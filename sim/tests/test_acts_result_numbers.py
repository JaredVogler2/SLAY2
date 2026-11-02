"""`scripts/acts-result-numbers.py --arms` prints the per-arm counts that the result section of ADR-061 quotes (so that none is typed by hand), and `--post-hoc` the
decomposition of the net wins and the second-boss interval from the episodes.

`--arms` reads only the manifests and audit records of the 25 held-out batches. This test builds a small world with known counts: five arms, five classes,
a batch with no win (no win audit to read), a batch with wins, and a second commit.
"""

from __future__ import annotations

import gzip
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
ARMS = ("s", "lead", "a1", "a2", "a3")
CLASSES = ("ironclad", "silent", "regent", "necrobinder", "defect")


def _module():
    spec = importlib.util.spec_from_file_location("acts_result_numbers", ROOT / "scripts" / "acts-result-numbers.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _world(tmp_path: Path, *, wins=lambda arm, cls: 0 if cls == "silent" else 3, head="a" * 40) -> Path:
    for arm in ARMS:
        for cls in CLASSES:
            w = wins(arm, cls)
            d = tmp_path / f"acts-{arm}-{cls}-a0-veteran-keeprelics-val2-n3000"
            d.mkdir(parents=True)
            (d / "manifest.json").write_text(
                json.dumps(
                    {
                        "summary": {"episodes": 3000, "completed": 2900, "counts": {"win": w, "simulator_error": 90, "timeout": 10}},
                        "environment": {"slay2": {"head": head, "dirty": False}},
                    }
                ),
                encoding="utf-8",
            )
            if w:
                (d / "wins-audit.json").write_text(json.dumps({"wins_audited": w, "wins_verified": w}), encoding="utf-8")
            (d / "sample-audit.json").write_text(json.dumps({"all_verified": True, "sample": {"drawn": 40}, "verified": 40}), encoding="utf-8")
    return tmp_path


def test_the_counts_of_each_arm_and_of_the_whole_run(tmp_path):
    lines = _module().arm_lines(_world(tmp_path))
    assert lines[0] == "- S (`s`, the baseline): 5 batches, 15,000 games, 14,500 completed, 12 wins, 450 simulator errors, 50 timeouts."
    assert lines[1].startswith("- L (`lead`): 5 batches, 15,000 games, 14,500 completed, 12 wins")
    assert lines[5] == "- All arms: 25 batches, 75,000 games, 72,500 completed, 60 wins, 2,250 simulator errors, 250 timeouts."


def test_the_commit_and_the_audits_are_reported(tmp_path):
    lines = _module().arm_lines(_world(tmp_path))
    assert lines[6] == f"- Played from 1 commit ({'a' * 12}); tree dirty: no."
    # the five Silent batches have no win and so no win audit; the other twenty have 3 wins each
    assert lines[7] == "- Audits: 60 of 60 audited wins re-derived (in 20 batches that have a win); 25 of 25 sample audits passed (1,000 of 1,000 sampled games verified)."


def test_two_commits_and_a_dirty_tree_are_said(tmp_path):
    world = _world(tmp_path)
    m = world / "acts-a3-defect-a0-veteran-keeprelics-val2-n3000" / "manifest.json"
    data = json.loads(m.read_text(encoding="utf-8"))
    data["environment"]["slay2"] = {"head": "b" * 40, "dirty": True}
    m.write_text(json.dumps(data), encoding="utf-8")
    line = _module().arm_lines(world)[6]
    assert line == f"- Played from 2 commits ({'a' * 12}, {'b' * 12}); tree dirty: yes."


def test_a_batch_with_wins_and_no_win_audit_is_an_error_not_a_silent_zero(tmp_path):
    world = _world(tmp_path)
    (world / "acts-lead-ironclad-a0-veteran-keeprelics-val2-n3000" / "wins-audit.json").unlink()
    with pytest.raises(FileNotFoundError):
        _module().arm_lines(world)


def test_the_command_line_prints_the_arms_and_refuses_an_empty_directory(tmp_path, capsys):
    mod = _module()
    assert mod.main(["--arms", "--batches", str(_world(tmp_path / "w"))]) == 0
    assert "All arms: 25 batches, 75,000 games" in capsys.readouterr().out
    (tmp_path / "empty").mkdir()
    assert mod.main(["--arms", "--batches", str(tmp_path / "empty")]) == 1


def _episodes_world(tmp_path: Path) -> Path:
    """Five arms of five classes with the same four seeds in each: the baseline wins seed 1, dies in Act 3 on seed 2, dies in Act 2 on seed 3 and has a
    simulator error on seed 4; every other arm loses seed 1 in Act 3, wins seed 2, dies in Act 3 on seed 3 and wins seed 4 (excluded: the baseline's game did
    not complete)."""
    base = [(1, "win", 2), (2, "death", 2), (3, "death", 1), (4, "simulator_error", 0)]
    other = [(1, "death", 2), (2, "win", 2), (3, "death", 2), (4, "win", 2)]
    for arm in ARMS:
        for cls in CLASSES:
            d = tmp_path / f"acts-{arm}-{cls}-a0-veteran-keeprelics-val2-n3000"
            d.mkdir(parents=True)
            rows = base if arm == "s" else other
            with gzip.open(d / "episodes.jsonl.gz", "wt", encoding="utf-8") as fh:
                for seed, outcome, act in rows:
                    fh.write(json.dumps({"seed": seed, "outcome": outcome, "act": act}) + "\n")
    return tmp_path


def test_the_post_hoc_decomposition_splits_the_net_wins_by_who_got_past_the_second_boss(tmp_path):
    lines = _module().post_hoc_lines(_episodes_world(tmp_path), iters=200)
    assert len(lines) == 4
    # seeds 1, 2 and 3 are pairs in five classes: 15 pairs; both got past the second boss in seeds 1 and 2 (10 pairs, 5 wins each), only the arm in seed 3
    assert lines[0].startswith(
        "- L: 15 pairs, net wins +0 = +0 in the 10 pairs in which both games got past the second boss (5 against 5 wins) "
        "and +0 in the 5 pairs in which only one did (arm only: 5 pairs, 0 wins; baseline only: 0 pairs, 0 wins); "
        "share past the second boss, arm minus baseline: +33.33 points (95 % whole-seed bootstrap "
    )
    assert lines[3].startswith("- A3: 15 pairs")


def test_the_second_boss_interval_contains_its_estimate_and_is_ordered(tmp_path):
    import re

    line = _module().post_hoc_lines(_episodes_world(tmp_path), iters=500)[2]
    m = re.search(r"minus baseline: \+([0-9.]+) points \(95 % whole-seed bootstrap ([+-][0-9.]+) points to ([+-][0-9.]+) points", line)
    assert m, line
    est, lo, hi = float(m.group(1)), float(m.group(2)), float(m.group(3))
    assert lo <= est <= hi


def test_the_post_hoc_command_prints_and_refuses_an_empty_directory(tmp_path, capsys):
    mod = _module()
    assert mod.main(["--post-hoc", "--batches", str(_episodes_world(tmp_path / "w"))]) == 0
    assert "- A2: 15 pairs" in capsys.readouterr().out
    (tmp_path / "empty").mkdir()
    assert mod.main(["--post-hoc", "--batches", str(tmp_path / "empty")]) == 1
