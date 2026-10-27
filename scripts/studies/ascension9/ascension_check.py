"""What does the pinned simulator change at each Ascension? (ADR-058, Context: a reading of the simulator against the rule register)

For Ascension 0 to 9 it builds the start of a run in every class and records what the register (docs/game/MECHANICS-COVERAGE.md, ASC-1..ASC-7)
says changes: potion slots (A4), Ascender's Bane in the starting deck (A5), the number of elites on the first act's map (A1), the card removal
price (A6), the card rarity odds and the pity counter's growth (A7). It plays no fight. A8's and A9's enemy HP and damage are in the monsters'
own files and were not read here (gap G2 records an audit of the A8 HP). Run from the repository root with SLAY2_EXTERNAL_ROOT set:
    PYTHONPATH=sim python3 scripts/studies/ascension9/ascension_check.py experiments/ascension9/ascension-check.json
"""

import json
import sys
from collections import Counter
from pathlib import Path

from slay2_sim import external

CLASSES = ["Ironclad", "Silent", "Regent", "Necrobinder", "Defect"]
SEEDS = list(range(1, 41))


def main(out: str) -> int:
    out_path = Path(out).resolve()  # before activate(), which changes the working directory to the simulator's checkout
    sim = external.locate()
    external.activate(sim.root)
    import sts2_env.run.run_manager as rm
    from sts2_env.run.odds import CardRarityOdds
    from sts2_env.run.shop import card_removal_cost

    levels = {}
    for asc in range(0, 10):
        per_class = {}
        for cls in CLASSES:
            mgr = rm.RunManager(seed=7, character_id=cls, ascension_level=asc, start_with_neow=True)
            player = mgr.run_state.player
            deck = Counter(c.card_id.name for c in player.deck)
            per_class[cls] = {
                "maxHp": int(player.max_hp),
                "potionSlots": int(player.max_potion_slots),
                "deckSize": sum(deck.values()),
                "ascendersBane": deck.get("ASCENDERS_BANE", 0),
            }
        elites = []
        for seed in SEEDS:
            mgr = rm.RunManager(seed=seed, character_id="Ironclad", ascension_level=asc, start_with_neow=True)
            points = list(mgr.run_state.map.all_points())
            elites.append(sum(1 for p in points if p.point_type.name == "ELITE"))
        odds = CardRarityOdds(asc)
        levels[str(asc)] = {
            "classes": per_class,
            "act1EliteCount": {"seeds": len(SEEDS), "min": min(elites), "max": max(elites), "mean": round(sum(elites) / len(elites), 2)},
            "cardRemovalCost": [card_removal_cost(n, asc) for n in range(3)],
            "rarityOdds": {
                "regularRare": odds.regular_odds["rare"],
                "eliteRare": odds.elite_odds["rare"],
                "shopRare": odds.shop_odds["rare"],
                "pityGrowthPerNonRare": odds.rarity_growth,
            },
        }
    first = levels["0"]
    nine = levels["9"]
    claims = {
        "A1 elites 5 -> 8": first["act1EliteCount"]["max"] == 5 and nine["act1EliteCount"]["min"] == 8,
        "A4 potion slots 3 -> 2": all(first["classes"][c]["potionSlots"] == 3 and nine["classes"][c]["potionSlots"] == 2 for c in CLASSES),
        "A5 Ascender's Bane in the starting deck": all(
            first["classes"][c]["ascendersBane"] == 0 and nine["classes"][c]["ascendersBane"] == 1 for c in CLASSES
        )
        and all(levels[str(a)]["classes"]["Ironclad"]["ascendersBane"] == (1 if a >= 5 else 0) for a in range(10)),
        "A6 card removal 75/100/125 -> 100/150/200": first["cardRemovalCost"] == [75, 100, 125] and nine["cardRemovalCost"] == [100, 150, 200],
        "A7 scarcity: rarer cards are rarer, the pity counter grows by half": (
            nine["rarityOdds"]["regularRare"] < first["rarityOdds"]["regularRare"]
            and nine["rarityOdds"]["pityGrowthPerNonRare"] == first["rarityOdds"]["pityGrowthPerNonRare"] / 2
        ),
    }
    report = {
        "schema": 1,
        "kind": "ascension-check",
        "simulator": sim.describe(),
        "claims": claims,
        "allClaimsHold": all(claims.values()),
        "levels": levels,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"claims": claims, "allClaimsHold": report["allClaimsHold"]}, indent=2))
    return 0 if report["allClaimsHold"] else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1]))
