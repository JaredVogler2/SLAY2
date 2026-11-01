"""The acts study's own tools (ADR-061): the design checks of its arms and the names of its batches.

ADR-061 asks which act's card-pick pickiness carries the effect the old lead (a card-pick threshold of 0.2 in every act, ADR-036) has on
how far a simulated run gets, and whether it reaches winning. Its arms are the baseline S (``rules_v2`` following the card values the site
shows, threshold 0), the lead (``rules_v2`` at 0.2 in every act) and three pilots that are pickier (0.2) in one act only and are S in the
others (``rules_v2_late`` with ``late_acts`` [0], [1] or [2]: A1, A2, A3, the acts counted from 0).

An arm that is S until the card rewards of act ``k`` plays the same game as S until the first of those, and that is what a paired test of
it rests on. ``identity`` checks it on the batches that were played, before any test is pooled (ADR-061 item 5):

* (b) every game that S ended before act ``k`` (S's last act index is below ``k``) never met the rule that differs, so the arm's record of
  that game must be S's, field for field but the wall clock, the batch id and the policy's name;
* (c) the arm cannot differ from S about a boss of an act before ``k`` in any pair (it plays S's game until the first card reward of act
  ``k``, which comes after those bosses): the Act-1 boss for ``k`` of 1 or more, the Act-2 boss for 2. A boss is "got past" by the
  definitions of ``slay2_sim.compare`` (a win, or a last act index of 1 / 2 or more), here over every pair of seeds both batches hold.

A single difference stops the study (ADR-061 item 5).

    python -m slay2_sim.actsstudy identity A2 --out experiments/acts/identity/A2.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCHEMA = 1
CLASSES = ("Ironclad", "Silent", "Regent", "Necrobinder", "Defect")
PARTITION, VAL_N = "val2", 3000
SEEDS_FILE = "experiments/seeds/ironclad-a0-v3.json"
LEAD_THRESHOLD = 0.2
TESTS_N = 4
LEVEL = 0.05 / TESTS_N  # each of the four tests is read at this level (ADR-061 item 4)
# test key -> (arm tag, the first act, counted from 0, whose card rewards differ from S's)
TESTS: dict[str, tuple[str, int]] = {"L": ("lead", 0), "A1": ("a1", 0), "A2": ("a2", 1), "A3": ("a3", 2)}
IGNORED_FIELDS = frozenset({"wall_seconds", "batch_id", "policy"})


def val_id(arm: str, cls: str) -> str:
    return f"acts-{arm}-{cls.lower()}-a0-veteran-keeprelics-{PARTITION}-n{VAL_N}"


def _rows(batch: Path) -> list[dict]:
    """The batch's raw episode records (every field), not the typed rows ``batch.read_episodes`` returns."""
    import gzip

    gz, plain = batch / "episodes.jsonl.gz", batch / "episodes.jsonl"
    if gz.exists():
        with gzip.open(gz, "rt", encoding="utf-8") as fh:
            return [json.loads(line) for line in fh if line.strip()]
    return [json.loads(line) for line in plain.read_text(encoding="utf-8").splitlines() if line.strip()]


def boss_flags(rec: dict) -> tuple[bool, bool]:
    """(got past the Act-1 boss, got past the Act-2 boss), as ``slay2_sim.compare`` defines them: a win, or a last act index of 1 / 2 or more."""
    won = rec.get("outcome") == "win"
    act = int(rec.get("act", 0))
    return won or act >= 1, won or act >= 2


def content_hash(batch: Path) -> str | None:
    """The content hash the batch's manifest records (None for a directory with episodes and no manifest, which only a test makes)."""
    try:
        return json.loads((batch / "manifest.json").read_text(encoding="utf-8")).get("content_sha256")
    except (OSError, ValueError):
        return None


def identity(arm: Path, baseline: Path, first_act: int) -> dict:
    """How the games of an arm that is S until act ``first_act`` compare with S's, record by record (b), and whether it agrees with S about the
    bosses before that act in every pair (c). A game S ended before that act never reached the rule that differs, so the arm's record of it has to
    be S's (every field but the wall clock, the batch id and the policy's name)."""
    a = {int(r["seed"]): r for r in _rows(arm)}
    b = {int(r["seed"]): r for r in _rows(baseline)}

    def same(x: dict, y: dict) -> bool:
        return all(x.get(k) == y.get(k) for k in (set(x) | set(y)) - IGNORED_FIELDS)

    shared = sorted(set(a) & set(b))
    before = [s for s in shared if int(b[s].get("act", 0)) < first_act]
    bosses = range(min(first_act, 2))  # 0: the Act-1 boss, 1: the Act-2 boss; those of the acts before the first act that differs
    return {
        "shared": len(shared),
        "beforePairs": len(before),
        "beforeDifferent": sum(1 for s in before if not same(a[s], b[s])),
        "bossPairs": len(shared),
        "bossDifferent": sum(1 for s in shared if any(boss_flags(a[s])[k] != boss_flags(b[s])[k] for k in bosses)),
    }


def identity_for(root: Path, test: str) -> dict:
    """The identity counts of one test's arm in the five classes (the lead and A1 differ from S from the first act on: nothing to check)."""
    arm, first = TESTS[test]
    per = {c: identity(root / val_id(arm, c), root / val_id("s", c), first) for c in CLASSES}
    ids = [val_id(x, c) for c in CLASSES for x in (arm, "s")]
    return {
        "test": test,
        "arm": arm,
        "firstAct": first,
        "beforePairs": sum(v["beforePairs"] for v in per.values()),
        "beforeDifferent": sum(v["beforeDifferent"] for v in per.values()),
        "bossPairs": sum(v["bossPairs"] for v in per.values()),
        "bossDifferent": sum(v["bossDifferent"] for v in per.values()),
        "contentSha256": {i: content_hash(root / i) for i in ids},  # the batches this record was made from
        "perClass": per,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("identity", help="the held-out arms that are S in the early acts against S, record by record")
    i.add_argument("test", choices=sorted(TESTS))
    i.add_argument("--batches", type=Path, default=Path("experiments/batches"))
    i.add_argument("--out", type=Path, required=True)
    args = ap.parse_args(argv)
    arm, first = TESTS[args.test]
    if first == 0:
        print(f"test {args.test} differs from S from the first act on: nothing to check")
        return 0
    rec = identity_for(args.batches, args.test)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"kind": "acts-identity", "schema": SCHEMA, **rec}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        f"test {args.test} ({arm}): {rec['beforeDifferent']} of {rec['beforePairs']} games that S ended before act {first + 1} differ; "
        f"{rec['bossDifferent']} of {rec['bossPairs']} pairs differ about a boss before it"
    )
    return 0 if not rec["beforeDifferent"] and not rec["bossDifferent"] and rec["beforePairs"] > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
