"""`scripts/studies/skip/pool.sh` end to end on a throwaway repository of synthetic batches (ADR-065 items 3 and 4), and `reading.py` on what it writes.

The script refuses to start unless the leg's ten batches (the five that charge for a slot, S1, and the five baselines, S0) are what the registration says, read again
from their own manifests, and are finished and audited; it pairs S1 as side `a` and S0 as side `b`, writes each class's comparison and the pooled check of the leg, and
runs each once. The batches here are synthetic games with a known answer in the format the harness writes; nothing is played. The two arms differ from one another, in
each leg and a little in each class, by the share of the seeds that they take past the Act-1 boss, so a pooled file that pairs the wrong two batches, or the right ones
the wrong way round, has other counts than the generator gives.
"""

from __future__ import annotations

import copy
import hashlib
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
LEGS = ["og", "ud"]
N = 2000
SEEDS_INFO = {"file": "experiments/seeds/ironclad-a0-v2.json", "file_sha256": "s" * 64, "partition": "val", "n": N, "sealed_partition_used": False}
S0_PARAMS = {"engines": 0, "margin": 0.0, "needs": 1, "scalers": 0.7}                  # ADR-054's A*: the registered baseline
S1_PARAMS = {**S0_PARAMS, "size": 1.0, "size_from": 20}                                  # the same pilot charging one point from the 21st card
ADR064_POOLED = ["pooled-ud-t1-synergy-astar-vs-d0star", "pooled-ud-t2-values-shown-vs-rules_v1", "pooled-ud-t3-neow-keep-v1-vs-rules_v2", "robustness-all-pairs"]


def batch_id(leg: str, arm: str, cls: str) -> str:
    tail = "-underdocks" if leg == "ud" else ""
    return f"advisor_v1-{'slot' if arm == 's1' else 'astar'}-{cls.lower()}-a0-veteran-keeprelics{tail}-val-n2000"


def batch_dir(work: Path, leg: str, arm: str, cls: str) -> Path:
    if arm == "s1":
        return work / "experiments" / "skip" / "batches" / batch_id(leg, arm, cls)
    return work / "experiments" / ("underdocks" if leg == "ud" else "") / "batches" / batch_id(leg, arm, cls)


# ---- the synthetic games
# Two seeds in three get past the Act-1 boss whatever the arm; an arm gets past it in ``bonus`` more of every hundred seeds, a different stretch of the hundred for each
# arm (so that each has pairs that only it wins, and a pairing the wrong way round reads the opposite). The bonuses differ by leg and arm, and by class (the class's
# position is added).
SHIFT = {"s1": 0, "s0": 50}
BONUS = {("og", "s1"): 7, ("og", "s0"): 4, ("ud", "s1"): 9, ("ud", "s0"): 3}
BONUS_BEHIND_UD = {"s1": 3, "s0": 9}                    # the Underdocks leg of the second world: the arm that charges for a slot is the one that is behind
TIMEOUT = {"s1": (250, 7), "s0": (400, 11)}            # a game in every 250 (400) ends at the step limit: pairs with a game that did not complete are left out


def bonus(leg: str, arm: str, ci: int, kind: str) -> int:
    base = BONUS_BEHIND_UD[arm] if (kind == "behind" and leg == "ud") else BONUS[(leg, arm)]
    return base + ci


def game(i: int, leg: str, arm: str, ci: int, kind: str) -> tuple[str, int, int]:
    """(outcome, floor, act) of seed i for an arm."""
    every, at = TIMEOUT[arm]
    if i % every == at:
        return ("timeout", 7, 0)
    if i % 3 == 0 and ((i + SHIFT[arm]) % 100) >= bonus(leg, arm, ci, kind):
        return ("death", 12, 0)
    return ("win", 51, 2) if i % 50 == 1 else ("death", 30, 1)


def advisor(i: int, leg: str, arm: str, ci: int) -> dict:
    """The card rewards a game met and skipped, as the pilot records them: by act only for the arm that names the price."""
    if arm == "s1":
        sk = (int(i % (8 if leg == "ud" else 10) == 0), int(i % 4 == 0), int(i % (3 + ci) == 0))
        return {"offers": 9, "taken": 9 - sum(sk), "skipped": sum(sk), "unscored": 0,
                "by_act": {"0": {"offers": 4, "skipped": sk[0]}, "1": {"offers": 3, "skipped": sk[1]}, "2": {"offers": 2, "skipped": sk[2]}}}
    k = int(i % (25 + ci + (5 if leg == "ud" else 0)) == 0)
    return {"offers": 9, "taken": 9 - k, "skipped": k, "unscored": 0}


def write_batch(work: Path, leg: str, arm: str, cls: str, kind: str) -> Path:
    ci = CLASSES.index(cls)
    games = [game(i, leg, arm, ci, kind) for i in range(N)]
    rows = [(i, outcome, floor, 1.0, act) for i, (outcome, floor, act) in enumerate(games)]
    d = batch_dir(work, leg, arm, cls)
    make_batch(d.parent, d.name, rows, character=cls, seeds=SEEDS_INFO)
    wins = sum(1 for g in games if g[0] == "win")
    timeouts = sum(1 for g in games if g[0] == "timeout")
    episodes = d / "episodes.jsonl"
    episodes.write_text("".join(json.dumps({**json.loads(line), "extra": {"advisor": advisor(i, leg, arm, ci)}}) + "\n" for i, line in enumerate(episodes.read_text().splitlines())))
    m = json.loads((d / "manifest.json").read_text())
    m["policy"] = {"name": "advisor_v1", "params": copy.deepcopy(S1_PARAMS if arm == "s1" else S0_PARAMS)}
    m["config"] = {"character": cls, "ascension": 0, "profile": "veteran", "keep_relics": True, **({"act1": "underdocks"} if leg == "ud" else {})}
    m["summary"] = {"episodes": N, "completed": N - timeouts, "counts": {"win": wins, "death": N - timeouts - wins, "timeout": timeouts, "simulator_error": 0,
                                                                          "aborted": 0, "harness_error": 0, "policy_error": 0, "invalid_action": 0}}
    m["class_start_verified"] = True
    m["canonical_process_state"] = True
    m["environment"] = {"slay2": {"head": "a" * 40, "dirty": False}}
    (d / "manifest.json").write_text(json.dumps(m))
    (d / "sample-audit.json").write_text(json.dumps({"all_verified": True, "verified": 40, "sample": {"drawn": 40}, "ledger": {"ok": True}, "batch_content_sha256": "c" * 64}))
    if wins:
        (d / "wins-audit.json").write_text(json.dumps({"all_verified": True, "wins_audited": wins, "wins_in_batch": wins}))
    return d


def write_leg(work: Path, leg: str, kind: str) -> None:
    for cls in CLASSES:
        for arm in ("s1", "s0"):
            write_batch(work, leg, arm, cls, kind)


def build(tmp: Path, kind: str = "ahead") -> Path:
    """A repository holding the study's scripts and the real analysis code, with the twenty batches of both legs (new files, as in the worktree that plays them)
    finished and audited, and the three pooled tests of ADR-064 that the Underdocks leg waits for."""
    work = tmp / "work"
    (work / "sim").mkdir(parents=True)
    shutil.copytree(REPO / "sim" / "slay2_sim", work / "sim" / "slay2_sim", ignore=shutil.ignore_patterns("__pycache__", "tests"))
    shutil.copytree(REPO / "scripts" / "studies" / "skip", work / "scripts" / "studies" / "skip", ignore=shutil.ignore_patterns("__pycache__"))
    for leg in LEGS:
        write_leg(work, leg, kind)
    for name in ADR064_POOLED:
        (work / "experiments" / "underdocks" / f"{name}.json").write_text("{}")
    return work


# ---- what the generator says the answer is
def expected(leg: str, kind: str = "ahead") -> dict:
    """The counts of the pooled file and of each class's file, from the generator alone."""
    out = {"a_only": 0, "b_only": 0, "wins_a": 0, "wins_b": 0, "both": 0, "floors": 0.0, "past_a": 0, "past_b": 0, "classes": {}}
    for ci, cls in enumerate(CLASSES):
        c = {"a_only": 0, "b_only": 0, "wins_a": 0, "wins_b": 0, "both": 0}
        for i in range(N):
            ga, gb = game(i, leg, "s1", ci, kind), game(i, leg, "s0", ci, kind)
            if "timeout" in (ga[0], gb[0]):
                continue
            c["both"] += 1
            pa, pb = ga[0] == "win" or ga[2] >= 1, gb[0] == "win" or gb[2] >= 1
            c["a_only"] += pa and not pb
            c["b_only"] += pb and not pa
            c["wins_a"] += ga[0] == "win"
            c["wins_b"] += gb[0] == "win"
            out["floors"] += ga[1] - gb[1]
            out["past_a"] += pa
            out["past_b"] += pb
        for k, v in c.items():
            out[k] += v
        out["classes"][cls] = c
    return out


def expected_shares(leg: str, arm: str) -> dict:
    per, tot, tot_act = {}, [0, 0], [[0, 0] for _ in range(3)]
    for ci, cls in enumerate(CLASSES):
        offers = skipped = 0
        act = [[0, 0] for _ in range(3)]
        for i in range(N):
            a = advisor(i, leg, arm, ci)
            offers += a["offers"]
            skipped += a["skipped"]
            for k, v in (a.get("by_act") or {}).items():
                act[int(k)][0] += v["offers"]
                act[int(k)][1] += v["skipped"]
        per[cls] = {"cardRewards": offers, "skipped": skipped, "share": round(skipped / offers, 4)}
        if arm == "s1":
            per[cls]["byAct"] = {f"act{a + 1}": {"cardRewards": v[0], "skipped": v[1], "share": round(v[1] / v[0], 4)} for a, v in enumerate(act)}
            for a in range(3):
                tot_act[a][0] += act[a][0]
                tot_act[a][1] += act[a][1]
        tot[0] += offers
        tot[1] += skipped
    out = {"cardRewards": tot[0], "skipped": tot[1], "share": round(tot[1] / tot[0], 4), "perClass": per}
    if arm == "s1":
        out["byAct"] = {f"act{a + 1}": {"cardRewards": v[0], "skipped": v[1], "share": round(v[1] / v[0], 4)} for a, v in enumerate(tot_act)}
    return out


# ---- running things
def env_of(work: Path, **extra: str) -> dict:
    return {**os.environ, "PY": sys.executable, "OUT": str(work / "artifacts" / "skip"), "PYTHONPATH": "", **extra}


def pool(work: Path, leg: str = "og") -> subprocess.CompletedProcess:
    return subprocess.run(["bash", "scripts/studies/skip/pool.sh", leg], cwd=work, env=env_of(work), capture_output=True, text=True)


def results(work: Path) -> Path:
    return work / "experiments" / "skip"


def amend(work: Path, leg: str, arm: str, cls: str, change) -> None:
    f = batch_dir(work, leg, arm, cls) / "manifest.json"
    m = json.loads(f.read_text())
    change(m)
    f.write_text(json.dumps(m))


def nothing_written(work: Path) -> bool:
    return not list(results(work).glob("pooled-slot-*.json")) and not (results(work) / "per-class").exists()


@pytest.fixture(scope="module")
def world(tmp_path_factory) -> Path:
    return build(tmp_path_factory.mktemp("skippool"))


@pytest.fixture
def work(world: Path, tmp_path: Path) -> Path:
    """A fresh copy of the repository for a test that changes it."""
    dest = tmp_path / "work"
    shutil.copytree(world, dest, symlinks=True)
    return dest


@pytest.fixture(scope="module")
def pooled(world: Path, tmp_path_factory) -> tuple[Path, dict]:
    """The world with both legs pooled by the real pool.sh (S1 ahead of S0 in both)."""
    dest = tmp_path_factory.mktemp("skippooled") / "work"
    shutil.copytree(world, dest, symlinks=True)
    runs = {leg: pool(dest, leg) for leg in LEGS}
    return dest, runs


@pytest.fixture(scope="module")
def pooled_behind(pooled, tmp_path_factory) -> Path:
    """The same, but in the Underdocks leg the arm that charges for a slot is behind: the og output is the one above, the ud batches are replaced and pooled again."""
    src, _ = pooled
    dest = tmp_path_factory.mktemp("skippooledbehind") / "work"
    shutil.copytree(src, dest, symlinks=True)
    (results(dest) / "pooled-slot-ud.json").unlink()
    for f in (results(dest) / "per-class").glob("slot-ud-*.json"):
        f.unlink()
    for cls in CLASSES:
        for arm in ("s1", "s0"):
            shutil.rmtree(batch_dir(dest, "ud", arm, cls))
    write_leg(dest, "ud", "behind")
    r = pool(dest, "ud")
    assert r.returncode == 0, r.stderr
    return dest


# ---- the pooling
@pytest.mark.parametrize("leg", LEGS)
def test_it_pools_the_leg_once_with_s1_as_a_and_s0_as_b_and_the_level_of_the_registration(pooled, leg):
    work, runs = pooled
    r = runs[leg]
    assert r.returncode == 0, r.stderr + r.stdout
    assert "POOL_DONE" in r.stdout
    file = results(work) / f"pooled-slot-{leg}.json"
    assert hashlib.sha256(file.read_bytes()).hexdigest() in r.stdout                  # the hash it prints is the file's
    body = json.loads(file.read_text())
    assert body["policies"] == {"a": "advisor_v1", "b": "advisor_v1"}                  # the policies cannot tell the sides apart: the batch ids do
    assert sorted(m["character"] for m in body["members"]) == sorted(CLASSES)
    for m in body["members"]:
        assert m["a"]["batchId"] == batch_id(leg, "s1", m["character"]), m["character"]    # S1, the arm that charges for a slot, is side a
        assert m["b"]["batchId"] == batch_id(leg, "s0", m["character"]), m["character"]    # S0, the baseline, is side b
    assert body["cohort"]["partition"] == "val" and body["cohort"]["ascension"] == 0 and body["cohort"]["profile"] == "veteran" and body["role"] == "held-out"
    cl = body["clusteredDifference"]
    assert abs(cl["ciAtLevel"]["level"] - 0.95) < 1e-9 and cl["method"].endswith("20000 resamples, rng seed 0")           # LEVEL_CONFIDENCE and --iters 20000
    e = expected(leg)
    table = body["reachedAct2"]["pairedTable"]
    assert (table["a_only"], table["b_only"]) == (e["a_only"], e["b_only"])           # the counts of the pairs the check pairs
    assert (body["wins"]["a"], body["wins"]["b"]) == (e["wins_a"], e["wins_b"])
    assert body["bothCompleted"] == e["both"] and body["pairedSeeds"] == N * len(CLASSES) and body["excludedNotCompleted"] == N * len(CLASSES) - e["both"] > 0
    assert cl["meanAMinusB"] == pytest.approx((e["a_only"] - e["b_only"]) / e["both"])
    assert body["floorDifference"]["meanAMinusB"] == pytest.approx(e["floors"] / e["both"])
    assert e["a_only"] > e["b_only"] > 0                                               # S1 is ahead of S0 in this world: swapped, the sign would turn
    for cls in CLASSES:                                                                # each class on its own, with its own numbers
        one = json.loads((results(work) / "per-class" / f"slot-{leg}-{cls.lower()}.json").read_text())
        assert one["a"]["batchId"] == batch_id(leg, "s1", cls) and one["b"]["batchId"] == batch_id(leg, "s0", cls)
        c = e["classes"][cls]
        assert (one["reachedAct2"]["pairedTable"]["a_only"], one["reachedAct2"]["pairedTable"]["b_only"]) == (c["a_only"], c["b_only"])
        assert (one["a"]["wins"], one["b"]["wins"]) == (c["wins_a"], c["wins_b"]) and one["bothCompleted"] == c["both"]
    assert not list(results(work).glob("*.tmp"))
    again = pool(work, leg)                                                            # the check is run once
    assert again.returncode != 0 and "the check is run once" in again.stderr
    assert hashlib.sha256(file.read_bytes()).hexdigest() in r.stdout


def test_the_legs_are_told_apart_by_their_counts_and_each_leg_leaves_the_other_alone(pooled):
    work, _ = pooled
    seen = {(e["a_only"], e["b_only"]) for e in (expected("og"), expected("ud"))}
    assert len(seen) == 2
    assert {p.name for p in results(work).glob("pooled-slot-*.json")} == {"pooled-slot-og.json", "pooled-slot-ud.json"}
    assert len(list((results(work) / "per-class").glob("*.json"))) == 2 * len(CLASSES)


def test_a_leg_alone_is_pooled_without_touching_the_other(work):
    r = pool(work, "og")
    assert r.returncode == 0, r.stderr
    assert (results(work) / "pooled-slot-og.json").exists() and not (results(work) / "pooled-slot-ud.json").exists()
    assert not list((results(work) / "per-class").glob("slot-ud-*.json"))


def test_an_unknown_leg_is_a_usage_error(work):
    for leg in ("", "xx"):
        r = subprocess.run(["bash", "scripts/studies/skip/pool.sh", leg], cwd=work, env=env_of(work), capture_output=True, text=True)
        assert r.returncode == 2 and "usage" in r.stderr and nothing_written(work)


# ---- what stops it
@pytest.mark.parametrize("leg,arm", [("og", "s1"), ("og", "s0"), ("ud", "s1"), ("ud", "s0")])
def test_it_pools_nothing_unless_every_batch_is_finished_and_audited(work, leg, arm):
    (batch_dir(work, leg, arm, "Silent") / "sample-audit.json").unlink()
    r = pool(work, leg)
    assert r.returncode != 0 and "no readable sample audit" in r.stderr and batch_dir(work, leg, arm, "Silent").name in r.stderr
    assert nothing_written(work)


@pytest.mark.parametrize("leg,arm", [("og", "s1"), ("ud", "s0")])
def test_a_sample_audit_of_fewer_than_forty_games_or_of_another_content_does_not_count(work, leg, arm):
    d = batch_dir(work, leg, arm, "Regent")
    audit = json.loads((d / "sample-audit.json").read_text())
    for bad in ({"verified": 39, "sample": {"drawn": 39}}, {"batch_content_sha256": "d" * 64}, {"all_verified": False}, {"ledger": {"ok": False}}):
        (d / "sample-audit.json").write_text(json.dumps({**audit, **bad}))
        r = pool(work, leg)
        assert r.returncode != 0 and "sample audit does not pass" in r.stderr and nothing_written(work), bad


@pytest.mark.parametrize("leg,arm", [("og", "s1"), ("og", "s0"), ("ud", "s1"), ("ud", "s0")])
def test_a_batch_with_wins_needs_a_win_audit_that_covered_every_win(work, leg, arm):
    d = batch_dir(work, leg, arm, "Defect")
    (d / "wins-audit.json").unlink()
    r = pool(work, leg)
    assert r.returncode != 0 and "wins and no readable win audit" in r.stderr and nothing_written(work)
    wins = json.loads((d / "manifest.json").read_text())["summary"]["counts"]["win"]
    assert wins > 0
    (d / "wins-audit.json").write_text(json.dumps({"all_verified": True, "wins_audited": wins - 1, "wins_in_batch": wins}))
    assert "not every win is re-derived" in pool(work, leg).stderr
    (d / "wins-audit.json").write_text(json.dumps({"all_verified": False, "wins_audited": wins, "wins_in_batch": wins}))
    assert "not every win is re-derived" in pool(work, leg).stderr


# every way a batch can be something other than the one the registration names, found in the batch's own manifest even though it was audited; S1 and S0 are
# both held to it (the dirty-tree rule is for the arm that is played here)
DIFFERENT = [
    ("og", "s1", lambda m: m["config"].update(act1="underdocks"), "Act 1 underdocks, not overgrowth"),
    ("ud", "s1", lambda m: m["config"].pop("act1"), "Act 1 overgrowth, not underdocks"),
    ("ud", "s0", lambda m: m["config"].pop("act1"), "Act 1 overgrowth, not underdocks"),
    ("og", "s0", lambda m: m["config"].update(act1="underdocks"), "Act 1 underdocks, not overgrowth"),
    ("og", "s1", lambda m: m["config"].update(keep_relics=False), "relics not kept"),
    ("ud", "s0", lambda m: m["config"].update(keep_relics=False), "relics not kept"),
    ("ud", "s1", lambda m: m["config"].pop("keep_relics"), "relics not kept"),
    ("og", "s1", lambda m: m["config"].update(ascension=9), "Ascension 9"),
    ("ud", "s0", lambda m: m["config"].update(ascension=1), "Ascension 1"),
    ("og", "s1", lambda m: m["config"].update(character="Ironclad"), "played as Ironclad, not Silent"),
    ("ud", "s0", lambda m: m["config"].update(character="Regent"), "played as Regent, not Silent"),
    ("og", "s1", lambda m: m["config"].update(profile="first_run"), "profile first_run"),
    ("og", "s1", lambda m: m["policy"].update(name="rules_v1"), "policy rules_v1"),
    ("ud", "s0", lambda m: m["policy"].update(name="rules_v2"), "policy rules_v2"),
    ("og", "s1", lambda m: m["policy"]["params"].update(size=0.6), "price 0.6 from 20"),
    ("ud", "s1", lambda m: m["policy"]["params"].update(size_from=30), "price 1.0 from 30"),
    ("og", "s1", lambda m: m["policy"]["params"].pop("size_from"), "price 1.0 from None"),
    ("ud", "s1", lambda m: m["policy"].update(params=dict(S0_PARAMS)), "price None from None"),                       # the baseline filed as the arm that charges
    ("og", "s0", lambda m: m["policy"].update(params=dict(S1_PARAMS)), "the baseline names a price"),                 # the arm that charges filed as the baseline
    ("ud", "s0", lambda m: m["policy"]["params"].update(size=1.0), "the baseline names a price"),
    ("og", "s1", lambda m: m["policy"]["params"].update(scalers=0.5), "policy parameters"),                            # any other parameter of the pilot
    ("ud", "s0", lambda m: m["policy"]["params"].update(engines=1), "policy parameters"),
    ("ud", "s0", lambda m: m["policy"]["params"].pop("needs"), "policy parameters"),
    ("og", "s1", lambda m: m["policy"]["params"].update(explore=0.1), "policy parameters"),
    ("og", "s1", lambda m: m["seeds"].update(partition="dev"), ": seeds"),
    ("ud", "s0", lambda m: m["seeds"].update(n=1000), ": seeds"),
    ("og", "s0", lambda m: m["summary"].update(episodes=1999), ": seeds"),
    ("og", "s1", lambda m: m["summary"].update(completed=1700), "only 1700 of 2000 completed"),
    ("ud", "s0", lambda m: m["summary"].update(completed=1799), "only 1799 of 2000 completed"),
    ("og", "s1", lambda m: m["summary"]["counts"].update(policy_error=1), "abort, a harness error, a policy error or an invalid action"),
    ("ud", "s0", lambda m: m["summary"]["counts"].update(aborted=2), "abort, a harness error, a policy error or an invalid action"),
    ("og", "s1", lambda m: m.update(class_start_verified=False), "class start or canonical process state"),
    ("ud", "s0", lambda m: m.update(canonical_process_state=False), "class start or canonical process state"),
    ("ud", "s1", lambda m: m["environment"]["slay2"].update(dirty=True), "uncommitted changes"),
    ("og", "s1", lambda m: m["environment"].pop("slay2"), "uncommitted changes"),
]


@pytest.mark.parametrize("leg,arm,change,message", DIFFERENT, ids=[f"{leg}-{arm}-{i}" for i, (leg, arm, _, _) in enumerate(DIFFERENT)])
def test_a_batch_that_is_not_what_the_registration_says_stops_the_pooling_even_when_it_was_audited(work, leg, arm, change, message):
    amend(work, leg, arm, "Silent", change)
    r = pool(work, leg)
    assert r.returncode != 0 and message in r.stderr and batch_dir(work, leg, arm, "Silent").name in r.stderr, r.stderr
    assert nothing_written(work)


@pytest.mark.parametrize("leg,arm", [("og", "s1"), ("og", "s0"), ("ud", "s1"), ("ud", "s0")])
def test_a_missing_batch_stops_the_pooling(work, leg, arm):
    shutil.rmtree(batch_dir(work, leg, arm, "Defect"))
    r = pool(work, leg)
    assert r.returncode != 0 and "no readable manifest" in r.stderr and nothing_written(work)


def test_a_manifest_that_names_another_batch_than_its_directory_stops_the_pooling(work):
    amend(work, "og", "s1", "Regent", lambda m: m.update(batch_id=batch_id("og", "s0", "Regent")))
    r = pool(work, "og")
    assert r.returncode != 0 and "its manifest names the batch" in r.stderr and nothing_written(work)


def test_a_result_that_already_exists_stops_the_pooling(work):
    out = results(work)
    (out / "pooled-slot-og.json").write_text("{}")
    r = pool(work, "og")
    assert r.returncode != 0 and "the check is run once" in r.stderr
    assert not (out / "per-class").exists()
    (out / "pooled-slot-og.json").unlink()
    (out / "per-class").mkdir()
    (out / "per-class" / "slot-og-ironclad.json").write_text("{}")
    r = pool(work, "og")
    assert r.returncode != 0 and "the comparisons are run once" in r.stderr
    assert not (out / "pooled-slot-og.json").exists()


@pytest.mark.parametrize("name", ADR064_POOLED)
def test_the_underdocks_leg_is_not_pooled_before_adr_064_is(work, name):
    (work / "experiments" / "underdocks" / f"{name}.json").unlink()
    r = pool(work, "ud")
    assert r.returncode != 0 and "ADR-064 has not been pooled yet: its tests are read before this leg's baseline is" in r.stderr and f"{name}.json" in r.stderr
    assert nothing_written(work)


def test_the_overgrowth_leg_does_not_wait_for_adr_064(work):
    for name in ADR064_POOLED:
        (work / "experiments" / "underdocks" / f"{name}.json").unlink()
    (batch_dir(work, "og", "s0", "Silent") / "sample-audit.json").unlink()            # something else stops it, so that the test does not pool
    r = pool(work, "og")
    assert r.returncode != 0 and "ADR-064" not in r.stderr and "no readable sample audit" in r.stderr


# The pairs are checked by name before anything is written. A change in the naming of common.sh that leaves every batch what it should be is the one way to get
# past the checks above to this one; the batches are renamed to follow it.
def rename_batches(work: Path, leg: str, arm: str, old: str, new: str) -> None:
    for cls in CLASSES:
        d = batch_dir(work, leg, arm, cls)
        target = d.with_name(d.name.replace(old, new))
        d.rename(target)
        m = json.loads((target / "manifest.json").read_text())
        m["batch_id"] = target.name
        (target / "manifest.json").write_text(json.dumps(m))


def rename_in_common(work: Path, old: str, new: str) -> None:
    common = work / "scripts" / "studies" / "skip" / "common.sh"
    text = common.read_text()
    assert old in text
    common.write_text(text.replace(old, new))


@pytest.mark.parametrize("arm,old,new,side", [("s1", "advisor_v1-slot-", "advisor_v1-astar-", "a"), ("s0", "advisor_v1-astar-", "advisor_v1-slot-", "b")])
def test_the_two_sides_have_to_be_the_arms_in_that_order_even_when_the_names_have_drifted(work, arm, old, new, side):
    rename_in_common(work, old, new)
    rename_batches(work, "og", arm, old, new)
    r = pool(work, "og")
    assert r.returncode != 0 and f"arm {side} of Ironclad is" in r.stderr and nothing_written(work), r.stderr


def test_the_two_sides_have_to_be_of_the_act_1_of_the_leg_even_when_the_names_have_drifted(work):
    for cls in CLASSES:                                                                 # the Underdocks batches of the arm that charges are out of the way
        shutil.rmtree(batch_dir(work, "ud", "s1", cls))
    rename_in_common(work, 'else echo "advisor_v1-slot-$l-a0-veteran-keeprelics-val-n2000"', 'else echo "advisor_v1-slot-$l-a0-veteran-keeprelics-underdocks-val-n2000"')
    rename_batches(work, "og", "s1", "keeprelics-val-n2000", "keeprelics-underdocks-val-n2000")
    r = pool(work, "og")
    assert r.returncode != 0 and "do not say the Act 1 of leg og" in r.stderr and nothing_written(work), r.stderr


# ---- the reading of what the pooling wrote
READING = REPO / "scripts" / "studies" / "skip" / "reading.py"


def read(work: Path, out: Path, *legs: str, base: Path | None = None) -> subprocess.CompletedProcess:
    base = base or results(work)
    return subprocess.run([sys.executable, "-I", str(READING), "--dir", str(base), "--root", str(work), "--legs", *(legs or LEGS), "--out", str(out)], capture_output=True, text=True)


def test_the_reading_of_a_leg_where_the_price_is_not_behind_says_so_and_carries_the_shares_of_card_rewards_skipped(pooled, tmp_path):
    work, _ = pooled
    r = read(work, tmp_path / "reading.json")
    assert r.returncode == 0, r.stderr
    body = json.loads((tmp_path / "reading.json").read_text())
    assert body["harmless"] is True and {k: v["verdict"] for k, v in body["legs"].items()} == {"og": "not behind", "ud": "not behind"}
    for leg in LEGS:
        e = expected(leg)
        boss = body["legs"][leg]["pastActOneBoss"]
        assert boss["differenceS1MinusS0"] == pytest.approx((e["a_only"] - e["b_only"]) / e["both"])           # S1 minus S0 ...
        assert boss["differenceS1MinusS0"] > 0                                                                # ... and S1 is the arm that is ahead here
        assert (boss["onlyS1"], boss["onlyS0"]) == (e["a_only"], e["b_only"]) and body["legs"][leg]["pairs"] == N * len(CLASSES)
        assert body["legs"][leg]["meanFloors"]["differenceS1MinusS0"] == pytest.approx(e["floors"] / e["both"])
        assert body["legs"][leg]["wins"]["s1"] == e["wins_a"] and body["legs"][leg]["wins"]["s0"] == e["wins_b"]
        for cls in CLASSES:                                                                                    # each class on its own, from the generator
            c, one = e["classes"][cls], body["legs"][leg]["perClass"][cls]
            assert (one["pastActOneBoss"]["onlyS1"], one["pastActOneBoss"]["onlyS0"]) == (c["a_only"], c["b_only"]) and one["bothCompleted"] == c["both"]
            assert one["wins"] == {"s1": c["wins_a"], "s0": c["wins_b"]} and one["pairs"] == N and 0 < one["pastActOneBoss"]["exactP"] <= 1
        shares = body["skipShares"][leg]
        assert set(shares) == {"s1", "s0"}
        assert shares["s1"] == expected_shares(leg, "s1")                                  # overall, by act (the arm that names the price counts them) and by class
        assert shares["s0"] == expected_shares(leg, "s0") and "byAct" not in shares["s0"]  # the baseline does not count by act, and nothing is made up for it
        assert all("byAct" not in c for c in shares["s0"]["perClass"].values()) and all("byAct" in c for c in shares["s1"]["perClass"].values())
        assert shares["s1"]["share"] != shares["s0"]["share"]


def test_the_reading_of_a_leg_where_the_price_is_behind_says_so_and_the_other_leg_is_read_on_its_own(pooled_behind, tmp_path):
    work = pooled_behind
    r = read(work, tmp_path / "reading.json")
    assert r.returncode == 0, r.stderr
    body = json.loads((tmp_path / "reading.json").read_text())
    ud, og = body["legs"]["ud"], body["legs"]["og"]
    e = expected("ud", "behind")
    assert e["b_only"] > e["a_only"]
    assert ud["pastActOneBoss"]["differenceS1MinusS0"] == pytest.approx((e["a_only"] - e["b_only"]) / e["both"])
    assert ud["pastActOneBoss"]["differenceS1MinusS0"] < -0.01
    assert ud["verdict"] == "not shown to be harmless" and ud["notBehind"]["firstBoss"] is False and ud["notBehind"]["floors"] is False
    assert og["verdict"] == "not behind" and og["notBehind"]["firstBoss"] is True and og["notBehind"]["floors"] is True
    assert body["harmless"] is False and json.loads(r.stdout)["harmless"] is False


def test_one_leg_read_alone_is_never_called_harmless_and_carries_only_its_own_shares(pooled, tmp_path):
    work, _ = pooled
    assert read(work, tmp_path / "reading.json", "og").returncode == 0
    body = json.loads((tmp_path / "reading.json").read_text())
    assert list(body["legs"]) == ["og"] and list(body["skipShares"]) == ["og"] and body["harmless"] is False


def mini(work: Path, tmp_path: Path, leg_files: dict[str, dict]) -> Path:
    """A results directory holding the given pooled files (and the arm's batches, linked), to read a file that was edited."""
    base = tmp_path / "skip"
    base.mkdir()
    (base / "batches").symlink_to(results(work) / "batches")
    for leg, body in leg_files.items():
        (base / f"pooled-slot-{leg}.json").write_text(json.dumps(body))
    return base


def pooled_body(work: Path, leg: str) -> dict:
    return json.loads((results(work) / f"pooled-slot-{leg}.json").read_text())


def swap_members(body: dict) -> dict:
    for m in body["members"]:
        m["a"], m["b"] = m["b"], m["a"]
    return body


def test_a_pooled_file_made_with_the_sides_the_wrong_way_round_is_refused_whatever_its_numbers(pooled_behind, tmp_path):
    """The reviewer's case: the arm that charges for a slot is behind the baseline, and the pooling was done with the two exchanged. Its file reads a gain."""
    work = pooled_behind
    pairs = [x for cls in CLASSES for x in ("--pair", str(batch_dir(work, "ud", "s0", cls)), str(batch_dir(work, "ud", "s1", cls)))]
    swapped = tmp_path / "swapped.json"
    r = subprocess.run([sys.executable, "-m", "slay2_sim", "pool", *pairs, "--iters", "500", "--confidence", "0.95", "--out", str(swapped)],
                       cwd=work, env={**os.environ, "PYTHONPATH": str(work / "sim")}, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    fake = json.loads(swapped.read_text())
    right = pooled_body(work, "ud")
    assert right["clusteredDifference"]["meanAMinusB"] < -0.01 and fake["clusteredDifference"]["meanAMinusB"] > 0.01    # the same games read as a gain
    assert all(m["a"]["batchId"] == batch_id("ud", "s0", m["character"]) for m in fake["members"])
    base = mini(work, tmp_path, {"og": pooled_body(work, "og"), "ud": fake})
    out = tmp_path / "reading.json"
    r = read(work, out, base=base)
    assert r.returncode != 0 and "not the pairing of ADR-065 for leg ud" in r.stderr and "side a is advisor_v1-astar-" in r.stderr
    assert not out.exists()                                                              # nothing is written for a file that is refused


@pytest.mark.parametrize(
    "leg,edit,message",
    [
        ("og", swap_members, "side a is advisor_v1-astar-"),
        ("ud", swap_members, "side b is advisor_v1-slot-"),
        ("og", lambda d: d["members"][1]["a"].update(batchId=batch_id("og", "s0", "Silent")), "Silent: side a is advisor_v1-astar-silent"),
        ("og", lambda d: d["members"][1]["b"].update(batchId=batch_id("og", "s1", "Silent")), "Silent: side b is advisor_v1-slot-silent"),
        ("og", lambda d: d["members"][2]["a"].update(batchId=batch_id("og", "s1", "Silent")), "Regent: side a is advisor_v1-slot-silent"),         # the wrong class
        ("ud", lambda d: d["members"][3]["b"].update(batchId=batch_id("ud", "s0", "Ironclad")), "Necrobinder: side b is advisor_v1-astar-ironclad"),
        ("og", lambda d: d["members"][0].update(character="Silent"), "not the five once each"),                                                  # a class twice, one missing
        ("og", lambda d: d["members"].pop(), "not the five once each"),
        ("ud", lambda d: d["members"].append(copy.deepcopy(d["members"][0])), "not the five once each"),
        ("og", lambda d: d["members"][0]["a"].update(batchId=batch_id("ud", "s1", "Ironclad")), "side a is advisor_v1-slot-ironclad-a0-veteran-keeprelics-underdocks-val-n2000"),
        ("ud", lambda d: d["members"][0]["b"].update(batchId=batch_id("og", "s0", "Ironclad")), "side b is advisor_v1-astar-ironclad-a0-veteran-keeprelics-val-n2000"),
        ("ud", lambda d: d["members"][4]["a"].update(batchId=batch_id("ud", "s1", "Defect").replace("-val-", "-dev-")), "Defect: side a is"),
        ("og", lambda d: d.update(policies={"a": "advisor_v1", "b": "rules_v1"}), "policies"),
        ("ud", lambda d: d.pop("members"), "not the five once each"),
    ],
    ids=["swapped-og", "swapped-ud", "a-is-baseline", "b-is-arm", "wrong-class-a", "wrong-class-b", "class-twice", "class-missing", "class-extra", "og-file-with-ud-ids",
         "ud-file-with-og-ids", "val-partition-id", "policies", "no-members"],
)
def test_a_pooled_file_that_is_not_the_arm_that_charges_against_the_baseline_class_for_class_in_the_legs_act_1_is_refused(pooled, tmp_path, leg, edit, message):
    work, _ = pooled
    files = {l: pooled_body(work, l) for l in LEGS}
    edit(files[leg])
    out = tmp_path / "reading.json"
    r = read(work, out, base=mini(work, tmp_path, files))
    assert r.returncode != 0 and f"not the pairing of ADR-065 for leg {leg}" in r.stderr and message in r.stderr, r.stderr
    assert not out.exists()


def test_the_skip_shares_are_read_from_the_batches_the_pooled_file_pooled(pooled, tmp_path):
    work, _ = pooled
    out = tmp_path / "reading.json"
    files = {l: pooled_body(work, l) for l in LEGS}
    files["og"]["members"][0]["b"]["contentSha256"] = "e" * 64                          # the baseline on disk is not the one that was pooled
    r = read(work, out, "og", base=mini(work, tmp_path, files))
    assert r.returncode != 0 and "is not the batch the pooled file pooled" in r.stderr and not out.exists()


def test_a_batch_missing_for_the_skip_shares_is_refused_with_the_directory_it_looked_in(pooled, tmp_path):
    work, _ = pooled
    other = tmp_path / "elsewhere"
    other.mkdir()
    out = tmp_path / "reading.json"
    r = subprocess.run([sys.executable, "-I", str(READING), "--dir", str(results(work)), "--root", str(other), "--legs", "og", "--out", str(out)], capture_output=True, text=True)
    assert r.returncode != 0 and "cannot read the batch" in r.stderr and str(other) in r.stderr and not out.exists()


def test_arms_whose_batches_do_not_all_count_by_act_are_refused(pooled, tmp_path):
    work, _ = pooled
    shutil.copytree(results(work) / "batches", tmp_path / "skip" / "batches", symlinks=True)
    for leg in LEGS:
        (tmp_path / "skip" / f"pooled-slot-{leg}.json").write_text((results(work) / f"pooled-slot-{leg}.json").read_text())
    f = tmp_path / "skip" / "batches" / batch_id("og", "s1", "Defect") / "episodes.jsonl"
    f.write_text("".join(json.dumps({**r, "extra": {"advisor": {k: v for k, v in r["extra"]["advisor"].items() if k != "by_act"}}}) + "\n" for r in map(json.loads, f.read_text().splitlines())))
    r = read(work, tmp_path / "reading.json", "og", base=tmp_path / "skip")
    assert r.returncode != 0 and "count their card rewards by act and others do not" in r.stderr


def test_the_batch_ids_the_reading_expects_are_the_ones_common_sh_names(tmp_path):
    sys.path.insert(0, str(READING.parent))
    try:
        import reading
    finally:
        sys.path.pop(0)
    for leg in LEGS:
        for cls in CLASSES:
            s1, s0 = reading.batch_ids(leg, cls)
            got = subprocess.run(["bash", "-c", f"OUT={tmp_path} PY=python3 source scripts/studies/skip/common.sh; basename $(s1_dir {cls} {leg}); basename $(s0_dir {cls} {leg})"],
                                 cwd=REPO, capture_output=True, text=True, check=True).stdout.split()
            assert got == [s1, s0] == [batch_id(leg, "s1", cls), batch_id(leg, "s0", cls)]
