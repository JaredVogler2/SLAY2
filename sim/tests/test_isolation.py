"""Search on clones must leave no trace in the live game (isolation.py).

The test plays a seed with the rules policy twice: once undisturbed, once with search-style clone play (clone, determinize,
step random actions on the copy) between the decisions. Without the guard the live game stops matching at step 187 on this
seed: a defect measured in the simulator's global card-id counter. With the guard the two runs are identical, observation
hash for observation hash.
"""

from __future__ import annotations

import random

import pytest

from slay2_sim.clone import clone_manager
from slay2_sim.hidden import fair_determinize
from slay2_sim.isolation import deliberation
from slay2_sim.observation import obs_hash, observe
from slay2_sim.policies import make_policy
from slay2_sim.runner import RunConfig, new_run, policy_seed_for

SEED = 81161925
STEPS = 260


def trajectory(*, noise: bool, guarded: bool) -> list[str]:
    mgr = new_run(RunConfig(), SEED)
    policy = make_policy("rules_v1")
    policy.reset(policy_seed_for(policy.name, SEED))
    rng = random.Random(5)
    hashes = []
    for _ in range(STEPS):
        if mgr.is_over:
            break
        acts = mgr.get_available_actions()
        obs = observe(mgr, acts)
        hashes.append(obs_hash(obs))
        idx = policy.act(obs, acts, None)
        if noise and obs["phase"] == "COMBAT":
            ctx = deliberation() if guarded else _nothing()
            with ctx:
                for _k in range(3):
                    copy = clone_manager(mgr)
                    fair_determinize(copy, rng.getrandbits(31))
                    for _j in range(6):
                        legal = copy.get_available_actions()
                        if not legal or copy.is_over:
                            break
                        copy.take_action(legal[rng.randrange(len(legal))])
        mgr.take_action(acts[idx])
    return hashes


class _nothing:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture(scope="module")
def clean(sim):
    return trajectory(noise=False, guarded=True)


def test_without_the_guard_clone_play_changes_the_live_game(sim, clean):
    """Documents the defect (and gives the next test its power): it must show up on this seed."""
    disturbed = trajectory(noise=True, guarded=False)
    assert disturbed != clean[: len(disturbed)] or len(disturbed) != len(clean)


def test_with_the_guard_the_live_game_is_exactly_what_it_was_without_any_search(sim, clean):
    assert trajectory(noise=True, guarded=True) == clean


def test_the_counter_is_restored_exactly(sim):
    from sts2_env.cards import base

    before = base._next_instance_id
    with deliberation():
        base._next_instance_id += 1000
    assert base._next_instance_id == before
    with pytest.raises(RuntimeError):
        with deliberation():
            base._next_instance_id += 7
            raise RuntimeError("a policy that fails must not leak ids either")
    assert base._next_instance_id == before
