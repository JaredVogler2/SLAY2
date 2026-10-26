"""Refactors must not change what a published policy does: re-play the first seeds of committed batches and require the
same records (outcome, floor, act, HP, deck, relics, gold, steps) as the batch that is cited as evidence."""

from __future__ import annotations

import json

import pytest

from slay2_sim import external
from slay2_sim.batch import read_episodes
from slay2_sim.policies import make_policy
from slay2_sim.policies.rules import DEFAULT_TUNE, resolve_tune
from slay2_sim.policies.rules2 import MAX_DECK
from slay2_sim.runner import RunConfig, run_episode

BATCHES = external.REPO_ROOT / "experiments" / "batches"
FIELDS = ("outcome", "floor", "act", "hp", "max_hp", "deck_size", "relics", "gold", "combats_won", "steps")


@pytest.mark.parametrize(
    "batch_id, n",
    [
        ("rules_v1-ironclad-a0-veteran-train-n300", 8),
        ("rules_v2-ironclad-a0-veteran-val-n2000", 8),
    ],
)
def test_committed_batches_are_reproduced_seed_by_seed(sim, batch_id: str, n: int):
    batch = BATCHES / batch_id
    manifest = json.loads((batch / "manifest.json").read_text(encoding="utf-8"))
    cfg = RunConfig(**manifest["config"])
    stored = read_episodes(batch)[:n]
    assert len(stored) == n
    for rec in stored:
        policy = make_policy(manifest["policy"]["name"], **manifest["policy"]["params"])
        again = run_episode(cfg, rec.seed, policy, batch_id=batch_id)
        assert {k: getattr(again, k) for k in FIELDS} == {k: getattr(rec, k) for k in FIELDS}, (batch_id, rec.seed)


def test_defaults_are_what_rules_v1_shipped_with_and_typos_are_refused(sim):
    assert resolve_tune(None) == DEFAULT_TUNE and DEFAULT_TUNE["max_deck"] == MAX_DECK
    assert make_policy("rules_v1").describe()["params"]["tune"] == DEFAULT_TUNE
    with pytest.raises(ValueError, match="unknown tunables"):
        make_policy("rules_v1", tune={"heal_bellow": 0.5})


def test_a_tuned_threshold_changes_the_decision_it_names(sim):
    run = {"hp": 65, "max_hp": 100}
    rest = [{"action": "rest_option", "option_id": "HEAL", "idx": 0, "enabled": True}, {"action": "rest_option", "option_id": "SMITH", "idx": 1, "enabled": True}]
    obs = {"run": run, "map": None}
    default = make_policy("rules_v1")
    default.reset(1)
    assert default._rest(obs, rest) == 0  # 65 % < 70 %: heal
    tuned = make_policy("rules_v1", tune={"heal_below": 0.5})
    tuned.reset(1)
    assert tuned._rest(obs, rest) == 1  # 65 % is fine for this policy: smith
    assert tuned.describe()["params"]["tune"]["heal_below"] == 0.5
