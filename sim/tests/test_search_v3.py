"""search_v3: a kill is not punished for the creatures it spawns (ADR-033).

search_v2 left a Phrog Parasite at 1 HP for six turns because killing it spawns four Wrigglers (about 80 HP) and its value
function counted every enemy HP point the same, so the sum went up when the parasite died.
"""

from __future__ import annotations

import pytest

from conftest import drive_to_combat
from slay2_sim.clone import clone_manager
from slay2_sim.policies import make_policy
from slay2_sim.policies.search2 import turn_value

KW = dict(enemy_hp_weight=0.55, potion_value=8.0, danger_fraction=0.25)


@pytest.fixture()
def combat(sim):
    mgr = drive_to_combat(5)
    assert mgr is not None and mgr.phase == "COMBAT"
    return mgr


def spawn(mgr):
    other = clone_manager(mgr)
    other.get_combat_state().spawn_infested_wrigglers(4)  # what a Phrog Parasite's death does
    return other


def test_spawned_hp_is_discounted_by_spawn_weight(combat):
    n_root = len(combat.get_combat_state().enemies)
    base = turn_value(combat, **KW, n_root=n_root, spawn_weight=1.0)
    after = spawn(combat)
    full = turn_value(after, **KW, n_root=n_root, spawn_weight=1.0) - base
    cheap = turn_value(after, **KW, n_root=n_root, spawn_weight=0.2) - base
    assert full < cheap < 0, "spawns still cost something, just much less"
    assert cheap == pytest.approx(full * 0.2, rel=1e-6)


def test_without_n_root_every_enemy_counts_the_same(combat):
    """search_v2 behaviour is unchanged: no root count, no discount."""
    base = turn_value(combat, **KW)
    after = spawn(combat)
    assert turn_value(after, **KW) == turn_value(after, **KW, n_root=None, spawn_weight=0.0)
    assert turn_value(after, **KW) < base


def test_enemies_that_were_there_at_the_root_keep_their_full_weight(combat):
    n_root = len(combat.get_combat_state().enemies)
    assert turn_value(combat, **KW, n_root=n_root, spawn_weight=0.0) == turn_value(combat, **KW)


def test_search_v3_is_search_v2_with_a_spawn_discount_and_says_so(sim):
    v2, v3 = make_policy("search_v2"), make_policy("search_v3")
    assert v2.spawn_weight == 1.0 and v3.spawn_weight == 0.2
    assert v3.describe()["params"]["spawn_weight"] == 0.2 and v3.name == "search_v3" and v3.needs_forward_model
    assert make_policy("search_v3", spawn_weight=0.5).spawn_weight == 0.5
    assert v3.nodes == v2.nodes == 250


def test_search_v3_takes_its_card_rewards_from_the_measured_values_like_rules_v2(sim, tmp_path):
    import json

    f = tmp_path / "v.json"
    f.write_text(json.dumps({"kind": "card-values", "cards": [{"id": "ANGER", "beta": 0.7}, {"id": "BASH", "beta": 0.2}]}))
    p = make_policy("search_v3", values=str(f))
    p.reset(1)
    actions = [{"action": "pick_card", "idx": 0, "card_id": "BASH"}, {"action": "pick_card", "idx": 1, "card_id": "ANGER"}, {"action": "skip", "idx": 2}]
    assert p._card_reward({"run": {"deck": [["STRIKE_IRONCLAD", False, 12]]}}, actions) == 1
    d = p.describe()["params"]
    assert len(d["values_sha256"]) == 64 and d["nodes"] == 250 and d["spawn_weight"] == 0.2
    assert make_policy("search_v3").describe()["params"]["values"] == "experiments/cardvalue/ironclad-a0-v1.json"


def test_scope_limits_the_search_to_the_named_fights_and_the_rules_play_the_rest(sim, monkeypatch):
    from slay2_sim.observation import observe
    from slay2_sim.policies.rules import RulesV1
    from slay2_sim.policies.search2 import SearchV2

    mgr = drive_to_combat(5)
    acts = mgr.get_available_actions()
    obs = observe(mgr, acts)
    monkeypatch.setattr(RulesV1, "_decide", lambda self, obs, actions, fm=None: -7)  # the rules' answer
    searched = []
    monkeypatch.setattr(SearchV2, "_plan_turn", lambda self, fm, seed: searched.append(1) or [])

    class Fm:  # never asked for a clone: _plan_turn is stubbed
        pass

    def decide(scope: str, entering: str | None):
        p = make_policy("search_v3", scope=scope)
        p.reset(1)
        p.entering = entering
        return p._decide(obs, acts, Fm())

    assert decide("boss", "MONSTER") == -7 and not searched
    assert decide("boss", "ELITE") == -7 and not searched
    assert decide("elite_boss", "MONSTER") == -7 and not searched
    decide("boss", "BOSS")
    decide("elite_boss", "ELITE")
    decide("all", "MONSTER")
    decide("all", None)
    assert len(searched) == 4
    with pytest.raises(ValueError):
        make_policy("search_v3", scope="everywhere")


def test_the_rules_policy_remembers_which_kind_of_node_it_walked_into(sim):
    from slay2_sim.observation import observe
    from slay2_sim.runner import new_run, RunConfig

    mgr = new_run(RunConfig(), 11)
    p = make_policy("rules_v1")
    p.reset(3)
    seen = set()
    for _ in range(400):
        if mgr.is_over:
            break
        acts = mgr.get_available_actions()
        obs = observe(mgr, acts)
        idx = p.act(obs, acts, None)
        if obs["phase"] == "MAP_CHOICE":
            seen.add(p.entering)
        mgr.take_action(acts[idx])
    assert seen and None not in seen and seen <= {"MONSTER", "ELITE", "REST_SITE", "SHOP", "UNKNOWN", "TREASURE", "BOSS", "ANCIENT"}
