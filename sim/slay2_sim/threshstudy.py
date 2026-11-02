"""The threshold study's own tools (ADR-062): the names of its batches, the development screen's selection rule and the design checks of its arms.

ADR-061 found that being pickier about card picks in Act 2 alone (take the best card offered only if its value is above 0.2, otherwise skip) wins more
simulated games than the baseline S (``rules_v2`` following the card values the site shows, threshold 0), narrowly, and the advisor waits for a
replication (addendum B). ADR-062 asks two things in the classes that win, Ironclad and Defect: does that replicate on seeds nobody has played
(**T1**, the threshold 0.2 against S), and is another threshold better (a development screen on the fresh ``dev2`` seeds picks one, **T2** tests it
against S and **T3** against 0.2, on the fresh ``val3`` seeds).

``dev`` reads the development batches (S and the six thresholds of ``GRID``, all on the same ``dev2`` seeds), pools each threshold against S over
the two classes (the exact McNemar test of ``slay2_sim pool``, the endpoint the study reads: the run was won) and applies the rule that ADR-062
fixed before any of those games was played:

* the screen's choice is the threshold with the largest *net wins* against S (games only the arm won minus games only S won, over the pairs both
  games completed); a tie goes to the smaller threshold;
* it goes to the held-out tests T2 and T3 only if its net wins are above zero, it is not 0.2 itself, and in a head-to-head against 0.2 on the same
  development pairs it is ahead with an exact two-sided McNemar p below 0.20 (a generous screen: it only decides what is worth 30,000 more games);
* T1, the replication of 0.2 against S, is always tested.

It also checks what the design relies on: every threshold plays S's game until the first card reward of Act 2, so a game that S ended in Act 1 has
to be the arm's own record, and no pair may differ about the Act-1 boss (the same check as ``slay2_sim.actsstudy.identity``, except that a pair in which either game was
stopped by the wall clock, which depends on the load of the machine and not on the game, is not compared and is counted). A single difference stops the study.

    python -m slay2_sim.threshstudy dev --batches experiments/batches --out experiments/thresh/dev-selection.json
    python -m slay2_sim.threshstudy identity t020 --stage val --batches experiments/batches --out experiments/thresh/identity/t020.json
    python -m slay2_sim.threshstudy tests --selection experiments/thresh/dev-selection.json
    python -m slay2_sim.threshstudy verify --batches experiments/batches --selection experiments/thresh/dev-selection.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .actsstudy import IGNORED_FIELDS, _rows, boss_flags
from .compare import build_pooled_comparison

SCHEMA = 1
CLASSES = ("Ironclad", "Defect")                  # the classes that win (94 % of the baseline's wins in ADR-061); the others almost never do
SEEDS_FILE = "experiments/seeds/ironclad-a0-v4.json"
DEV_PARTITION, DEV_N = "dev2", 3000
VAL_PARTITION, VAL_N = "val3", 15000
FIRST_ACT = 1                                     # the arms differ from S from the first card reward of Act 2 (act index 1) on
# the thresholds of the card reward of Act 2 (tag -> threshold of ``late_threshold``); +100 never takes a card in Act 2
GRID: dict[str, float] = {"t010": 0.1, "t020": 0.2, "t030": 0.3, "t045": 0.45, "t060": 0.6, "tnone": 100.0}
REPLICATION_TAG = "t020"                          # the threshold ADR-061 tested; T1 replicates it
HEAD_ALPHA = 0.20                                 # the head-to-head screen against 0.2
STUDY_ALPHA = 0.05                                # split over the held-out tests that are played


def dev_id(arm: str, cls: str) -> str:
    return f"thresh-dev-{arm}-{cls.lower()}-a0-veteran-keeprelics-{DEV_PARTITION}-n{DEV_N}"


def val_id(arm: str, cls: str) -> str:
    return f"thresh-val-{arm}-{cls.lower()}-a0-veteran-keeprelics-{VAL_PARTITION}-n{VAL_N}"


class StudyStop(Exception):
    """A condition the design relies on does not hold (ADR-062 item 5): the study stops and the cause is written in the record."""


def pool_arms(root: Path, arm: str, base: str, ident, *, iters: int = 2000, seed: int = 0, confidence: float | None = None) -> dict:
    """The pooled comparison of ``arm`` (a) against ``base`` (b) over the study's classes, the run won as the endpoint of the interval."""
    pairs = [(root / ident(arm, c), root / ident(base, c)) for c in CLASSES]
    return build_pooled_comparison(pairs, iters=iters, seed=seed, confidence=confidence, endpoint="win")


def summarise(pooled: dict) -> dict:
    t, n = pooled["wins"]["pairedTable"], pooled["bothCompleted"]
    wa, wb = pooled["wins"]["a"], pooled["wins"]["b"]
    return {
        "pairs": n,
        "excluded": pooled["excludedNotCompleted"],
        "wins": {"arm": wa, "baseline": wb},
        "shares": {"arm": wa / n, "baseline": wb / n},
        "difference": (wa - wb) / n,
        "armOnly": t["a_only"], "baselineOnly": t["b_only"], "net": t["a_only"] - t["b_only"], "p": t["mcnemar_p"],
        "pastAct1Boss": {"arm": pooled["reachedAct2"]["a"]["rate"], "baseline": pooled["reachedAct2"]["b"]["rate"]},
        "pastAct2Boss": {"arm": pooled["reachedAct3"]["a"]["rate"], "baseline": pooled["reachedAct3"]["b"]["rate"]},
        "meanFloorDifference": pooled["floorDifference"]["meanAMinusB"],
        "perClass": {m["character"]: {"pairs": m["bothCompleted"], "wins": {"arm": m["a"]["wins"], "baseline": m["b"]["wins"]}} for m in pooled["members"]},
        "contentSha256": pooled["contentSha256"],
    }


def mean_deck(root: Path, arm: str, base: str, ident) -> dict:
    """The mean final deck size of the arm's games and of S's over the pairs both games completed: descriptive, the selection rule does not read it (a game that
    ended earlier has had fewer rewards, so it is a picture of how much each arm takes, not a measure of it). ``None`` where no record carries a deck size."""
    pairs = []
    for c in CLASSES:
        a = {int(r["seed"]): r for r in _rows(root / ident(arm, c))}
        b = {int(r["seed"]): r for r in _rows(root / ident(base, c))}
        for seed in sorted(set(a) & set(b)):
            if a[seed]["outcome"] in ("win", "death") and b[seed]["outcome"] in ("win", "death") and a[seed].get("deck_size") is not None and b[seed].get("deck_size") is not None:
                pairs.append((a[seed]["deck_size"], b[seed]["deck_size"]))
    if not pairs:
        return {"arm": None, "baseline": None, "pairs": 0}
    return {"arm": sum(x for x, _ in pairs) / len(pairs), "baseline": sum(y for _, y in pairs) / len(pairs), "pairs": len(pairs)}


def wall_clock_stop(rec: dict) -> bool:
    """A game stopped by the wall clock: the one way a game can end that depends on the load of the machine and not on the game (a turn limit and a step limit are
    the game's own and the arm reproduces them)."""
    return rec.get("outcome") == "timeout" and str(rec.get("error") or "").startswith("episode exceeded")


def _identity(arm: Path, baseline: Path, first_act: int) -> dict:
    """How the games of an arm that is S until act ``first_act`` compare with S's, record by record, and whether it agrees with S about the Act-1 boss in every pair.

    A game S ended before that act never met the rule that differs, so the arm's record of it has to be S's (every field but the wall clock, the batch id and the
    policy's name); a pair in which either game was stopped by the wall clock is not compared (it says nothing about the play) and is counted."""
    a = {int(r["seed"]): r for r in _rows(arm)}
    b = {int(r["seed"]): r for r in _rows(baseline)}
    shared = sorted(set(a) & set(b))
    timed = {s for s in shared if wall_clock_stop(a[s]) or wall_clock_stop(b[s])}
    kept = [s for s in shared if s not in timed]

    def same(x: dict, y: dict) -> bool:
        return all(x.get(k) == y.get(k) for k in (set(x) | set(y)) - IGNORED_FIELDS)

    before = [s for s in kept if int(b[s].get("act", 0)) < first_act]
    return {
        "shared": len(shared),
        "wallClockPairs": len(timed),
        "beforePairs": len(before),
        "beforeDifferent": sum(1 for s in before if not same(a[s], b[s])),
        "bossPairs": len(kept),
        "bossDifferent": sum(1 for s in kept if boss_flags(a[s])[0] != boss_flags(b[s])[0]),
    }


def content_sha(batch: Path) -> str | None:
    """The content hash the batch's manifest records (a record made from the batch carries it, and the reader ties the record to the batch by it)."""
    try:
        return json.loads((batch / "manifest.json").read_text(encoding="utf-8")).get("content_sha256")
    except (OSError, ValueError):
        return None


def identity_for(root: Path, arm: str, ident) -> dict:
    """The identity counts of one arm against S in the study's classes (an arm is S until the first card reward of Act 2)."""
    per = {c: _identity(root / ident(arm, c), root / ident("s", c), FIRST_ACT) for c in CLASSES}
    ids = [ident(x, c) for c in CLASSES for x in (arm, "s")]
    return {
        "arm": arm,
        "firstAct": FIRST_ACT,
        "beforePairs": sum(v["beforePairs"] for v in per.values()),
        "beforeDifferent": sum(v["beforeDifferent"] for v in per.values()),
        "bossPairs": sum(v["bossPairs"] for v in per.values()),
        "bossDifferent": sum(v["bossDifferent"] for v in per.values()),
        "wallClockPairs": sum(v["wallClockPairs"] for v in per.values()),
        "batches": ids,
        "contentSha256": {i: content_sha(root / i) for i in ids},
        "perClass": per,
    }


def broken(rec: dict) -> bool:
    return bool(rec["beforeDifferent"] or rec["bossDifferent"] or rec["beforePairs"] <= 0)


def advance_rule(best: str, net: int, head: dict | None) -> tuple[bool, str]:
    """Whether the screen's choice goes to the held-out tests T2 and T3 (ADR-062 item 3): its net wins are above zero, it is not 0.2, and against 0.2
    on the same pairs it is ahead (more games for the choice than for 0.2) with an exact two-sided McNemar p below ``HEAD_ALPHA``. Both are strict."""
    if net <= 0:
        return False, "no threshold won more games than S in development (the largest net was not above zero)"
    if best == REPLICATION_TAG:
        return False, "0.2 itself had the largest net wins, so the held-out run has nothing to add to T1"
    if head is None:
        raise ValueError("the head-to-head against 0.2 is needed to apply the rule")
    if head["armOnly"] > head["baselineOnly"] and head["p"] < HEAD_ALPHA:
        return True, f"{best} is ahead of 0.2 in the head-to-head (exact p {head['p']:.3g}, below {HEAD_ALPHA})"
    return False, f"{best} is not ahead of 0.2 in the head-to-head at an exact p below {HEAD_ALPHA} ({head['armOnly']} against {head['baselineOnly']} games, p {head['p']:.3g})"


def select(root: Path, *, iters: int = 2000) -> dict:
    rows = {tag: summarise(pool_arms(root, tag, "s", dev_id, iters=iters)) for tag in GRID}
    ids = {tag: identity_for(root, tag, dev_id) for tag in GRID}
    bad = [
        f"{tag}: {rec['beforeDifferent']} of {rec['beforePairs']} games that S ended in Act 1 differ, {rec['bossDifferent']} of {rec['bossPairs']} pairs differ about the Act-1 boss"
        for tag, rec in ids.items()
        if broken(rec)
    ]
    if bad:
        raise StudyStop("the design's own check failed (ADR-062 item 5): " + "; ".join(bad))
    for tag, rec in ids.items():
        rows[tag]["identity"] = {k: rec[k] for k in ("beforePairs", "beforeDifferent", "bossPairs", "bossDifferent", "wallClockPairs")}
        rows[tag]["meanDeckSize"] = mean_deck(root, tag, "s", dev_id)
    best = max(GRID, key=lambda t: (rows[t]["net"], -GRID[t]))   # the largest net wins; a tie goes to the smaller threshold
    head = None
    if rows[best]["net"] > 0 and best != REPLICATION_TAG:
        head = summarise(pool_arms(root, best, REPLICATION_TAG, dev_id, iters=iters))
    advance, reason = advance_rule(best, rows[best]["net"], head)
    pooled_hash = {tag: row.pop("contentSha256") for tag, row in rows.items()}
    if head is not None:
        head["pooledSha256"] = head.pop("contentSha256")
    return {
        "schema": SCHEMA, "kind": "thresh-dev-selection", "role": "development: not a held-out result",
        "slice": {"partition": DEV_PARTITION, "n": DEV_N, "classes": list(CLASSES), "seedsFile": SEEDS_FILE},
        "rule": {
            "choice": "the threshold with the largest net wins (games only the arm won minus games only S won, over the pairs both games completed) against S; a tie goes to the smaller threshold",
            "advance": f"the choice goes to the held-out tests T2 and T3 if its net wins are above zero, it is not 0.2, and against 0.2 on the same pairs it is ahead with an exact two-sided McNemar p below {HEAD_ALPHA}",
            "T1": "always tested: 0.2 against S on the held-out seeds",
        },
        "baseline": "s",
        "contentSha256": {dev_id(a, c): content_sha(root / dev_id(a, c)) for a in ("s", *GRID) for c in CLASSES},
        "arms": {tag: {**row, "threshold": GRID[tag], "pooledSha256": pooled_hash[tag]} for tag, row in rows.items()},
        "best": {"arm": best, "threshold": GRID[best], "net": rows[best]["net"]},
        "headToHead": head,
        "choice": {"arm": best if advance else None, "threshold": GRID[best] if advance else None, "advance": advance, "reason": reason},
        "designChecksPassed": True,   # select() stops with StudyStop otherwise: a selection file never says anything else
    }


def _choice(selection: dict) -> dict:
    """The selection's choice, refused unless it is one the screen can write: an advanced arm is a threshold of the grid other than 0.2 (a file that advances 0.2
    itself, or an arm the grid does not have, would make the tests T2 and T3 mean nothing)."""
    choice = selection["choice"]
    if choice["advance"] and (choice["arm"] not in GRID or choice["arm"] == REPLICATION_TAG):
        raise ValueError(f"the selection advances {choice['arm']!r}, which is not a threshold of the grid other than {REPLICATION_TAG}")
    return choice


def tests_of(selection: dict) -> list[dict]:
    """The held-out tests the selection leaves: T1 always, T2 and T3 when the screen's choice advanced."""
    out = [{"key": "T1", "arm": REPLICATION_TAG, "baseline": "s"}]
    choice = _choice(selection)
    if choice["advance"]:
        out += [{"key": "T2", "arm": choice["arm"], "baseline": "s"}, {"key": "T3", "arm": choice["arm"], "baseline": REPLICATION_TAG}]
    return out


def level_of(selection: dict) -> float:
    """The level each held-out test is read at: the study-wise 0.05 divided by the number of tests that are played."""
    return STUDY_ALPHA / len(tests_of(selection))


def val_arms(selection: dict) -> list[str]:
    arms = ["s", REPLICATION_TAG]
    choice = _choice(selection)
    if choice["advance"]:
        arms.append(choice["arm"])
    return arms


def verify_selection(root: Path, selection: Path, *, iters: int = 2000) -> list[str]:
    """The development selection recomputed from the batches by the rule of item 3: what differs from the file, a line each (empty if the file is what the rule gives)."""
    try:
        want = json.loads(json.dumps(select(root, iters=iters), sort_keys=True))
    except StudyStop as e:
        return [f"STOP: {e}"]
    have = json.loads(selection.read_text(encoding="utf-8"))
    if want == have:
        return []
    out = []
    for key in sorted(set(want) | set(have)):
        if want.get(key) == have.get(key):
            continue
        if key == "arms" and isinstance(have.get("arms"), dict):
            out += [f"arms.{tag} differs" for tag in sorted(set(want["arms"]) | set(have["arms"])) if want["arms"].get(tag) != have["arms"].get(tag)]
        else:
            out.append(f"{key} differs")
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("dev", help="apply the registered selection rule to the development batches")
    d.add_argument("--batches", type=Path, default=Path("experiments/batches"))
    d.add_argument("--out", type=Path, required=True)
    i = sub.add_parser("identity", help="an arm against S, record by record (the arm is S until the first card reward of Act 2)")
    i.add_argument("arm", choices=sorted(GRID))
    i.add_argument("--stage", choices=["dev", "val"], default="val")
    i.add_argument("--batches", type=Path, default=Path("experiments/batches"))
    i.add_argument("--out", type=Path, required=True)
    v = sub.add_parser("verify", help="recompute the development selection from the batches and require it to be the file")
    v.add_argument("--batches", type=Path, default=Path("experiments/batches"))
    v.add_argument("--selection", type=Path, default=Path("experiments/thresh/dev-selection.json"))
    t = sub.add_parser("tests", help="the held-out tests and the level they are read at, from the selection file")
    t.add_argument("--selection", type=Path, default=Path("experiments/thresh/dev-selection.json"))
    args = ap.parse_args(argv)
    if args.cmd == "tests":
        sel = json.loads(args.selection.read_text(encoding="utf-8"))
        print(json.dumps({"tests": tests_of(sel), "arms": val_arms(sel), "level": level_of(sel)}, sort_keys=True))
        return 0
    if args.cmd == "verify":
        problems = verify_selection(args.batches, args.selection)
        for line in problems:
            print(f"verify: {line}", file=sys.stderr)
        if not problems:
            print(f"{args.selection} is what the rule of ADR-062 item 3 gives on the batches in {args.batches}")
        return 1 if problems else 0
    if args.cmd == "identity":
        rec = identity_for(args.batches, args.arm, dev_id if args.stage == "dev" else val_id)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps({"kind": "thresh-identity", "schema": SCHEMA, "stage": args.stage, **rec}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"{args.arm}: {rec['beforeDifferent']} of {rec['beforePairs']} games that S ended in Act 1 differ; {rec['bossDifferent']} of {rec['bossPairs']} pairs differ about the Act-1 boss ({rec['wallClockPairs']} pairs stopped by the wall clock are not compared)")
        return 1 if broken(rec) else 0
    try:
        body = select(args.batches)
    except StudyStop as e:
        print(f"STOP: {e}", file=sys.stderr)
        return 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(body, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    for tag, row in body["arms"].items():
        print(f"  {tag:6s} threshold {row['threshold']:6.2f}  pairs {row['pairs']:5d}  wins {row['wins']['arm']:4d} vs {row['wins']['baseline']:4d}  "
              f"only-arm {row['armOnly']:4d} only-S {row['baselineOnly']:4d}  net {row['net']:+4d}  p {row['p']:.4g}")
    print(f"best: {body['best']}\nchoice: {body['choice']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
