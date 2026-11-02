"""`scripts/thresh-result-numbers.py` prints the numbers of the result sections of ADR-062 from the exporter's output, so nothing in the record is typed by hand.

The input is what the real reader (`scripts/lib/thresh.mjs`) emits on the output of the real tools in a throwaway repository (`test_thresh_reader`): a field the
script asks for and the reader does not write fails here, before any result exists.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from test_thresh_pool import build, run
from test_thresh_reader import give_the_world_what_a_real_run_has, read_with_node

from slay2_sim import external

REPO = external.REPO_ROOT
SCRIPT = REPO / "scripts" / "thresh-result-numbers.py"
NODE = shutil.which("node")


def numbers(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True)


def world(tmp_path: Path, advance: str | None):
    work = build(tmp_path, advance=advance, two_parts=True)
    assert run(work).returncode == 0
    give_the_world_what_a_real_run_has(work, advance)
    return work, read_with_node(work, tmp_path)


@pytest.mark.skipif(NODE is None, reason="node is not installed")
def test_it_prints_the_screen_and_every_test_the_reader_read_with_the_reader_s_own_numbers(tmp_path):
    work, out = world(tmp_path, "t030")
    data = tmp_path / "thresh.generated.json"
    data.write_text(json.dumps(out), encoding="utf-8")
    r = numbers(str(data))
    assert r.returncode == 0, r.stderr
    text = r.stdout
    assert "### The development screen as it came out" in text and "level of the tests it leaves: 0.05 / 3" in text
    for tag in ("0.1 (`t010`)", "0.2 (`t020`)", "0.3 (`t030`)", "0.45 (`t045`)", "0.6 (`t060`)", "no card in Act 2 (`tnone`)"):
        assert f"- {tag}:" in text
    assert "**Choice: ADVANCED 0.3 (`t030`)**" in text and "Head-to-head of 0.3 (`t030`) against 0.2" in text
    assert f"DEV_HEAD={out['devHead']}" in text and f"selection SHA-256 {out['selectionSha256']}" in text
    for key in ("T1", "T2", "T3"):
        t = out["tests"]["results"][key]
        assert f"### Test {key}:" in text
        assert f"{t['pairs']:,} paired games from {t['pairedSeeds']:,} paired seeds" in text
        assert f"{t['armOnly']:,} pairs won only by the arm against {t['baselineOnly']:,} only by the baseline" in text
        assert f"**Reading by the rule of item 5: {t['verdict'].replace('-', ' ').upper()}" in text
    assert "### Test T3: 0.3 (`t030`) against 0.2" in text and "### Test T1: 0.2 (`t020`) against S" in text
    assert text.count("- **Each class on its own**") == 3 and "  - ironclad:" in text and "  - defect:" in text
    assert "Design check of 0.3 (`t030`) against S on the held-out batches" in text


@pytest.mark.skipif(NODE is None, reason="node is not installed")
def test_it_prints_the_replication_alone_when_nothing_was_advanced(tmp_path):
    work, out = world(tmp_path, None)
    data = tmp_path / "thresh.generated.json"
    data.write_text(json.dumps(out), encoding="utf-8")
    text = numbers(str(data)).stdout
    assert "**Choice: nothing advanced**" in text and "Tests left: T1 (t020 against s)." in text
    assert "### Test T1:" in text and "### Test T2" not in text and "### Test T3" not in text
    assert "No head-to-head was read" in text or "Head-to-head of" in text


def test_it_stops_before_there_is_anything_to_print(tmp_path):
    data = tmp_path / "registered.json"
    data.write_text(json.dumps({"registered": True, "stage": "registered", "screen": None, "tests": None}), encoding="utf-8")
    r = numbers(str(data))
    assert r.returncode == 1 and "no screen or test result" in r.stderr
    none = tmp_path / "none.json"
    none.write_text(json.dumps({"registered": False}), encoding="utf-8")
    assert numbers(str(none)).returncode == 1
    assert numbers("--arms", "--batches", str(tmp_path / "nowhere")).returncode == 1


@pytest.mark.skipif(NODE is None, reason="node is not installed")
def test_the_arm_lines_count_what_the_manifests_and_the_audits_say(tmp_path):
    work, _ = world(tmp_path, "t030")
    batches = work / "experiments" / "batches"
    for d in batches.iterdir():                                               # the audits the real tool writes (audit.sh), as a stage leaves them
        wins = json.loads((d / "manifest.json").read_text())["summary"]["counts"]["win"]
        if wins:
            (d / "wins-audit.json").write_text(json.dumps({"all_verified": True, "wins_audited": wins, "wins_verified": wins, "wins_in_batch": wins}))
        (d / "sample-audit.json").write_text(json.dumps({"all_verified": True, "verified": 40, "sample": {"drawn": 40}, "ledger": {"ok": True}}))
    for stage, arms in (("val", ["S (the baseline)", "0.2 (`t020`)", "0.3 (`t030`)"]), ("dev", ["S (the baseline)", "0.1 (`t010`)", "no card in Act 2 (`tnone`)"])):
        r = numbers("--arms", "--stage", stage, "--batches", str(batches))
        assert r.returncode == 0, r.stderr
        for arm in arms:
            assert f"- {arm}: 2 batches," in r.stdout, (stage, arm)
        assert "- All arms:" in r.stdout and "tree dirty: no." in r.stdout and "sample audits passed" in r.stdout
    val = numbers("--arms", "--stage", "val", "--batches", str(batches)).stdout
    assert "- All arms: 6 batches," in val                                    # S, 0.2 and 0.3 in two classes
    assert "- All arms: 14 batches," in numbers("--arms", "--stage", "dev", "--batches", str(batches)).stdout
