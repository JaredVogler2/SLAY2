"""Act 1 in Underdocks (gap G12, ADR-064): the harness variant plays the game's other first act, and nothing else changes.

The pinned simulator builds every run from Overgrowth and holds Underdocks only as an unused extra act. ``slay2_sim.act1`` gives a run the
two things its first act needs (the act's configuration and the pools its fights are drawn from) without editing the checkout. These tests
pin: the default (no field in the fingerprint, no change to a game), the facts (against the game's own source when it is checked out), what a
run in Underdocks is dealt, that the other two acts and the way a game is won are the simulator's, that a game is deterministic and fair, and
that every fight of the act can be played.
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import random
import re
import subprocess
import sys
from pathlib import Path

import pytest

from slay2_sim import act1 as ud
from slay2_sim import cli, external
from slay2_sim.observation import obs_hash, observe
from slay2_sim.runner import RunConfig, new_run

UNDERDOCKS = RunConfig(act1="underdocks")
CLASSES = ("Ironclad", "Silent", "Regent", "Necrobinder", "Defect")
OVERGROWTH_BOSSES = {"setup_vantom_boss", "setup_ceremonial_beast_boss", "setup_the_kin_boss"}


# --------------------------------------------------------------------------------------------------------------- the configuration


def test_the_default_keeps_the_fingerprint_of_every_earlier_batch():
    assert "act1" not in RunConfig().describe()
    assert RunConfig(act1="overgrowth").describe() == RunConfig().describe()
    assert RunConfig(act1="underdocks").describe()["act1"] == "underdocks"
    for cfg in (RunConfig(), UNDERDOCKS, RunConfig(character="Defect", ascension=9, keep_relics=True, act1="underdocks")):
        assert RunConfig(**cfg.describe()) == cfg  # a manifest's config rebuilds the run that wrote it (the audits do exactly this)


@pytest.mark.parametrize("bad", ["underdock", "Underdocks", "", "act1", None, 1])
def test_an_act1_the_game_does_not_have_is_refused_not_played_as_something_else(bad):
    with pytest.raises(ValueError, match="act1"):
        RunConfig(act1=bad)


def make_args(**over) -> argparse.Namespace:
    base = dict(seeds="x", partition="dev", allow_sealed=False, n=5, offset=0, policy="rules_v3", ancient_heal=False, character="Ironclad", ascension=0, profile="veteran")
    base.update(over)
    return argparse.Namespace(**base)


def test_the_default_batch_id_says_underdocks_and_is_unchanged_without_it():
    assert cli._default_batch_id(make_args(), 5) == "rules_v3-ironclad-a0-veteran-dev-n5"
    assert cli._default_batch_id(make_args(act1="overgrowth"), 5) == "rules_v3-ironclad-a0-veteran-dev-n5"
    assert cli._default_batch_id(make_args(act1="underdocks"), 5) == "rules_v3-ironclad-a0-veteran-underdocks-dev-n5"
    assert cli._default_batch_id(make_args(act1="underdocks", keep_relics=True), 5) == "rules_v3-ironclad-a0-veteran-keeprelics-underdocks-dev-n5"


def test_the_command_line_takes_the_variant_on_every_command_that_plays_games():
    parser = cli.build_parser()
    for command in ("run", "smoke"):
        assert parser.parse_args([command]).act1 == "overgrowth"
        assert parser.parse_args([command, "--act1", "underdocks"]).act1 == "underdocks"
        with pytest.raises(SystemExit):
            parser.parse_args([command, "--act1", "overgrowth2"])


# ----------------------------------------------------------------------------------------------------------- the facts of the game


def test_the_pools_have_the_numbers_of_the_game_and_no_overlap():
    assert [len(v) for v in ud.ENCOUNTERS.values()] == [4, 10, 3, 3] and ud.ENCOUNTER_COUNT == 20
    every = [n for names in ud.ENCOUNTERS.values() for n in names]
    assert len(set(every)) == 20
    assert len(ud.EVENTS) == 10 and len(set(ud.EVENTS)) == 10
    assert ud.ROOMS == 15 and ud.WEAK_FIGHTS == 3


def test_setup_names_are_the_simulators_names(sim):
    from sts2_env.encounters import act4

    assert ud.setup_name("CorpseSlugsWeak") == "setup_corpse_slugs_weak"
    assert ud.setup_name("TwoTailedRatsNormal") == "setup_two_tailed_rats_normal"
    pools = ud.pools()
    assert [len(v) for v in pools.values()] == [4, 10, 3, 3]
    for kind, names in ud.ENCOUNTERS.items():
        assert [fn.__name__ for fn in pools[kind]] == [ud.setup_name(n) for n in names]
        assert all(getattr(act4, fn.__name__) is fn for fn in pools[kind])
    assert ud.pools()["boss"] is not ud.pools()["boss"]  # a fresh list each call: a run's bags may not share one


def test_every_event_of_the_act_and_the_shared_ones_exist_in_the_simulator(sim):
    # an event the registry does not know is skipped without a word by the simulator's event picker (``pick_event``), so a missing one
    # would silently shrink the act's pool
    import sts2_env.events  # noqa: F401  (registers the events)
    from sts2_env.map import acts
    from sts2_env.run.events import get_event

    assert len(acts._SHARED_EVENT_IDS) == 18
    for event_id in (*ud.EVENTS, *acts._SHARED_EVENT_IDS):
        assert get_event(event_id) is not None, event_id
    config = ud.act_config()
    assert config.act_index == 0 and config.num_rooms == 15 and config.num_weak_encounters == 3
    assert config.event_ids == [*ud.EVENTS, *acts._SHARED_EVENT_IDS] and len(config.event_ids) == 28
    assert config.event_ids is not ud.act_config().event_ids  # a run shuffles its own copy in place


def _game_source(sim, *parts: str) -> str:
    path = Path(sim.root).joinpath("decompiled", *parts)
    if not path.exists():
        pytest.skip(f"the game's decompiled source is not checked out ({path})")
    return path.read_text(encoding="utf-8")


def test_the_facts_are_the_games_own_underdocks_class(sim):
    text = _game_source(sim, "MegaCrit.Sts2.Core.Models.Acts", "Underdocks.cs")
    assert re.search(r"NumberOfWeakEncounters => 3;", text) and re.search(r"BaseNumberOfRooms => 15;", text)
    assert re.search(r"public override int Index => 0;", text)  # the first act, as Overgrowth
    events = re.findall(r"ModelDb\.Event<(\w+)>\(\)", text.split("AllEvents")[1].split("NumberOfWeakEncounters")[0])
    assert tuple(events) == ud.EVENTS
    listed = re.findall(r"ModelDb\.Encounter<(\w+)>\(\)", text.split("GenerateAllEncounters")[1].split("GetUnlockedAncients")[0])
    assert len(listed) == ud.ENCOUNTER_COUNT == 20

    kinds: dict[str, list[str]] = {"weak": [], "normal": [], "elite": [], "boss": []}
    for name in listed:  # each encounter says what it is in its own file; the array's order is kept
        body = _game_source(sim, "MegaCrit.Sts2.Core.Models.Encounters", f"{name}.cs")
        room = re.search(r"RoomType RoomType => RoomType\.(\w+);", body).group(1)
        weak = bool(re.search(r"bool IsWeak => true;", body))
        kinds["elite" if room == "Elite" else "boss" if room == "Boss" else "weak" if weak else "normal"].append(name)
    assert {k: tuple(v) for k, v in kinds.items()} == ud.ENCOUNTERS


def test_the_anti_repeat_tags_are_the_games(sim):
    from sts2_env.encounters import ENCOUNTER_TAGS

    for names in ud.ENCOUNTERS.values():
        for name in names:
            body = _game_source(sim, "MegaCrit.Sts2.Core.Models.Encounters", f"{name}.cs")
            tags = frozenset(t.lower() for t in re.findall(r"EncounterTag\.(\w+)", body))
            assert ENCOUNTER_TAGS.get(ud.setup_name(name), frozenset()) == tags, name


# C# monster class -> the simulator's creator (and the arguments that pick a variant of it)
MONSTERS = {
    "CorpseSlug": ("create_corpse_slug", {"starter_idx": 0}),
    "Seapunk": ("create_seapunk", {}),
    "SludgeSpinner": ("create_sludge_spinner", {}),
    "Toadpole": ("create_toadpole", {"slot": "first"}),
    "CalcifiedCultist": ("create_calcified_cultist", {}),
    "DampCultist": ("create_damp_cultist", {}),
    "FossilStalker": ("create_fossil_stalker", {}),
    "GremlinMerc": ("create_gremlin_merc", {}),
    "SneakyGremlin": ("create_sneaky_gremlin", {}),
    "FatGremlin": ("create_fat_gremlin", {}),
    "HauntedShip": ("create_haunted_ship", {}),
    "LivingFog": ("create_living_fog", {}),
    "PunchConstruct": ("create_punch_construct", {}),
    "SewerClam": ("create_sewer_clam", {}),
    "TwoTailedRat": ("create_two_tailed_rat", {"starter_move_idx": 0}),
    "PhantasmalGardener": ("create_phantasmal_gardener", {"slot": "first"}),
    "SkulkingColony": ("create_skulking_colony", {}),
    "TerrorEel": ("create_terror_eel", {}),
    "WaterfallGiant": ("create_waterfall_giant", {}),
    "SoulFysh": ("create_soul_fysh", {}),
    "LagavulinMatriarch": ("create_lagavulin_matriarch", {}),
}


def _hp_range(source: str, which: str, level: int) -> tuple[int, int] | None:
    """(value from the game's ToughEnemies level on, value below it) of ``MinInitialHp`` or ``MaxInitialHp``; the level must be 8."""
    m = re.search(rf"{which}InitialHp => AscensionHelper\.GetValueIfAscension\(AscensionLevel\.ToughEnemies, (\d+), (\d+)\);", source)
    return (int(m.group(1)), int(m.group(2))) if m else None


@pytest.mark.parametrize("monster", sorted(MONSTERS))
def test_the_monsters_hit_points_are_the_games_at_every_ascension(sim, monster):
    """The simulator's monster has the hit points the game's class gives it (ToughEnemies is Ascension 8): the range, both ends reached."""
    from sts2_env.core.rng import Rng
    from sts2_env.monsters import act4 as monsters

    source = _game_source(sim, "MegaCrit.Sts2.Core.Models.Monsters", f"{monster}.cs")
    lo, hi = _hp_range(source, "Min", 8), None
    if re.search(r"MaxInitialHp => MinInitialHp;", source):
        hi = lo
    else:
        hi = _hp_range(source, "Max", 8)
    assert lo and hi, monster
    creator, kwargs = MONSTERS[monster]
    for ascension in (0, 7, 8, 9, 10):
        tough = ascension >= 8
        want = (lo[0] if tough else lo[1], hi[0] if tough else hi[1])
        seen = {getattr(monsters, creator)(Rng(seed), ascension_level=ascension, **kwargs)[0].max_hp for seed in range(300)}
        assert min(seen) == want[0] and max(seen) == want[1], f"{monster} at Ascension {ascension}: {sorted(seen)} against {want}"


# ---------------------------------------------------------------------------------------------------------- what a run is dealt


SEEDS = 240  # building a run costs a third of a second (the Ancient's opening, the map), so each seed is built once for the whole module
_DEALT: dict[int, tuple] = {}


def _rooms(seed: int, cfg: RunConfig = UNDERDOCKS):
    mgr = new_run(cfg, seed)
    return mgr, mgr.run_state.get_act_room_set(0)


def _dealt(seed: int):
    """(run state, the first act's room set, the boss's name) of the Underdocks run of ``seed``, built once."""
    if seed not in _DEALT:
        mgr, rooms = _rooms(seed)
        _DEALT[seed] = (mgr.run_state, rooms, ud.boss_name(mgr))
    return _DEALT[seed]


def test_a_run_in_underdocks_is_dealt_underdocks_fights_and_only_those(sim):
    want = ud.pools()
    for seed in range(SEEDS):
        rs, rooms, boss = _dealt(seed)
        assert len(rs.acts) == 3 and rs.current_act_index == 0
        assert len(rooms.normal_encounters) == 15
        assert all(e in want["weak"] for e in rooms.normal_encounters[:3])  # the first three fights come from the weak pool
        assert all(e in want["normal"] for e in rooms.normal_encounters[3:])
        assert len(rooms.elite_encounters) == 15 and all(e in want["elite"] for e in rooms.elite_encounters)
        assert rooms.boss in want["boss"]
        assert sorted(rs.acts[0].event_ids) == sorted([*ud.EVENTS, *ud._shared_events()])
        assert boss in ud.ENCOUNTERS["boss"]


def test_the_anti_repeat_rule_is_in_force_in_underdocks_as_in_the_other_acts(sim):
    from sts2_env.encounters import shares_tags_with
    from sts2_env.encounters import act4

    # the tag table knows the act's tagged encounters (the slugs and the seapunk, in their weak and normal forms) ...
    assert shares_tags_with(act4.setup_corpse_slugs_weak, act4.setup_corpse_slugs_normal)
    assert shares_tags_with(act4.setup_seapunk_weak, act4.setup_seapunk_normal)
    assert not shares_tags_with(act4.setup_seapunk_normal, act4.setup_corpse_slugs_normal)
    assert not shares_tags_with(act4.setup_cultists_normal, act4.setup_cultists_normal)  # an untagged encounter shares nothing
    # ... and the rooms it deals rarely put two encounters of one tag next to each other (the rule is "no shared tag and not equal, with a
    # fallback to anything when the bag has nothing else")
    pairs = repeats = 0
    for seed in range(SEEDS):
        _, rooms, _ = _dealt(seed)
        for a, b in zip(rooms.normal_encounters, rooms.normal_encounters[1:]):
            pairs += 1
            repeats += shares_tags_with(a, b)
    assert repeats / pairs < 0.05, (repeats, pairs)


def test_the_boss_is_dealt_from_the_three_and_about_equally(sim):
    counts = collections.Counter(_dealt(seed)[2] for seed in range(SEEDS))
    assert set(counts) == set(ud.ENCOUNTERS["boss"])
    assert all(50 <= n <= 110 for n in counts.values()), counts  # 80 each, a little over four standard errors (7.3) either way


def test_every_underdocks_fight_appears_in_a_run_given_enough_runs(sim):
    seen_normal, seen_weak, seen_elite = set(), set(), set()
    for seed in range(SEEDS):
        _, rooms, _ = _dealt(seed)
        seen_weak.update(e.__name__ for e in rooms.normal_encounters[:3])
        seen_normal.update(e.__name__ for e in rooms.normal_encounters[3:])
        seen_elite.update(e.__name__ for e in rooms.elite_encounters)
    assert seen_weak == {ud.setup_name(n) for n in ud.ENCOUNTERS["weak"]}
    assert seen_normal == {ud.setup_name(n) for n in ud.ENCOUNTERS["normal"]}
    assert seen_elite == {ud.setup_name(n) for n in ud.ENCOUNTERS["elite"]}


def test_the_second_and_third_acts_and_the_win_are_the_simulators_own(sim):
    from sts2_env.encounters import get_act_encounter_pools
    from sts2_env.map import acts

    for seed in range(12):
        rs, _, _ = _dealt(seed)
        for index in (1, 2):
            pools = get_act_encounter_pools(index)
            rooms = rs.get_act_room_set(index)
            assert all(e in pools["weak"] for e in rooms.normal_encounters[: rs.acts[index].num_weak_encounters])
            assert all(e in pools["weak"] + pools["normal"] for e in rooms.normal_encounters)
            assert all(e in pools["elite"] for e in rooms.elite_encounters) and rooms.boss in pools["boss"]
            assert sorted(rs.acts[index].event_ids) == sorted(acts.ALL_ACTS[index].event_ids)
            assert rs.acts[index].num_rooms == acts.ALL_ACTS[index].num_rooms
    # three acts and no fourth: leaving the third act is the victory, whatever the first act was
    mgr, _ = _rooms(5)
    rs = mgr.run_state
    rs.enter_act(2)
    assert rs.enter_next_act() is False and rs.is_over and rs.player_won


def test_the_default_run_is_overgrowth_and_the_variant_leaves_no_trace_in_the_simulator(sim):
    import sts2_env.encounters as encounters
    import sts2_env.run.run_manager as rm
    from sts2_env.map import acts

    snapshot = list(acts.ALL_ACTS[0].event_ids)
    original_pools, original_state = encounters.get_act_encounter_pools, rm.RunState
    for seed in range(8):
        new_run(UNDERDOCKS, seed)
        assert encounters.get_act_encounter_pools is original_pools and rm.RunState is original_state
        assert acts.ALL_ACTS[0].event_ids == snapshot
        mgr, rooms = _rooms(seed, RunConfig())
        assert rooms.boss.__name__ in OVERGROWTH_BOSSES
        assert ud.check_act1(mgr, "overgrowth") is None


def test_the_patch_is_undone_when_building_the_rooms_fails(sim, monkeypatch):
    import sts2_env.encounters as encounters

    original = encounters.get_act_encounter_pools

    def broken():
        raise RuntimeError("no pools today")

    monkeypatch.setattr(ud, "pools", broken)
    with pytest.raises(RuntimeError, match="no pools today"):
        new_run(UNDERDOCKS, 1)
    assert encounters.get_act_encounter_pools is original


def test_a_run_that_is_not_in_the_act_that_was_asked_for_is_refused(sim):
    mgr = new_run(RunConfig(), 3)  # an Overgrowth run
    with pytest.raises(ud.Act1Error):
        ud.check_act1(mgr, "underdocks")
    with pytest.raises(ud.Act1Error, match="unknown"):
        ud.check_act1(mgr, "act1")
    from slay2_sim.classes import ClassError

    assert issubclass(ud.Act1Error, ClassError)  # the episode runner stops a batch on it, as on a wrong class
    mgr = new_run(UNDERDOCKS, 3)
    mgr.run_state.get_act_room_set(0).boss = ud.pools()["weak"][0]  # a fight that is not a boss of the act
    with pytest.raises(ud.Act1Error):
        ud.check_act1(mgr, "underdocks")


def test_the_episode_record_names_the_boss_only_outside_overgrowth(sim):
    from slay2_sim.policies import make_policy
    from slay2_sim.runner import run_episode

    policy = make_policy("rules_v1")
    rec = run_episode(UNDERDOCKS, 11, policy, batch_id="t")
    assert rec.extra["act1"] == {"version": "underdocks", "boss": ud.boss_name(new_run(UNDERDOCKS, 11))}
    assert "act1" not in run_episode(RunConfig(), 11, policy, batch_id="t").extra  # the records of every earlier batch stay what they were
    assert rec.outcome in {"win", "death"}


# ---------------------------------------------------------------------------------------------------------- the game is a game


def _trace(cfg: RunConfig, seed: int, steps: int = 400) -> list[str]:
    mgr = new_run(cfg, seed)
    rnd = random.Random(seed)
    out = []
    for _ in range(steps):
        if mgr.is_over:
            break
        actions = mgr.get_available_actions()
        out.append(obs_hash(observe(mgr, actions)))
        mgr.take_action(rnd.choice(actions))
    return out


@pytest.mark.parametrize("character", CLASSES)
def test_a_game_in_underdocks_is_a_function_of_its_seed(sim, character):
    cfg = RunConfig(character=character, act1="underdocks")
    assert _trace(cfg, 21) == _trace(cfg, 21)
    assert _trace(cfg, 21) != _trace(cfg, 22)


def test_the_two_versions_of_act_one_differ_from_the_first_fight_and_share_the_opening(sim):
    under, over = _trace(UNDERDOCKS, 31), _trace(RunConfig(), 31)
    assert under[:3] == over[:3]  # the Ancient's opening and the first map are the same: same seed, same Ancient, same map rules
    assert under != over


SCRIPT = r"""
import json, sys
from slay2_sim import external
sim = external.locate()
external.activate(sim.root)
from slay2_sim.isolation import deliberation
from slay2_sim.observation import obs_hash, observe
from slay2_sim.policies import make_policy
from slay2_sim.runner import RunConfig, new_run, policy_seed_for

seed, character = int(sys.argv[1]), sys.argv[2]
cfg = RunConfig(character=character, act1="underdocks")
policy = make_policy("rules_v1")
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


@pytest.mark.parametrize("character,seed", [("Ironclad", 41), ("Defect", 42), ("Necrobinder", 43)])
def test_the_second_game_of_a_process_replays_the_first_in_underdocks(sim, character, seed):
    """ADR-037 for the other first act: nothing in Underdocks makes a game depend on how many games its process played before it."""
    env = {**os.environ, "PYTHONPATH": str(external.REPO_ROOT / "sim")}
    env.pop("SLAY2_NO_WARMUP", None)
    out = subprocess.run([sys.executable, "-c", SCRIPT, str(seed), character], env=env, cwd=external.REPO_ROOT, capture_output=True, text=True, timeout=600, check=True)
    got = json.loads(out.stdout.strip().splitlines()[-1])
    assert got["steps"] > 100 and got["first_divergence"] is None


# ------------------------------------------------------------------------------------------------------------------ every fight


def _fight(setup_fn, room_type, character: str, ascension: int, seed: int) -> tuple[int, str, list[tuple[str, int]]]:
    """Play one encounter of the act to its end (or 700 random legal actions) with a very large HP pool, so that the monsters' whole move
    cycle is met. Returns (actions taken, the phase it ended in, the enemies it began with); an exception in the simulator is the test
    failing."""
    from sts2_env.core.enums import RoomType

    cfg = RunConfig(character=character, ascension=ascension, act1="underdocks")
    mgr = new_run(cfg, seed)
    rooms = mgr.run_state.get_act_room_set(0)
    if room_type == "boss":
        rooms.boss = setup_fn
    elif room_type == "elite":
        rooms.elite_encounters[:] = [setup_fn]
    else:
        rooms.normal_encounters[:] = [setup_fn]
    player = mgr.run_state.player
    player.max_hp = player.current_hp = 4000
    mgr._enter_combat({"boss": RoomType.BOSS, "elite": RoomType.ELITE, "normal": RoomType.MONSTER}[room_type])
    began = [(e["id"], e["max_hp"]) for e in observe(mgr, mgr.get_available_actions())["combat"]["enemies"]]
    rnd = random.Random(seed)
    steps = 0
    while mgr.phase == "COMBAT" and not mgr.is_over and steps < 700:
        actions = mgr.get_available_actions()
        assert actions, f"no legal action in {setup_fn.__name__}"
        mgr.take_action(rnd.choice(actions))
        steps += 1
    return steps, mgr.phase, began


ENCOUNTER_KINDS = [(kind, name) for kind, names in ud.ENCOUNTERS.items() for name in names]


@pytest.mark.parametrize("kind,name", ENCOUNTER_KINDS, ids=[n for _, n in ENCOUNTER_KINDS])
def test_every_fight_of_the_act_can_be_played_at_ascension_0_and_9(sim, kind, name):
    setup_fn = next(fn for fn in ud.pools()[kind] if fn.__name__ == ud.setup_name(name))
    room = {"weak": "normal", "normal": "normal", "elite": "elite", "boss": "boss"}[kind]
    for ascension in (0, 9):
        for seed, character in ((1, "Ironclad"), (2, "Defect"), (3, "Necrobinder")):
            steps, phase, began = _fight(setup_fn, room, character, ascension, seed)
            assert began and all(hp > 0 for _, hp in began), (name, began)  # the encounter put real enemies into the fight
            assert steps >= 5, f"{name} ended after {steps} actions in {phase}"  # a fight that ends at once was not set up
            expected = {"CorpseSlugsWeak": 2, "CorpseSlugsNormal": 3, "TwoTailedRatsNormal": 3, "PhantasmalGardenersElite": 4, "GremlinMercNormal": 3, "ToadpolesWeak": 2, "CultistsNormal": 2, "SeapunkNormal": 2}
            if name in expected:
                assert len(began) == expected[name], (name, began)  # the numbers of enemies of the game's own GenerateMonsters
