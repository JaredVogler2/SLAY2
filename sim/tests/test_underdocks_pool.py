"""`scripts/studies/underdocks/pool.sh` end to end on a throwaway repository of synthetic batches (ADR-064 items 4, 5, 10 and 11).

The script refuses to start unless all thirty batches are finished and audited and are what the registration says (read again from their own manifests), writes each
class's comparison and the three pooled tests, and runs each of them once. The batches here are synthetic games with a known answer in the format the harness writes;
nothing is played. The arms differ from one another by a different share of the seeds that they take past the Act-1 boss, so a pooled file that pairs the wrong two
arms has other counts than the generator gives.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from slay2_sim import external
from test_compare import make_batch

REPO = external.REPO_ROOT
CLASSES = ["Ironclad", "Silent", "Regent", "Necrobinder", "Defect"]
N = 2000
SEEDS_INFO = {"file": "experiments/seeds/ironclad-a0-v2.json", "file_sha256": "s" * 64, "partition": "val", "n": N, "sealed_partition_used": False}
# the six arms in the order of common.sh's arm_ids: batch-id prefix, policy, and the share of every hundred seeds that the arm takes past the Act-1 boss
# beyond the 2 seeds in 3 that every arm gets past it (distinct for the arms that are compared, so that a wrong pairing shows in the counts)
ARMS = [
    ("advisor_v1-astar", "advisor_v1", 5),
    ("advisor_v1-d0star", "advisor_v1", 0),
    ("rules_v2-shownvals", "rules_v2", 9),
    ("rules_v1", "rules_v1", 0),
    ("rules_v2_neow_values-keepvals", "rules_v2_neow_values", 7),
    ("rules_v2", "rules_v2", 0),
]
TESTS = {"ud-t1": (0, 1, "pooled-ud-t1-synergy-astar-vs-d0star"), "ud-t2": (2, 3, "pooled-ud-t2-values-shown-vs-rules_v1"), "ud-t3": (4, 5, "pooled-ud-t3-neow-keep-v1-vs-rules_v2")}


def batch_id(arm: str, cls: str) -> str:
    return f"{arm}-{cls.lower()}-a0-veteran-keeprelics-underdocks-val-n2000"


def arm_params(cls: str, out: Path) -> list[dict]:
    """The parameters the study's own script plays each arm of the class with (the same function the runner and the pooling read)."""
    text = subprocess.run(["bash", "-c", f"OUT={out} PY=python3 source scripts/studies/underdocks/common.sh; arm_params {cls}"], cwd=REPO, capture_output=True, text=True, check=True).stdout
    return [json.loads(line) for line in text.splitlines()]


def record(i: int, bonus: int) -> tuple[str, int, int]:
    """(outcome, floor, act) of seed i for an arm: two seeds in three get past the Act-1 boss; the arm gets past it in ``bonus`` more of every hundred (the seeds that
    end in Act 1 for the others), and one seed in fifty of those that get past it is a win."""
    past = i % 3 != 0 or (i % 100) < bonus
    if not past:
        return ("death", 12, 0)
    return ("win", 51, 2) if i % 50 == 1 else ("death", 30, 1)


def git(work: Path, cmd: str) -> None:
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["bash", "-c", cmd], cwd=work, env=env, capture_output=True, text=True, check=True)


def run(work: Path) -> subprocess.CompletedProcess:
    env = {**os.environ, "PY": sys.executable, "OUT": str(work / "artifacts" / "underdocks"), "PYTHONPATH": ""}
    return subprocess.run(["bash", "scripts/studies/underdocks/pool.sh"], cwd=work, env=env, capture_output=True, text=True)


def errored(i: int) -> bool:
    """A game that ended in a simulator error (3 % of them, the same seeds in every batch): it keeps the act it had reached, as a real record does."""
    return i % 31 == 0                               # (among them seeds the arms are told apart on, so that the primary test and the all-pairs analysis differ)


def build(tmp: Path, *, errors: bool = False) -> Path:
    """A repository holding the study's scripts and the real analysis code, with the thirty held-out batches (new, untracked files as in the worktree that plays
    them) finished and audited; with ``errors``, some games of every batch ended in a simulator error."""
    work = tmp / "work"
    (work / "sim").mkdir(parents=True)
    shutil.copytree(REPO / "sim" / "slay2_sim", work / "sim" / "slay2_sim", ignore=shutil.ignore_patterns("__pycache__", "tests"))
    shutil.copytree(REPO / "scripts" / "studies" / "underdocks", work / "scripts" / "studies" / "underdocks", ignore=shutil.ignore_patterns("__pycache__"))
    (work / ".gitignore").write_text("__pycache__/\n*.pyc\n")
    git(work, "git init -q -b main && git add -A && git commit -q -m registration")
    batches = work / "experiments" / "underdocks" / "batches"
    batches.mkdir(parents=True)
    for cls in CLASSES:
        params = arm_params(cls, tmp / "scratch")
        for (arm, policy, bonus), arm_param in zip(ARMS, params):
            rows = [(i, "simulator_error" if errors and errored(i) else outcome, floor, 1.0, act) for i in range(N) for outcome, floor, act in [record(i, bonus)]]
            d = make_batch(batches, batch_id(arm, cls), rows, character=cls, seeds=SEEDS_INFO)
            wins = sum(1 for r in rows if r[1] == "win")
            failed = sum(1 for r in rows if r[1] == "simulator_error")
            m = json.loads((d / "manifest.json").read_text())
            m["policy"] = {"name": policy, "params": arm_param}
            m["config"] = {"character": cls, "ascension": 0, "profile": "veteran", "keep_relics": True, "act1": "underdocks"}
            m["summary"] = {"episodes": N, "completed": N - failed, "counts": {"win": wins, "death": N - wins - failed, "simulator_error": failed, "aborted": 0, "harness_error": 0, "policy_error": 0, "invalid_action": 0}}
            m["class_start_verified"] = True
            m["canonical_process_state"] = True
            m["environment"] = {"slay2": {"head": "a" * 40, "dirty": False}}
            (d / "manifest.json").write_text(json.dumps(m))
            (d / "sample-audit.json").write_text(json.dumps({"all_verified": True, "verified": 40, "sample": {"drawn": 40}, "ledger": {"ok": True}, "batch_content_sha256": "c" * 64}))
            if wins:
                (d / "wins-audit.json").write_text(json.dumps({"all_verified": True, "wins_audited": wins, "wins_in_batch": wins}))
    return work


@pytest.fixture(scope="module")
def world(tmp_path_factory) -> Path:
    return build(tmp_path_factory.mktemp("udpool"))


@pytest.fixture
def work(world: Path, tmp_path: Path) -> Path:
    """A fresh copy of the repository for a test that changes it."""
    dest = tmp_path / "work"
    shutil.copytree(world, dest, symlinks=True)
    return dest


def amend(work: Path, arm: str, cls: str, change) -> None:
    f = work / "experiments" / "underdocks" / "batches" / batch_id(arm, cls) / "manifest.json"
    m = json.loads(f.read_text())
    change(m)
    f.write_text(json.dumps(m))


def expected(ia: int, ib: int) -> tuple[int, int, int, int]:
    """(arm only, baseline only, arm wins, baseline wins) past the Act-1 boss / won, over the five classes, from the generator alone."""
    a_only = b_only = wa = wb = 0
    for _ in CLASSES:
        for i in range(N):
            pa, pb = record(i, ARMS[ia][2]), record(i, ARMS[ib][2])
            a_past, b_past = pa[2] >= 1, pb[2] >= 1
            a_only += a_past and not b_past
            b_only += b_past and not a_past
            wa += pa[0] == "win"
            wb += pb[0] == "win"
    return a_only, b_only, wa, wb


def test_it_pools_each_test_once_with_the_right_two_arms_and_the_level_of_the_registration(world, tmp_path):
    work = tmp_path / "work"
    shutil.copytree(world, work, symlinks=True)
    r = run(work)
    assert r.returncode == 0, r.stderr + r.stdout
    assert "POOL_DONE" in r.stdout
    out = work / "experiments" / "underdocks"
    seen = set()
    for key, (ia, ib, name) in TESTS.items():
        body = json.loads((out / f"{name}.json").read_text())
        arm_a, arm_b = ARMS[ia][0], ARMS[ib][0]
        assert body["policies"] == {"a": ARMS[ia][1], "b": ARMS[ib][1]}
        for m in body["members"]:
            cls = m["character"]
            assert m["a"]["batchId"] == batch_id(arm_a, cls) and m["b"]["batchId"] == batch_id(arm_b, cls), (key, cls)
        assert sorted(m["character"] for m in body["members"]) == sorted(CLASSES)
        assert body["cohort"]["partition"] == "val" and body["cohort"]["ascension"] == 0 and body["role"] == "held-out"
        cl = body["clusteredDifference"]
        assert abs(cl["ciAtLevel"]["level"] - (1 - 0.05 / 3)) < 1e-9
        a_only, b_only, wa, wb = expected(ia, ib)
        table = body["reachedAct2"]["pairedTable"]
        assert (table["a_only"], table["b_only"]) == (a_only, b_only), key           # the arms that were paired are the ones the registration pairs
        assert (body["wins"]["a"], body["wins"]["b"]) == (wa, wb) and body["bothCompleted"] == N * len(CLASSES)
        assert cl["meanAMinusB"] == pytest.approx((a_only - b_only) / body["bothCompleted"])
        seen.add((a_only, b_only))
        for c in CLASSES:
            assert (out / "per-class" / f"{key}-{c.lower()}.json").exists()
    assert len(seen) == 3                                                            # the three tests are told apart by their counts
    assert not (out / "pooled-ud-t1-synergy-astar-vs-d0star.json.tmp").exists()
    again = run(work)                                                                # each test is run once
    assert again.returncode != 0 and "each test is run once" in again.stderr


def test_it_pools_nothing_unless_every_batch_is_finished_and_audited(work):
    (work / "experiments" / "underdocks" / "batches" / batch_id("rules_v1", "Silent") / "sample-audit.json").unlink()
    r = run(work)
    assert r.returncode != 0 and "no readable sample audit" in r.stderr
    assert not list((work / "experiments" / "underdocks").glob("pooled-ud-*.json")) and not (work / "experiments" / "underdocks" / "per-class").exists()


def test_a_sample_audit_of_fewer_than_forty_games_or_of_another_content_does_not_count(work):
    d = work / "experiments" / "underdocks" / "batches" / batch_id("advisor_v1-astar", "Regent")
    audit = json.loads((d / "sample-audit.json").read_text())
    (d / "sample-audit.json").write_text(json.dumps({**audit, "verified": 39, "sample": {"drawn": 39}}))
    assert "sample audit does not pass" in run(work).stderr
    (d / "sample-audit.json").write_text(json.dumps({**audit, "batch_content_sha256": "d" * 64}))
    assert "sample audit does not pass" in run(work).stderr


def test_a_batch_with_wins_needs_a_win_audit_that_covered_every_win(work):
    d = work / "experiments" / "underdocks" / "batches" / batch_id("rules_v2", "Defect")
    (d / "wins-audit.json").unlink()
    assert "wins and no readable win audit" in run(work).stderr
    wins = json.loads((d / "manifest.json").read_text())["summary"]["counts"]["win"]
    (d / "wins-audit.json").write_text(json.dumps({"all_verified": True, "wins_audited": wins - 1, "wins_in_batch": wins}))
    assert "not every win is re-derived" in run(work).stderr


@pytest.mark.parametrize(
    "change,message",
    [
        (lambda m: m["config"].update(act1="overgrowth"), "Act 1 overgrowth"),
        (lambda m: m["config"].pop("act1"), "Act 1 overgrowth"),
        (lambda m: m["config"].update(keep_relics=False), "relics not kept"),
        (lambda m: m["config"].update(ascension=9), "Ascension 9"),
        (lambda m: m["config"].update(profile="first_run"), "profile first_run"),
        (lambda m: m["config"].update(character="Ironclad"), "played as Ironclad, not Silent"),
        (lambda m: m["policy"].update(name="rules_v1"), "policy rules_v1"),
        (lambda m: m["policy"].update(params={"engines": 0, "margin": 0.0, "needs": 1, "scalers": 0.7}), "policy parameters"),
        (lambda m: m["policy"]["params"].update(margin=0.5), "policy parameters"),
        (lambda m: m["seeds"].update(partition="dev"), "seeds"),
        (lambda m: m["seeds"].update(n=1000), "seeds"),
        (lambda m: m["summary"].update(completed=1700), "only 1700 of 2000 completed"),
        (lambda m: m["summary"]["counts"].update(policy_error=1), "abort, a harness error, a policy error or an invalid action"),
        (lambda m: m.update(class_start_verified=False), "class start or canonical process state"),
        (lambda m: m["environment"]["slay2"].update(dirty=True), "uncommitted changes"),
    ],
    ids=["act1-overgrowth", "act1-missing", "relics-dropped", "ascension", "profile", "character", "policy", "params-swapped", "params-changed", "partition", "seed-count", "few-completed", "policy-error", "class-start", "dirty-tree"],
)
def test_a_batch_that_is_not_what_the_registration_says_stops_the_pooling_even_when_it_was_audited(work, change, message):
    amend(work, "advisor_v1-d0star", "Silent", change)
    r = run(work)
    assert r.returncode != 0 and message in r.stderr, r.stderr
    assert not list((work / "experiments" / "underdocks").glob("pooled-ud-*.json")) and not (work / "experiments" / "underdocks" / "per-class").exists()


def test_a_missing_batch_stops_the_pooling(work):
    shutil.rmtree(work / "experiments" / "underdocks" / "batches" / batch_id("rules_v2_neow_values-keepvals", "Defect"))
    r = run(work)
    assert r.returncode != 0 and "no readable manifest" in r.stderr


def test_batches_played_from_different_commits_stop_the_pooling_before_anything_is_written(work):
    """The reader refuses a result whose batches were played from different commits, but only after the pooled files exist and cannot be made again."""
    amend(work, "rules_v1", "Silent", lambda m: m["environment"]["slay2"].update(head="b" * 40))
    r = run(work)
    assert r.returncode != 0 and "not all played from one commit" in r.stderr, r.stderr
    assert not list((work / "experiments" / "underdocks").glob("pooled-ud-*.json")) and not (work / "experiments" / "underdocks" / "per-class").exists()
    amend(work, "rules_v1", "Silent", lambda m: m["environment"]["slay2"].update(head="not-a-commit"))
    assert "not all played from one commit" in run(work).stderr


def test_a_manifest_that_names_another_batch_than_its_directory_stops_the_pooling(work):
    """The pooled file, the reader and the independent recomputation name a batch by its manifest; the all-pairs analysis finds it by its directory."""
    amend(work, "rules_v2", "Regent", lambda m: m.update(batch_id=batch_id("rules_v1", "Regent")))
    r = run(work)
    assert r.returncode != 0 and "its manifest names the batch" in r.stderr, r.stderr
    assert not list((work / "experiments" / "underdocks").glob("pooled-ud-*.json")) and not (work / "experiments" / "underdocks" / "per-class").exists()


def test_a_result_that_already_exists_stops_the_pooling(work):
    out = work / "experiments" / "underdocks"
    (out / "pooled-ud-t2-values-shown-vs-rules_v1.json").write_text("{}")
    r = run(work)
    assert r.returncode != 0 and "each test is run once" in r.stderr
    assert not (out / "pooled-ud-t1-synergy-astar-vs-d0star.json").exists()
    (out / "pooled-ud-t2-values-shown-vs-rules_v1.json").unlink()
    (out / "per-class").mkdir()
    (out / "per-class" / "ud-t1-ironclad.json").write_text("{}")
    r = run(work)
    assert r.returncode != 0 and "the comparisons are run once" in r.stderr


@pytest.mark.parametrize(
    "old,new",
    [
        ("2 3 rules_v2-shownvals rules_v1", "3 2 rules_v2-shownvals rules_v1"),                       # T2's two arms read in the other order
        ("4 5 rules_v2_neow_values-keepvals rules_v2", "5 4 rules_v2_neow_values-keepvals rules_v2"),  # T3's
        ("0 1 advisor_v1-astar advisor_v1-d0star", "0 4 advisor_v1-astar advisor_v1-d0star"),         # T1 against another test's arm
    ],
    ids=["t2-swapped", "t3-swapped", "t1-wrong-baseline"],
)
def test_a_pairing_that_is_not_the_registered_one_stops_the_pooling_before_anything_is_written(work, old, new):
    """The script lists the arms each test compares and checks every pair of every test before it writes a file; a copy whose list says otherwise is refused."""
    script = work / "scripts" / "studies" / "underdocks" / "pool.sh"
    text = script.read_text()
    assert text.count(old) == 1
    script.write_text(text.replace(old, new))
    r = run(work)
    assert r.returncode != 0 and ("arm a of" in r.stderr or "arm b of" in r.stderr), r.stderr
    assert not list((work / "experiments" / "underdocks").glob("pooled-ud-*.json")) and not (work / "experiments" / "underdocks" / "per-class").exists()


# ---- the all-pairs analysis the reading rule asks for


@pytest.fixture(scope="module")
def pooled_with_errors(tmp_path_factory) -> Path:
    work = build(tmp_path_factory.mktemp("udpoolerr"), errors=True)
    r = run(work)
    assert r.returncode == 0, r.stderr + r.stdout
    return work


def test_the_all_pairs_analysis_scores_the_endpoint_as_observed_and_keeps_the_pairs_the_primary_drops(pooled_with_errors):
    out = pooled_with_errors / "experiments" / "underdocks"
    rob = json.loads((out / "robustness-all-pairs.json").read_text())
    assert rob["kind"] == "underdocks-robustness" and rob["schema"] == 1 and rob["maxExcludedFraction"] == 0.10 and abs(rob["level"] - 0.05) < 1e-12
    assert sorted(rob["tests"]) == ["neow", "synergy", "values"]
    keys = {"synergy": (0, 1), "values": (2, 3), "neow": (4, 5)}
    for key, (ia, ib) in keys.items():
        entry = rob["tests"][key]
        assert entry["arm"] == ARMS[ia][0] and entry["baseline"] == ARMS[ib][0]
        a_only, b_only, _, _ = expected(ia, ib)                       # past the Act-1 boss by the generator, every game kept (an error keeps its act)
        pooled = entry["pooled"]
        assert (pooled["armOnly"], pooled["baselineOnly"]) == (a_only, b_only), key
        assert pooled["pairs"] == pooled["shared"] == N * len(CLASSES)
        n_err = sum(1 for i in range(N) if errored(i))
        assert pooled["notCompleted"] == {"arm": n_err * len(CLASSES), "baseline": n_err * len(CLASSES)}
        assert pooled["primaryPairs"] == (N - n_err) * len(CLASSES)    # the primary test drops the pairs with an error (the same seeds in both arms here)
        assert abs(pooled["primaryExcludedFraction"] - n_err / N) < 1e-12
        assert abs(pooled["difference"] - (a_only - b_only) / pooled["pairs"]) < 1e-12
        assert sorted(entry["perClass"]) == sorted(CLASSES)
        for k in ("pairs", "armOnly", "baselineOnly", "arm", "baseline"):
            assert sum(entry["perClass"][c][k] for c in CLASSES) == pooled[k]
        assert pooled["armOnly"] - pooled["baselineOnly"] == pooled["arm"] - pooled["baseline"]
        primary = json.loads((out / (TESTS[{"synergy": "ud-t1", "values": "ud-t2", "neow": "ud-t3"}[key]][2] + ".json")).read_text())
        assert primary["bothCompleted"] == pooled["primaryPairs"]
        assert primary["reachedAct2"]["pairedTable"]["a_only"] < pooled["armOnly"]       # the pairs with an error are in the all-pairs count and not in the primary's
    # tied to the batches by content hash
    assert len(rob["contentSha256"]) == 30 and set(rob["contentSha256"].values()) == {"c" * 64}


def test_the_all_pairs_analysis_is_refused_a_second_time_and_needs_no_part_of_the_simulator_package(pooled_with_errors, tmp_path):
    again = run(pooled_with_errors)
    assert again.returncode != 0 and "each test is run once" in again.stderr
    src = (REPO / "scripts" / "studies" / "underdocks" / "robustness.py").read_text()
    assert "slay2_sim" not in src.replace("`slay2_sim`", "")


# ---- the two small functions of the all-pairs analysis, on their own


def robustness_module():
    import importlib.util

    spec = importlib.util.spec_from_file_location("ud_robustness", REPO / "scripts" / "studies" / "underdocks" / "robustness.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    "a_only,b_only,expected",
    [(0, 0, 1.0), (3, 0, 0.25), (0, 3, 0.25), (10, 0, 2 / 1024), (5, 5, 1.0), (7, 2, 92 / 512), (2, 7, 92 / 512)],
    ids=["none", "three-to-none", "none-to-three", "ten-to-none", "tie", "seven-to-two", "two-to-seven"],
)
def test_the_exact_test_of_the_all_pairs_analysis_is_the_two_sided_one(a_only, b_only, expected):
    assert robustness_module().mcnemar_exact(a_only, b_only) == pytest.approx(expected, rel=1e-12)


def test_the_exact_test_of_the_all_pairs_analysis_agrees_with_the_library_which_it_must_not_import():
    from slay2_sim import stats

    mine = robustness_module().mcnemar_exact
    for a_only in range(0, 40, 3):
        for b_only in range(0, 40, 4):
            assert mine(a_only, b_only) == pytest.approx(stats.mcnemar_exact(a_only, b_only), rel=1e-9, abs=1e-15), (a_only, b_only)
    import ast

    tree = ast.parse((REPO / "scripts" / "studies" / "underdocks" / "robustness.py").read_text())
    imported = {a.name.split(".")[0] for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names}
    imported |= {n.module.split(".")[0] for n in ast.walk(tree) if isinstance(n, ast.ImportFrom) and n.module}
    assert "slay2_sim" not in imported


def test_only_a_win_or_a_death_is_a_completed_game_and_the_endpoint_is_the_act_the_game_ended_in():
    r = robustness_module()
    for outcome, done in [("win", True), ("death", True), ("timeout", False), ("step_limit", False), ("simulator_error", False), ("aborted", False)]:
        assert r.completed({"outcome": outcome, "act": 0}) is done, outcome
    # got past the Act-1 boss: won, or in a later act when the game ended, however it ended
    assert r.past_boss({"outcome": "win", "act": 2}) and r.past_boss({"outcome": "win", "act": 0})
    assert r.past_boss({"outcome": "death", "act": 1}) and not r.past_boss({"outcome": "death", "act": 0})
    for outcome in ("timeout", "step_limit", "simulator_error"):
        assert r.past_boss({"outcome": outcome, "act": 1}) and not r.past_boss({"outcome": outcome, "act": 0}), outcome
