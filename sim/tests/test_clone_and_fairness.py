"""Clone fidelity and information-fairness tests (need the pinned external simulator)."""

import json
import random

import pytest

from conftest import drive_to_combat


def _strip(obs):
    o = dict(obs)
    o.pop("map", None)
    return o


def test_clone_manager_is_faithful_over_random_combat_sequences(sim):
    """A closure-aware clone must evolve identically to the original (plain deepcopy does not)."""
    from slay2_sim.clone import clone_manager
    from slay2_sim.observation import observe

    compared = 0
    for seed in range(25):
        m = drive_to_combat(seed)
        if m is None:
            continue
        c = clone_manager(m)
        rnd = random.Random(seed)
        for _ in range(24):
            if m.phase != "COMBAT" or c.phase != "COMBAT":
                break
            am, ac = m.get_available_actions(), c.get_available_actions()
            assert len(am) == len(ac)
            non_end = [i for i, a in enumerate(am) if a["action"] != "end_turn"]
            pick = rnd.choice(non_end) if non_end and rnd.random() < 0.8 else rnd.randrange(len(am))
            m.take_action(am[pick])
            c.take_action(ac[pick])
            assert _strip(observe(m)) == _strip(observe(c)), f"clone diverged: seed={seed}"
            compared += 1
    assert compared > 300


def test_observation_is_invariant_to_hidden_state(sim):
    """Same visible state, different draw order and RNG streams => identical observation."""
    from slay2_sim.clone import clone_manager
    from slay2_sim.hidden import perturb_hidden
    from slay2_sim.observation import observe

    checked = 0
    for seed in range(20):
        m = drive_to_combat(seed)
        if m is None:
            continue
        a = clone_manager(m)
        b = clone_manager(m)
        perturb_hidden(b, seed + 1000)
        # the perturbation really changed the hidden draw order (otherwise the test proves nothing)
        order_a = [c.instance_id for c in a.get_combat_state().draw_pile]
        order_b = [c.instance_id for c in b.get_combat_state().draw_pile]
        if len(order_a) > 1:
            assert order_a != order_b or len(set(order_a)) == 1
        assert observe(a) == observe(b)
        checked += 1
    assert checked >= 15


def test_observation_exposes_no_seed_or_rng_fields(sim):
    from slay2_sim.observation import observe

    m = drive_to_combat(3)
    blob = json.dumps(observe(m), default=str).lower()
    for forbidden in ("seed", "rng", "random", "_state", "instance_id"):
        assert forbidden not in blob, f"observation leaks {forbidden!r}"


def test_fair_determinize_depends_only_on_visible_state_and_seed(sim):
    """Two clones with different hidden draw order/RNG become identical after determinization."""
    from slay2_sim.clone import clone_manager
    from slay2_sim.hidden import fair_determinize, perturb_hidden

    for seed in range(12):
        m = drive_to_combat(seed)
        if m is None:
            continue
        a, b = clone_manager(m), clone_manager(m)
        perturb_hidden(b, seed + 77)
        fair_determinize(a, 4242)
        fair_determinize(b, 4242)
        ids_a = [(c.card_id.name, c.upgraded) for c in a.get_combat_state().draw_pile]
        ids_b = [(c.card_id.name, c.upgraded) for c in b.get_combat_state().draw_pile]
        assert ids_a == ids_b
        # and the RNG streams produce the same numbers
        from slay2_sim.hidden import find_rngs

        ra, rb = find_rngs(a), find_rngs(b)
        assert len(ra) == len(rb) > 0
        assert [r.next_float() for r in ra] == [r.next_float() for r in rb]


def test_profile_cohorts_and_no_class_leak(sim):
    """veteran switches off tutorial scripting via unlock state; the patched RunState never leaks."""
    import sts2_env.run.run_manager as rm
    from slay2_sim.runner import RunConfig, new_run

    original = rm.RunState
    vet = new_run(RunConfig(profile="veteran"), 5)
    first = new_run(RunConfig(profile="first_run"), 5)
    assert rm.RunState is original
    assert vet.run_state.player.unlock_state.get("number_of_runs") == 10
    assert vet.run_state.player.unlock_state.get("epoch_unlock_count") == 20
    assert "number_of_runs" not in first.run_state.player.unlock_state
    with pytest.raises(ValueError):
        new_run(RunConfig(profile="bogus"), 5)
