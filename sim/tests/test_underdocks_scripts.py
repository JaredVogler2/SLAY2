"""The scripts of the Underdocks study (ADR-064): they parse, they name the batches the registration names, and the precondition report reads the
conditions it is meant to read. Nothing here plays a game."""

from __future__ import annotations

import gzip
import json
import subprocess
from pathlib import Path

import pytest

from slay2_sim import external

ROOT = external.REPO_ROOT
DIR = ROOT / "scripts" / "studies" / "underdocks"
CLASSES = ("Ironclad", "Silent", "Regent", "Necrobinder", "Defect")


def bash(script: str, **env: str) -> str:
    out = subprocess.run(["bash", "-c", script], cwd=ROOT, capture_output=True, text=True, timeout=60, env={"PATH": "/usr/bin:/bin:/usr/local/bin", "PY": "python3", **env})
    assert out.returncode == 0, out.stderr
    return out.stdout


@pytest.mark.parametrize("name", ["common.sh", "preflight-val.sh", "run-val.sh", "audit.sh", "pool.sh", "precondition.sh"])
def test_every_script_parses(name):
    assert subprocess.run(["bash", "-n", str(DIR / name)], capture_output=True, text=True).returncode == 0


def test_the_batches_of_each_class_are_named_as_the_registration_names_them(tmp_path):
    for cls in CLASSES:
        l = cls.lower()
        ids = bash(f'OUT={tmp_path} source scripts/studies/underdocks/common.sh; arm_ids {cls}').split()
        assert ids == [
            f"advisor_v1-astar-{l}-a0-veteran-keeprelics-underdocks-val-n2000",
            f"advisor_v1-d0star-{l}-a0-veteran-keeprelics-underdocks-val-n2000",
            f"rules_v2-shownvals-{l}-a0-veteran-keeprelics-underdocks-val-n2000",
            f"rules_v1-{l}-a0-veteran-keeprelics-underdocks-val-n2000",
            f"rules_v2_neow_values-keepvals-{l}-a0-veteran-keeprelics-underdocks-val-n2000",
            f"rules_v2-{l}-a0-veteran-keeprelics-underdocks-val-n2000",
        ]
        og = bash(f'OUT={tmp_path} source scripts/studies/underdocks/common.sh; overgrowth_ids {cls}').split()
        assert len(og) == 6
        assert [i.replace("-underdocks-val", "-val") for i in ids] == og  # the same six arms, the same seeds, Act 1 apart
        for batch in og:  # the Overgrowth side exists, from the earlier studies, and is the game the study sets its result beside
            manifest = json.loads((ROOT / "experiments" / "batches" / batch / "manifest.json").read_text(encoding="utf-8"))
            assert manifest["config"].get("keep_relics") is True and manifest["config"]["ascension"] == 0 and "act1" not in manifest["config"]
            assert manifest["seeds"]["partition"] == "val" and manifest["seeds"]["n"] == 2000


def test_the_study_keeps_its_batches_apart_from_the_batches_of_the_games_before_it(tmp_path):
    out = bash(f'OUT={tmp_path} source scripts/studies/underdocks/common.sh; echo "$BATCHES $RESULTS $ASC $ACT1"').split()
    assert out == ["experiments/underdocks/batches", "experiments/underdocks", "0", "underdocks"]


def test_the_runner_plays_in_underdocks_and_nothing_else(tmp_path):
    text = (DIR / "common.sh").read_text(encoding="utf-8")
    assert '--act1 "$ACT1"' in text and '--ascension "$ASC"' in text and "--keep-relics" in text and '--out "$dest"' in text
    for name in ("run-val.sh", "audit.sh", "pool.sh", "precondition.sh", "preflight-val.sh"):
        assert "a9" not in (DIR / name).read_text(encoding="utf-8").replace("preflight", "")  # nothing of the Ascension 9 study is left in them


# ---- the precondition report
REPORT = DIR / "precondition_report.py"
BOSSES = ["LagavulinMatriarchBoss", "SoulFyshBoss", "WaterfallGiantBoss"]


def make_batch(base: Path, arm: str, cls: str, *, underdocks: bool = True, win_every: int = 7, drop_boss: bool = False, errors: int = 0, past: float = 0.4) -> None:
    d = base / f"{arm}-{cls.lower()}"
    d.mkdir(parents=True)
    rows = []
    for i in range(100):
        passed = i < int(100 * past)
        outcome = "simulator_error" if i < errors else ("win" if (i % win_every == 0 and passed) else "death")
        extra: dict = {"profile": "veteran"}
        if underdocks:
            extra["act1"] = {"version": "underdocks", "boss": None if (drop_boss and i == 3) else BOSSES[i % 3]}
        rows.append({"seed": i, "outcome": outcome, "act": 1 if passed else 0, "floor": 20 if passed else 8, "ascension": 0, "character": cls, "extra": extra, "error": "boom" if outcome == "simulator_error" else None})
    with gzip.open(d / "episodes.jsonl.gz", "wt", encoding="utf-8") as fh:
        fh.write("\n".join(json.dumps(r) for r in rows) + "\n")
    config = {"character": cls, "ascension": 0, "keep_relics": True, **({"act1": "underdocks"} if underdocks else {})}
    (d / "manifest.json").write_text(json.dumps({"config": config, "class_start_verified": True, "canonical_process_state": True, "environment": {"slay2": {"head": "abc"}}}), encoding="utf-8")


def build(base: Path, **over) -> None:
    for arm in ("astar", "d0star", "shown", "v1", "neow", "base", "ogshown"):
        for cls in CLASSES:
            opts = dict(over.get(arm, {}))
            if arm == "ogshown":
                opts["underdocks"] = False
            make_batch(base, arm, cls, **opts)


def report(tmp_path: Path, **over) -> tuple[int, dict]:
    base = tmp_path / "pre"
    build(base, **over)
    out = tmp_path / "pre.json"
    code = subprocess.run(["python3", "-I", str(REPORT), "--dir", str(base), "--out", str(out)], capture_output=True, text=True).returncode
    return code, json.loads(out.read_text(encoding="utf-8"))


def test_the_precondition_passes_when_every_condition_holds(tmp_path):
    code, r = report(tmp_path)
    assert code == 0 and r["passed"] is True and all(r["criteria"].values())
    assert r["pooledShownValues"]["underdocks"]["rate"] >= 0.1


def test_it_fails_when_a_game_does_not_name_an_underdocks_boss(tmp_path):
    code, r = report(tmp_path, shown={"drop_boss": True})
    assert code == 1 and r["criteria"]["a_records"] is False and r["passed"] is False


def test_it_fails_when_a_batch_has_too_many_errors(tmp_path):
    code, r = report(tmp_path, v1={"errors": 11})
    assert code == 1 and r["criteria"]["b_plays"] is False


def test_it_fails_when_the_comparator_is_not_overgrowth(tmp_path):
    base = tmp_path / "pre"
    build(base)
    # an Overgrowth comparator that names an Underdocks boss in one game: the Act 1 is not what it says
    path = base / "ogshown-ironclad" / "episodes.jsonl.gz"
    rows = [json.loads(line) for line in gzip.open(path, "rt", encoding="utf-8").read().splitlines()]
    rows[0]["extra"]["act1"] = {"version": "underdocks", "boss": "SoulFyshBoss"}
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        fh.write("\n".join(json.dumps(r) for r in rows) + "\n")
    out = tmp_path / "pre.json"
    code = subprocess.run(["python3", "-I", str(REPORT), "--dir", str(base), "--out", str(out)], capture_output=True, text=True).returncode
    r = json.loads(out.read_text(encoding="utf-8"))
    assert code == 1 and r["criteria"]["a_records"] is False and r["criteria"]["c_underdocks_in_force"] is False


def test_it_fails_when_the_act_cannot_be_got_through(tmp_path):
    code, r = report(tmp_path, shown={"past": 0.05})
    assert code == 1 and r["criteria"]["d_the_act_can_be_got_through"] is False and r["criteria"]["a_records"] is True
