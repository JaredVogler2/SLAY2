"""How often does the advisor's index say skip, on the card-reward states real simulated games reach? (ADR-065; behaviour only, no outcome is read)

Two sets of states are collected by playing games and writing down, at every card reward, the deck (counts), the act and the offered cards:
  * `advisor`: `advisor_v1` with `A*` (the pilot that decides card rewards by the page's index, version 1's price), 60 games a class, seeds 7000 to 7059;
  * `values`: `rules_v2` following the card values the site shows, the relics kept, 120 games a class, seeds 9000 to 9119: a pilot that reaches Acts 2 and 3
    far more often, so its states cover the decks in which dilution matters.
Seeds are plain integers outside every partition of the seed file. Each candidate price (the number of cards from which every card costs, and what it costs)
is then asked what it would do on the same states, and the share of states in which skipping ranks first is written by act and by size of the deck, with the
median gain of the best offered card by size (the part of the index that decides whether a card beats skipping). Standard library plus the simulator.

    fingerprint.py --out experiments/skip/fingerprint.json [--states-dir DIR]     (collecting takes about eight minutes a core)
"""

from __future__ import annotations

import argparse
import collections
import json
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "sim"))

CLASSES = ["Ironclad", "Silent", "Regent", "Necrobinder", "Defect"]
BANDS = [("<=15", 0, 15), ("16-20", 16, 20), ("21-25", 21, 25), ("26-30", 26, 30), (">30", 31, 999)]
A_STAR = {"synergy": 1, "needs": 1, "scalers": 0.7, "engines": 0, "margin": 0}
CANDIDATES = [("version 1", 30, 0.6), ("page: 1.0 from the 21st card", 20, 1.0)] + [
    (f"{p} from the {n + 1}th card", n, p) for n in (15, 20, 25) for p in (0.3, 0.6, 1.0, 1.5) if (n, p) != (20, 1.0)
]


def band(n: int) -> str:
    return next(name for name, lo, hi in BANDS if lo <= n <= hi)


def collect(kind: str, out: Path) -> None:
    from slay2_sim import advisor, external
    from slay2_sim.policies.advisor_v1 import AdvisorV1
    from slay2_sim.policies.rules import deck_ids
    from slay2_sim.policies.rules2 import RulesV2
    from slay2_sim.runner import RunConfig, run_episode

    sim = external.locate()
    external.activate(sim.root)
    log: list[dict] = []

    def record(obs, actions):
        picks = [a for a in actions if a.get("action") == "pick_card"]
        if picks:
            run = obs["run"]
            deck = advisor.deck_from_ids(cid for cid, _ in deck_ids(run))
            offered = [advisor.card_id_of(a["card_id"]) for a in picks]
            log.append({"c": run.get("character"), "act": int(run["act"]), "deck": deck, "offered": [o for o in offered if o]})

    class LoggingAdvisor(AdvisorV1):
        name = "advisor_v1"  # the policy-private stream of the arm it copies

        def _card_reward(self, obs, actions):
            record(obs, actions)
            return super()._card_reward(obs, actions)

    class LoggingValues(RulesV2):
        def _card_reward(self, obs, actions):
            record(obs, actions)
            return super()._card_reward(obs, actions)

    with out.open("w", encoding="utf-8") as fh:
        for cls in CLASSES:
            if kind == "advisor":
                policy, games, base = LoggingAdvisor(**A_STAR), 60, 7000
            else:
                values = "experiments/cardvalue/ironclad-a0-v2.json" if cls == "Ironclad" else f"experiments/cardvalue/{cls.lower()}-a0-keep-v1.json"
                policy, games, base = LoggingValues(values=values, threshold=0.0), 120, 9000
            for s in range(games):
                log.clear()
                run_episode(RunConfig(character=cls, keep_relics=True), base + s, policy, batch_id="fingerprint")
                for row in log:
                    fh.write(json.dumps(row) + "\n")


def evaluate(states: list[dict]) -> dict:
    from slay2_sim import advisor

    model = advisor.Model(needs=1.0, scalers=0.7, engines=0.0)
    out: dict = {"states": len(states), "byAct": dict(sorted(collections.Counter(min(max(s["act"], 0), 2) + 1 for s in states).items())),
                 "byDeckSize": {name: sum(1 for s in states if lo <= sum(s["deck"].values()) <= hi) for name, lo, hi in BANDS}, "candidates": []}
    gains: dict[str, list[float]] = collections.defaultdict(list)
    parts: dict[str, dict[str, list[float]]] = collections.defaultdict(lambda: collections.defaultdict(list))
    for label, n0, price in CANDIDATES:
        by_band: dict[str, list[int]] = collections.defaultdict(lambda: [0, 0])
        by_act: dict[int, list[int]] = collections.defaultdict(lambda: [0, 0])
        total = [0, 0]
        for s in states:
            act = min(max(s["act"], 0), 2)
            w = advisor.base_weights(act, "balanced", 1.0, price, n0)
            character = (s["c"] or "").lower() or None
            ranked = advisor.rank_options(s["deck"], s["offered"], act, "balanced", w, model, character)
            skip = ranked[0][0] == advisor.SKIP
            size = sum(s["deck"].values())
            for table, key in ((by_band, band(size)), (by_act, act + 1)):
                table[key][0] += skip
                table[key][1] += 1
            total[0] += skip
            total[1] += 1
            if label == "version 1":  # the parts of the best card's gain, once
                base_p = advisor.profile_deck(s["deck"], act, model, character)
                base_t = advisor.score_terms(base_p, w)
                best = None
                for cid in s["offered"]:
                    t = advisor.score_terms(advisor.profile_deck(advisor.with_card(s["deck"], cid), act, model, character), w)
                    d = {"quality": t.quality - base_t.quality, "coverage": sum(t.coverage.values()) - sum(base_t.coverage.values()),
                         "synergy": t.synergy - base_t.synergy}
                    d["total"] = advisor.total(t) - advisor.total(base_t)
                    if best is None or d["total"] > best["total"]:
                        best = d
                if best is not None:
                    gains[band(size)].append(best["total"])
                    for k in ("quality", "coverage", "synergy"):
                        parts[band(size)][k].append(best[k])
        out["candidates"].append({
            "label": label, "sizeFrom": n0, "price": price, "skipShare": round(total[0] / max(total[1], 1), 4),
            "byAct": {f"act{a}": round(v[0] / max(v[1], 1), 4) for a, v in sorted(by_act.items())},
            "byDeckSize": {name: round(by_band[name][0] / max(by_band[name][1], 1), 4) for name, _, _ in BANDS},
        })
    out["bestCardGainUnderVersion1"] = {
        name: {"n": len(gains[name]), "median": round(statistics.median(gains[name]), 3),
               "meanQuality": round(statistics.mean(parts[name]["quality"]), 3), "meanCoverage": round(statistics.mean(parts[name]["coverage"]), 3),
               "meanSynergy": round(statistics.mean(parts[name]["synergy"]), 3)}
        for name, _, _ in BANDS if gains[name]
    }
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--states-dir", default=None, help="where the collected states are kept (default: next to --out); states found there are reused")
    args = ap.parse_args()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    states_dir = Path(args.states_dir) if args.states_dir else out.parent / "fingerprint-states"
    states_dir.mkdir(parents=True, exist_ok=True)
    result: dict = {"schema": 1, "kind": "advisor-skip-fingerprint", "about": "how often the index ranks skipping first on the card-reward states simulated games reach (behaviour only: no outcome is read)", "sets": {}}
    for kind in ("advisor", "values"):
        path = states_dir / f"{kind}.jsonl"
        if not path.exists():
            t0 = time.time()
            collect(kind, path)
            print(f"collected {kind} states in {time.time() - t0:.0f} s", file=sys.stderr)
        states = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        result["sets"][kind] = evaluate(states)
    out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
