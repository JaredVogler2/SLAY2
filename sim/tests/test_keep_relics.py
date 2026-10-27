"""G14: the pinned simulator drops every relic a run gains after its first fight.

``RunState.relics`` is an alias of the player's relic list; the setup of the first fight gives the player a new list, the alias
goes stale, and the next fight's setup rebuilds the player's relics from the stale alias. The harness variant ``keep_relics``
(off by default, recorded in a batch's manifest only when on) points the alias back at the player's list after every action.
These tests pin the fingerprint of every earlier batch and, on real games, that the gap exists, that the variant repairs it
and changes nothing before the first relic that would have been lost, and that a game played with the variant replays.
"""

from __future__ import annotations

from slay2_sim import external
from slay2_sim.runner import RunConfig


def test_the_default_config_keeps_the_fingerprint_of_every_earlier_batch():
    assert "keep_relics" not in RunConfig().describe()
    assert RunConfig(keep_relics=True).describe()["keep_relics"] is True
    for cfg in (RunConfig(), RunConfig(keep_relics=True), RunConfig(character="Regent", ascension=2, ancient_heal=True, keep_relics=True)):
        assert RunConfig(**cfg.describe()) == cfg  # a manifest's config rebuilds the run that wrote it


def _play(seed: int, *, keep_relics: bool, picks: list[int] | None = None, until: int | None = None):
    """Play ``rules_v1`` (or the recorded action indices) and record, after every action, the phase, the player's relics, whether
    ``RunState.relics`` is still the player's list, and the observation hash that preceded the action."""
    from slay2_sim.isolation import deliberation
    from slay2_sim.observation import obs_hash, observe
    from slay2_sim.policies import make_policy
    from slay2_sim.runner import new_run, policy_seed_for

    mgr = new_run(RunConfig(character="Ironclad", keep_relics=keep_relics), seed)
    policy = make_policy("rules_v1")
    policy.reset(policy_seed_for(policy.name, seed))
    steps: list[dict] = []
    chosen: list[int] = []
    for step in range(20000):
        if mgr.is_over or (until is not None and step >= until):
            break
        actions = mgr.get_available_actions()
        obs = observe(mgr, actions)
        if picks is not None:
            idx = picks[step]
        else:
            with deliberation():
                idx = policy.act(obs, actions, None)
        h = obs_hash(obs)
        mgr.take_action(actions[idx])
        chosen.append(idx)
        player = mgr.run_state.player
        steps.append({
            "hash": h, "phase": mgr.phase, "relics": [str(r) for r in player.relics],
            "aliased": mgr.run_state.relics is player.relics,
        })
    return chosen, steps


def _first_loss(steps: list[dict]):
    """(g, f): the step after which a relic was gained once a fight had started, and the first later step that is a fight
    again; None when the run never gains a relic after its first fight and then fights again."""
    fought = False
    gained = None
    for i, s in enumerate(steps):
        if s["phase"] == "COMBAT":
            fought = True
            if gained is not None:
                return gained, i
        if fought and gained is None and i > 0 and len(s["relics"]) > len(steps[i - 1]["relics"]):
            gained = i
    return None


def test_the_simulator_drops_a_relic_gained_after_the_first_fight_and_the_variant_keeps_it(sim):
    import pytest

    from slay2_sim.manifest import load_seed_manifest, partition_seeds

    manifest = load_seed_manifest(external.REPO_ROOT / "experiments" / "seeds" / "ironclad-a0-v2.json")
    for seed in partition_seeds(manifest, "dev", allow_sealed=False, limit=40):
        picks, plain = _play(seed, keep_relics=False)
        found = _first_loss(plain)
        if found is None:
            continue
        g, f = found
        gained = [r for r in plain[g]["relics"] if r not in plain[g - 1]["relics"]]
        assert len(gained) == 1
        # the simulator as it is: the relic is on the player when it is gained and gone when the next fight is set up
        assert gained[0] in plain[g]["relics"]
        assert gained[0] not in plain[f]["relics"]
        assert plain[f]["relics"] == plain[g - 1]["relics"]
        assert plain[f]["aliased"] is False  # the alias went stale at the first fight and nothing repaired it
        # the variant, fed the same decisions: the same game until the relic is gained, and the relic kept at the next fight
        _, kept = _play(seed, keep_relics=True, picks=picks, until=f + 1)
        assert [s["hash"] for s in kept[: g + 1]] == [s["hash"] for s in plain[: g + 1]]
        assert gained[0] in kept[g]["relics"]
        assert gained[0] in kept[f]["relics"]
        assert all(s["aliased"] for s in kept)
        return
    pytest.fail("none of the first 40 development seeds gained a relic after its first fight and fought again with rules_v1")


def test_a_game_played_with_the_variant_replays_hash_for_hash_and_holds_more_relics(sim, tmp_path):
    from slay2_sim.policies import make_policy
    from slay2_sim.runner import replay_from_trace, run_episode

    cfg = RunConfig(character="Ironclad", keep_relics=True)
    policy = make_policy("rules_v1")
    trace = tmp_path / "7.jsonl.gz"
    record = run_episode(cfg, 7, policy, batch_id="keep-relics-test", trace_path=trace)
    assert record.outcome in ("death", "win")
    ok, message = replay_from_trace(cfg, 7, trace)
    assert ok, message
    # the same seed and policy without the variant ends with the relics the opening Ancient gave and nothing else
    plain = run_episode(RunConfig(character="Ironclad"), 7, make_policy("rules_v1"), batch_id="keep-relics-test")
    assert plain.relics == 2
    assert record.relics >= plain.relics
