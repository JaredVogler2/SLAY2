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


def sample_points(seed: int, steps: int = 500, every: int = 5) -> list:
    """Snapshot (clone) a random-play run every ``every`` decisions: diverse phases, mid-combat states included."""
    mgr = new_run(RunConfig(), seed)
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


@pytest.mark.parametrize("name", ["random_legal", "rules_v1", "rules_explore"])
def test_cheap_policies_ignore_hidden_state(points, name):
    for i, p in enumerate(points):
        a, b = twins(p, 5000 + i)
        assert decide(name, a) == decide(name, b), f"{name} depends on hidden state at point {i} ({p.phase})"


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
