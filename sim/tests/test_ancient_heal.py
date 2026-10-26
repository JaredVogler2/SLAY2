"""G11: the game opens every act with an Ancient event that heals the player first; the pinned simulator starts acts 2 and 3 on the map.

The harness variant ``ancient_heal`` (off by default, recorded in a batch's manifest only when on) restores what the game's
Ancient event restores before it offers anything. These tests pin the arithmetic, the fingerprint of every earlier batch, and
(on real games) that the variant changes the hit points at the act boundary and nothing before it.
"""

from __future__ import annotations

import pytest

from slay2_sim import external
from slay2_sim.runner import RunConfig, ancient_heal_amount


def test_the_amount_is_all_the_missing_hp_until_ascension_two_then_four_fifths_truncated():
    assert ancient_heal_amount(0, 0) == 0
    assert ancient_heal_amount(-3, 0) == 0
    assert ancient_heal_amount(37, 0) == 37
    assert ancient_heal_amount(37, 1) == 37
    assert ancient_heal_amount(37, 2) == 29  # 0.8 * 37 = 29.6, truncated like the game's (int)(current + amount)
    assert ancient_heal_amount(80, 10) == 64
    assert ancient_heal_amount(1, 5) == 0
    assert ancient_heal_amount(5, 5) == 4


def test_the_default_config_keeps_the_fingerprint_of_every_earlier_batch():
    assert "ancient_heal" not in RunConfig().describe()
    assert RunConfig(ancient_heal=True).describe()["ancient_heal"] is True
    for cfg in (RunConfig(), RunConfig(ancient_heal=True), RunConfig(character="Defect", ascension=3, ancient_heal=True)):
        assert RunConfig(**cfg.describe()) == cfg  # a manifest's config rebuilds the run that wrote it


def _first_act_boundary(seed: int, *, ancient_heal: bool, recorded: list[int] | None = None):
    """Play ``rules_v1`` (or the recorded action indices) until the act index changes; return (picks, state just before, state just after)."""
    from slay2_sim.isolation import deliberation
    from slay2_sim.observation import observe
    from slay2_sim.policies import make_policy
    from slay2_sim.runner import new_run, policy_seed_for

    cfg = RunConfig(character="Ironclad", ancient_heal=ancient_heal)
    mgr = new_run(cfg, seed)
    policy = make_policy("rules_v1")
    policy.reset(policy_seed_for(policy.name, seed))
    picks: list[int] = []
    for step in range(20000):
        if mgr.is_over:
            return None
        actions = mgr.get_available_actions()
        if recorded is not None:
            idx = recorded[step]
        else:
            with deliberation():
                idx = policy.act(observe(mgr, actions), actions, None)
        player = mgr.run_state.player
        before = (mgr.run_state.current_act_index, player.current_hp, player.max_hp, mgr.run_state.total_floor)
        mgr.take_action(actions[idx])
        picks.append(idx)
        if mgr.run_state.current_act_index != before[0]:
            after = (mgr.run_state.current_act_index, player.current_hp, player.max_hp, mgr.run_state.total_floor)
            return picks, before, after
    return None


def test_the_variant_heals_at_the_boundary_of_acts_on_real_games(sim):
    from slay2_sim.manifest import load_seed_manifest, partition_seeds

    manifest = load_seed_manifest(external.REPO_ROOT / "experiments" / "seeds" / "ironclad-a0-v2.json")
    seeds = partition_seeds(manifest, "dev", allow_sealed=False, limit=40)
    for seed in seeds:
        plain = _first_act_boundary(seed, ancient_heal=False)
        if plain is None:
            continue  # died in act one: try the next seed
        picks, before, after = plain
        assert after[0] == before[0] + 1
        healed = _first_act_boundary(seed, ancient_heal=True, recorded=picks)
        assert healed is not None
        picks2, before2, after2 = healed
        assert picks2 == picks
        assert before2 == before  # nothing before the boundary differs: the variant adds no randomness and no earlier effect
        assert after2[0] == after[0] and after2[3] == after[3] and after2[2] == after[2]
        assert after2[1] == after2[2]  # Ascension 0: the whole of the missing HP
        assert after2[1] >= after[1]
        return
    pytest.fail("none of the first 40 development seeds reached act two with rules_v1")
