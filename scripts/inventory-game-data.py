#!/usr/bin/env python3
"""Count the things the game has, by category, from the local read-only copy of the extracted game data (ADR-011).

The insights page says what SLAY2 captures of each part of the game (cards, relics, potions, events, enchantments, monsters, powers)
and needs to say how big each part is. The cards and the relics are counted from SLAY2's own facts-only catalogs; the other categories
have no catalog in this repository (their text is the game's, and none of it is copied), so their *sizes* are written here once: counts
by category only, no names, no ids, no text. The output is committed; the extracted data stays git-ignored.

    python3 scripts/inventory-game-data.py                 # writes experiments/insights/game-inventory.json
    python3 scripts/inventory-game-data.py --check         # exits 1 when the committed file is not what the local data give

Refuses to run when the local checkout is not the commit pinned in external/pins.json (a different snapshot is a different game build).
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "experiments" / "insights" / "game-inventory.json"
ARCHIVE = ROOT / "external" / "checkouts" / "spire-archive"
DATA = ARCHIVE / "data" / "sts2"


def load(name: str):
    return json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))


def pinned_sha() -> str:
    pins = json.loads((ROOT / "external" / "pins.json").read_text(encoding="utf-8"))
    return next(r["sha"] for r in pins["repos"] if r["id"] == "spire-archive")


def build() -> dict:
    head = subprocess.run(["git", "-C", str(ARCHIVE), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    pin = pinned_sha()
    if head != pin:
        sys.exit(f"the local spire-archive checkout is at {head[:12]}, not the pinned {pin[:12]}: fetch it with scripts/external-fetch.sh")
    by = lambda rows, key: dict(sorted(collections.Counter(str(r.get(key)) for r in rows).items()))  # noqa: E731
    cards, relics, potions, events = load("cards"), load("relics"), load("potions"), load("events")
    enchantments, monsters, powers, characters = load("enchantments"), load("monsters"), load("powers"), load("characters")
    counts = {
        "cards": {"total": len(cards)},
        "relics": {"total": len(relics)},
        "potions": {"total": len(potions), "byRarity": by(potions, "rarity")},
        "events": {"total": len(events)},
        "enchantments": {"total": len(enchantments)},
        "monsters": {"total": len(monsters), "byType": by(monsters, "type")},
        "powers": {"total": len(powers)},
        "characters": {"total": len(characters)},
    }
    body = {
        "schema": 1,
        "kind": "game-inventory",
        "build": "sts2-main-0.107.1",
        "source": {"id": "spire-archive", "sha": pin, "snapshot": "data/sts2", "retrievedAt": "2026-10-25"},
        "note": "Counts by category only: no name, id or text of the game is stored here (docs/IP-COMPLIANCE.md).",
        "counts": counts,
    }
    body["contentSha256"] = hashlib.sha256(json.dumps(counts, sort_keys=True).encode()).hexdigest()
    return body


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    text = json.dumps(build(), indent=2, sort_keys=True) + "\n"
    if args.check:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print("stale: experiments/insights/game-inventory.json (run: python3 scripts/inventory-game-data.py)", file=sys.stderr)
            return 1
        print("game inventory: current")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
