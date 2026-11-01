"""`slay2_sim.actsstudy` and the definitions of the acts study's arms (ADR-061): the design checks, and the shell, Python and JavaScript agreeing on names."""

from __future__ import annotations

import inspect
import json
import re
import subprocess
from pathlib import Path

import pytest

from slay2_sim import actsstudy as ac
from slay2_sim import external
from slay2_sim.policies import make_policy

REPO = external.REPO_ROOT
CLASSES = list(ac.CLASSES)


def batch(root: Path, arm: str, cls: str, rows: list[tuple]) -> None:
    d = root / ac.val_id(arm, cls)
    d.mkdir(parents=True)
    with (d / "episodes.jsonl").open("w", encoding="utf-8") as fh:
        for seed, outcome, floor, act, *extra in rows:
            fh.write(json.dumps({"seed": seed, "outcome": outcome, "floor": floor, "act": act, "wall_seconds": 1.0 + (extra[0] if extra else 0), "batch_id": d.name, "policy": arm}) + "\n")


def s_rows(n: int = 40) -> list[tuple]:
    """The baseline's games: a quarter end in Act 1 (index 0), a half in Act 2 (index 1), a quarter in Act 3 (index 2)."""
    return [(i, "death", 10 + 10 * (i % 4 > 0) + 10 * (i % 4 == 3), 0 if i % 4 == 0 else 1 if i % 4 in (1, 2) else 2) for i in range(n)]


def world(tmp_path: Path, differ: dict[str, dict[str, list[tuple]]] | None = None) -> Path:
    """Every arm of every class is the baseline's games, but for the rows ``differ[arm][class]`` replaces (by seed)."""
    batches = tmp_path / "batches"
    for c in CLASSES:
        base = s_rows()
        batch(batches, "s", c, base)
        for arm in ("lead", "a1", "a2", "a3"):
            mine = {r[0]: r for r in (differ or {}).get(arm, {}).get(c, [])}
            batch(batches, arm, c, [mine.get(r[0], r) for r in base])
    return batches


def test_the_names_are_the_ones_the_batches_and_the_scripts_use():
    assert ac.val_id("a2", "Ironclad") == "acts-a2-ironclad-a0-veteran-keeprelics-val2-n3000"
    assert ac.PARTITION == "val2" and ac.VAL_N == 3000 and ac.SEEDS_FILE == "experiments/seeds/ironclad-a0-v3.json"
    assert abs(ac.LEVEL - 0.0125) < 1e-15 and ac.TESTS_N == 4
    assert ac.TESTS == {"L": ("lead", 0), "A1": ("a1", 0), "A2": ("a2", 1), "A3": ("a3", 2)}


def test_an_arm_that_is_s_in_the_early_acts_must_be_s_record_for_record_in_the_games_s_ended_before_its_act(tmp_path):
    batches = world(tmp_path)
    for test in ("A2", "A3"):
        rec = ac.identity_for(batches, test)
        # S ended 10 of 40 games in act 0 and 20 in act 1 (one more quarter in act 2): A2 is held to the first, A3 to both
        assert rec["beforeDifferent"] == 0 and rec["beforePairs"] == 5 * (10 if test == "A2" else 30), rec
    # wall clock, batch id and policy name are not part of the game
    assert ac.identity(batches / ac.val_id("a2", "Silent"), batches / ac.val_id("s", "Silent"), 1)["beforeDifferent"] == 0


def test_one_difference_in_a_game_s_ended_before_the_act_is_found(tmp_path):
    # seed 4 ends in Act 1 (index 0) in S: A2 and A3 must both have played that very game
    moved = [(4, "death", 12, 0)]
    batches = world(tmp_path, {"a2": {"Regent": moved}, "a3": {"Regent": moved}})
    for test in ("A2", "A3"):
        rec = ac.identity_for(batches, test)
        assert rec["beforeDifferent"] == 1 and rec["perClass"]["Regent"]["beforeDifferent"] == 1, test
    # seed 5 ends in Act 2 (index 1): A3 must have played it too, A2 may differ
    later = [(5, "death", 33, 1)]
    batches = world(tmp_path / "b", {"a2": {"Silent": later}, "a3": {"Silent": later}})
    assert ac.identity_for(batches, "A2")["beforeDifferent"] == 0
    assert ac.identity_for(batches, "A3")["beforeDifferent"] == 1
    # a game S ended in Act 3 (index 2) may differ for both
    last = [(7, "win", 51, 2)]
    batches = world(tmp_path / "c", {"a2": {"Silent": last}, "a3": {"Silent": last}})
    assert ac.identity_for(batches, "A2")["beforeDifferent"] == 0 and ac.identity_for(batches, "A3")["beforeDifferent"] == 0


def test_the_command_writes_the_record_and_fails_on_a_difference_or_on_nothing_to_compare(tmp_path):
    batches = world(tmp_path)
    out = tmp_path / "out" / "A3.json"
    assert ac.main(["identity", "A3", "--batches", str(batches), "--out", str(out)]) == 0
    body = json.loads(out.read_text())
    assert body["kind"] == "acts-identity" and body["schema"] == 1 and body["test"] == "A3" and body["arm"] == "a3" and body["firstAct"] == 2
    assert body["beforeDifferent"] == 0 and body["beforePairs"] == 150 and body["bossDifferent"] == 0 and body["bossPairs"] == 200
    # the lead and A1 differ from S from the first act on: nothing to check, nothing written
    skipped = tmp_path / "out" / "L.json"
    assert ac.main(["identity", "L", "--batches", str(batches), "--out", str(skipped)]) == 0 and not skipped.exists()
    # a difference stops it (exit 1) but the record is still written, so that the cause is in the files
    bad = world(tmp_path / "bad", {"a3": {"Defect": [(1, "death", 22, 0)]}})
    failing = tmp_path / "out" / "bad.json"
    assert ac.main(["identity", "A3", "--batches", str(bad), "--out", str(failing)]) == 1
    assert json.loads(failing.read_text())["beforeDifferent"] == 1


def test_the_record_is_made_from_the_batches_it_names(tmp_path):
    batches = world(tmp_path)
    for c in CLASSES:
        for arm in ("s", "a2", "a3"):
            (batches / ac.val_id(arm, c) / "manifest.json").write_text(json.dumps({"content_sha256": f"{arm}-{c}".ljust(64, "0")}))
    rec = ac.identity_for(batches, "A2")
    assert rec["contentSha256"] == {ac.val_id(arm, c): f"{arm}-{c}".ljust(64, "0") for c in CLASSES for arm in ("a2", "s")}
    # a directory without a manifest (only a test makes one) has no hash to record
    assert ac.identity_for(world(tmp_path / "bare"), "A3")["contentSha256"][ac.val_id("s", "Silent")] is None


def test_an_arm_that_is_s_until_act_k_cannot_differ_about_the_bosses_before_it(tmp_path):
    """(c) of ADR-061 item 5, made on the records before any test is pooled: the Act-1 boss for A2, both bosses for A3, none for A1 and the lead."""
    # seed 5 is a game S ended in Act 2 (index 1): the arm "died in Act 1" instead, a difference about the first boss that (b) does not see
    first_boss = [(5, "death", 12, 0)]
    batches = world(tmp_path / "a", {"a2": {"Regent": first_boss}, "a3": {"Regent": first_boss}, "a1": {"Regent": first_boss}})
    assert ac.identity_for(batches, "A2")["bossDifferent"] == 1
    assert ac.identity_for(batches, "A3")["bossDifferent"] == 1
    assert ac.identity_for(batches, "A3")["beforeDifferent"] == 1 and ac.identity_for(batches, "A2")["beforeDifferent"] == 0  # (b) sees it for A3 only
    # seed 7 is a game S ended in Act 3 (index 2): the arm "died in Act 2" instead, a difference about the second boss, which only A3 may not have
    second_boss = [(7, "death", 33, 1)]
    batches = world(tmp_path / "b", {"a2": {"Silent": second_boss}, "a3": {"Silent": second_boss}})
    assert ac.identity_for(batches, "A2")["bossDifferent"] == 0               # A2 is allowed to differ about the second boss
    assert ac.identity_for(batches, "A3")["bossDifferent"] == 1 and ac.identity_for(batches, "A3")["beforeDifferent"] == 0
    # a win is past both bosses whatever its last act (the definitions of slay2_sim.compare)
    assert ac.boss_flags({"outcome": "win", "act": 0}) == (True, True)
    assert ac.boss_flags({"outcome": "death", "act": 1}) == (True, False)
    assert ac.boss_flags({"outcome": "simulator_error", "act": 2}) == (True, True)
    assert ac.boss_flags({"outcome": "timeout", "act": 0}) == (False, False)
    # the command fails on (c) alone
    out = tmp_path / "c.json"
    assert ac.main(["identity", "A3", "--batches", str(batches), "--out", str(out)]) == 1
    rec = json.loads(out.read_text())
    assert rec["beforeDifferent"] == 0 and rec["bossDifferent"] == 1


# ---- the shell definitions of the arms -----------------------------------------------------------------------------------------------------

def common(snippet: str) -> list[str]:
    run = subprocess.run(["bash", "-c", f"source scripts/studies/acts/common.sh; {snippet}"], cwd=REPO, capture_output=True, text=True, env={"PATH": "/usr/bin:/bin", "OUT": "/tmp/acts-test-out", "PYTHONPATH": ""})
    assert run.returncode == 0, run.stderr
    return run.stdout.split("\n")[:-1]


def test_the_shell_names_the_arms_the_python_and_the_reader_name():
    assert common("echo $ARMS_ALL") == ["s lead a1 a2 a3"] and common("echo $TESTS") == ["L A1 A2 A3"]
    assert common("echo $PARTITION $VAL_N $SEEDS $LEVEL_CONFIDENCE") == [f"{ac.PARTITION} {ac.VAL_N} {ac.SEEDS_FILE} 0.9875"]
    assert abs(1 - ac.LEVEL - 0.9875) < 1e-15
    for c in CLASSES:
        for arm in ("s", "lead", "a1", "a2", "a3"):
            assert common(f"val_id {arm} {c}") == [ac.val_id(arm, c)]
    for test, (arm, _) in ac.TESTS.items():
        assert common(f"test_name {arm}") == [test]
    mjs = (REPO / "scripts" / "lib" / "acts.mjs").read_text()
    for test, (arm, first) in ac.TESTS.items():
        assert re.search(rf'key: "{test}", arm: "{arm}", file: "pooled-acts-{test}\.json", acts: \[[0-9, ]*\], first: {first}', mjs), test
    assert 'partition: "val2"' in mjs and f'seeds: {ac.VAL_N}' in mjs and "level: 0.05 / 4" in mjs and 'marker: "Registration of ADR-061 (frozen choices)"' in mjs
    import importlib.util

    spec = importlib.util.spec_from_file_location("acts_robustness_names", REPO / "scripts" / "studies" / "acts" / "robustness.py")
    assert spec and spec.loader
    rob = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(rob)
    assert rob.TESTS == {test: arm for test, (arm, _) in ac.TESTS.items()} and rob.VAL_N == ac.VAL_N and tuple(rob.CLASSES) == ac.CLASSES
    assert all(rob.batch_id(arm, c) == ac.val_id(arm, c) for arm in ("s", "lead", "a1", "a2", "a3") for c in ac.CLASSES)
    assert rob.LEVEL == 0.05 and rob.MAX_EXCLUDED_FRACTION == 0.10


@pytest.mark.parametrize("cls", CLASSES)
def test_every_arm_is_a_policy_that_exists_with_the_parameters_the_registration_gives(sim, cls):
    shown = common(f"shown_values {cls}")[0]
    expected = {
        "s": ("rules_v2", {"threshold": 0.0, "values": shown}),
        "lead": ("rules_v2", {"threshold": 0.2, "values": shown}),
        "a1": ("rules_v2_late", {"threshold": 0.0, "values": shown, "late_threshold": 0.2, "late_acts": [0]}),
        "a2": ("rules_v2_late", {"threshold": 0.0, "values": shown, "late_threshold": 0.2, "late_acts": [1]}),
        "a3": ("rules_v2_late", {"threshold": 0.0, "values": shown, "late_threshold": 0.2, "late_acts": [2]}),
    }
    for arm, (name, params) in expected.items():
        assert common(f"arm_policy {arm}") == [name]
        assert json.loads(common(f"arm_params {arm} {cls}")[0]) == params, arm
        policy = make_policy(name, **json.loads(common(f"arm_params {arm} {cls}")[0]))        # the file exists and the parameters are valid
        eff = policy.describe()["params"]
        assert eff["threshold"] == params["threshold"] and eff.get("late_acts") == params.get("late_acts")
    # no other arm is a name the scripts know
    assert subprocess.run(["bash", "-c", "source scripts/studies/acts/common.sh; arm_params p020 Ironclad"], cwd=REPO, capture_output=True, env={"PATH": "/usr/bin:/bin", "OUT": "/tmp/acts-test-out"}).returncode != 0


def test_the_shown_values_are_the_files_the_site_shows():
    sets = json.loads((REPO / "experiments" / "cardvalue" / "site-sets.json").read_text())["sets"]
    for c in CLASSES:
        shown = common(f"shown_values {c}")[0]
        listed = [e["file"] for e in sets if e["file"].startswith(f"{c.lower()}-a0-")]
        assert listed == [Path(shown).name], c
        assert (REPO / shown).exists()


def test_the_pinned_and_the_reading_paths_cover_what_the_arms_read_and_what_reads_them():
    pinned = common('printf "%s\\n" "${PINNED_PATHS[@]}"')
    reading = common('printf "%s\\n" "${READING_PATHS[@]}"')
    assert {"sim", "scripts/studies/acts", "scripts/verify-pooled.py", "packages/game-data/data", "experiments/cardvalue", "experiments/seeds", "external/pins.json"} <= set(pinned)
    assert {":(exclude)sim/tests", ":(exclude)scripts/studies/acts/README.md"} <= set(pinned)       # what runs nothing is not pinned
    assert reading == ["scripts/lib/acts.mjs", "scripts/lib/pooled.mjs", "scripts/verify-pooled.py"]
    table = common("arm_table")
    assert len(table) == 5 * 5 + 1 and table[-1] == f"{ac.SEEDS_FILE}|{ac.PARTITION}|{ac.VAL_N}|0.2|0.9875|L A1 A2 A3"


def test_the_acts_copy_of_verify_batch_is_the_act_two_logic_under_a_new_heading():
    """The batch check was tested for the Act-2 study (test_act2_verify_batch.py); the acts study uses the same logic, and a test says so."""
    import importlib.util

    def load(name: str, path: Path):
        spec = importlib.util.spec_from_file_location(name, path)
        assert spec and spec.loader
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    a = load("acts_verify_batch", REPO / "scripts" / "studies" / "acts" / "verify_batch.py")
    b = load("act2_verify_batch_copy", REPO / "scripts" / "studies" / "act2" / "verify_batch.py")
    assert inspect.getsource(a.problems) == inspect.getsource(b.problems) and inspect.getsource(a.main) == inspect.getsource(b.main)



def test_the_record_of_adr_061_names_its_registration_once_and_quotes_every_hash_it_pins():
    """The real docs/DECISIONS.md: the preflight finds the registration by the first commit that adds this text, so the text occurs once."""
    log = (REPO / "docs" / "DECISIONS.md").read_text(encoding="utf-8")
    start = log.index("ADR-061: does a pickier card rule win more games")
    nxt = log.find("\n## ", start)
    record = log[start:nxt if nxt >= 0 else len(log)]
    marker = "Registration of ADR-061 (frozen choices)"
    assert record.count(marker) == 1 and log.count(marker) == 1
    mjs = (REPO / "scripts" / "lib" / "acts.mjs").read_text(encoding="utf-8")
    assert f'marker: "{marker}"' in mjs and 'headline: "does a pickier card rule win more games"' in mjs
    import hashlib

    for rel in [common(f"shown_values {c}")[0] for c in CLASSES] + [ac.SEEDS_FILE]:
        assert hashlib.sha256((REPO / rel).read_bytes()).hexdigest() in record, rel
