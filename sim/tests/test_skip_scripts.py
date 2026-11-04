"""The scripts of the price-of-a-slot check (ADR-065): they parse, they name the batches the registration names, `verify_batch` holds a finished batch to what the
registration says, the precondition report reads the conditions it is meant to read and the reading applies the rule of the registration to the numbers alone. Nothing here
plays a game. (`pool.sh`, the preflight, the run and the audit are tested end to end in `test_skip_pool.py`, `test_skip_preflight.py` and `test_skip_run_audit.py`.)"""

from __future__ import annotations

import gzip
import json
import re
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


@pytest.mark.parametrize("name", ["reading.py", "precondition_report.py", "fingerprint.py"])
def test_every_python_script_compiles(name):
    compile((DIR / name).read_text(encoding="utf-8"), name, "exec")


# The item numbers that the scripts cite are those of the record: ADR-065's "Decision" is numbered 1 to 7, and a comment that cites "item 2" for the preflight (item 3 of the
# record) sends a reader to the wrong paragraph.
CITED = {  # file -> {item number cited: the words that item's title has in the record}
    "common.sh": {4: "Endpoints", 6: "Precondition"},
    "preflight-val.sh": {3: "registered check"},
    "precondition.sh": {6: "Precondition"},
    "precondition_report.py": {6: "Precondition"},
    "reading.py": {4: "Endpoints"},
}


def adr_items() -> dict[int, str]:
    text = (ROOT / "docs" / "DECISIONS.md").read_text(encoding="utf-8")
    start = text.find("ADR-065: the advisor charges for a slot")
    if start < 0:
        pytest.skip("the record does not carry ADR-065 here")
    section = re.split(r"\n## ", text[start:], maxsplit=1)[0]
    decision = section.split("**Decision", 1)[1]
    return {int(m.group(1)): m.group(2) for m in re.finditer(r"(?m)^(\d)\. \*([^*]+)\*", decision)}


def test_the_item_numbers_the_scripts_cite_are_the_ones_of_the_record():
    items = adr_items()
    assert sorted(items) == [1, 2, 3, 4, 5, 6, 7]
    for name in sorted(p.name for p in DIR.iterdir() if p.suffix in (".sh", ".py")):
        text = (DIR / name).read_text(encoding="utf-8")
        cited = {int(n) for n in re.findall(r"\bitem (\d)\b", text)}
        assert cited <= set(CITED.get(name, {})), f"{name} cites ADR-065 item(s) {sorted(cited - set(CITED.get(name, {})))} that this test does not know"
        for n, words in CITED.get(name, {}).items():
            assert words in items[n], f"item {n} of the record is {items[n]!r}, not what {name} cites it for ({words})"


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


def ids_of(leg: str, cls: str) -> tuple[str, str]:
    tail = "-underdocks" if leg == "ud" else ""
    return f"advisor_v1-slot-{cls.lower()}-a0-veteran-keeprelics{tail}-val-n2000", f"advisor_v1-astar-{cls.lower()}-a0-veteran-keeprelics{tail}-val-n2000"


def members_of(leg: str) -> list[dict]:
    return [{"character": c, "a": {"batchId": ids_of(leg, c)[0], "contentSha256": "c" * 64, "wins": i}, "b": {"batchId": ids_of(leg, c)[1], "contentSha256": "c" * 64, "wins": i + 1},
             "pairedSeeds": 2000, "bothCompleted": 1960 + i, "meanFloorDifference": 0.01 * i,
             "reachedAct2": {"a": 0.40 + 0.01 * i, "b": 0.40, "pairedTable": {"a_only": 3 * i + 2, "b_only": i, "mcnemar_p": 0.5 / (i + 1)}}} for i, c in enumerate(CLASSES)]


def pooled(path: Path, *, boss_lo: float, floor_lo: float, boss_diff: float = 0.0, floor_diff: float = 0.0, leg: str = "og", members: list[dict] | None = None) -> None:
    path.write_text(json.dumps({
        "policies": {"a": "advisor_v1", "b": "advisor_v1"}, "members": members if members is not None else members_of(leg),
        "pairedSeeds": 10000, "bothCompleted": 9800, "excludedNotCompleted": 200,
        "clusteredDifference": {"meanAMinusB": boss_diff, "ci95": [boss_lo, boss_lo + 0.02]},
        "floorDifference": {"meanAMinusB": floor_diff, "ci95": [floor_lo, floor_lo + 0.2]},
        "reachedAct2": {"a": {"rate": 0.4}, "b": {"rate": 0.4}, "pairedTable": {"a_only": 10, "b_only": 10, "mcnemar_p": 1.0}},
        "reachedAct3": {"a": {"rate": 0.02}, "b": {"rate": 0.02}, "pairedTable": {"a_only": 5, "b_only": 5, "mcnemar_p": 1.0}},
        "wins": {"a": 1, "b": 1, "pairedTable": {"a_only": 1, "b_only": 1}},
    }), encoding="utf-8")


def small_batches(tmp_path: Path) -> Path:
    """The forty batches the skip shares are read from, one game each: the arm that charges under <tmp>/batches, the baselines under <tmp>/root (returns the root)."""
    root = tmp_path / "root"
    for leg in ("og", "ud"):
        for cls in CLASSES:
            s1, s0 = ids_of(leg, cls)
            for arm, d in (("s1", tmp_path / "batches" / s1), ("s0", root / "experiments" / ("underdocks" if leg == "ud" else "") / "batches" / s0)):
                d.mkdir(parents=True, exist_ok=True)
                (d / "manifest.json").write_text(json.dumps({"content_sha256": "c" * 64}))
                advisor = {"offers": 10, "taken": 7, "skipped": 3, "unscored": 0}
                if arm == "s1":
                    advisor["by_act"] = {"0": {"offers": 4, "skipped": 1}, "1": {"offers": 4, "skipped": 1}, "2": {"offers": 2, "skipped": 1}}
                (d / "episodes.jsonl").write_text(json.dumps({"seed": 1, "extra": {"advisor": advisor}}) + "\n")
    return root


def read(tmp_path: Path, og: dict, ud: dict, legs=("og", "ud")) -> dict:
    root = small_batches(tmp_path)
    pooled(tmp_path / "pooled-slot-og.json", leg="og", **og)
    pooled(tmp_path / "pooled-slot-ud.json", leg="ud", **ud)
    out = tmp_path / "reading.json"
    subprocess.run(["python3", "-I", str(READING), "--dir", str(tmp_path), "--root", str(root), "--legs", *legs, "--out", str(out)], check=True, capture_output=True)
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


def test_the_reading_carries_the_skip_shares_of_both_arms_from_the_batches_of_the_leg(tmp_path):
    ok = dict(boss_lo=-0.004, floor_lo=-0.1)
    shares = read(tmp_path, ok, ok)["skipShares"]
    for leg in ("og", "ud"):
        s1, s0 = shares[leg]["s1"], shares[leg]["s0"]
        assert (s1["cardRewards"], s1["skipped"], s1["share"]) == (50, 15, 0.3) and (s0["cardRewards"], s0["skipped"], s0["share"]) == (50, 15, 0.3)
        assert s1["byAct"]["act1"] == {"cardRewards": 20, "skipped": 5, "share": 0.25} and s1["byAct"]["act3"]["cardRewards"] == 10     # summed over the five classes
        assert "byAct" not in s0 and sorted(s1["perClass"]) == sorted(CLASSES) and s1["perClass"]["Silent"]["cardRewards"] == 10


def test_the_reading_carries_each_class_on_its_own_next_to_the_pooled_numbers(tmp_path):
    ok = dict(boss_lo=-0.004, floor_lo=-0.1)
    body = read(tmp_path, ok, ok)
    for leg in ("og", "ud"):
        classes = body["legs"][leg]["perClass"]
        assert sorted(classes) == sorted(CLASSES)
        silent = classes["Silent"]                                                                         # the class in position 1 of members_of
        assert silent["meanFloorsDifferenceS1MinusS0"] == pytest.approx(0.01) and silent["pastActOneBoss"]["s1"] == pytest.approx(0.41)
        del silent["meanFloorsDifferenceS1MinusS0"], silent["pastActOneBoss"]["s1"]
        assert silent == {"pairs": 2000, "bothCompleted": 1961, "wins": {"s1": 1, "s0": 2}, "pastActOneBoss": {"s0": 0.40, "onlyS1": 5, "onlyS0": 1, "exactP": 0.25}}
        assert classes["Defect"]["pastActOneBoss"]["onlyS1"] == 14 and classes["Ironclad"]["pastActOneBoss"]["onlyS0"] == 0
    assert body["legs"]["og"]["verdict"] == "not behind"                                                  # the pooled rule is read from the pooled numbers, not from these


def run_reading(tmp_path: Path, *extra: str) -> subprocess.CompletedProcess:
    return subprocess.run(["python3", "-I", str(READING), "--dir", str(tmp_path), "--root", str(tmp_path / "root"), "--out", str(tmp_path / "reading.json"), *extra],
                          capture_output=True, text=True)


def test_a_pooled_file_with_the_arms_the_wrong_way_round_or_in_the_wrong_act_1_is_refused_whatever_it_says(tmp_path):
    ok = dict(boss_lo=-0.004, floor_lo=-0.1)
    read(tmp_path, ok, ok)
    (tmp_path / "reading.json").unlink()
    swapped = [{"character": m["character"], "a": m["b"], "b": m["a"]} for m in members_of("og")]
    pooled(tmp_path / "pooled-slot-og.json", leg="og", members=swapped, **ok)
    r = run_reading(tmp_path)
    assert r.returncode != 0 and "not the pairing of ADR-065 for leg og" in r.stderr and "side a is advisor_v1-astar-ironclad" in r.stderr and not (tmp_path / "reading.json").exists()
    pooled(tmp_path / "pooled-slot-og.json", leg="ud", **ok)                                              # the Underdocks batches in the Overgrowth leg
    r = run_reading(tmp_path)
    assert r.returncode != 0 and "leg og" in r.stderr and "-underdocks-val-n2000" in r.stderr
    pooled(tmp_path / "pooled-slot-og.json", leg="og", **ok)
    pooled(tmp_path / "pooled-slot-ud.json", leg="og", **ok)                                              # and the Overgrowth batches in the Underdocks leg
    r = run_reading(tmp_path)
    assert r.returncode != 0 and "leg ud" in r.stderr and not (tmp_path / "reading.json").exists()
    pooled(tmp_path / "pooled-slot-ud.json", leg="ud", **ok)
    assert run_reading(tmp_path).returncode == 0                                                          # and the right file passes


def test_the_reading_does_not_look_at_a_class_pooled_twice_or_left_out(tmp_path):
    ok = dict(boss_lo=-0.004, floor_lo=-0.1)
    read(tmp_path, ok, ok)
    for bad in (members_of("og")[:4], members_of("og") + members_of("og")[:1], members_of("og")[:4] + members_of("og")[:1]):
        pooled(tmp_path / "pooled-slot-og.json", leg="og", members=bad, **ok)
        r = run_reading(tmp_path, "--legs", "og")
        assert r.returncode != 0 and "not the five once each" in r.stderr


# ---- verify_batch, on manifests
def good_manifest(leg: str, arm: str, cls: str) -> dict:
    s1 = {"engines": 0, "margin": 0.0, "needs": 1, "scalers": 0.7, "size": 1.0, "size_from": 20}
    s0 = {"engines": 0, "margin": 0.0, "needs": 1, "scalers": 0.7}
    return {
        "policy": {"name": "advisor_v1", "params": s1 if arm == "s1" else s0},
        "config": {"character": cls, "ascension": 0, "profile": "veteran", "keep_relics": True, **({"act1": "underdocks"} if leg == "ud" else {})},
        "seeds": {"partition": "val", "n": 2000}, "class_start_verified": True, "canonical_process_state": True, "environment": {"slay2": {"head": "a" * 40, "dirty": False}},
        "summary": {"episodes": 2000, "completed": 1990, "counts": {"win": 3, "death": 1987, "timeout": 10, "aborted": 0, "harness_error": 0, "policy_error": 0, "invalid_action": 0}},
    }


def verify(tmp_path: Path, manifest: dict | None, *args: str) -> subprocess.CompletedProcess:
    d = tmp_path / "batch"
    d.mkdir(exist_ok=True)
    if manifest is not None:
        (d / "manifest.json").write_text(json.dumps(manifest))
    env = {"PATH": "/usr/bin:/bin:/usr/local/bin", "PY": "python3"}
    return subprocess.run(["bash", "-c", f"OUT={tmp_path}/out source scripts/studies/skip/common.sh; verify_batch {d} {' '.join(args)}"], cwd=ROOT, capture_output=True, text=True, env=env)


@pytest.mark.parametrize("leg", ["og", "ud"])
@pytest.mark.parametrize("arm", ["s0", "s1"])
def test_a_batch_that_is_what_the_registration_says_is_accepted(tmp_path, leg, arm):
    for cls in CLASSES:
        r = verify(tmp_path, good_manifest(leg, arm, cls), "val", "2000", leg, arm, cls)
        assert r.returncode == 0, r.stderr


def test_the_parameters_are_compared_as_numbers_and_not_as_text(tmp_path):
    m = good_manifest("og", "s1", "Silent")
    m["policy"]["params"].update(size=1, size_from=20.0, needs=1.0, engines=0.0)                         # 1 and 1.0, 20 and 20.0 are the same number
    assert verify(tmp_path, m, "val", "2000", "og", "s1", "Silent").returncode == 0
    m = good_manifest("og", "s0", "Silent")
    m["policy"]["params"] = dict(reversed(list(m["policy"]["params"].items())))                         # and the order of the keys is nothing
    assert verify(tmp_path, m, "val", "2000", "og", "s0", "Silent").returncode == 0


VERIFY_MUTATIONS = [
    (lambda m: m["config"].update(character="Defect"), "played as Defect, not Silent"),
    (lambda m: m["config"].pop("character"), "played as None, not Silent"),
    (lambda m: m["config"].update(character="silent"), "played as silent, not Silent"),                  # the simulator plays any other string as Ironclad (ADR-049)
    (lambda m: m["policy"].update(name="rules_v1"), "policy rules_v1"),
    (lambda m: m["policy"].update(params={}), "policy parameters {}"),
    (lambda m: m["policy"]["params"].update(needs=2), "policy parameters"),
    (lambda m: m["policy"]["params"].update(unlisted=1), "policy parameters"),
    (lambda m: m["config"].update(ascension=1), "Ascension 1"),
    (lambda m: m["config"].update(profile="first_run"), "profile first_run"),
    (lambda m: m["config"].pop("profile"), "profile None"),
    (lambda m: m["config"].update(keep_relics=False), "relics not kept"),
    (lambda m: m["config"].update(act1="underdocks"), "Act 1 underdocks, not overgrowth"),
    (lambda m: m["seeds"].update(partition="dev"), ": seeds"),
    (lambda m: m["seeds"].update(n=100), ": seeds"),
    (lambda m: m["summary"].update(episodes=1999), ": seeds"),
    (lambda m: m["summary"]["counts"].update(aborted=1), "1 games ended in an abort"),
    (lambda m: m["summary"]["counts"].update(harness_error=1), "1 games ended in an abort"),
    (lambda m: m["summary"]["counts"].update(invalid_action=1), "1 games ended in an abort"),
    (lambda m: m["summary"].update(completed=1799), "only 1799 of 2000 completed"),
    (lambda m: m.pop("class_start_verified"), "class start or canonical process state"),
    (lambda m: m.update(canonical_process_state=False), "class start or canonical process state"),
]


@pytest.mark.parametrize("change,message", VERIFY_MUTATIONS, ids=[f"m{i}" for i in range(len(VERIFY_MUTATIONS))])
@pytest.mark.parametrize("arm", ["s0", "s1"])
def test_a_batch_that_is_something_else_is_refused_for_either_arm(tmp_path, arm, change, message):
    m = good_manifest("og", arm, "Silent")
    change(m)
    r = verify(tmp_path, m, "val", "2000", "og", arm, "Silent")
    assert r.returncode == 1 and message in r.stderr, r.stderr


@pytest.mark.parametrize(
    "arm,change,message",
    [
        ("s1", lambda m: m["policy"]["params"].update(size=0.6), "price 0.6 from 20"),
        ("s1", lambda m: m["policy"]["params"].update(size_from=30), "price 1.0 from 30"),
        ("s1", lambda m: m["policy"]["params"].pop("size"), "price None from 20"),
        ("s1", lambda m: m["policy"].update(params=good_manifest("og", "s0", "Silent")["policy"]["params"]), "price None from None"),   # the baseline filed as the arm that charges
        ("s0", lambda m: m["policy"].update(params=good_manifest("og", "s1", "Silent")["policy"]["params"]), "the baseline names a price"),   # and the other way round
        ("s0", lambda m: m["policy"]["params"].update(size=1.0), "the baseline names a price"),
        ("s1", lambda m: m["environment"]["slay2"].update(dirty=True), "uncommitted changes"),
        ("s1", lambda m: m.pop("environment"), "uncommitted changes"),
    ],
)
def test_the_price_the_arm_charges_and_the_clean_tree_are_held_to_the_arm(tmp_path, arm, change, message):
    m = good_manifest("og", arm, "Silent")
    change(m)
    r = verify(tmp_path, m, "val", "2000", "og", arm, "Silent")
    assert r.returncode == 1 and message in r.stderr, r.stderr


def test_a_baseline_played_from_a_working_tree_with_changes_is_not_held_to_a_clean_tree(tmp_path):
    """Only the arm played for this check has to come from a clean tree: the baselines were played by earlier studies, whose provenance is their own record."""
    m = good_manifest("ud", "s0", "Silent")
    m["environment"]["slay2"]["dirty"] = True
    assert verify(tmp_path, m, "val", "2000", "ud", "s0", "Silent").returncode == 0


def test_the_leg_decides_which_act_1_the_batch_has_to_have(tmp_path):
    assert verify(tmp_path, good_manifest("ud", "s1", "Silent"), "val", "2000", "og", "s1", "Silent").returncode == 1
    assert "Act 1 underdocks, not overgrowth" in verify(tmp_path, good_manifest("ud", "s1", "Silent"), "val", "2000", "og", "s1", "Silent").stderr
    assert "Act 1 overgrowth, not underdocks" in verify(tmp_path, good_manifest("og", "s0", "Silent"), "val", "2000", "ud", "s0", "Silent").stderr


def test_verify_batch_refuses_what_it_cannot_read_or_be_told(tmp_path):
    assert "no readable manifest" in verify(tmp_path, None, "val", "2000", "og", "s1", "Silent").stderr
    ok = good_manifest("og", "s1", "Silent")
    r = verify(tmp_path, ok, "val", "2000", "og", "s1")                                                   # the class is not optional: a check that can be left out is not one
    assert r.returncode == 2 and "usage" in r.stderr
    assert "the arm is s0 or s1" in verify(tmp_path, ok, "val", "2000", "og", "s2", "Silent").stderr
    assert "the arm is s0 or s1" in verify(tmp_path, ok, "val", "2000", "xx", "s1", "Silent").stderr


def test_the_stricter_check_accepts_the_baselines_that_exist(tmp_path):
    """The Overgrowth baselines are ADR-054's real batches; the check that holds a new batch to the registration must not refuse them."""
    for cls in CLASSES:
        d = ROOT / "experiments" / "batches" / f"advisor_v1-astar-{cls.lower()}-a0-veteran-keeprelics-val-n2000"
        env = {"PATH": "/usr/bin:/bin:/usr/local/bin", "PY": "python3"}
        r = subprocess.run(["bash", "-c", f"OUT={tmp_path}/out source scripts/studies/skip/common.sh; verify_batch {d} val 2000 og s0 {cls}"], cwd=ROOT, capture_output=True, text=True, env=env)
        assert r.returncode == 0, r.stderr


def test_the_precondition_batches_that_were_played_are_accepted_by_the_stricter_check(tmp_path):
    """`precondition.sh` holds its baselines to `verify_batch` (now with the class), and `run_batch` holds the arm's: both are real batches here."""
    base = ROOT / "experiments" / "skip" / "precondition"
    if not base.is_dir():
        pytest.skip("the precondition batches are not in this checkout")
    env = {"PATH": "/usr/bin:/bin:/usr/local/bin", "PY": "python3"}
    for leg in ("og", "ud"):
        for arm in ("s0", "s1"):
            for cls in CLASSES:
                d = base / f"{leg}-{arm}-{cls.lower()}"
                r = subprocess.run(["bash", "-c", f"OUT={tmp_path}/out source scripts/studies/skip/common.sh; verify_batch {d} dev 100 {leg} {arm} {cls}"], cwd=ROOT, capture_output=True, text=True, env=env)
                assert r.returncode == 0, r.stderr


def test_the_reading_looks_for_the_baselines_in_this_repository_unless_it_is_told_otherwise():
    import importlib.util

    spec = importlib.util.spec_from_file_location("skip_reading", READING)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.ROOT == ROOT
    ok = module.batch_dirs(Path("experiments/skip"), module.ROOT, "ud", "Defect")
    assert ok == (Path("experiments/skip/batches/advisor_v1-slot-defect-a0-veteran-keeprelics-underdocks-val-n2000"),
                  ROOT / "experiments/underdocks/batches/advisor_v1-astar-defect-a0-veteran-keeprelics-underdocks-val-n2000")


# ---- the order of the two studies
def unpooled(root_files: list[str], tmp_path: Path) -> subprocess.CompletedProcess:
    base = tmp_path / "w"
    (base / "experiments" / "underdocks").mkdir(parents=True, exist_ok=True)
    for f in root_files:
        (base / "experiments" / "underdocks" / f).write_text("{}")
    env = {"PATH": "/usr/bin:/bin:/usr/local/bin", "PY": "python3"}
    return subprocess.run(["bash", "-c", f"OUT={tmp_path}/out; source {ROOT}/scripts/studies/skip/common.sh; cd {base}; adr064_unpooled"], capture_output=True, text=True, env=env)


def test_the_helper_names_the_first_pooled_test_of_adr_064_that_is_missing_and_fails_when_none_is(tmp_path):
    names = ["pooled-ud-t1-synergy-astar-vs-d0star.json", "pooled-ud-t2-values-shown-vs-rules_v1.json", "pooled-ud-t3-neow-keep-v1-vs-rules_v2.json", "robustness-all-pairs.json"]
    r = unpooled([], tmp_path / "none")
    assert r.returncode == 0 and r.stdout.strip() == f"experiments/underdocks/{names[0]}"
    r = unpooled(names[:1] + names[2:], tmp_path / "one")
    assert r.returncode == 0 and r.stdout.strip() == f"experiments/underdocks/{names[1]}"
    r = unpooled(names, tmp_path / "all")
    assert r.returncode == 1 and r.stdout == ""

