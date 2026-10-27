"""Paired comparison artifact: arithmetic on synthetic batches, strict pairing rules, and the committed artifact."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from slay2_sim import external
from slay2_sim.compare import build_comparison, build_pooled_comparison, render_pooled_text, render_text, write_comparison
from slay2_sim.manifest import make_seed_manifest, sha256_file
from slay2_sim.stats import mcnemar_exact

REPO = external.REPO_ROOT


def make_batch(
    root: Path, name: str, rows: list[tuple], *, seeds_sha: str = "s" * 64, profile: str = "veteran", seeds: dict | None = None,
    character: str = "Ironclad",
) -> Path:
    """rows: (seed, outcome, floor, wall_seconds[, act]). Writes the two files build_comparison reads."""
    d = root / name
    d.mkdir(parents=True)
    (d / "manifest.json").write_text(
        json.dumps(
            {
                "batch_id": name,
                "policy": {"name": name.split("-")[0], "params": {"scope": "boss"} if name.startswith("alpha") else {}},
                "content_sha256": "c" * 64,
                "seeds": seeds if seeds is not None else {"file_sha256": seeds_sha, "partition": "train"},
                "config": {"character": character, "ascension": 0, "profile": profile},
                "simulator": {"id": "sim", "pinned": "abc", "parity_with_live_game": "UNVERIFIED"},
            }
        ),
        encoding="utf-8",
    )
    with (d / "episodes.jsonl").open("w", encoding="utf-8") as fh:
        for seed, outcome, floor, wall, *rest in rows:
            fh.write(
                json.dumps(
                    {
                        "batch_id": name, "seed": seed, "character": character, "ascension": 0, "policy": name,
                        "policy_version": "1", "outcome": outcome, "floor": floor, "wall_seconds": wall,
                        "act": rest[0] if rest else 0,
                    }
                )
                + "\n"
            )
    return d


def test_arithmetic_on_known_rows(tmp_path: Path):
    a = make_batch(tmp_path, "alpha-x", [(1, "death", 10, 1.0), (2, "win", 51, 1.0), (3, "death", 20, 1.0), (4, "death", 30, 1.0)])
    b = make_batch(tmp_path, "beta-x", [(1, "death", 8, 4.0), (2, "death", 40, 4.0), (3, "death", 20, 4.0), (9, "death", 99, 4.0)])
    c = build_comparison(a, b, iters=2000, seed=1)
    # seeds 1,2,3 are shared; 4 and 9 are not paired
    assert c["pairedSeeds"] == 3 and c["bothCompleted"] == 3 and c["excludedNotCompleted"] == 0
    assert c["a"]["wins"] == 1 and c["b"]["wins"] == 0
    assert c["a"]["params"] == {"scope": "boss"} and c["b"]["params"] == {}  # a variant of a policy is told apart from the policy
    assert c["pairedWinTable"] == {"both": 0, "a_only": 1, "b_only": 0, "neither": 2, "mcnemar_p": 1.0}
    # floors on the shared seeds: A = 10,51,20 (mean 27); B = 8,40,20 (mean 22.6667); mean(A-B) = (2+11+0)/3
    assert c["a"]["meanFloor"] == pytest.approx(27.0)
    assert c["b"]["meanFloor"] == pytest.approx(68 / 3)
    assert c["floorDifference"]["meanAMinusB"] == pytest.approx(13 / 3)
    lo, hi = c["floorDifference"]["ci95"]
    assert lo <= 13 / 3 <= hi
    assert c["wallTimeRatioBOverA"] == 4.0
    assert c["role"].startswith("development")
    assert len(c["contentSha256"]) == 64


def test_past_the_act_one_boss_endpoint_counts_later_acts_and_wins_and_pairs_by_seed(tmp_path: Path):
    a = make_batch(tmp_path, "alpha-q", [(1, "death", 18, 1.0, 1), (2, "death", 9, 1.0, 0), (3, "win", 51, 1.0, 2), (4, "death", 33, 1.0, 2)])
    b = make_batch(tmp_path, "beta-q", [(1, "death", 7, 1.0, 0), (2, "death", 10, 1.0, 0), (3, "death", 18, 1.0, 1), (4, "death", 20, 1.0, 0)])
    c = build_comparison(a, b, iters=200)
    r = c["reachedAct2"]
    assert r["a"]["games"] == 3 and r["b"]["games"] == 1  # seed 1 and 4 died in a later act; seed 3 won
    assert r["a"]["rate"] == 0.75 and r["b"]["rate"] == 0.25
    # seed 3 reached it for both; seeds 1 and 4 only for A; seed 2 for neither. Exact McNemar, 2 vs 0 discordant pairs: p = 0.5
    assert r["pairedTable"] == {"both": 1, "a_only": 2, "b_only": 0, "neither": 1, "mcnemar_p": 0.5}
    lo, hi = r["a"]["wilson95"]
    assert lo < 0.75 < hi
    assert "past the Act-1 boss" in render_text(c)
    # the second act's boss: seed 3 won and seed 4 died in the third act (A); nobody in B got there
    r3 = c["reachedAct3"]
    assert r3["a"]["games"] == 2 and r3["b"]["games"] == 0
    assert r3["pairedTable"] == {"both": 0, "a_only": 2, "b_only": 0, "neither": 2, "mcnemar_p": 0.5}
    assert "past the Act-2 boss" in render_text(c)


def test_the_post_hoc_sensitivity_counts_timeouts_by_the_act_they_reached_and_is_off_by_default(tmp_path: Path):
    a = make_batch(tmp_path, "alpha-s", [
        (1, "death", 18, 1.0, 1), (2, "timeout", 25, 1.0, 1), (3, "timeout", 6, 1.0, 0), (4, "simulator_error", 0, 1.0, 0), (5, "death", 9, 1.0, 0),
    ])
    b = make_batch(tmp_path, "beta-s", [
        (1, "death", 7, 1.0, 0), (2, "death", 9, 1.0, 0), (3, "death", 20, 1.0, 1), (4, "death", 9, 1.0, 0), (5, "timeout", 30, 1.0, 1),
    ])
    plain = build_comparison(a, b, iters=100)
    assert "sensitivityByActReached" not in plain  # the registered comparison is unchanged by the option
    assert plain["bothCompleted"] == 1 and plain["excludedNotCompleted"] == 4  # only seed 1 ended in a win or a death in both
    x = build_comparison(a, b, iters=100, sensitivity=True)["sensitivityByActReached"]
    assert "post hoc" in x["label"]
    # seed 4 (a simulator error) drops; seeds 2 and 3 are timeouts in A, seed 5 is one in B
    assert x["pairs"] == 4 and x["droppedPairs"] == 1 and x["timeouts"] == {"a": 2, "b": 1}
    # past the Act-1 boss: A = seeds 1 and 2 (act 1), B = seed 3 and 5 (act 1)
    assert x["a"]["games"] == 2 and x["b"]["games"] == 2
    assert x["pairedTable"] == {"both": 0, "a_only": 2, "b_only": 2, "neither": 0, "mcnemar_p": 1.0}
    assert "[post hoc]" in render_text(build_comparison(a, b, iters=100, sensitivity=True))
    assert "[post hoc]" not in render_text(plain)


def test_pooling_adds_the_discordant_pairs_of_every_class_and_tests_the_total_once(tmp_path: Path):
    def cohort(tag: str, character: str, a_rows, b_rows):
        return (make_batch(tmp_path, f"alpha-{tag}", a_rows, character=character), make_batch(tmp_path, f"beta-{tag}", b_rows, character=character))

    # Ironclad: past the Act-1 boss for A on seeds 1-4, for B on seed 4 only; Silent: A on 1-2, B on 3
    iron = cohort("i", "Ironclad",
        [(1, "death", 18, 1.0, 1), (2, "death", 18, 1.0, 1), (3, "death", 18, 1.0, 1), (4, "win", 51, 1.0, 2), (5, "death", 5, 1.0, 0)],
        [(1, "death", 7, 1.0, 0), (2, "death", 7, 1.0, 0), (3, "death", 7, 1.0, 0), (4, "death", 20, 1.0, 1), (5, "death", 5, 1.0, 0)])
    silent = cohort("s", "Silent",
        [(1, "death", 18, 1.0, 1), (2, "death", 18, 1.0, 1), (3, "death", 5, 1.0, 0), (4, "simulator_error", 0, 1.0, 0)],
        [(1, "death", 7, 1.0, 0), (2, "death", 7, 1.0, 0), (3, "death", 18, 1.0, 1), (4, "death", 9, 1.0, 0)])
    pooled = build_pooled_comparison([iron, silent], iters=200)
    t = pooled["reachedAct2"]["pairedTable"]
    # Ironclad: a_only = seeds 1, 2, 3 (3), b_only = 0, both = seed 4; Silent: a_only = seeds 1, 2 (2), b_only = seed 3 (1)
    assert (t["a_only"], t["b_only"], t["both"]) == (5, 1, 1)
    assert t["mcnemar_p"] == mcnemar_exact(5, 1)  # one test on the total, not one per class
    assert pooled["pairedSeeds"] == 9 and pooled["bothCompleted"] == 8 and pooled["excludedNotCompleted"] == 1
    assert pooled["cohort"]["characters"] == ["Ironclad", "Silent"]
    assert [m["character"] for m in pooled["members"]] == ["Ironclad", "Silent"]
    assert [m["bothCompleted"] for m in pooled["members"]] == [5, 3]
    assert pooled["wins"]["a"] == 1 and pooled["wins"]["b"] == 0
    assert pooled["reachedAct3"]["a"]["games"] == 1  # the win
    assert "POOLED" in render_pooled_text(pooled) and "Silent" in render_pooled_text(pooled)
    assert len(pooled["contentSha256"]) == 64
    assert build_pooled_comparison([iron, silent], iters=200) == pooled  # deterministic


def test_a_level_can_be_asked_for_the_whole_seed_interval_and_changes_nothing_else(tmp_path: Path):
    rows_a = [(s, "death", 18, 1.0, 1 if s % 5 else 0) for s in range(400)]
    rows_b = [(s, "death", 18, 1.0, 1 if s % 2 else 0) for s in range(400)]
    pairs = [(make_batch(tmp_path, f"alpha-l{k}", rows_a, character=c), make_batch(tmp_path, f"beta-l{k}", rows_b, character=c))
             for k, c in enumerate(("Ironclad", "Silent"))]
    plain = build_pooled_comparison(pairs, iters=2000)
    assert "ciAtLevel" not in plain["clusteredDifference"]  # the output of every earlier study is unchanged
    asked = build_pooled_comparison(pairs, iters=2000, confidence=1 - 0.05 / 3)
    extra = asked["clusteredDifference"].pop("ciAtLevel")
    assert extra["level"] == pytest.approx(1 - 0.05 / 3)
    lo95, hi95 = plain["clusteredDifference"]["ci95"]
    lo, hi = extra["ci"]
    assert lo < lo95 and hi > hi95  # a higher level is a wider interval of the same resamples
    assert lo < asked["clusteredDifference"]["meanAMinusB"] < hi
    # nothing else moves, content hash apart (the hash covers the body that now holds the extra interval)
    assert {k: v for k, v in asked.items() if k != "contentSha256"} == {k: v for k, v in plain.items() if k != "contentSha256"}
    for bad in (0.5, 1.0, 1.2, 0.0):
        with pytest.raises(ValueError):
            build_pooled_comparison(pairs, iters=50, confidence=bad)


def test_the_pooled_difference_is_also_checked_with_whole_seeds_as_the_resampling_unit(tmp_path: Path):
    from slay2_sim.stats import clustered_bootstrap_ci, paired_bootstrap_ci

    # two classes played the same 400 seeds and the outcomes are identical in both: the second class adds rows, not information
    rows_a = [(s, "death", 18, 1.0, 1 if s % 5 else 0) for s in range(400)]  # past the Act-1 boss on 4 seeds in 5
    rows_b = [(s, "death", 18, 1.0, 1 if s % 2 else 0) for s in range(400)]  # on every other seed
    pairs = [(make_batch(tmp_path, f"alpha-s{k}", rows_a, character=c), make_batch(tmp_path, f"beta-s{k}", rows_b, character=c))
             for k, c in enumerate(("Ironclad", "Silent"))]
    pooled = build_pooled_comparison(pairs, iters=2000)
    cl = pooled["clusteredDifference"]
    assert cl["meanAMinusB"] == pytest.approx(0.3, abs=0.01)  # 0.8 - 0.5
    flags_a = [float(s % 5 != 0) for s in range(400)] * 2
    flags_b = [float(s % 2 == 1) for s in range(400)] * 2
    _, lo_iid, hi_iid = paired_bootstrap_ci(flags_a, flags_b, iters=2000)
    # the duplicated rows make the plain interval look about sqrt(2) tighter than it is; resampling seeds does not
    assert (cl["ci95"][1] - cl["ci95"][0]) > 1.2 * (hi_iid - lo_iid)
    assert build_pooled_comparison(pairs, iters=2000)["clusteredDifference"] == cl  # deterministic
    # rows of one cluster move together: a single cluster has nothing to resample
    mean, lo, hi = clustered_bootstrap_ci([1.0, 0.0, 1.0, 0.0], [7, 7, 7, 7], iters=50)
    assert mean == lo == hi == 0.5
    with pytest.raises(ValueError):
        clustered_bootstrap_ci([], [])


def test_pooling_refuses_what_is_not_one_experiment(tmp_path: Path):
    a1 = make_batch(tmp_path, "alpha-p1", [(1, "death", 3, 1.0)], character="Ironclad")
    b1 = make_batch(tmp_path, "beta-p1", [(1, "death", 3, 1.0)], character="Ironclad")
    a2 = make_batch(tmp_path, "alpha-p2", [(1, "death", 3, 1.0)], character="Silent")
    other = make_batch(tmp_path, "gamma-p2", [(1, "death", 3, 1.0)], character="Silent")  # another policy on side B
    first_run = make_batch(tmp_path, "beta-p3", [(1, "death", 3, 1.0)], character="Silent", profile="first_run")
    with pytest.raises(ValueError, match="at least two"):
        build_pooled_comparison([(a1, b1)])
    with pytest.raises(ValueError, match="two policies"):
        build_pooled_comparison([(a1, b1), (a2, other)])
    with pytest.raises(ValueError):  # a pair that is not itself a pairing (profiles differ)
        build_pooled_comparison([(a1, b1), (a2, first_run)])


def test_a_different_class_is_refused_and_so_is_a_class_string_that_is_not_exact(tmp_path: Path):
    # the letter case is not a formatting detail: the simulator plays "silent" as Ironclad (ADR-049, test_classes.py pins the rest)
    old = make_batch(tmp_path, "alpha-c1", [(1, "death", 18, 1.0, 1)], character="Ironclad")
    other = make_batch(tmp_path, "beta-c2", [(1, "death", 7, 1.0, 0)], character="Silent")
    with pytest.raises(ValueError, match="character"):
        build_comparison(old, other)


def test_non_completed_episodes_are_excluded_and_counted_not_scored_as_losses(tmp_path: Path):
    a = make_batch(tmp_path, "alpha-y", [(1, "win", 51, 1.0), (2, "timeout", 12, 1.0), (3, "death", 5, 1.0)])
    b = make_batch(tmp_path, "beta-y", [(1, "death", 9, 1.0), (2, "death", 9, 1.0), (3, "simulator_error", 0, 1.0)])
    c = build_comparison(a, b, iters=500)
    assert c["pairedSeeds"] == 3
    assert c["bothCompleted"] == 1 and c["excludedNotCompleted"] == 2
    assert c["a"]["wins"] == 1 and c["bothCompleted"] == 1  # the win rate denominator is the paired completed games


def test_unpaired_batches_are_refused(tmp_path: Path):
    a = make_batch(tmp_path, "alpha-z", [(1, "death", 3, 1.0)])
    other_seeds = make_batch(tmp_path, "beta-z", [(1, "death", 3, 1.0)], seeds_sha="t" * 64)
    other_profile = make_batch(tmp_path, "gamma-z", [(1, "death", 3, 1.0)], profile="first_run")
    disjoint = make_batch(tmp_path, "delta-z", [(7, "death", 3, 1.0)])
    for bad in (other_seeds, other_profile):
        with pytest.raises(ValueError):
            build_comparison(a, bad)
    with pytest.raises(ValueError, match="completed"):
        build_comparison(a, disjoint)


SIZES = {"train": 30, "val": 20, "test": 10}


def seeds_info(root: Path, name: str, manifest: dict, partition: str, n: int) -> dict:
    """What a batch manifest records about its seeds, with the seed manifest written under ``root`` as the repository has it."""
    path = root / "experiments" / "seeds" / f"{name}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {"file": f"experiments/seeds/{name}.json", "file_sha256": sha256_file(path), "partition": partition, "n": n}


def test_a_later_version_of_the_seed_manifest_pairs_when_the_partition_is_unchanged(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(external, "REPO_ROOT", tmp_path)
    v1 = make_seed_manifest("t-v1", 7, SIZES)
    v2 = make_seed_manifest("t-v2", 7, {**SIZES, "dev": 40})  # the same stream plus a dev partition
    val = v1["partitions"]["val"]
    assert val == v2["partitions"]["val"]  # what makes the pairing sound, and what the guard checks rather than assumes
    ia, ib = seeds_info(tmp_path, "t-v1", v1, "val", 20), seeds_info(tmp_path, "t-v2", v2, "val", 8)
    assert ia["file_sha256"] != ib["file_sha256"]
    a = make_batch(tmp_path, "alpha-m", [(s, "death", 10 + i, 1.0) for i, s in enumerate(val)], seeds=ia)
    b = make_batch(tmp_path, "beta-m", [(s, "death", 9 + i, 1.0) for i, s in enumerate(val[:8])], seeds=ib)  # first 8 only
    c = build_comparison(a, b, iters=200)
    assert c["pairedSeeds"] == 8
    assert c["cohort"]["seedManifestSha256"] == ia["file_sha256"] and c["cohort"]["seedManifestSha256B"] == ib["file_sha256"]
    assert "sameSeedsBy" in c["cohort"]
    same = build_comparison(a, a, iters=200)  # one manifest: the cohort block stays what it always was
    assert "seedManifestSha256B" not in same["cohort"] and "sameSeedsBy" not in same["cohort"]


def test_other_seed_lists_a_changed_file_another_partition_and_the_sealed_partition_are_refused(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(external, "REPO_ROOT", tmp_path)
    v1 = make_seed_manifest("t-v1", 7, SIZES)
    v2 = make_seed_manifest("t-v2", 7, {**SIZES, "dev": 40})
    other = make_seed_manifest("t-o", 8, SIZES)  # another master seed: other seeds under the same partition names
    rows = [(s, "death", 10, 1.0) for s in v1["partitions"]["val"]]
    a = make_batch(tmp_path, "alpha-r", rows, seeds=seeds_info(tmp_path, "t-v1", v1, "val", 20))
    # a different list under the same partition name
    o = make_batch(tmp_path, "beta-r", rows, seeds=seeds_info(tmp_path, "t-o", other, "val", 20))
    with pytest.raises(ValueError, match="same seed manifest"):
        build_comparison(a, o)
    # the same list in another partition's name
    t = make_batch(tmp_path, "gamma-r", rows, seeds=seeds_info(tmp_path, "t-v2", v2, "train", 20))
    with pytest.raises(ValueError, match="same seed manifest"):
        build_comparison(a, t)
    # a seed file that is no longer what the batch recorded is not evidence of anything
    ib = seeds_info(tmp_path, "t-v2", v2, "val", 20)
    b = make_batch(tmp_path, "delta-r", rows, seeds=ib)
    assert build_comparison(a, b, iters=100)["pairedSeeds"] == 20
    path = tmp_path / ib["file"]
    path.write_text(path.read_text(encoding="utf-8") + " ", encoding="utf-8")
    with pytest.raises(ValueError, match="same seed manifest"):
        build_comparison(a, b)
    # the sealed partition is never read to make a pairing: two different files, both on test, are refused
    ta = make_batch(tmp_path, "eps-r", [(s, "death", 10, 1.0) for s in v1["partitions"]["test"]], seeds=seeds_info(tmp_path, "t-v1", v1, "test", 10))
    tb = make_batch(tmp_path, "zeta-r", [(s, "death", 10, 1.0) for s in v1["partitions"]["test"]], seeds=seeds_info(tmp_path, "t-v2b", v2, "test", 10))
    with pytest.raises(ValueError, match="same seed manifest"):
        build_comparison(ta, tb)


def test_output_is_deterministic_and_round_trips(tmp_path: Path):
    a = make_batch(tmp_path, "alpha-d", [(i, "death", 10 + i % 7, 0.5) for i in range(1, 40)])
    b = make_batch(tmp_path, "beta-d", [(i, "death", 9 + i % 5, 2.0) for i in range(1, 40)])
    first = build_comparison(a, b, iters=1000, seed=3)
    second = build_comparison(a, b, iters=1000, seed=3)
    assert first == second
    out = tmp_path / "out" / "cmp.json"
    write_comparison(first, out)
    assert json.loads(out.read_text(encoding="utf-8")) == first
    assert "mean(A-B)" in render_text(first)


COMMITTED = sorted((REPO / "experiments" / "comparisons").glob("*.json"))
BATCHES = REPO / "experiments" / "batches"


@pytest.mark.parametrize("path", COMMITTED, ids=lambda p: p.stem)
def test_committed_comparison_matches_a_recomputation_from_the_committed_batches(path: Path):
    committed = json.loads(path.read_text(encoding="utf-8"))
    fresh = build_comparison(
        BATCHES / committed["a"]["batchId"], BATCHES / committed["b"]["batchId"], iters=2000, seed=0
    )
    for key in ("pairedSeeds", "bothCompleted", "excludedNotCompleted", "pairedWinTable", "reachedAct2", "cohort", "role"):
        assert fresh[key] == committed[key], key
    for side in ("a", "b"):
        for key in ("batchId", "policy", "contentSha256", "wins", "meanFloor", "meanWallSecondsPerEpisode"):
            assert fresh[side][key] == committed[side][key], (side, key)
    assert fresh["floorDifference"]["meanAMinusB"] == pytest.approx(committed["floorDifference"]["meanAMinusB"])
    assert fresh["wallTimeRatioBOverA"] == committed["wallTimeRatioBOverA"]
    # the committed interval is from 20,000 resamples, this one from 2,000: allow Monte-Carlo noise only
    for got, want in zip(fresh["floorDifference"]["ci95"], committed["floorDifference"]["ci95"]):
        assert got == pytest.approx(want, abs=0.25)


POOLED = sorted((REPO / "experiments" / "neow").glob("pooled-*.json"))


@pytest.mark.parametrize("path", POOLED, ids=lambda p: p.stem)
def test_committed_pooled_comparison_matches_a_recomputation_from_the_committed_batches(path: Path):
    """The site exporter trusts a pooled file's own numbers once its batches' hashes match; this is what checks the numbers (ADR-049)."""
    committed = json.loads(path.read_text(encoding="utf-8"))
    pairs = [(BATCHES / m["a"]["batchId"], BATCHES / m["b"]["batchId"]) for m in committed["members"]]
    fresh = build_pooled_comparison(pairs, iters=2000, seed=0)
    for key in ("policies", "cohort", "pairedSeeds", "bothCompleted", "excludedNotCompleted", "wins", "reachedAct2", "reachedAct3", "role", "members"):
        assert fresh[key] == committed[key], key
    for key in ("floorDifference", "clusteredDifference"):
        assert fresh[key]["meanAMinusB"] == pytest.approx(committed[key]["meanAMinusB"]), key
        for got, want in zip(fresh[key]["ci95"], committed[key]["ci95"]):
            assert got == pytest.approx(want, abs=0.25), key  # 2,000 resamples here against 20,000 there
