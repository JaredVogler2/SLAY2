"""The reader of the threshold study (`scripts/lib/thresh.mjs`) reads what `pool.sh` and the tools it runs really write (ADR-062 items 5 and 11).

`apps/web/test/thresh-export.test.ts` builds the reader's inputs by hand; this test builds them with the real tools: synthetic development batches, the selection
`threshstudy dev` writes, held-out batches, and `pool.sh` itself in a throwaway repository (the identity checks, the comparisons, the pooled tests, the all-pairs
analysis, the independent recomputation). It then gives the files the manifests, the value files and the record a real run would have and runs the reader on the
whole. A field the tools do not write and the reader asks for fails here, before any game is played.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from slay2_sim import external
from slay2_sim import threshstudy as ts
from test_thresh_pool import MARK1, MARK2, build, run

REPO = external.REPO_ROOT
NODE = shutil.which("node")
DEV_HEAD, VAL_HEAD = "d" * 40, "e" * 40
SIZES = {"dev": 64, "val": 400}      # games in a batch of the synthetic world (the registered sizes are 3,000 and 15,000; the names keep them)

READ = """
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { parseThreshWith } from "%(reader)s";
const root = process.argv[2];
const dir = `${root}/experiments/batches`;
const reports = readdirSync(dir).filter((n) => existsSync(`${dir}/${n}/manifest.json`)).map((n) => {
  const m = JSON.parse(readFileSync(`${dir}/${n}/manifest.json`, "utf8"));
  const sa = existsSync(`${dir}/${n}/sample-audit.json`) ? JSON.parse(readFileSync(`${dir}/${n}/sample-audit.json`, "utf8")) : null;
  return {
    id: m.batch_id, policy: m.policy.name, policyParams: m.policy.params ?? {}, character: m.config.character, ascension: m.config.ascension, profile: m.config.profile,
    keepRelics: m.config.keep_relics === true, partition: m.seeds.partition, seeds: m.seeds.n, counts: m.summary.counts, completed: m.summary.completed,
    classStartVerified: m.class_start_verified === true, canonicalProcessState: m.canonical_process_state === true, contentSha256: m.content_sha256,
    sampleAudit: sa ? { drawn: sa.sample.drawn, verified: sa.verified, ledgerOk: sa.ledger.ok } : null,
  };
});
console.log(JSON.stringify(parseThreshWith({ root, reports }, { dev: %(dev)d, val: %(val)d })));
"""


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def give_the_world_what_a_real_run_has(work: Path, advance: str | None) -> None:
    """The files, manifests and record that the throwaway repository lacks and a real run has: value files, the seed file, the faithful manifests of every batch
    and the record with its hashes, development commit and arm names. Nothing the tools wrote is changed (the content hashes stay)."""
    cards = work / "experiments" / "cardvalue"
    cards.mkdir(parents=True, exist_ok=True)
    shown = {"Ironclad": "ironclad-a0-v2.json", "Defect": "defect-a0-keep-v1.json"}
    for c, f in shown.items():
        (cards / f).write_text(json.dumps({"kind": "card-values", "character": c}))
    (cards / "site-sets.json").write_text(json.dumps({"sets": [{"file": f} for f in shown.values()]}))
    seeds = work / ts.SEEDS_FILE
    seeds.parent.mkdir(parents=True, exist_ok=True)
    seeds.write_text(json.dumps({"kind": "fixture"}))
    batches = work / "experiments" / "batches"
    for d in sorted(batches.iterdir()):
        m = json.loads((d / "manifest.json").read_text())
        stage, arm, cls = ("dev" if d.name.startswith("thresh-dev-") else "val"), d.name.split("-")[2], d.name.split("-")[3].capitalize()
        n = SIZES[stage]
        values = f"experiments/cardvalue/{shown[cls]}"
        effective = {"threshold": 0, "values": values, "values_sha256": sha(work / values), "tune": {"max_deck": 32}}
        params = {"threshold": 0.0, "values": values}
        if arm != "s":
            params |= {"late_threshold": ts.GRID[arm], "late_acts": [1]}
            effective |= {"late_threshold": ts.GRID[arm], "late_acts": [1]}
        rows = [json.loads(line) for line in (d / "episodes.jsonl").read_text().splitlines()]
        wins = sum(1 for r in rows if r["outcome"] == "win")
        m.update({
            "batch_id": d.name,
            "policy": {"name": "rules_v2" if arm == "s" else "rules_v2_late", "params": params, "effective": {"params": effective}},
            "config": {"ascension": 0, "character": cls, "keep_relics": True, "profile": "veteran", "max_steps": 20000, "wall_seconds": 900.0, "max_turns_per_combat": 80,
                       "stall_limit": 200, "start_with_neow": True},
            "environment": {"slay2": {"head": DEV_HEAD if stage == "dev" else VAL_HEAD, "dirty": False}},
            "seeds": {"file": ts.SEEDS_FILE, "file_sha256": sha(seeds), "partition": "dev2" if stage == "dev" else "val3", "n": n, "sealed_partition_used": False},
            "simulator": {"pin_ok": True, "dirty": False, "pinned": "5" * 40},
            "summary": {"episodes": n, "completed": n, "counts": {"aborted": 0, "harness_error": 0, "policy_error": 0, "invalid_action": 0, "simulator_error": 0, "death": n - wins, "win": wins}},
            "class_start_verified": True, "canonical_process_state": True,
        })
        (d / "manifest.json").write_text(json.dumps(m))
    sel = work / "experiments" / "thresh" / "dev-selection.json"
    quoted = "\n".join([*(f"`{sha(cards / f)}`" for f in shown.values()), f"`{sha(seeds)}`", f"`{sha(sel)}`"])
    arm_line = f"ARM_{advance}\n" if advance and advance != "t020" else ""
    (work / "docs" / "DECISIONS.md").write_text(
        f"## 2026-11-02 — ADR-062: {'does the Act-2 pickiness result hold on seeds nobody has played'}\n\nThe design text.\n\n**{MARK1}.**\nThe registration paragraph.\n\n"
        f"**{MARK2}.**\nDEV_HEAD={DEV_HEAD}\n{quoted}\n{arm_line}"
    )


def read_with_node(work: Path, tmp: Path) -> dict:
    script = tmp / "read.mjs"
    script.write_text(READ % {"reader": (REPO / "scripts" / "lib" / "thresh.mjs").as_posix(), **SIZES})
    r = subprocess.run([NODE, str(script), str(work)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


@pytest.mark.skipif(NODE is None, reason="node is not installed")
@pytest.mark.parametrize("advance", ["t030", None])
def test_the_reader_reads_the_output_of_pool_sh_and_the_tools_it_runs(tmp_path, advance):
    work = build(tmp_path, advance=advance, two_parts=True)
    r = run(work)
    assert r.returncode == 0, r.stderr + r.stdout
    give_the_world_what_a_real_run_has(work, advance)
    out = read_with_node(work, tmp_path)
    assert out["stage"] == "tested" and out["registered"] and out["frozen"] and out["partTwo"]
    keys = ["T1", "T2", "T3"] if advance else ["T1"]
    assert out["tests"]["order"] == keys and abs(out["tests"]["level"] - (0.05 / 3 if advance else 0.05)) < 1e-12
    assert out["screen"]["choice"]["advance"] is bool(advance) and out["screen"]["choice"]["arm"] == advance
    assert out["devHead"] == DEV_HEAD and out["selectionSha256"] == sha(work / "experiments" / "thresh" / "dev-selection.json")
    t1 = out["tests"]["results"]["T1"]
    assert (t1["arm"], t1["baseline"]) == ("t020", "s") and t1["verdict"] == "passed", t1                     # the synthetic arm wins 40 seeds S does not, and loses none
    assert t1["wins"]["arm"] > t1["wins"]["baseline"] and t1["armOnly"] > 0 and t1["baselineOnly"] == 0 and t1["downgrades"] == []
    assert t1["verification"]["exactChecks"] > 50 and [c["character"] for c in t1["perClass"]] == ["ironclad", "defect"]
    if advance:
        t2, t3 = out["tests"]["results"]["T2"], out["tests"]["results"]["T3"]
        assert (t2["arm"], t2["baseline"]) == (advance, "s") and (t3["arm"], t3["baseline"]) == (advance, "t020")
        assert t3["baselineOnly"] > 0                                                                     # the synthetic 0.3 loses seeds that 0.2 wins
        assert sorted(out["identity"]) == ["t020", advance]
    else:
        assert sorted(out["identity"]) == ["t020"]


@pytest.mark.skipif(NODE is None, reason="node is not installed")
def test_the_reader_stops_where_the_tools_and_the_reader_would_disagree(tmp_path):
    """Break one thing in what the tools wrote, as a defect of either side would: the reader refuses it."""
    work = build(tmp_path, advance="t030", two_parts=True)
    assert run(work).returncode == 0
    give_the_world_what_a_real_run_has(work, "t030")
    assert read_with_node(work, tmp_path)["stage"] == "tested"
    ident = work / "experiments" / "thresh" / "identity" / "t030.json"
    body = json.loads(ident.read_text())
    del body["contentSha256"]                          # a record that does not say which batches it was made from
    ident.write_text(json.dumps(body))
    script = tmp_path / "read.mjs"
    r = subprocess.run([NODE, str(script), str(work)], capture_output=True, text=True)
    assert r.returncode != 0 and "was not made from the content of" in r.stderr


@pytest.mark.skipif(NODE is None, reason="node is not installed")
def test_the_reader_reads_the_real_selection_of_the_screen_before_any_held_out_file_exists(tmp_path):
    work = build(tmp_path, advance="t030", two_parts=True)
    give_the_world_what_a_real_run_has(work, "t030")
    shutil.rmtree(work / "experiments" / "thresh" / "identity", ignore_errors=True)      # (pool.sh has not run: only the screen exists)
    out = read_with_node(work, tmp_path)
    assert out["stage"] == "screened" and out["tests"] is None
    assert out["screen"]["best"]["arm"] == "t030" and out["screen"]["choice"]["advance"] is True
    assert [t["key"] for t in out["screen"]["tests"]] == ["T1", "T2", "T3"]
    assert set(out["screen"]["rows"]) == set(ts.GRID) and out["screen"]["rows"]["t030"]["meanDeckSize"] == {"arm": None, "baseline": None, "pairs": 0}
