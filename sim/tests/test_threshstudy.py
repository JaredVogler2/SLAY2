"""The threshold study's development screen and design checks (ADR-062): the selection rule on synthetic batches with known answers."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from slay2_sim import threshstudy as ts
from test_compare import make_batch

N = 64   # seeds a class: 1 in 4 ends in Act 1 (act 0), 1 in 2 in Act 2 (act 1), 1 in 4 in Act 3 (act 2); S wins 1 seed in 8 (those that end in Act 3)


def s_act(i: int) -> int:
    return 2 if i % 4 == 0 else 1 if i % 4 in (1, 2) else 0


def s_outcome(i: int) -> str:
    return "win" if i % 8 == 0 else "death"


def rows_of(gain: int = 0, loss: int = 0, break_act0: bool = False) -> list[tuple]:
    """S's games, but ``gain`` of the Act-3 deaths (seeds 4, 12, ...) become wins, ``loss`` of S's wins (seeds 0, 8, ...) become deaths and, if asked,
    one game that S ended in Act 1 (seed 3) is another game (the design's own check must catch it)."""
    out = []
    for i in range(N):
        outcome, act, floor = s_outcome(i), s_act(i), 50 if s_act(i) == 2 else 25 if s_act(i) == 1 else 10
        if i % 8 == 4 and (i - 4) // 8 < gain:
            outcome = "win"
        if i % 8 == 0 and i // 8 < loss:
            outcome = "death"
        if break_act0 and i == 3:
            floor, act = 12, 0
        out.append((i, outcome, floor, 1.0, act))
    return out


def write(root: Path, ident, arm: str, **kw) -> None:
    for cls in ts.CLASSES:
        make_batch(root, ident(arm, cls), rows_of(**kw), character=cls)


def build(tmp_path: Path, ident=ts.dev_id, **per_arm) -> Path:
    root = tmp_path / "batches"
    root.mkdir(parents=True)
    write(root, ident, "s")
    spec = {tag: {} for tag in ts.GRID} | per_arm
    for arm, kw in spec.items():
        write(root, ident, arm, **kw)
    return root


def test_the_names_are_the_ones_the_batches_use():
    assert ts.dev_id("t030", "Defect") == "thresh-dev-t030-defect-a0-veteran-keeprelics-dev2-n3000"
    assert ts.val_id("t020", "Ironclad") == "thresh-val-t020-ironclad-a0-veteran-keeprelics-val3-n15000"
    assert ts.CLASSES == ("Ironclad", "Defect") and ts.SEEDS_FILE == "experiments/seeds/ironclad-a0-v4.json"
    assert (ts.DEV_PARTITION, ts.DEV_N, ts.VAL_PARTITION, ts.VAL_N) == ("dev2", 3000, "val3", 15000)
    assert ts.GRID == {"t010": 0.1, "t020": 0.2, "t030": 0.3, "t045": 0.45, "t060": 0.6, "tnone": 100.0}
    assert ts.REPLICATION_TAG in ts.GRID and ts.HEAD_ALPHA == 0.20 and ts.STUDY_ALPHA == 0.05 and ts.FIRST_ACT == 1


def test_the_choice_is_the_largest_net_win_and_a_tie_goes_to_the_smaller_threshold_and_it_advances_when_ahead_of_0_2(tmp_path):
    # per class: t020 gains 2, t030 and t045 gain 4 (a tie: the smaller threshold wins), t060 gains 1, tnone loses 2 of S's wins, t010 is S
    root = build(tmp_path, t020={"gain": 2}, t030={"gain": 4}, t045={"gain": 4}, t060={"gain": 1}, tnone={"loss": 2})
    sel = ts.select(root, iters=200)
    arms = sel["arms"]
    assert arms["t010"]["net"] == 0 and arms["t010"]["armOnly"] == 0 and arms["t010"]["baselineOnly"] == 0
    assert arms["t020"]["net"] == 4 and arms["t030"]["net"] == 8 == arms["t045"]["net"] and arms["t060"]["net"] == 2
    assert arms["tnone"]["net"] == -4 and arms["tnone"]["baselineOnly"] == 4
    assert sel["best"] == {"arm": "t030", "threshold": 0.3, "net": 8}
    # against 0.2 the choice is ahead in 4 pairs and behind in none: the exact two-sided p is 0.125, below 0.20
    assert sel["headToHead"]["armOnly"] == 4 and sel["headToHead"]["baselineOnly"] == 0 and sel["headToHead"]["p"] == pytest.approx(0.125)
    assert sel["choice"] == {"arm": "t030", "threshold": 0.3, "advance": True, "reason": sel["choice"]["reason"]}
    assert "ahead of 0.2 in the head-to-head" in sel["choice"]["reason"]
    assert sel["designChecksPassed"] is True and sel["role"] == "development: not a held-out result"
    assert arms["t030"]["identity"] == {"beforePairs": 2 * (N // 4), "beforeDifferent": 0, "bossPairs": 2 * N, "bossDifferent": 0, "wallClockPairs": 0}
    # S wins 8 games a class and 16 in all; shares are of the pairs both games completed
    assert arms["t030"]["wins"] == {"arm": 24, "baseline": 16} and arms["t030"]["shares"]["baseline"] == pytest.approx(16 / (2 * N))


def test_when_0_2_itself_has_the_largest_net_wins_nothing_more_is_tested(tmp_path):
    root = build(tmp_path, t010={"gain": 1}, t020={"gain": 3}, t030={"gain": 2})
    sel = ts.select(root, iters=200)
    assert sel["best"]["arm"] == "t020" and sel["choice"]["advance"] is False and sel["choice"]["arm"] is None and sel["headToHead"] is None
    assert "0.2 itself" in sel["choice"]["reason"]


def test_when_no_threshold_wins_more_than_s_nothing_advances(tmp_path):
    root = build(tmp_path, tnone={"loss": 3}, t060={"loss": 1})
    sel = ts.select(root, iters=200)
    assert sel["best"]["net"] == 0 and sel["best"]["arm"] == "t010"   # all zero: the tie goes to the smallest threshold, and zero is not above zero
    assert sel["choice"]["advance"] is False and "no threshold won more games than S" in sel["choice"]["reason"]


def test_a_choice_that_is_not_clearly_ahead_of_0_2_does_not_advance(tmp_path):
    # t030 gains 5 a class against t020's 4: ahead by one pair a class (2 in all), exact p of 2 against 0 is 0.5, far above 0.20
    root = build(tmp_path, t020={"gain": 4}, t030={"gain": 5})
    sel = ts.select(root, iters=200)
    assert sel["best"]["arm"] == "t030" and sel["headToHead"]["armOnly"] == 2 and sel["headToHead"]["p"] == pytest.approx(0.5)
    assert sel["choice"]["advance"] is False and "not ahead of 0.2" in sel["choice"]["reason"]


def test_the_advance_rule_needs_a_positive_net_a_choice_other_than_0_2_and_a_head_to_head_that_is_ahead_with_a_p_below_the_level():
    head = lambda a, b, p: {"armOnly": a, "baselineOnly": b, "p": p}  # noqa: E731
    assert ts.advance_rule("t030", 5, head(9, 2, 0.19))[0] is True
    assert ts.advance_rule("t030", 5, head(9, 2, 0.20))[0] is False        # at the level is not below it
    assert ts.advance_rule("t030", 5, head(5, 5, 0.01))[0] is False        # a tie is not ahead, whatever the p
    assert ts.advance_rule("t030", 5, head(2, 9, 0.01))[0] is False        # behind is not ahead, however small the p
    assert ts.advance_rule("t030", 0, head(9, 2, 0.01))[0] is False        # a net of zero is not above zero
    assert ts.advance_rule("t030", -3, head(9, 2, 0.01))[0] is False
    ok, why = ts.advance_rule("t020", 7, None)                              # 0.2 itself: no head-to-head is needed or read
    assert ok is False and "0.2 itself" in why
    with pytest.raises(ValueError):
        ts.advance_rule("t045", 4, None)


def test_a_game_that_s_ended_in_act_1_must_be_the_arms_own_record_or_the_study_stops(tmp_path):
    root = build(tmp_path, t030={"gain": 2, "break_act0": True})
    with pytest.raises(ts.StudyStop, match=r"t030: 2 of 32 games that S ended in Act 1 differ"):
        ts.select(root, iters=200)
    out = tmp_path / "sel.json"
    assert ts.main(["dev", "--batches", str(root), "--out", str(out)]) == 1 and not out.exists()   # nothing is written when the design check fails


def test_the_command_writes_the_selection_and_the_tests_follow_from_it(tmp_path, capsys):
    root = build(tmp_path, t020={"gain": 2}, t030={"gain": 4})
    out = tmp_path / "thresh" / "dev-selection.json"
    assert ts.main(["dev", "--batches", str(root), "--out", str(out)]) == 0
    sel = json.loads(out.read_text(encoding="utf-8"))
    assert sel["choice"]["advance"] is True and sel["choice"]["arm"] == "t030"
    assert [t["key"] for t in ts.tests_of(sel)] == ["T1", "T2", "T3"]
    assert ts.tests_of(sel)[2] == {"key": "T3", "arm": "t030", "baseline": "t020"} and ts.tests_of(sel)[1]["baseline"] == "s"
    assert ts.level_of(sel) == pytest.approx(0.05 / 3) and ts.val_arms(sel) == ["s", "t020", "t030"]
    capsys.readouterr()
    assert ts.main(["tests", "--selection", str(out)]) == 0
    said = json.loads(capsys.readouterr().out)
    assert said["arms"] == ["s", "t020", "t030"] and said["level"] == pytest.approx(0.05 / 3) and len(said["tests"]) == 3


def test_without_an_advance_only_the_replication_is_tested_at_the_whole_level(tmp_path):
    root = build(tmp_path, t020={"gain": 3})
    sel = ts.select(root, iters=200)
    assert [t["key"] for t in ts.tests_of(sel)] == ["T1"] and ts.tests_of(sel)[0] == {"key": "T1", "arm": "t020", "baseline": "s"}
    assert ts.level_of(sel) == 0.05 and ts.val_arms(sel) == ["s", "t020"]


def test_the_identity_command_checks_the_held_out_arms_against_s_and_fails_on_a_difference(tmp_path):
    root = build(tmp_path, ident=ts.val_id, t020={"gain": 2})
    out = tmp_path / "identity" / "t020.json"
    assert ts.main(["identity", "t020", "--stage", "val", "--batches", str(root), "--out", str(out)]) == 0
    rec = json.loads(out.read_text(encoding="utf-8"))
    assert rec["kind"] == "thresh-identity" and rec["stage"] == "val" and rec["beforeDifferent"] == 0 and rec["beforePairs"] == 2 * (N // 4)
    assert rec["batches"] == [ts.val_id("t020", "Ironclad"), ts.val_id("s", "Ironclad"), ts.val_id("t020", "Defect"), ts.val_id("s", "Defect")]
    bad = build(tmp_path / "bad", ident=ts.val_id, t020={"break_act0": True})
    assert ts.main(["identity", "t020", "--stage", "val", "--batches", str(bad), "--out", str(tmp_path / "bad.json")]) == 1


def test_a_boss_that_goes_differently_in_a_pair_is_a_difference_too(tmp_path):
    root = build(tmp_path, ident=ts.val_id)
    # seed 5 ended in Act 2 (act 1, past the Act-1 boss) in S; in the arm it ends in Act 1: the pair disagrees about the Act-1 boss
    d = root / ts.val_id("t020", "Ironclad") / "episodes.jsonl"
    lines = [json.loads(line) for line in d.read_text(encoding="utf-8").splitlines()]
    for r in lines:
        if r["seed"] == 5:
            r["act"] = 0
    d.write_text("".join(json.dumps(r) + "\n" for r in lines), encoding="utf-8")
    rec = ts.identity_for(root, "t020", ts.val_id)
    assert rec["bossDifferent"] == 1 and ts.broken(rec)


def test_a_selection_that_advances_0_2_itself_or_an_arm_the_grid_does_not_have_is_refused():
    for arm in ("t020", "t099", None):
        sel = {"choice": {"advance": True, "arm": arm}}
        with pytest.raises(ValueError, match="not a threshold of the grid other than t020"):
            ts.tests_of(sel)
        with pytest.raises(ValueError):
            ts.val_arms(sel)
        with pytest.raises(ValueError):
            ts.level_of(sel)
    # not advanced: the arm named (None, as the screen writes it) is not read
    assert ts.tests_of({"choice": {"advance": False, "arm": None}}) == [{"key": "T1", "arm": "t020", "baseline": "s"}]
    assert ts.val_arms({"choice": {"advance": False, "arm": None}}) == ["s", "t020"]


def test_the_mean_final_deck_is_descriptive_and_read_over_the_pairs_both_games_completed(tmp_path):
    root = build(tmp_path, t030={"gain": 1})
    kept = {"arm": [], "baseline": []}
    for arm in ("s", *ts.GRID):
        for cls in ts.CLASSES:
            f = root / ts.dev_id(arm, cls) / "episodes.jsonl"
            lines = [json.loads(line) for line in f.read_text(encoding="utf-8").splitlines()]
            for r in lines:
                size = 24 + (2 if r["seed"] % 2 else 0)                    # odd seeds have two cards more
                r["deck_size"] = size - 4 if arm == "t030" and s_act(r["seed"]) >= 1 else size   # t030 takes four cards fewer once a game has passed Act 1
            if arm == "t030" and cls == "Defect":
                lines[0]["outcome"] = "simulator_error"                      # one pair is left out
            f.write_text("".join(json.dumps(r) + "\n" for r in lines), encoding="utf-8")
    for cls in ts.CLASSES:
        for i in range(N):
            if cls == "Defect" and i == 0:
                continue
            base = 24 + (2 if i % 2 else 0)
            kept["baseline"].append(base)
            kept["arm"].append(base - 4 if s_act(i) >= 1 else base)
    sel = ts.select(root, iters=200)
    deck = sel["arms"]["t030"]["meanDeckSize"]
    assert deck["pairs"] == 2 * N - 1 == len(kept["arm"])
    assert deck["arm"] == pytest.approx(sum(kept["arm"]) / len(kept["arm"])) and deck["baseline"] == pytest.approx(sum(kept["baseline"]) / len(kept["baseline"]))
    assert deck["baseline"] - deck["arm"] == pytest.approx(4 * (3 * N / 4 * 2 - 1) / (2 * N - 1))      # three seeds in four pass Act 1 (seed 0, left out, is one)
    t010 = sel["arms"]["t010"]["meanDeckSize"]                               # an arm that plays S's game: the same deck size in every pair
    assert t010["arm"] == pytest.approx(t010["baseline"]) and t010["pairs"] == 2 * N


def test_a_batch_without_a_deck_size_has_no_mean_deck(tmp_path):
    root = build(tmp_path)
    assert ts.select(root, iters=200)["arms"]["t030"]["meanDeckSize"] == {"arm": None, "baseline": None, "pairs": 0}


def rewrite(root: Path, ident: str, arm: str, cls: str, change) -> None:
    """Edit the episode records of one batch: ``change(record)`` for each."""
    f = root / ident / "episodes.jsonl"
    lines = [json.loads(line) for line in f.read_text(encoding="utf-8").splitlines()]
    for r in lines:
        change(r)
    f.write_text("".join(json.dumps(r) + "\n" for r in lines), encoding="utf-8")


def test_a_pair_stopped_by_the_wall_clock_is_not_compared_and_is_counted_but_any_other_stop_is_the_games_own(tmp_path):
    root = build(tmp_path, ident=ts.val_id)
    # seed 3 is a game S ended in Act 1; in the arm's batch the wall clock stopped it (the load of the machine, not the play): not compared
    rewrite(root, ts.val_id("t020", "Ironclad"), "t020", "Ironclad", lambda r: r.update(outcome="timeout", error="episode exceeded 900s wall clock") if r["seed"] == 3 else None)
    rec = ts.identity_for(root, "t020", ts.val_id)
    assert rec["wallClockPairs"] == 1 and rec["beforeDifferent"] == 0 and rec["bossDifferent"] == 0 and not ts.broken(rec)
    assert rec["beforePairs"] == 2 * (N // 4) - 1 and rec["bossPairs"] == 2 * N - 1
    # the same stop in S's batch counts the same way
    root2 = build(tmp_path / "s-side", ident=ts.val_id)
    rewrite(root2, ts.val_id("s", "Defect"), "s", "Defect", lambda r: r.update(outcome="timeout", error="episode exceeded 900s wall clock") if r["seed"] == 7 else None)
    assert ts.identity_for(root2, "t030", ts.val_id)["wallClockPairs"] == 1
    # a turn limit is the game's own: the arm reproduces it, so a difference is a difference
    root3 = build(tmp_path / "turns", ident=ts.val_id)
    rewrite(root3, ts.val_id("t020", "Ironclad"), "t020", "Ironclad", lambda r: r.update(outcome="timeout", error="combat exceeded 80 turns") if r["seed"] == 3 else None)
    rec3 = ts.identity_for(root3, "t020", ts.val_id)
    assert rec3["wallClockPairs"] == 0 and rec3["beforeDifferent"] == 1 and ts.broken(rec3)


def test_the_identity_record_and_the_selection_carry_the_content_hash_of_every_batch_they_were_made_from(tmp_path):
    root = build(tmp_path, ident=ts.val_id)
    rec = ts.identity_for(root, "t030", ts.val_id)
    assert set(rec["contentSha256"]) == set(rec["batches"]) and all(v == "c" * 64 for v in rec["contentSha256"].values())   # make_batch writes one hash for all
    (root / ts.val_id("t030", "Defect") / "manifest.json").unlink()
    assert ts.identity_for(root, "t030", ts.val_id)["contentSha256"][ts.val_id("t030", "Defect")] is None
    dev = build(tmp_path / "dev")
    sel = ts.select(dev, iters=200)
    assert set(sel["contentSha256"]) == {ts.dev_id(a, c) for a in ("s", *ts.GRID) for c in ts.CLASSES} and all(v == "c" * 64 for v in sel["contentSha256"].values())


def test_the_design_check_of_the_screen_also_stops_on_a_pair_that_differs_about_the_act_1_boss(tmp_path):
    root = build(tmp_path)
    rewrite(root, ts.dev_id("t045", "Defect"), "t045", "Defect", lambda r: r.update(act=0) if r["seed"] == 5 else None)   # S took seed 5 past the first boss
    with pytest.raises(ts.StudyStop, match=r"t045: 0 of 32 games that S ended in Act 1 differ, 1 of 128 pairs differ about the Act-1 boss"):
        ts.select(root, iters=200)


def test_the_selection_can_be_recomputed_from_the_batches_and_a_hand_edit_or_a_changed_batch_is_found(tmp_path, capsys):
    root = build(tmp_path, t020={"gain": 2}, t030={"gain": 4})
    out = tmp_path / "sel.json"
    assert ts.main(["dev", "--batches", str(root), "--out", str(out)]) == 0
    capsys.readouterr()
    assert ts.main(["verify", "--batches", str(root), "--selection", str(out)]) == 0
    assert "is what the rule of ADR-062 item 3 gives" in capsys.readouterr().out
    body = json.loads(out.read_text(encoding="utf-8"))
    body["arms"]["t045"]["net"] += 1
    body["choice"]["arm"] = "t045"
    out.write_text(json.dumps(body), encoding="utf-8")
    assert ts.main(["verify", "--batches", str(root), "--selection", str(out)]) == 1
    err = capsys.readouterr().err
    assert "arms.t045 differs" in err and "choice differs" in err
    # the file is right but a batch it was made from has been changed
    out.write_text(json.dumps(json.loads(json.dumps(ts.select(root, iters=200), sort_keys=True))), encoding="utf-8")
    rewrite(root, ts.dev_id("t030", "Ironclad"), "t030", "Ironclad", lambda r: r.update(outcome="death") if r["seed"] == 0 else None)
    assert ts.main(["verify", "--batches", str(root), "--selection", str(out)]) == 1
    assert "differs" in capsys.readouterr().err
    # batches whose own design check fails are not recomputed into a selection
    root2 = build(tmp_path / "stop", t030={"gain": 2, "break_act0": True})
    good = tmp_path / "good.json"
    good.write_text("{}", encoding="utf-8")
    assert ts.main(["verify", "--batches", str(root2), "--selection", str(good)]) == 1
    assert "STOP: the design's own check failed" in capsys.readouterr().err


def test_the_fingerprints_of_the_pooled_computations_are_written_but_not_compared_while_every_number_the_rule_reads_and_every_batch_hash_is(tmp_path, capsys):
    """`pooledSha256` hashes bootstrap intervals, which depend on the random stream of the installed numpy and not on the games: a rebuilt environment must not
    refuse a correct selection (item 5 of the record: the content hash of every batch is what binds the inputs)."""
    root = build(tmp_path, t020={"gain": 2}, t030={"gain": 4})
    sel = tmp_path / "sel.json"
    assert ts.main(["dev", "--batches", str(root), "--out", str(sel)]) == 0
    capsys.readouterr()
    body = json.loads(sel.read_text(encoding="utf-8"))
    assert body["choice"]["advance"] is True and body["headToHead"] is not None
    assert all(len(row["pooledSha256"]) == 64 for row in body["arms"].values()) and len(body["headToHead"]["pooledSha256"]) == 64      # (they are still written)
    different = json.loads(json.dumps(body))
    for row in different["arms"].values():
        row["pooledSha256"] = "0" * 64
    different["headToHead"]["pooledSha256"] = "f" * 64
    sel.write_text(json.dumps(different), encoding="utf-8")
    assert ts.main(["verify", "--batches", str(root), "--selection", str(sel)]) == 0                  # another fingerprint of the same selection is accepted ...
    first_batch = next(iter(body["contentSha256"]))
    edits = {
        "a net the rule reads": lambda b: b["arms"]["t030"].update(net=b["arms"]["t030"]["net"] + 1),
        "a p value of the head-to-head": lambda b: b["headToHead"].update(p=0.5),
        "the content hash of a batch": lambda b: b["contentSha256"].update({first_batch: "0" * 64}),
        "the choice": lambda b: b["choice"].update(advance=not b["choice"]["advance"]),
    }
    for what, edit in edits.items():                                                                  # ... and nothing else is
        edited = json.loads(json.dumps(different))
        edit(edited)
        sel.write_text(json.dumps(edited), encoding="utf-8")
        assert ts.main(["verify", "--batches", str(root), "--selection", str(sel)]) == 1, what
        capsys.readouterr()
    # a selection without the fingerprint fields at all is the same selection
    stripped = json.loads(json.dumps(body))
    for row in stripped["arms"].values():
        del row["pooledSha256"]
    del stripped["headToHead"]["pooledSha256"]
    sel.write_text(json.dumps(stripped), encoding="utf-8")
    assert ts.main(["verify", "--batches", str(root), "--selection", str(sel)]) == 0
