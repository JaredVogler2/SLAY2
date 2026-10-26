"""A game must not depend on how many games its process played before it (warmup.py).

The sample audit found it: the pinned simulator caches some card lookups lazily and the first lookup in a process takes a card
id without giving it back, so the *first* game of a process to upgrade a Vicious card ran with ids one higher than the same
game later, and in rare situations a pile differed (Anger's added copy). Each test plays the policy on a seed in a fresh
subprocess, then replays the recorded actions in the same process (the second game of that process) and compares every
observation hash. Real games; the subprocess is the only way to start from a process that has played none.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

from slay2_sim import external

SEED = 1725454781  # Ironclad, rules_v2 with the committed Ironclad values: dies on step 459; the old divergence is at step 441
VALUES = external.REPO_ROOT / "experiments" / "cardvalue" / "ironclad-a0-v1.json"

SCRIPT = r"""
import json, sys
from slay2_sim import external
sim = external.locate()
external.activate(sim.root)
from slay2_sim.isolation import deliberation
from slay2_sim.observation import obs_hash, observe
from slay2_sim.policies import make_policy
from slay2_sim.runner import RunConfig, new_run, policy_seed_for

seed, values = int(sys.argv[1]), sys.argv[2]
cfg = RunConfig(character="Ironclad")
policy = make_policy("rules_v2", threshold=0.0, values=values)

mgr = new_run(cfg, seed)                      # the first game of this process
policy.reset(policy_seed_for(policy.name, seed))
hashes, picks = [], []
while not mgr.is_over:
    actions = mgr.get_available_actions()
    obs = observe(mgr, actions)
    hashes.append(obs_hash(obs))
    with deliberation():
        idx = policy.act(obs, actions, None)
    picks.append(idx)
    mgr.take_action(actions[idx])

mgr = new_run(cfg, seed)                      # the second game of this process: the recorded actions, no policy
first_divergence = None
for t, idx in enumerate(picks):
    actions = mgr.get_available_actions()
    if obs_hash(observe(mgr, actions)) != hashes[t]:
        first_divergence = t
        break
    mgr.take_action(actions[idx])
print(json.dumps({"steps": len(picks), "first_divergence": first_divergence}))
"""


def play_then_replay(*, warmup: bool) -> dict:
    env = {**os.environ, "PYTHONPATH": str(external.REPO_ROOT / "sim")}
    env.pop("SLAY2_NO_WARMUP", None)
    if not warmup:
        env["SLAY2_NO_WARMUP"] = "1"
    out = subprocess.run([sys.executable, "-c", SCRIPT, str(SEED), str(VALUES)], env=env, cwd=external.REPO_ROOT,
                         capture_output=True, text=True, timeout=600, check=True)
    return json.loads(out.stdout.strip().splitlines()[-1])


def test_with_the_warm_up_the_second_game_of_a_process_replays_the_first_exactly(sim):
    got = play_then_replay(warmup=True)
    assert got["steps"] == 459 and got["first_divergence"] is None


def test_without_it_the_same_game_diverges_which_is_what_the_warm_up_is_for(sim):
    """The test proves its own power: with the warm-up switched off the defect of the pinned simulator is still there."""
    got = play_then_replay(warmup=False)
    assert got["steps"] == 459 and got["first_divergence"] == 441
