"""The harness cannot play the wrong class (ADR-049).

The pinned simulator matches a class id exactly and plays any other string as Ironclad. On 2026-10-26 four classes of the
opening-relic study were played that way and every audit passed. These tests pin the three guards that make it impossible:
the class id must be exact (configuration and command line), every game must start as the class it was asked for, and the
pairing guard refuses a class string that is not exact.
"""

from __future__ import annotations

import json

import pytest

from slay2_sim import catalog, cli, gaps
from slay2_sim.classes import CHARACTER_IDS, SIM_START_HP, ClassError, check_start, exact_character, expected_start
from slay2_sim.compare import build_comparison
from slay2_sim.runner import RunConfig, new_run, run_episode

from test_compare import make_batch


def test_only_the_simulators_exact_ids_are_accepted():
    for name in CHARACTER_IDS:
        assert exact_character(name) == name
    for bad in ("silent", "SILENT", " Silent", "ironclad", "Watcher", "", None, 3):
        with pytest.raises(ClassError):
            exact_character(bad)
    with pytest.raises(ClassError, match="did you mean 'Silent'"):
        exact_character("silent")


def test_a_run_configuration_refuses_an_inexact_class_before_anything_runs():
    with pytest.raises(ClassError):
        RunConfig(character="silent")
    assert RunConfig(character="Silent").character == "Silent"
    assert RunConfig().character == "Ironclad"
    # a manifest's config rebuilds the run that wrote it, so an audit of a batch with an inexact class is refused too
    with pytest.raises(ClassError):
        RunConfig(**{"character": "necrobinder", "ascension": 0, "profile": "veteran"})


def test_the_command_line_refuses_an_inexact_class_for_runs_and_audits(capsys):
    parser = cli.build_parser()
    for argv in (["run", "--policy", "random_legal", "--character", "silent"], ["audit", "sample", "--character", "defect"]):
        with pytest.raises(SystemExit) as stop:
            parser.parse_args(argv)
        assert stop.value.code == 2
        assert "did you mean" in capsys.readouterr().err
    ok = parser.parse_args(["run", "--policy", "random_legal", "--character", "Defect"])
    assert ok.character == "Defect"


def test_the_table_of_starting_hit_points_is_the_simulators_and_the_games_except_necrobinder(sim):
    from sts2_env.run.run_manager import _CHARACTER_CONFIG, DEFAULT_CHARACTER_ID, SUPPORTED_CHARACTER_IDS

    assert set(SUPPORTED_CHARACTER_IDS) == set(CHARACTER_IDS)
    assert DEFAULT_CHARACTER_ID == "Ironclad"  # the fallback every unknown id gets
    facts = {c["id"]: c for c in json.loads(catalog.CHARACTERS_PATH.read_text(encoding="utf-8"))["characters"]}
    for name in CHARACTER_IDS:
        assert SIM_START_HP[name] == _CHARACTER_CONFIG[name]["hp"], name
        if name == "Necrobinder":
            # gap G13: the game's source says 66, the simulator starts the class at 75
            assert facts["necrobinder"]["startingHp"] == 66 and SIM_START_HP[name] == 75
            assert "G13-necrobinder-start-hp" in {g["id"] for g in gaps.applicable(0, "Necrobinder")}
        else:
            assert facts[name.lower()]["startingHp"] == SIM_START_HP[name], name


@pytest.mark.parametrize("name", CHARACTER_IDS)
def test_every_class_starts_as_itself_and_the_check_passes(sim, name):
    mgr = new_run(RunConfig(character=name), 7)
    hp, deck = expected_start(name)
    assert mgr.run_state.player.max_hp == hp
    assert {c.card_id.name for c in mgr.run_state.player.deck} == set(deck)


def test_ascenders_bane_joins_the_expected_deck_from_ascension_five(sim):
    for ascension in (4, 5, 10):
        mgr = new_run(RunConfig(character="Silent", ascension=ascension), 7)
        _, deck = expected_start("Silent", ascension)
        assert ("ASCENDERS_BANE" in deck) == (ascension >= 5)
        check_start(mgr, "Silent", ascension)  # the simulator models it, so the run is accepted


def test_a_run_that_is_not_the_class_asked_for_is_refused_with_both_sides_named(sim):
    from sts2_env.run.run_manager import RunManager

    # what the simulator does with a lower-case id: Ironclad's HP and starter deck under a different name
    fell_back = RunManager(seed=7, character_id="silent", ascension_level=0, start_with_neow=True)
    assert fell_back.run_state.player.max_hp == 80
    with pytest.raises(ClassError, match=r"did not start as Silent.*maximum HP 80 \(expected 70\)"):
        check_start(fell_back, "Silent")
    # and the right class under the wrong expectation is refused the same way
    real_silent = RunManager(seed=7, character_id="Silent", ascension_level=0, start_with_neow=True)
    with pytest.raises(ClassError):
        check_start(real_silent, "Ironclad")


def test_a_game_that_did_not_start_as_its_class_stops_the_batch_instead_of_becoming_a_result(sim, monkeypatch):
    import slay2_sim.runner as runner
    from slay2_sim.policies import make_policy
    from sts2_env.run.run_manager import RunManager

    real_new_run = runner.new_run

    def wrong_class(cfg, seed):
        mgr = RunManager(seed=seed, character_id="silent", ascension_level=0, start_with_neow=True)  # plays Ironclad
        check_start(mgr, cfg.character, cfg.ascension)
        return mgr

    monkeypatch.setattr(runner, "new_run", wrong_class)
    with pytest.raises(ClassError):
        run_episode(RunConfig(character="Silent"), 7, make_policy("random_legal"), batch_id="test-wrong-class")
    monkeypatch.setattr(runner, "new_run", real_new_run)  # and the real construction path runs the same check
    rec = run_episode(RunConfig(character="Silent", max_steps=3), 7, make_policy("random_legal"), batch_id="test-right-class")
    assert rec.character == "Silent" and rec.outcome in {"timeout", "win", "death", "simulator_error"}


def test_the_pairing_guard_refuses_an_inexact_class_even_when_both_sides_agree(tmp_path):
    rows = [(1, "death", 18, 1.0, 1)]
    lower_a = make_batch(tmp_path, "alpha-x1", rows, character="ironclad")
    lower_b = make_batch(tmp_path, "beta-x1", rows, character="ironclad")
    capital = make_batch(tmp_path, "beta-x2", rows, character="Ironclad")
    exact_a = make_batch(tmp_path, "alpha-x3", rows, character="Ironclad")
    with pytest.raises(ClassError):
        build_comparison(lower_a, lower_b)  # both wrong in the same way is still wrong
    with pytest.raises(ValueError, match="character"):
        build_comparison(lower_a, capital)  # "ironclad" against "Ironclad" is a warning, not a formatting difference
    assert build_comparison(exact_a, capital, iters=100)["bothCompleted"] == 1


def test_a_gap_about_one_class_is_listed_for_that_class_only():
    ids = lambda **kw: {g["id"] for g in gaps.applicable(0, **kw)}  # noqa: E731
    assert "G13-necrobinder-start-hp" in ids(character="Necrobinder")
    for other in ("Ironclad", "Silent", "Regent", "Defect"):
        assert "G13-necrobinder-start-hp" not in ids(character=other)
    assert "G13-necrobinder-start-hp" not in ids()  # no class given: only the gaps that are about every class
    # a gap that is not about a class keeps the exact shape every earlier manifest has
    g4 = next(g for g in gaps.applicable(0, "Silent") if g["id"].startswith("G4"))
    assert set(g4) == {"id", "summary", "min_ascension", "affects"}
