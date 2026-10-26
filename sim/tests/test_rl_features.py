"""Neural-policy plumbing that needs the simulator and torch: fair encoding, environment, network masking, run-level policy."""

from __future__ import annotations

import numpy as np
import pytest

from slay2_sim.rl import features as ft

torch = pytest.importorskip("torch")


def _snapshots(sim, seeds=(1, 2), keep=1.0):
    from slay2_sim.rl import env as E

    return E.collect_snapshots(list(seeds), keep_monster=keep)


def test_encoding_matches_layout_and_mask_equals_the_legal_set(sim):
    from slay2_sim.observation import observe
    from slay2_sim.rl import env as E

    env = E.CombatEnv(_snapshots(sim), seed=3)
    enc = env.reset()
    for key, (shape, dtype) in ft.layout().items():
        assert np.asarray(enc[key]).shape == shape, key
        assert np.asarray(enc[key]).dtype == np.dtype(dtype), key
    assert int(enc["mask"].sum()) == len(env.table) > 0
    assert set(np.flatnonzero(enc["mask"])) == set(env.table)
    for aid, idx in env.table.items():  # every id points at an action that maps back to it
        assert ft.action_id(env.obs["actions"][idx]) == aid
    assert observe(env.mgr)["phase"] == "COMBAT"


def test_encoding_depends_only_on_what_a_player_can_see(sim):
    """Perturb the hidden draw order and every RNG stream: the encoded observation must not change at all."""
    from slay2_sim.clone import clone_manager
    from slay2_sim.hidden import perturb_hidden
    from slay2_sim.observation import observe
    from slay2_sim.rl import env as E

    env = E.CombatEnv(_snapshots(sim), seed=5)
    env.reset()
    checked = 0
    for step in range(12):
        base = ft.encode(observe(env.mgr))
        for s in (1, 2, 3):
            twin = clone_manager(env.mgr)
            perturb_hidden(twin, s)
            other = ft.encode(observe(twin))
            for k in base:
                assert np.array_equal(base[k], other[k]), (step, k)
        checked += 1
        legal = np.flatnonzero(base["mask"])
        _, _, done, _ = env.step(int(legal[0]))
        if done:
            break
    assert checked > 3


def test_environment_episodes_terminate_with_bounded_rewards(sim):
    from slay2_sim.rl import env as E

    rng = np.random.default_rng(0)
    env = E.CombatEnv(_snapshots(sim), seed=9)
    outcomes = []
    for _ in range(12):
        enc, done, total = env.reset(), False, 0.0
        while not done:
            assert enc["mask"].any()
            enc, r, done, info = env.step(int(rng.choice(np.flatnonzero(enc["mask"]))))
            assert -2.0 <= r <= 1.0
            total += r
        outcomes.append(info.won)
        assert info.steps > 0 and (info.won or info.hp_end <= info.hp_start)
        assert total <= 1.0 + 1e-9
    assert any(outcomes) and not all(outcomes)  # random play wins some trivial fights and loses others


def test_environment_is_reproducible(sim):
    import random

    from slay2_sim.rl import env as E

    lib = _snapshots(sim)
    snap = lib[len(lib) // 2]

    def rollout():
        env = E.CombatEnv(lib, seed=0)
        env.rng = random.Random(1234)
        enc, done, trace = env.reset(snap), False, []
        while not done:
            a = int(np.flatnonzero(enc["mask"])[-1])  # fixed rule: last legal action
            enc, r, done, info = env.step(a)
            trace.append((a, round(r, 6), done))
        return trace, info.won, info.hp_end

    assert rollout() == rollout()


def test_network_never_puts_probability_on_illegal_actions(sim):
    from slay2_sim.rl import env as E
    from slay2_sim.rl import net as N

    torch.manual_seed(0)
    model = N.CombatNet().eval()
    env = E.CombatEnv(_snapshots(sim), seed=2)
    batch = ft.stack([env.reset() for _ in range(6)])
    with torch.inference_mode():
        logits, value = model(N.to_tensors(batch))
    probs = torch.softmax(logits, -1).numpy()
    assert logits.shape == (6, ft.N_ACTIONS) and value.shape == (6,)
    assert np.isfinite(value.numpy()).all()
    assert np.all(probs[~batch["mask"]] < 1e-12)
    assert np.allclose(probs.sum(-1), 1.0, atol=1e-5)


def test_checkpoint_roundtrip_and_run_level_policy(sim, tmp_path):
    from slay2_sim.policies import make_policy
    from slay2_sim.policies.ppo_combat import file_sha256
    from slay2_sim.rl import net as N
    from slay2_sim.runner import RunConfig, run_episode

    torch.manual_seed(0)
    path = tmp_path / "ckpt.pt"
    N.save(N.CombatNet(), path, note="test")
    digest = file_sha256(path)
    with pytest.raises(ValueError):
        make_policy("ppo_combat_v1", checkpoint=str(path), checkpoint_sha256="0" * 64)
    policy = make_policy("ppo_combat_v1", checkpoint=str(path), checkpoint_sha256=digest)
    rec = run_episode(RunConfig(), 11, policy, batch_id="test")
    assert rec.outcome in ("win", "death"), rec.error  # a random-weights network plays badly but legally
    assert rec.extra.get("combat_decisions", 0) > 0
