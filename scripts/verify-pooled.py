#!/usr/bin/env python3
"""Recompute a pooled paired comparison from the episode files of its batches, with code that shares nothing with `slay2_sim`.

`slay2_sim pool` writes the comparison a registered study is read from. This reads the same episode files again (the committed
`episodes.jsonl.gz` of each batch the file names) and recomputes, from the raw records and the definitions written in the registrations
(a game is completed when it ended in a win or a death; a run got past the Act-1 boss when it won or ended in the second act or later; the
Act-2 boss likewise in the third; a pair is a seed that both batches completed), every count the pooled file reports: each class's paired
table, the pooled tables for the Act-1 boss, the Act-2 boss and wins, the pairs, the exact McNemar p-values (exact integers), the rates, the
mean floors and the pooled difference (of the endpoint the file names: the Act-1 boss unless it says `act2`, ADR-060). With `--bootstrap` it also draws its own whole-seed and paired resamples (another generator, another
count) and checks that the file's intervals agree within the Monte-Carlo error.

    python3 scripts/verify-pooled.py experiments/neow/pooled-neow-values-keep-v1-vs-rules_v2-keeprelics-val.json [--bootstrap]

Exit status 0 when everything matches, 1 otherwise. Used once for ADR-058, after `pool.sh` (its outcome is quoted in the result of ADR-058);
`sim/tests/test_verify_pooled.py` runs it on the published pooled files of ADR-054, ADR-055 and ADR-058 and checks that it notices a changed count,
a p-value that is not the exact one, a shifted interval and a missing batch.
"""
from __future__ import annotations

import argparse
import gzip
import json
import sys
from fractions import Fraction
from math import comb
from pathlib import Path


def read_episodes(batch_dir: Path) -> dict[int, dict]:
    """The batch's episodes by seed (the compressed file that is committed, else the plain one)."""
    gz, plain = batch_dir / "episodes.jsonl.gz", batch_dir / "episodes.jsonl"
    opener, path = (gzip.open, gz) if gz.exists() else (open, plain)
    rows: dict[int, dict] = {}
    with opener(path, "rt", encoding="utf-8") as fh:  # type: ignore[operator]
        for line in fh:
            if line.strip():
                r = json.loads(line)
                rows[int(r["seed"])] = r
    return rows


def completed(r: dict) -> bool:
    return r["outcome"] in ("win", "death")


def won(r: dict) -> bool:
    return r["outcome"] == "win"


def past_act_one(r: dict) -> bool:
    return won(r) or int(r["act"]) >= 1


def past_act_two(r: dict) -> bool:
    return won(r) or int(r["act"]) >= 2


def mcnemar_exact(a_only: int, b_only: int) -> float:
    """Two-sided exact McNemar p: twice the lower binomial tail at one half, capped at one, in exact integers."""
    n = a_only + b_only
    if n == 0:
        return 1.0
    tail = sum(comb(n, i) for i in range(min(a_only, b_only) + 1))
    return min(1.0, float(Fraction(2 * tail, 2**n)))


def table(xs: list[bool], ys: list[bool]) -> dict:
    a_only = sum(1 for x, y in zip(xs, ys) if x and not y)
    b_only = sum(1 for x, y in zip(xs, ys) if y and not x)
    both = sum(1 for x, y in zip(xs, ys) if x and y)
    neither = len(xs) - a_only - b_only - both
    return {"a_only": a_only, "b_only": b_only, "both": both, "neither": neither, "mcnemar_p": mcnemar_exact(a_only, b_only)}


class Checker:
    def __init__(self) -> None:
        self.problems: list[str] = []
        self.checked = 0

    def same(self, what: str, got, want) -> None:
        self.checked += 1
        if got != want:
            self.problems.append(f"{what}: the file says {got!r}, the episodes give {want!r}")

    def close(self, what: str, got: float, want: float, tol: float = 1e-9) -> None:
        self.checked += 1
        if not abs(got - want) <= tol * max(1.0, abs(want)):
            self.problems.append(f"{what}: the file says {got!r}, the episodes give {want!r}")

    def table(self, what: str, got: dict, want: dict) -> None:
        for k in ("a_only", "b_only", "both", "neither"):
            self.same(f"{what} {k}", got[k], want[k])
        self.checked += 1
        if not abs(got["mcnemar_p"] - want["mcnemar_p"]) <= 1e-9 * want["mcnemar_p"] + 1e-300:
            self.problems.append(f"{what} mcnemar_p: the file says {got['mcnemar_p']!r}, the exact value is {want['mcnemar_p']!r}")


def verify(path: Path, batches: Path, bootstrap: bool = False) -> tuple[list[str], int]:
    t = json.loads(path.read_text(encoding="utf-8"))
    ck = Checker()
    ck.same("kind", t.get("kind"), "pooled-paired-comparison")
    flags = {k: ([], []) for k in ("win", "act1", "act2")}
    seeds: list[int] = []
    floors_a: list[float] = []
    floors_b: list[float] = []
    total_pairs = 0
    for m in t["members"]:
        who = str(m["character"])
        a = read_episodes(batches / m["a"]["batchId"])
        b = read_episodes(batches / m["b"]["batchId"])
        shared = sorted(set(a) & set(b))
        both = [s for s in shared if completed(a[s]) and completed(b[s])]
        total_pairs += len(shared)
        ck.same(f"{who} pairedSeeds", m["pairedSeeds"], len(shared))
        ck.same(f"{who} bothCompleted", m["bothCompleted"], len(both))
        mine = {
            "win": ([won(a[s]) for s in both], [won(b[s]) for s in both]),
            "act1": ([past_act_one(a[s]) for s in both], [past_act_one(b[s]) for s in both]),
            "act2": ([past_act_two(a[s]) for s in both], [past_act_two(b[s]) for s in both]),
        }
        ck.same(f"{who} wins of the first arm", m["a"]["wins"], sum(mine["win"][0]))
        ck.same(f"{who} wins of the second arm", m["b"]["wins"], sum(mine["win"][1]))
        ck.table(f"{who} past the Act-1 boss", m["reachedAct2"]["pairedTable"], table(*mine["act1"]))
        ck.close(f"{who} share of the first arm", m["reachedAct2"]["a"], sum(mine["act1"][0]) / len(both))
        ck.close(f"{who} share of the second arm", m["reachedAct2"]["b"], sum(mine["act1"][1]) / len(both))
        fa = [float(a[s]["floor"]) for s in both]
        fb = [float(b[s]["floor"]) for s in both]
        ck.close(f"{who} mean floor difference", m["meanFloorDifference"], (sum(fa) - sum(fb)) / len(both))
        for k, (x, y) in mine.items():
            flags[k][0].extend(x)
            flags[k][1].extend(y)
        seeds.extend(both)
        floors_a.extend(fa)
        floors_b.extend(fb)
    n = len(seeds)
    ck.same("pairedSeeds", t["pairedSeeds"], total_pairs)
    ck.same("bothCompleted", t["bothCompleted"], n)
    ck.same("excludedNotCompleted", t["excludedNotCompleted"], total_pairs - n)
    ck.same("wins of the first arm", t["wins"]["a"], sum(flags["win"][0]))
    ck.same("wins of the second arm", t["wins"]["b"], sum(flags["win"][1]))
    ck.table("pooled wins", t["wins"]["pairedTable"], table(*flags["win"]))
    ck.table("pooled past the Act-1 boss", t["reachedAct2"]["pairedTable"], table(*flags["act1"]))
    ck.table("pooled past the Act-2 boss", t["reachedAct3"]["pairedTable"], table(*flags["act2"]))
    for key, name in (("reachedAct2", "Act-1"), ("reachedAct3", "Act-2")):
        flag = flags["act1" if key == "reachedAct2" else "act2"]
        ck.same(f"games past the {name} boss, first arm", t[key]["a"]["games"], sum(flag[0]))
        ck.same(f"games past the {name} boss, second arm", t[key]["b"]["games"], sum(flag[1]))
        ck.close(f"share past the {name} boss, first arm", t[key]["a"]["rate"], sum(flag[0]) / n)
        ck.close(f"share past the {name} boss, second arm", t[key]["b"]["rate"], sum(flag[1]) / n)
    endpoint = t["clusteredDifference"].get("endpoint", "act1")  # absent in every file written before ADR-060: the Act-1 boss
    ck.same("endpoint of the whole-seed interval", endpoint in ("act1", "act2"), True)
    rows = [float(x) - float(y) for x, y in zip(*flags["act2" if endpoint == "act2" else "act1"])]
    ck.close("pooled difference of the shares", t["clusteredDifference"]["meanAMinusB"], sum(rows) / n)
    ck.close("mean floor difference", t["floorDifference"]["meanAMinusB"], (sum(floors_a) - sum(floors_b)) / n)

    if bootstrap:
        import numpy as np  # only for the resamples

        rng = np.random.default_rng(987654321)  # not the generator or the seed of the pooled file
        x = np.asarray(rows)
        _, inverse = np.unique(np.asarray(seeds), return_inverse=True)
        sums = np.bincount(inverse, weights=x)
        counts = np.bincount(inverse).astype(float)
        k = sums.size
        iters = 40000
        means = np.empty(iters)
        for start in range(0, iters, 500):
            idx = rng.integers(0, k, size=(500, k))
            means[start : start + 500] = sums[idx].sum(axis=1) / counts[idx].sum(axis=1)

        def agree(what: str, mine_ci: tuple[float, float], theirs: list[float]) -> None:
            width = theirs[1] - theirs[0]
            for end, (u, v) in zip(("lower", "upper"), zip(mine_ci, theirs)):
                ck.checked += 1
                if abs(u - v) > 0.06 * width:
                    ck.problems.append(f"{what}, {end} end: the file says {v!r}, an independent resample gives {u!r} (interval width {width!r})")

        lo, hi = np.quantile(means, [0.025, 0.975])
        agree("the whole-seed 95 % interval of the pooled difference", (float(lo), float(hi)), t["clusteredDifference"]["ci95"])
        at = t["clusteredDifference"].get("ciAtLevel")
        if at:
            alpha = (1 - at["level"]) / 2
            lo, hi = np.quantile(means, [alpha, 1 - alpha])
            agree(f"the whole-seed interval at level {at['level']:.4f}", (float(lo), float(hi)), at["ci"])
        d = np.asarray(floors_a) - np.asarray(floors_b)
        fm = np.empty(20000)
        for start in range(0, 20000, 1000):
            idx = rng.integers(0, d.size, size=(1000, d.size))
            fm[start : start + 1000] = d[idx].mean(axis=1)
        lo, hi = np.quantile(fm, [0.025, 0.975])
        agree("the paired 95 % interval of the floor difference", (float(lo), float(hi)), t["floorDifference"]["ci95"])
    return ck.problems, ck.checked


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("pooled", type=Path, nargs="+", help="a pooled comparison written by `slay2_sim pool`")
    ap.add_argument("--batches", type=Path, default=Path("experiments/batches"))
    ap.add_argument("--bootstrap", action="store_true", help="also check the intervals with resamples of its own (needs numpy)")
    args = ap.parse_args(argv)
    status = 0
    for p in args.pooled:
        problems, checked = verify(p, args.batches, args.bootstrap)
        if problems:
            status = 1
            print(f"MISMATCH {p}: {len(problems)} of {checked} checks differ")
            for line in problems:
                print("  " + line)
        else:
            print(f"MATCH {p}: all {checked} checks agree with the episodes" + (" (intervals by an independent resample)" if args.bootstrap else ""))
    return status


if __name__ == "__main__":
    sys.exit(main())
