"""The relic synergy table, made from two blind readings and a reconciliation (ADR-051).

Two readers each tagged the 296 relics of v0.107.1 in the vocabulary of the card table (`experiments/synergy/relics/reading-a.json`
and `reading-b.json`): what a relic provides to a deck (`g`) and what its value depends on (`w`). This module reconciles them by the
rule written in `experiments/synergy/relics/reconciliation.json` and writes the table the advisor reads
(`packages/game-data/data/relic-synergy.sts2-main-0.107.1.json`), so the table is a function of the readings and of the decisions and
a test can regenerate it:

    PYTHONPATH=sim python -m slay2_sim.relicreading --check     fail if the committed table is not what the readings make
    PYTHONPATH=sim python -m slay2_sim.relicreading --write     write it

The rule, in short: both readers wrote a mechanic -> kept at the lower magnitude; one reader wrote it -> kept only by a decision with
its reason (a mechanic with no decision is an error, so nothing is kept or dropped by accident); only `g` is kept; starter relics are
not tagged (the card table's innate supply counts the class's starting relic).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from . import external

DATA = external.REPO_ROOT / "packages" / "game-data" / "data"
DIR = external.REPO_ROOT / "experiments" / "synergy" / "relics"
BUILD_ID = "sts2-main-0.107.1"
TABLE = DATA / f"relic-synergy.{BUILD_ID}.json"


def canonical(value) -> str:
    """The canonical JSON of the card table's hash (sorted keys, no spaces): what the TypeScript test computes."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def read(name: str) -> dict:
    return json.loads((DIR / name).read_text(encoding="utf-8"))


def gives(reading: dict, relic: str) -> dict[str, int]:
    return dict(reading["tagged"].get(relic, {}).get("g", {}))


class ReconciliationError(ValueError):
    pass


def reconcile(a: dict, b: dict, decisions: dict, relics: list[dict], vocabulary: set[str]) -> tuple[dict[str, dict], dict]:
    """(relic id -> {"g": {mechanic: n}} for the relics that provide something, the counts that describe the reconciliation)."""
    table: dict[str, dict] = {}
    stats = {"relics": len(relics), "starters_skipped": 0, "agreed_exactly": 0, "lower_magnitude_taken": 0, "one_reader_kept": 0, "one_reader_dropped": 0}
    used: set[tuple[str, str]] = set()
    for relic in sorted(relics, key=lambda r: r["id"]):
        rid = relic["id"]
        if relic["rarity"] == "starter":
            stats["starters_skipped"] += 1
            continue
        ga, gb = gives(a, rid), gives(b, rid)
        out: dict[str, int] = {}
        for mechanic in sorted(set(ga) | set(gb)):
            if mechanic not in vocabulary:
                raise ReconciliationError(f"{rid}: {mechanic} is not a mechanic of the card table")
            if mechanic in ga and mechanic in gb:
                x, y = ga[mechanic], gb[mechanic]
                if (x > 0) != (y > 0):
                    raise ReconciliationError(f"{rid}: the readers disagree on the sign of {mechanic}")
                value = x if abs(x) <= abs(y) else y
                stats["agreed_exactly" if x == y else "lower_magnitude_taken"] += 1
                out[mechanic] = value
            else:
                decision = decisions["decisions"].get(rid, {}).get(mechanic)
                if decision is None:
                    raise ReconciliationError(f"{rid}: only one reader wrote {mechanic} and there is no decision for it")
                used.add((rid, mechanic))
                if decision["keep"] is None:
                    stats["one_reader_dropped"] += 1
                else:
                    stats["one_reader_kept"] += 1
                    out[mechanic] = int(decision["keep"])
        if out:
            table[rid] = {"g": out}
    stale = [(r, m) for r, ms in decisions["decisions"].items() for m in ms if (r, m) not in used]
    if stale:
        raise ReconciliationError(f"decisions for a mechanic that is not a one-reader mechanic: {stale}")
    stats["tagged"] = len(table)
    return table, stats


def build() -> dict:
    a, b, decisions = read("reading-a.json"), read("reading-b.json"), read("reconciliation.json")
    relics = json.loads((DATA / f"relics.{BUILD_ID}.json").read_text(encoding="utf-8"))["relics"]
    vocabulary = set(json.loads((DATA / f"synergy.{BUILD_ID}.json").read_text(encoding="utf-8"))["mechanics"])
    table, stats = reconcile(a, b, decisions, relics, vocabulary)
    body = {
        "schema": 1,
        "build": BUILD_ID,
        "provenance": {
            "kind": "SLAY2's own judgement of what each relic provides to a deck, in the vocabulary of the card table; no relic text, art or numbers are stored (ADR-011, ADR-051)",
            "reading": "g = what the relic provides to the deck, per mechanic: 1 minor or conditional, 2 standard, 3 major or every turn; a negative number takes the mechanic away. Two blind readings of every relic, reconciled by a written rule (experiments/synergy/relics/); built by sim/slay2_sim/relicreading.py.",
            "retrieved": "2026-10-27",
            "notAMeasurement": "The tags are judgements. They have not been tested in simulation (docs/DECISIONS.md, ADR-051).",
            "reconciliation": stats,
        },
        "relics": table,
    }
    body["sha256"] = hashlib.sha256(canonical({"relics": table}).encode("utf-8")).hexdigest()
    return body


def render(body: dict) -> str:
    return json.dumps(body, indent=1, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="fail if the committed table is not what the readings make")
    group.add_argument("--write", action="store_true", help="write the table")
    args = parser.parse_args(argv[1:])
    body = build()
    text = render(body)
    if args.write:
        TABLE.write_text(text, encoding="utf-8")
        print(f"wrote {TABLE}  relics tagged={len(body['relics'])}  sha256={body['sha256'][:16]}...  {body['provenance']['reconciliation']}")
        return 0
    if not TABLE.exists() or TABLE.read_text(encoding="utf-8") != text:
        print("the committed relic table is not what the readings make: run python -m slay2_sim.relicreading --write", file=sys.stderr)
        return 1
    print(f"the relic table is what the readings make ({len(body['relics'])} relics, sha256 {body['sha256'][:12]})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
