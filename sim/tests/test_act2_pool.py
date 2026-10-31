"""`scripts/studies/act2/pool.sh` end to end on a throwaway repository of synthetic batches (ADR-060 item 10).

The script refuses to run unless every held-out batch is finished and audited, writes each class's comparison, the pooled tests at the Act-2
endpoint with the interval at the level of the tests, and the determinism record of the replayed baseline, and runs each of them once.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from slay2_sim import external
from test_compare import make_batch

REPO = external.REPO_ROOT
CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"]
EXACT = {c: c.capitalize() for c in CLASSES}
N = 400


def run(work: Path, *args: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "PY": sys.executable, "OUT": str(work / "artifacts" / "act2"), "PYTHONPATH": ""}
    return subprocess.run(["bash", "scripts/studies/act2/pool.sh", *args], cwd=work, env=env, capture_output=True, text=True)


def act_of(i: int, arm: str) -> int:
    """The act each run ended in: the baseline gets 1 seed in 4 past the Act-2 boss; the pickier arm 1 in 4 plus 1 in 20 more; the lead as the baseline."""
    base = 2 if i % 4 == 0 else 1 if i % 4 in (1, 2) else 0
    if arm == "p020" and base == 1 and i % 20 == 1:
        return 2
    return base


def build(tmp: Path, audited: bool = True) -> Path:
    work = tmp / "work"
    (work / "sim").mkdir(parents=True)
    shutil.copytree(REPO / "sim" / "slay2_sim", work / "sim" / "slay2_sim", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(REPO / "scripts" / "studies" / "act2", work / "scripts" / "studies" / "act2")
    batches = work / "experiments" / "batches"
    batches.mkdir(parents=True)
    (work / "experiments" / "act2").mkdir(parents=True)
    (work / "experiments" / "act2" / "dev-selection.json").write_text(json.dumps({"P": {"advance": True, "arm": "p020"}, "V": {"advance": False}}))
    for c in CLASSES:
        for arm in ("s", "lead", "p020"):
            name = f"act2-{arm}-{c}-a0-veteran-keeprelics-val-n2000"
            rows = [(i, "death", 40, 1.0, act_of(i, arm)) for i in range(N)]
            d = make_batch(batches, name, rows, character=EXACT[c])
            m = json.loads((d / "manifest.json").read_text())
            m["summary"] = {"counts": {"win": 0}}
            (d / "manifest.json").write_text(json.dumps(m))
            if audited:
                (d / "sample-audit.json").write_text(json.dumps({"all_verified": True, "verified": 40, "sample": {"drawn": 40}, "ledger": {"ok": True}, "batch_content_sha256": "c" * 64}))
        # the batch ADR-058 played, replayed by this study: identical in all but one episode
        old = make_batch(batches, f"rules_v2-shownvals-{c}-a0-veteran-keeprelics-val-n2000", [(i, "death", 40, 1.0, act_of(i, "s")) for i in range(N)], character=EXACT[c])
        new = batches / f"act2-s-{c}-a0-veteran-keeprelics-val-n2000" / "episodes.jsonl"
        lines = (old / "episodes.jsonl").read_text().splitlines()    # the same games under the same policy name, as in life
        row = json.loads(lines[3])
        row["floor"] = 41
        lines[3] = json.dumps(row)
        new.write_text("\n".join((old / "episodes.jsonl").read_text().splitlines()[:3] + [lines[3]] + (old / "episodes.jsonl").read_text().splitlines()[4:]) + "\n")
        assert old.exists()
    return work


def test_it_writes_each_comparison_once_at_the_act_two_endpoint_and_the_determinism_record(tmp_path):
    work = build(tmp_path)
    r = run(work)
    assert r.returncode == 0, r.stderr + r.stdout
    assert "POOL_DONE" in r.stdout
    out = work / "experiments" / "act2"
    for t in ("L", "P"):
        body = json.loads((out / f"pooled-act2-{t}.json").read_text())
        cl = body["clusteredDifference"]
        assert cl["endpoint"] == "act2" and abs(cl["ciAtLevel"]["level"] - (1 - 0.05 / 3)) < 1e-9
        assert sorted(m["character"] for m in body["members"]) == sorted(EXACT.values())
        for c in CLASSES:
            assert (out / "per-class" / f"{t}-{c}.json").exists()
    assert not (out / "pooled-act2-V.json").exists()                           # V was not sent forward
    p = json.loads((out / "pooled-act2-P.json").read_text())
    assert p["reachedAct3"]["pairedTable"]["a_only"] == 5 * (N // 20) and p["reachedAct3"]["pairedTable"]["b_only"] == 0
    assert p["reachedAct2"]["pairedTable"]["a_only"] == 0 == p["reachedAct2"]["pairedTable"]["b_only"]   # Act 1 identical
    for c in CLASSES:
        d = json.loads((out / "determinism" / f"{c}.json").read_text())
        assert (d["shared"], d["identical"], d["different"], d["differingSeeds"]) == (N, N - 1, 1, [3])
    # each test is run once
    again = run(work)
    assert again.returncode != 0 and "each test is run once" in again.stderr


def test_it_refuses_to_start_unless_every_batch_is_audited(tmp_path):
    work = build(tmp_path, audited=False)
    r = run(work)
    assert r.returncode != 0 and "a batch is not finished and audited" in r.stderr
    assert not (work / "experiments" / "act2" / "pooled-act2-L.json").exists()


def test_a_batch_with_wins_needs_its_win_audit(tmp_path):
    work = build(tmp_path)
    m = work / "experiments" / "batches" / "act2-lead-defect-a0-veteran-keeprelics-val-n2000" / "manifest.json"
    body = json.loads(m.read_text())
    body["summary"]["counts"]["win"] = 3
    m.write_text(json.dumps(body))
    r = run(work)
    assert r.returncode != 0 and "wins and no readable win audit" in r.stderr
