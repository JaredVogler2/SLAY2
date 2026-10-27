"""R4 (ADR-051 addendum A): can the relic reading be tested with the website's own pilot? A description of ten development batches.

The relic reading of ADR-051 (which relics supply which mechanic) promised a test: the pilot ``advisor_v1`` with the relics it holds
counted by the index against the same pilot without. The simulator drops the relics a run gains after its first fight (G14), so the
test could not have been seen before; with ``keep_relics`` runs hold relics. This program reads the development pair that asks
whether the test could see anything: ``advisor_v1`` at the strengths the website keeps (A*), ``relics`` false against true, both with
the relics kept, development seeds 500 to 999 of each class, Ascension 0, ``veteran`` profile. It looks at how often the two arms
play differently at all, because a paired test only learns from the games in which they do, and states what a held-out test of
that size could detect. It is descriptive: no outcome chose anything, and no held-out game was played.

    python -m slay2_sim.relicpower --out experiments/relics/dev-pair-power.json
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from math import erf, sqrt
from pathlib import Path

import numpy as np

from . import advisor, external

SCHEMA = 1
CLASSES = ("ironclad", "silent", "regent", "necrobinder", "defect")
ARMS = ("norelics", "relics")
LEVEL_Z = 1.959964  # two-sided 0.05
HELD_OUT_PAIRS = 10_000  # 2,000 val seeds in each of five classes, as every registered test of this project
EFFECTS = (0.02, 0.05, 0.10)  # the change in the share past the Act-1 boss among the games whose picks differ


def batch_id(cls: str, arm: str) -> str:
    return f"r4dev-{cls}-{arm}-keeprelics-dev-o500-n500"


def read_batch(cls: str, arm: str) -> tuple[dict[int, dict], dict]:
    """The episodes of a batch by seed, after checking that the episodes file is the one its manifest names."""
    root = external.REPO_ROOT / "experiments" / "batches" / batch_id(cls, arm)
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    packed = root / "episodes.jsonl.gz"
    if hashlib.sha256(packed.read_bytes()).hexdigest() != manifest["episodes_gz"]["sha256"]:
        raise ValueError(f"{batch_id(cls, arm)}: episodes.jsonl.gz is not the file its manifest names")
    if manifest["config"]["keep_relics"] is not True or bool(manifest["policy"]["params"].get("relics")) != (arm == "relics"):
        raise ValueError(f"{batch_id(cls, arm)}: not the arm its name says")
    episodes = {}
    for line in gzip.open(packed, "rt", encoding="utf-8"):
        e = json.loads(line)
        episodes[int(e["seed"])] = e
    return episodes, manifest


def _completed(e: dict) -> bool:
    return e["outcome"] in ("win", "death")


def _past_act1_boss(e: dict) -> bool:
    return e["outcome"] == "win" or int(e["act"]) >= 1


def _boss_deck(e: dict) -> dict | None:
    fights = (e.get("extra") or {}).get("boss_fights") or []
    return fights[0] if fights and fights[0]["act"] == 0 else None


def _parts(deck: dict[str, int], character: str, relics: list[str] | None) -> tuple[float, float, float]:
    setting = advisor.Setting(character, tuple(relics)) if relics is not None else character
    cards = advisor.deck_from_ids([c for c, n in deck.items() for _ in range(n)])
    return advisor.synergy_components(cards, 0, advisor.DEFAULT_MODEL, setting)


def analyse_class(cls: str) -> dict:
    with_relics, m1 = read_batch(cls, "relics")
    without, m0 = read_batch(cls, "norelics")
    if m1["seeds"] != m0["seeds"] or m1["environment"]["slay2"] != m0["environment"]["slay2"]:
        raise ValueError(f"{cls}: the two arms are not on the same seeds and commit")
    table = advisor.relic_synergy_table()["relics"]
    pairs = [s for s in sorted(with_relics) if s in without and _completed(with_relics[s]) and _completed(without[s])]
    a_only = sum(_past_act1_boss(with_relics[s]) and not _past_act1_boss(without[s]) for s in pairs)
    b_only = sum(_past_act1_boss(without[s]) and not _past_act1_boss(with_relics[s]) for s in pairs)
    identical = sum(with_relics[s]["outcome"] == without[s]["outcome"] and with_relics[s]["floor"] == without[s]["floor"] for s in pairs)
    floors = np.array([with_relics[s]["floor"] - without[s]["floor"] for s in pairs], dtype=float)
    boss_pairs = deck_differs = tagged = parts_differ = 0
    for s in pairs:
        fa, fb = _boss_deck(with_relics[s]), _boss_deck(without[s])
        if fa is None or fb is None:
            continue
        boss_pairs += 1
        deck_differs += int(fa["deck"] != fb["deck"])
        if any(r in table for r in fa["relics"]):
            tagged += 1
        deck = {k.rstrip("+"): 0 for k in fa["deck"]}
        for k, n in fa["deck"].items():
            deck[k.rstrip("+")] += n
        if _parts(deck, cls, fa["relics"]) != _parts(deck, cls, None):
            parts_differ += 1
    return {
        "batches": [batch_id(cls, "relics"), batch_id(cls, "norelics")],
        "pairs": len(pairs),
        "past_act1_boss": {
            "relics": round(sum(_past_act1_boss(with_relics[s]) for s in pairs) / len(pairs), 4),
            "norelics": round(sum(_past_act1_boss(without[s]) for s in pairs) / len(pairs), 4),
            "only_relics": a_only, "only_norelics": b_only,
        },
        "identical_results": identical,
        "mean_floors_relics_minus_norelics": round(float(floors.mean()), 4),
        "sd_floors": round(float(floors.std()), 3),
        "boss_decks": {"pairs": boss_pairs, "deck_differs": deck_differs, "relics_arm_holds_a_tagged_relic": tagged, "index_parts_differ_with_relics": parts_differ},
    }


def _phi(x: float) -> float:
    return 0.5 * (1 + erf(x / sqrt(2)))


def power_table(pooled: dict) -> dict:
    """What a held-out test of ``HELD_OUT_PAIRS`` pairs could see, by the normal approximation to the exact McNemar test: the games in
    which the two arms pick differently are the share ``s`` of the pairs; among them the outcomes differ in the share ``q`` (as
    observed); a true change of ``d`` in the share past the boss among them moves the discordant pairs by ``d`` per such game."""
    s = pooled["boss_decks"]["deck_differs"] / pooled["boss_decks"]["pairs"]
    different = pooled["boss_decks"]["deck_differs"]
    discordant = pooled["past_act1_boss"]["only_relics"] + pooled["past_act1_boss"]["only_norelics"]
    q = discordant / different if different else 0.0
    games = HELD_OUT_PAIRS * s
    spread = sqrt(max(games * q, 1e-9))
    return {
        "pairs_in_a_held_out_test": HELD_OUT_PAIRS,
        "share_of_pairs_that_play_differently": round(s, 4),
        "share_of_those_whose_outcomes_differ": round(q, 3),
        "expected_games_that_play_differently": round(games, 1),
        "expected_discordant_pairs": round(games * q, 1),
        "by_effect": {
            f"{d:.2f}": {"expected_net_pairs": round(d * games, 1), "z": round(d * games / spread, 2), "power": round(_phi(d * games / spread - LEVEL_Z), 3)}
            for d in EFFECTS
        },
        "method": "normal approximation to the exact McNemar test at level 0.05, two-sided; the effect is the change in the share past the Act-1 boss among the games whose boss decks differ",
    }


def build_report() -> dict:
    per_class = {c: analyse_class(c) for c in CLASSES}
    pooled = {
        "pairs": sum(v["pairs"] for v in per_class.values()),
        "past_act1_boss": {
            "relics": round(sum(v["past_act1_boss"]["relics"] * v["pairs"] for v in per_class.values()) / sum(v["pairs"] for v in per_class.values()), 4),
            "norelics": round(sum(v["past_act1_boss"]["norelics"] * v["pairs"] for v in per_class.values()) / sum(v["pairs"] for v in per_class.values()), 4),
            "only_relics": sum(v["past_act1_boss"]["only_relics"] for v in per_class.values()),
            "only_norelics": sum(v["past_act1_boss"]["only_norelics"] for v in per_class.values()),
        },
        "identical_results": sum(v["identical_results"] for v in per_class.values()),
        "mean_floors_relics_minus_norelics": round(sum(v["mean_floors_relics_minus_norelics"] * v["pairs"] for v in per_class.values()) / sum(v["pairs"] for v in per_class.values()), 4),
        "boss_decks": {k: sum(v["boss_decks"][k] for v in per_class.values()) for k in ("pairs", "deck_differs", "relics_arm_holds_a_tagged_relic", "index_parts_differ_with_relics")},
    }
    return {
        "schema": SCHEMA, "kind": "relic-reading-dev-pair", "stage": "R4-dev of ADR-051 addendum A (development seeds; descriptive, not a test)",
        "relic_synergy_table_sha256": advisor.relic_synergy_table()["sha256"],
        "arms": {"relics": "advisor_v1 at A*, the relics it holds counted by the index", "norelics": "advisor_v1 at A*, the class alone"},
        "per_class": per_class, "pooled": pooled, "power": power_table(pooled),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    report = build_report()
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    p = report["pooled"]
    print(f"wrote {out}: {p['pairs']} pairs, {p['boss_decks']['deck_differs']} of {p['boss_decks']['pairs']} boss-deck pairs differ, "
          f"past the Act-1 boss only with relics {p['past_act1_boss']['only_relics']} / only without {p['past_act1_boss']['only_norelics']}")
    for d, v in report["power"]["by_effect"].items():
        print(f"  a change of {d} among the games that play differently: net {v['expected_net_pairs']} pairs, z {v['z']}, power {v['power']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
