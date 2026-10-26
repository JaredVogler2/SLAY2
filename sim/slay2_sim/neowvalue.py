"""Opening-Ancient (Neow) relic values learned from randomised choices (H10, ADR-041).

``rules_v2_neow`` plays simulated runs whose Neow choice (one of three offered relics: two positive, one cursed) is
decided by chance, and records the offer and the relic it took. Because chance, not taste, decided which relic the run
started with, the effect of taking a relic can be read from a regression: logit P(the run gets past the Act-1 boss) =
class + sum over relics of beta_relic * [the run took that relic]. ``beta_relic`` is the change in log-odds, relative to the
average relic taken, with a bootstrap interval that resamples whole games; the penalty shrinks relics seen in few games toward
that average (the usual cure for the winner's curse when the best of many estimates is the one acted on).

What this is not: a statement about the real game (the simulator is unverified, and its relic effects are what the simulator
implements), about other pilots (the policy that plays on is rules_v2, which ignores effects it does not know how to use,
such as free travel), or about the Ancients of acts two and three (the simulator has none, gap G11).

    python -m slay2_sim.neowvalue --batches experiments/neow/... --out experiments/neow/neow-values-v1.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from .cardvalue import FOLDS, bootstrap, cross_validate, fit_logistic, read_episodes

SCHEMA = 1


def extract(episodes: list[dict], character: str) -> list[dict]:
    """One record per game that finished cleanly and logged a Neow offer. Errors and timeouts are never read as losses."""
    out = []
    for ep in episodes:
        if ep.get("outcome") not in ("death", "win"):
            continue
        neow = (ep.get("extra") or {}).get("neow")
        if not neow:
            continue
        out.append({
            "character": character,
            "seed": int(ep["seed"]),
            "offered": sorted(neow["positive"]) + [neow["cursed"]],
            "cursed": neow["cursed"],
            "taken": neow["taken"],
            "explored": bool(neow.get("explored")),
            "passed": int(ep["outcome"] == "win" or int(ep["act"]) >= 1),
            "floor": int(ep["floor"]),
        })
    return out


def vocabulary(records: list[dict], min_taken: int = 30) -> dict:
    taken: dict[str, int] = {}
    offered: dict[str, int] = {}
    for r in records:
        taken[r["taken"]] = taken.get(r["taken"], 0) + 1
        for x in r["offered"]:
            offered[x] = offered.get(x, 0) + 1
    relics = sorted(x for x, n in taken.items() if n >= min_taken)
    return {"relics": relics, "taken": taken, "offered": offered, "characters": sorted({r["character"] for r in records})}


def design(records: list[dict], vocab: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str], np.ndarray]:
    chars = vocab["characters"][1:]  # the first class is the reference level
    relics = vocab["relics"]
    names = ["intercept"] + [f"class:{c}" for c in chars] + [f"relic:{x}" for x in relics]
    ci = {c: 1 + k for k, c in enumerate(chars)}
    ri = {x: 1 + len(chars) + k for k, x in enumerate(relics)}
    X = np.zeros((len(records), len(names)))
    y = np.zeros(len(records))
    g = np.arange(len(records), dtype=np.int64)  # every game is its own group: games are independent draws
    for i, r in enumerate(records):
        X[i, 0] = 1.0
        if r["character"] in ci:
            X[i, ci[r["character"]]] = 1.0
        if r["taken"] in ri:
            X[i, ri[r["taken"]]] = 1.0
        y[i] = r["passed"]
    penalised = np.zeros(len(names), dtype=bool)
    penalised[list(ri.values())] = True
    return X, y, g, names, penalised


def build_report(records: list[dict], *, bootstrap_draws: int = 200, seed: int = 0, min_taken: int = 30) -> dict:
    vocab = vocabulary(records, min_taken=min_taken)
    X, y, g, names, penalised = design(records, vocab)
    cv = cross_validate(X, y, g, penalised)
    l2 = cv["best_l2"]
    beta = fit_logistic(X, y, l2, penalised)
    draws = bootstrap(X, y, g, penalised, l2, bootstrap_draws, seed)
    lo, hi = np.percentile(draws, [2.5, 97.5], axis=0)
    cursed = {r["cursed"] for r in records}
    by_taken: dict[str, list[int]] = {}
    other: dict[str, list[int]] = {}
    for r in records:
        by_taken.setdefault(r["taken"], []).append(r["passed"])
        for x in r["offered"]:
            if x != r["taken"]:
                other.setdefault(x, []).append(r["passed"])
    relics = []
    for j, name in enumerate(names):
        if not name.startswith("relic:"):
            continue
        label = name[6:]
        took, left = by_taken.get(label, []), other.get(label, [])
        relics.append({
            "label": label,
            "kind": "cursed" if label in cursed else "positive",
            "beta": round(float(beta[j]), 4),
            "ci95": [round(float(lo[j]), 4), round(float(hi[j]), 4)],
            "taken": len(took),
            "offered": vocab["offered"].get(label, 0),
            "pass_rate_taken": round(sum(took) / len(took), 4) if took else None,
            "pass_rate_offered_not_taken": round(sum(left) / len(left), 4) if left else None,
        })
    relics.sort(key=lambda r: -r["beta"])
    per_class = {}
    for c in vocab["characters"]:
        mine = [r for r in records if r["character"] == c]
        per_class[c] = {"games": len(mine), "pass_rate": round(sum(r["passed"] for r in mine) / max(1, len(mine)), 4)}
    return {
        "schema": SCHEMA,
        "kind": "neow-values",
        "outcome": "the run gets past the Act-1 boss",
        "games": len(records),
        "pass_rate": round(float(y.mean()), 4),
        "classes": per_class,
        "model": {"l2": l2, "folds": FOLDS, "cross_validation": cv, "bootstrap_draws": bootstrap_draws, "min_taken": min_taken,
                  "features": len(names)},
        "covariates": {n: round(float(beta[j]), 4) for j, n in enumerate(names) if not n.startswith("relic:")},
        "relics": relics,
        "rule": "take the offered relic with the largest beta; a relic taken in fewer than min_taken games counts as 0 (the average)",
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--batches", nargs="+", required=True, help="batch directories written by `slay2_sim run --policy rules_v2_neow`")
    ap.add_argument("--out", required=True)
    ap.add_argument("--bootstrap", type=int, default=200)
    ap.add_argument("--min-taken", type=int, default=30)
    args = ap.parse_args(argv)
    out = Path(args.out).resolve()
    dirs = [Path(b).resolve() for b in args.batches]
    records: list[dict] = []
    manifests = []
    cohorts = set()
    for d in dirs:
        mf = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
        if mf["policy"]["name"] != "rules_v2_neow" or mf["policy"]["params"].get("neow_explore", 1.0) != 1.0:
            raise SystemExit(f"{d.name}: only fully randomised rules_v2_neow batches identify the effect of a relic")
        cohorts.add((mf["config"]["ascension"], mf["config"]["profile"]))
        records.extend(extract(read_episodes(d), mf["config"]["character"]))
        manifests.append({"batch_id": mf["batch_id"], "character": mf["config"]["character"], "content_sha256": mf["content_sha256"],
                          "policy": mf["policy"], "known_simulator_gaps": [gp["id"] for gp in mf.get("known_simulator_gaps", [])]})
    if len(cohorts) != 1:
        raise SystemExit(f"batches must share one (ascension, profile); got {sorted(cohorts)}")
    ascension, profile = next(iter(cohorts))
    report = build_report(records, bootstrap_draws=args.bootstrap, min_taken=args.min_taken)
    report["ascension"], report["profile"] = ascension, profile
    report["batches"] = manifests
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out}: {report['games']} games, pass rate {report['pass_rate']}, best l2 {report['model']['l2']}")
    for r in report["relics"][:5] + report["relics"][-5:]:
        print(f"  {r['label']:24s} {r['kind']:8s} beta {r['beta']:+.3f}  ci95 [{r['ci95'][0]:+.3f}, {r['ci95'][1]:+.3f}]  taken={r['taken']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
