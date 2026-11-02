"""The scripts of the price-of-a-slot check (ADR-065): they parse, they name the batches the registration names, the precondition report reads the conditions
it is meant to read and the reading applies the rule of the registration to the numbers alone. Nothing here plays a game."""

from __future__ import annotations

import gzip
import json
import subprocess
from pathlib import Path

import pytest

from slay2_sim import external

ROOT = external.REPO_ROOT
DIR = ROOT / "scripts" / "studies" / "skip"
CLASSES = ("Ironclad", "Silent", "Regent", "Necrobinder", "Defect")


def bash(script: str, **env: str) -> str:
    out = subprocess.run(["bash", "-c", script], cwd=ROOT, capture_output=True, text=True, timeout=60, env={"PATH": "/usr/bin:/bin:/usr/local/bin", "PY": "python3", **env})
    assert out.returncode == 0, out.stderr
    return out.stdout


@pytest.mark.parametrize("name", ["common.sh", "preflight-val.sh", "run-val.sh", "audit.sh", "pool.sh", "precondition.sh"])
def test_every_script_parses(name):
    assert subprocess.run(["bash", "-n", str(DIR / name)], capture_output=True, text=True).returncode == 0


def test_the_batches_are_named_as_the_registration_names_them_and_the_baselines_exist_where_it_says(tmp_path):
    for cls in CLASSES:
        l = cls.lower()
        got = {
            ("og", "s1"): bash(f"OUT={tmp_path} source scripts/studies/skip/common.sh; s1_id {cls} og").strip(),
            ("ud", "s1"): bash(f"OUT={tmp_path} source scripts/studies/skip/common.sh; s1_id {cls} ud").strip(),
            ("og", "s0"): bash(f"OUT={tmp_path} source scripts/studies/skip/common.sh; s0_dir {cls} og").strip(),
            ("ud", "s0"): bash(f"OUT={tmp_path} source scripts/studies/skip/common.sh; s0_dir {cls} ud").strip(),
        }
        assert got[("og", "s1")] == f"advisor_v1-slot-{l}-a0-veteran-keeprelics-val-n2000"
        assert got[("ud", "s1")] == f"advisor_v1-slot-{l}-a0-veteran-keeprelics-underdocks-val-n2000"
        assert got[("og", "s0")] == f"experiments/batches/advisor_v1-astar-{l}-a0-veteran-keeprelics-val-n2000"
        # the Underdocks baseline is the T1 arm A* of ADR-064, which that study names the same way
        assert got[("ud", "s0")] == f"experiments/underdocks/batches/advisor_v1-astar-{l}-a0-veteran-keeprelics-underdocks-val-n2000"
        ud_ids = bash(f"OUT={tmp_path} source scripts/studies/underdocks/common.sh; arm_ids {cls}").split()
        assert got[("ud", "s0")].rsplit("/", 1)[1] == ud_ids[0]
        manifest = json.loads((ROOT / got[("og", "s0")] / "manifest.json").read_text(encoding="utf-8"))  # the Overgrowth baseline is ADR-054's, on disk
        assert manifest["policy"]["name"] == "advisor_v1" and manifest["policy"]["params"].get("engines") == 0 and "size" not in manifest["policy"]["params"]
        assert manifest["seeds"]["partition"] == "val" and manifest["seeds"]["n"] == 2000 and manifest["config"]["keep_relics"] is True


def test_the_arms_differ_in_the_price_and_in_nothing_else():
    out = bash("source scripts/studies/skip/common.sh; echo \"$S0_PARAMS\"; echo \"$S1_PARAMS\"").splitlines()
    s0, s1 = json.loads(out[0]), json.loads(out[1])
    assert s0 == {"engines": 0, "margin": 0.0, "needs": 1, "scalers": 0.7}  # ADR-054's A*, exactly
    assert s1.pop("size") == 1.0 and s1.pop("size_from") == 20
    assert s1 == s0


def test_the_price_the_arm_charges_is_the_one_the_page_charges():
    ts = (ROOT / "packages" / "decision" / "src" / "quality.ts").read_text(encoding="utf-8")
    assert "export const SIZE_FROM = 20;" in ts and "export const SIZE_PRICE = 1;" in ts
    from slay2_sim import advisor

    assert (advisor.SIZE_FROM, advisor.SIZE_PRICE) == (20, 1.0)


# ---- the precondition report
REPORT = DIR / "precondition_report.py"
BOSSES = ["LagavulinMatriarchBoss", "SoulFyshBoss", "WaterfallGiantBoss"]


def make_batch(base: Path, leg: str, arm: str, cls: str, *, skip_rate: float, drop_price: bool = False, errors: int = 0) -> None:
    d = base / f"{leg}-{arm}-{cls.lower()}"
    d.mkdir(parents=True)
    rows = []
    for i in range(100):
        extra: dict = {"profile": "veteran", "advisor": {"offers": 10, "taken": 10 - int(10 * skip_rate), "skipped": int(10 * skip_rate), "unscored": 0}}
        if leg == "ud":
            extra["act1"] = {"version": "underdocks", "boss": BOSSES[i % 3]}
        outcome = "simulator_error" if i < errors else "death"
        rows.append({"seed": i, "outcome": outcome, "act": 0, "floor": 9, "ascension": 0, "character": cls, "extra": extra, "error": "boom" if errors and i < errors else None})
    with gzip.open(d / "episodes.jsonl.gz", "wt", encoding="utf-8") as fh:
        fh.write("\n".join(json.dumps(r) for r in rows) + "\n")
    config = {"character": cls, "ascension": 0, "keep_relics": True, **({"act1": "underdocks"} if leg == "ud" else {})}
    params = {"engines": 0, "margin": 0.0, "needs": 1, "scalers": 0.7, **({"size": 1.0, "size_from": 20.0} if arm == "s1" and not drop_price else {})}
    (d / "manifest.json").write_text(json.dumps({"config": config, "policy": {"name": "advisor_v1", "params": params}, "class_start_verified": True,
                                                 "canonical_process_state": True, "environment": {"slay2": {"head": "abc"}}}), encoding="utf-8")


def report(tmp_path: Path, over: dict | None = None) -> tuple[int, dict]:
    over = over or {}
    base = tmp_path / "pre"
    for leg in ("og", "ud"):
        for arm in ("s0", "s1"):
            for cls in CLASSES:
                opts = dict(skip_rate=0.0 if arm == "s0" else 0.4)
                opts.update(over.get((leg, arm), {}))
                make_batch(base, leg, arm, cls, **opts)
    out = tmp_path / "pre.json"
    code = subprocess.run(["python3", "-I", str(REPORT), "--dir", str(base), "--out", str(out)], capture_output=True, text=True).returncode
    return code, json.loads(out.read_text(encoding="utf-8"))


def test_the_precondition_passes_when_every_condition_holds(tmp_path):
    code, r = report(tmp_path)
    assert code == 0 and r["passed"] is True and all(r["criteria"].values())
    assert r["legs"]["ud"]["s1"]["skipShare"] == 0.4 and r["legs"]["ud"]["s0"]["skipShare"] == 0.0
    assert r["developmentPairs"]["og"]["bothCompleted"] == 500 and r["developmentPairs"]["og"]["pairsThatDifferInTheBossOutcome"] == 0  # identical synthetic games


def test_it_fails_when_the_price_does_not_bite_in_one_leg(tmp_path):
    code, r = report(tmp_path, {("ud", "s1"): {"skip_rate": 0.0}})
    assert code == 1 and r["criteria"]["c_the_price_bites"] is False and r["criteria"]["a_records"] is True


def test_it_fails_when_an_arm_does_not_name_its_price(tmp_path):
    code, r = report(tmp_path, {("og", "s1"): {"drop_price": True}})
    assert code == 1 and r["criteria"]["a_records"] is False


def test_it_fails_when_a_batch_has_too_many_errors(tmp_path):
    code, r = report(tmp_path, {("og", "s0"): {"errors": 11}})
    assert code == 1 and r["criteria"]["b_plays"] is False


# ---- the reading
READING = DIR / "reading.py"


def pooled(path: Path, *, boss_lo: float, floor_lo: float, boss_diff: float = 0.0, floor_diff: float = 0.0) -> None:
    path.write_text(json.dumps({
        "pairedSeeds": 10000, "bothCompleted": 9800, "excludedNotCompleted": 200,
        "clusteredDifference": {"meanAMinusB": boss_diff, "ci95": [boss_lo, boss_lo + 0.02]},
        "floorDifference": {"meanAMinusB": floor_diff, "ci95": [floor_lo, floor_lo + 0.2]},
        "reachedAct2": {"a": {"rate": 0.4}, "b": {"rate": 0.4}, "pairedTable": {"a_only": 10, "b_only": 10, "mcnemar_p": 1.0}},
        "reachedAct3": {"a": {"rate": 0.02}, "b": {"rate": 0.02}, "pairedTable": {"a_only": 5, "b_only": 5, "mcnemar_p": 1.0}},
        "wins": {"a": 1, "b": 1, "pairedTable": {"a_only": 1, "b_only": 1}},
    }), encoding="utf-8")


def read(tmp_path: Path, og: dict, ud: dict, legs=("og", "ud")) -> dict:
    pooled(tmp_path / "pooled-slot-og.json", **og)
    pooled(tmp_path / "pooled-slot-ud.json", **ud)
    out = tmp_path / "reading.json"
    subprocess.run(["python3", "-I", str(READING), "--dir", str(tmp_path), "--legs", *legs, "--out", str(out)], check=True, capture_output=True)
    return json.loads(out.read_text(encoding="utf-8"))


def test_the_price_is_harmless_only_when_both_legs_are_not_behind(tmp_path):
    ok = dict(boss_lo=-0.004, floor_lo=-0.1)
    assert read(tmp_path, ok, ok)["harmless"] is True
    behind_boss = dict(boss_lo=-0.012, floor_lo=-0.1)
    behind_floors = dict(boss_lo=-0.004, floor_lo=-0.3)
    for bad in (behind_boss, behind_floors):
        r = read(tmp_path, ok, bad)
        assert r["harmless"] is False and r["legs"]["ud"]["verdict"] == "not shown to be harmless" and r["legs"]["og"]["verdict"] == "not behind"
        assert read(tmp_path, bad, ok)["harmless"] is False


def test_the_margins_are_strict_at_their_edges(tmp_path):
    # the lower end has to be above the margin: equal to it is not enough
    assert read(tmp_path, dict(boss_lo=-0.01, floor_lo=-0.1), dict(boss_lo=-0.004, floor_lo=-0.1))["legs"]["og"]["verdict"] == "not shown to be harmless"
    assert read(tmp_path, dict(boss_lo=-0.004, floor_lo=-0.25), dict(boss_lo=-0.004, floor_lo=-0.1))["legs"]["og"]["verdict"] == "not shown to be harmless"
    assert read(tmp_path, dict(boss_lo=-0.0099, floor_lo=-0.2499), dict(boss_lo=-0.004, floor_lo=-0.1))["legs"]["og"]["verdict"] == "not behind"


def test_one_leg_alone_is_never_called_harmless(tmp_path):
    ok = dict(boss_lo=-0.004, floor_lo=-0.1)
    assert read(tmp_path, ok, ok, legs=("og",))["harmless"] is False  # the rule needs both Act 1s
