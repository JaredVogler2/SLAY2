"""Counterfactual-invariance tests for policies (docs/INFORMATION-FAIRNESS.md).

A fair policy is a function of (visible state, its private RNG). So for any decision point, a *twin* that differs
only in hidden state (draw-pile order, every RNG stream) must yield the identical observation and the identical
action. The search policy is the dangerous one: it clones the simulator, so these tests are what keeps it honest.
"""

import random

import pytest

from slay2_sim.clone import clone_manager
from slay2_sim.hidden import perturb_hidden
from slay2_sim.observation import obs_hash, observe
from slay2_sim.policies import make_policy
from slay2_sim.runner import ManagerForwardModel, RunConfig, new_run

POLICY_SEED = 987654321


def sample_points(seed: int, steps: int = 500, every: int = 5, cfg: RunConfig | None = None) -> list:
    """Snapshot (clone) a random-play run every ``every`` decisions: diverse phases, mid-combat states included."""
    mgr = new_run(cfg or RunConfig(), seed)
    rnd = random.Random(seed)
    points = []
    for step in range(steps):
        if mgr.is_over:
            break
        actions = mgr.get_available_actions()
        if step % every == 0:
            points.append(clone_manager(mgr))
        mgr.take_action(rnd.choice(actions))
    return points


@pytest.fixture(scope="module")
def points(sim):
    pts = []
    for seed in (11, 12, 13, 14, 15, 16):
        pts.extend(sample_points(seed))
    return pts


def decide(name: str, mgr, **params):
    policy = make_policy(name, **params)
    policy.reset(POLICY_SEED)
    actions = mgr.get_available_actions()
    obs = observe(mgr, actions)
    fm = ManagerForwardModel(mgr) if policy.needs_forward_model else None
    idx = policy.act(obs, actions, fm)
    stats = policy.episode_stats() if hasattr(policy, "episode_stats") else {}
    return obs_hash(obs), idx, stats


def twins(mgr, salt: int):
    a, b = clone_manager(mgr), clone_manager(mgr)
    perturb_hidden(b, salt)
    return a, b


def test_sample_is_diverse_and_the_perturbation_is_real(points):
    phases = {p.phase for p in points}
    assert {"COMBAT", "MAP_CHOICE"} <= phases, phases
    assert len(phases) >= 4, phases
    real = 0
    for i, p in enumerate(points):
        combat = p.get_combat_state()
        if combat is None or len(combat.draw_pile) < 3:
            continue
        a, b = twins(p, 1000 + i)
        order_a = [c.instance_id for c in a.get_combat_state().draw_pile]
        order_b = [c.instance_id for c in b.get_combat_state().draw_pile]
        real += order_a != order_b
    assert real >= 10, "too few decision points with a hidden draw order that the perturbation actually changed"


@pytest.mark.parametrize("name", ["random_legal", "rules_v1", "rules_explore", "rules_v2_neow", "advisor_v1"])
def test_cheap_policies_ignore_hidden_state(points, name):
    for i, p in enumerate(points):
        a, b = twins(p, 5000 + i)
        assert decide(name, a) == decide(name, b), f"{name} depends on hidden state at point {i} ({p.phase})"


# The three pilots that produced the held-out numbers on the site, with the measured-values files they read. The points are
# Ironclad runs from the start (the opening choice included), which is what these default parameters play.
HEADLINE_POLICIES = [
    ("rules_v2", {}),
    ("rules_v3", {}),
    ("rules_v2_neow_values", {"neow_values": "experiments/neow/neow-values-v2.json"}),
    # the pilots of ADR-060: the late card rule is a function of the offered cards, the deck and the act, all of which a human sees (the
    # states at an Act-2 card reward are tested in test_rules_v2_late.py)
    ("rules_v2_late", {"late_threshold": 0.2}),
    ("rules_v2_late", {"late_values": "experiments/cardvalue/ironclad-a0-v2.json", "late_threshold": 0.0}),
]


@pytest.mark.parametrize("name,params", HEADLINE_POLICIES, ids=[n for n, _ in HEADLINE_POLICIES])
def test_the_pilots_behind_the_published_numbers_ignore_hidden_state(points, name, params):
    for i, p in enumerate(points):
        a, b = twins(p, 7000 + i)
        assert decide(name, a, **params) == decide(name, b, **params), f"{name} depends on hidden state at point {i} ({p.phase})"


def test_search_policy_ignores_hidden_state(points):
    """search_v1 clones the live simulator; its determinization must erase everything hidden."""
    combat_points = [p for p in points if p.phase == "COMBAT" and len(p.get_combat_state().draw_pile) >= 2]
    assert len(combat_points) >= 12
    for i, p in enumerate(combat_points[:12]):
        a, b = twins(p, 9000 + i)
        da, db = decide("search_v1", a, nodes=30, depth=4), decide("search_v1", b, nodes=30, depth=4)
        assert da == db, f"search_v1 depends on hidden state at combat point {i}: {da} != {db}"
        assert da[2]["search_nodes"] > 0 or len(a.get_available_actions()) <= 1


def search_plan(mgr, forward_model, **params):
    """The complete plan (signature list) the search would follow, not just its first action."""
    from slay2_sim.policies.search import _signature

    policy = make_policy("search_v1", **params)
    policy.reset(POLICY_SEED)
    policy.plan, policy.plan_turn = [], None
    return [_signature(a) for a in policy._search(forward_model, policy.rng.getrandbits(31))]


def test_search_plans_ignore_hidden_state(points):
    """Stronger than the first-action check: the entire planned line is identical for hidden-state twins."""
    combat_points = [p for p in points if p.phase == "COMBAT" and len(p.get_combat_state().draw_pile) >= 3]
    assert len(combat_points) >= 12
    for i, p in enumerate(combat_points[:20]):
        a, b = twins(p, 12000 + i)
        pa = search_plan(a, ManagerForwardModel(a), nodes=40, depth=6)
        pb = search_plan(b, ManagerForwardModel(b), nodes=40, depth=6)
        assert pa == pb, f"plan depends on hidden state at combat point {i}"


def test_search_policy_reacts_to_visible_state(points):
    """Sanity: the invariance above is not because the policy ignores everything (it must pick non-trivial plays)."""
    chosen = set()
    for p in [q for q in points if q.phase == "COMBAT"][:12]:
        actions = p.get_available_actions()
        _, idx, _ = decide("search_v1", p, nodes=30, depth=4)
        chosen.add(actions[idx]["action"])
    assert "play_card" in chosen


class LeakyForwardModel:
    """Canary: hands out clones with the TRUE hidden state (no determinization)."""

    def __init__(self, mgr):
        self._mgr = mgr

    def clone(self, seed: int):
        return clone_manager(self._mgr)


def draw_matters_scenario(sim, seed: int, top_first: bool):
    """A fresh combat whose hand is one Shrug It Off (draw 1) and whose draw pile holds the same multiset in two
    orders: one puts Bash (2 energy, vulnerable) on top, the other a Defend. The next draw changes the best line."""
    from conftest import drive_to_combat
    from sts2_env.cards.factory import create_card
    from sts2_env.core.enums import CardId

    mgr = drive_to_combat(seed)
    assert mgr is not None
    combat = mgr.get_combat_state()
    combat.hand = [create_card(CardId.SHRUG_IT_OFF)]
    pile = [create_card(CardId.BASH)] + [create_card(CardId.DEFEND_IRONCLAD) for _ in range(5)]
    combat.draw_pile = pile if top_first else pile[1:] + pile[:1]
    combat.energy = 3
    return mgr


def test_canary_a_leaky_forward_model_is_detected(sim):
    """Power check: with the true draw order visible to the search, the plan changes with the hidden order."""
    differing = 0
    for seed in range(8):
        a = draw_matters_scenario(sim, seed, top_first=True)
        b = draw_matters_scenario(sim, seed, top_first=False)
        assert sorted(c.card_id.name for c in a.get_combat_state().draw_pile) == sorted(c.card_id.name for c in b.get_combat_state().draw_pile)
        assert observe(a) == observe(b), "twins must be indistinguishable to a fair observer"
        pa = search_plan(a, LeakyForwardModel(a), nodes=60, depth=6)
        pb = search_plan(b, LeakyForwardModel(b), nodes=60, depth=6)
        differing += pa != pb
    assert differing >= 6, f"leaky search differed on only {differing}/8 scenarios; the canary has no power"


def test_fair_search_does_not_exploit_the_hidden_draw_order(sim):
    """Same scenario, fair determinization: identical plans for both orders on every seed."""
    for seed in range(8):
        a = draw_matters_scenario(sim, seed, top_first=True)
        b = draw_matters_scenario(sim, seed, top_first=False)
        pa = search_plan(a, ManagerForwardModel(a), nodes=60, depth=6)
        pb = search_plan(b, ManagerForwardModel(b), nodes=60, depth=6)
        assert pa == pb, f"fair search leaked the hidden draw order at seed {seed}"
        assert pa, "the search must find some plan"


# ------------------------------------------------------------------------------------------------ search_v2
def search2_plan(mgr, forward_model, **params):
    """The complete turn plan (signature list) search_v2 would follow."""
    from slay2_sim.policies.search import _signature as signature

    policy = make_policy("search_v2", **params)
    policy.reset(POLICY_SEED)
    return [signature(a) for a in policy._plan_turn(forward_model, policy.rng.getrandbits(31))]


def test_search2_policy_ignores_hidden_state(points):
    combat_points = [p for p in points if p.phase == "COMBAT" and len(p.get_combat_state().draw_pile) >= 2]
    assert len(combat_points) >= 12
    for i, p in enumerate(combat_points[:12]):
        a, b = twins(p, 15000 + i)
        da, db = decide("search_v2", a, nodes=40), decide("search_v2", b, nodes=40)
        assert da == db, f"search_v2 depends on hidden state at combat point {i}: {da} != {db}"


def test_search2_plans_ignore_hidden_state(points):
    combat_points = [p for p in points if p.phase == "COMBAT" and len(p.get_combat_state().draw_pile) >= 3]
    assert len(combat_points) >= 12
    for i, p in enumerate(combat_points[:16]):
        a, b = twins(p, 17000 + i)
        assert search2_plan(a, ManagerForwardModel(a), nodes=60) == search2_plan(b, ManagerForwardModel(b), nodes=60), f"combat point {i}"


def test_canary_a_leaky_forward_model_is_detected_for_search2(sim):
    differing = 0
    for seed in range(8):
        a = draw_matters_scenario(sim, seed, top_first=True)
        b = draw_matters_scenario(sim, seed, top_first=False)
        differing += search2_plan(a, LeakyForwardModel(a), nodes=80) != search2_plan(b, LeakyForwardModel(b), nodes=80)
    assert differing >= 5, f"leaky search_v2 differed on only {differing}/8 scenarios; the canary has no power"


def test_fair_search2_does_not_exploit_the_hidden_draw_order(sim):
    for seed in range(8):
        a = draw_matters_scenario(sim, seed, top_first=True)
        b = draw_matters_scenario(sim, seed, top_first=False)
        pa = search2_plan(a, ManagerForwardModel(a), nodes=80)
        pb = search2_plan(b, ManagerForwardModel(b), nodes=80)
        assert pa == pb and pa, f"fair search_v2 leaked the hidden draw order at seed {seed}"


def test_search2_state_key_merges_play_orders_and_keeps_different_boards_apart(sim):
    from conftest import drive_to_combat
    from slay2_sim.policies.search2 import state_key

    mgr = drive_to_combat(3)
    assert mgr is not None
    plays = [a for a in mgr.get_available_actions() if a["action"] == "play_card"]
    strikes = [a for a in plays if a.get("card_id") == "STRIKE_IRONCLAD"]
    defends = [a for a in plays if a.get("card_id") == "DEFEND_IRONCLAD"]
    assert strikes and defends

    def after(*first):
        c = clone_manager(mgr)
        for want in first:  # always the first legal action that is the requested card (indexes shift as cards leave the hand)
            a = next(x for x in c.get_available_actions() if x["action"] == "play_card" and x.get("card_id") == want and (x.get("target_index") in (None, 0)))
            c.take_action(a)
        return state_key(c)

    assert after("STRIKE_IRONCLAD", "DEFEND_IRONCLAD") == after("DEFEND_IRONCLAD", "STRIKE_IRONCLAD")
    assert after("STRIKE_IRONCLAD") != after("DEFEND_IRONCLAD")


# The six arms of the Ascension 9 study (ADR-058) in the game it is played in: Ascension 9, the relics kept, every class. A policy must
# not read more of that game than of Ascension 0 (the Ascender's Bane in the deck, the relics a run gains later, the other classes' cards).
A9_CLASSES = ["Ironclad", "Silent", "Regent", "Necrobinder", "Defect"]


def a9_arms(cls: str) -> list[tuple[str, dict]]:
    shown = "ironclad-a0-v2" if cls == "Ironclad" else f"{cls.lower()}-a0-keep-v1"
    first = {} if cls == "Ironclad" else {"values": f"experiments/cardvalue/{cls.lower()}-a0-v1.json"}
    return [
        ("advisor_v1", {"engines": 0, "margin": 0.0, "needs": 1, "scalers": 0.7}),
        ("advisor_v1", {"synergy": 0, "margin": 0}),
        ("rules_v1", {}),
        ("rules_v2", {"threshold": 0.0, "values": f"experiments/cardvalue/{shown}.json"}),
        ("rules_v2_neow_values", {"threshold": 0.0, "neow_values": "experiments/neow/neow-values-keep-v1.json", **first}),
        ("rules_v2", {"threshold": 0.0, **first}),
    ]


_A9_POINTS: dict[str, list] = {}


def a9_points(cls: str) -> list:
    if cls not in _A9_POINTS:
        cfg = RunConfig(character=cls, ascension=9, keep_relics=True)
        pts = []
        for seed in (31, 32, 33):
            pts.extend(sample_points(seed, steps=420, every=7, cfg=cfg))
        _A9_POINTS[cls] = pts
    return _A9_POINTS[cls]


@pytest.mark.parametrize("cls", A9_CLASSES)
def test_the_ascension_9_game_is_the_one_the_arms_are_tested_in(sim, cls):
    pts = a9_points(cls)
    assert all(p.run_state.ascension_level == 9 for p in pts)
    assert any(p.phase == "COMBAT" for p in pts) and len({p.phase for p in pts}) >= 2
    # Ascender's Bane is in the deck from the first point on
    assert any(c.card_id.name == "ASCENDERS_BANE" for c in pts[0].run_state.player.deck)


@pytest.mark.parametrize("cls", A9_CLASSES)
def test_the_arms_of_the_ascension_9_study_ignore_hidden_state(sim, cls):
    pts = a9_points(cls)
    for name, params in a9_arms(cls):
        for i, p in enumerate(pts):
            a, b = twins(p, 15000 + i)
            assert decide(name, a, **params) == decide(name, b, **params), (
                f"{name} {params} depends on hidden state at point {i} ({p.phase}) of {cls} at Ascension 9"
            )
