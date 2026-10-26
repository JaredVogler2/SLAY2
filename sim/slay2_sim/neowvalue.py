"""Opening-Ancient (Neow) relic values learned from randomised choices (H10, ADR-041).

``rules_v2_neow`` plays simulated runs whose Neow choice (one of three offered relics: two positive, one cursed) is
decided by chance, and records the offer and the relic it took. Because chance, not taste, decided which relic the run
started with, the effect of taking a relic can be read from a regression: logit P(the run gets past the Act-1 boss) =
class + sum over relics of beta_relic * [the run took that relic]. ``beta_relic`` is the change in log-odds, relative to the
average relic taken, with a bootstrap interval that resamples whole *seeds*; the penalty shrinks relics seen in few games toward
that average (the usual cure for the winner's curse when the best of many estimates is the one acted on).

The unit of resampling and of cross-validation is the seed, not the game (ADR-049): the seed decides the offer and, under
exploration, the relic taken, so the five classes' games of one seed share both and are not independent draws (15,000 games
are 3,000 independent draws of a relic). The first version of this fit treated every game as its own group, which made the
intervals optimistic; the point estimates, and the rule built on them, do not depend on the grouping.

What this is not: a statement about the real game (the simulator is unverified, and its relic effects are what the simulator
implements), about other pilots (the policy that plays on is rules_v2, which ignores effects it does not know how to use,
such as free travel), or about the Ancients of acts two and three (the simulator has none, gap G11).

    python -m slay2_sim.neowvalue --batches experiments/neow/... --out experiments/neow/neow-values-v1.json
"""

from __future__ import annotations

import argparse
import json
from math import comb
from pathlib import Path

import numpy as np

from .cardvalue import FOLDS, bootstrap, cross_validate, fit_logistic, read_episodes
from .classes import exact_character

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


def extract_excluded(episodes: list[dict], character: str) -> list[dict]:
    """Games that did not finish cleanly (a simulator error, a timeout) and still say which relic they took.

    They are not part of the fit and are never read as losses; they are counted against the relic they took, so that a relic
    whose games end in the simulator's known defects (G6, G7, G9) more often than the others can be seen instead of silently
    thinning that relic's sample.
    """
    out = []
    for ep in episodes:
        if ep.get("outcome") in ("death", "win"):
            continue
        neow = (ep.get("extra") or {}).get("neow")
        if not neow:
            continue
        out.append({"character": character, "seed": int(ep["seed"]), "taken": neow["taken"], "outcome": ep.get("outcome")})
    return out


def binomial_upper_tail(k: int, n: int, p: float) -> float:
    """P(X >= k) for X ~ Binomial(n, p), exact."""
    if k <= 0:
        return 1.0
    return min(1.0, sum(comb(n, j) * p**j * (1 - p) ** (n - j) for j in range(k, n + 1)))


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
    # the group is the seed: the offer and the relic taken are functions of it, so the games of one seed (one per class) move
    # together in the cross-validation folds and in the bootstrap (ADR-049)
    index = {s: k for k, s in enumerate(sorted({r["seed"] for r in records}))}
    g = np.array([index[r["seed"]] for r in records], dtype=np.int64)
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


def build_report(
    records: list[dict], *, excluded: list[dict] | None = None, bootstrap_draws: int = 200, seed: int = 0, min_taken: int = 30
) -> dict:
    excluded = excluded or []
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
    ex_by_taken: dict[str, int] = {}
    for e in excluded:
        ex_by_taken[e["taken"]] = ex_by_taken.get(e["taken"], 0) + 1
    games_all = len(records) + len(excluded)
    overall_ex = len(excluded) / games_all if games_all else 0.0
    n_relics = max(1, sum(1 for nme in names if nme.startswith("relic:")))
    relics = []
    for j, name in enumerate(names):
        if not name.startswith("relic:"):
            continue
        label = name[6:]
        took, left = by_taken.get(label, []), other.get(label, [])
        n_ex = ex_by_taken.get(label, 0)
        n_all = len(took) + n_ex
        ex_p = binomial_upper_tail(n_ex, n_all, overall_ex) if n_all and overall_ex > 0 else 1.0
        relics.append({
            "label": label,
            "kind": "cursed" if label in cursed else "positive",
            "beta": round(float(beta[j]), 4),
            "ci95": [round(float(lo[j]), 4), round(float(hi[j]), 4)],
            "taken": len(took),
            "offered": vocab["offered"].get(label, 0),
            "pass_rate_taken": round(sum(took) / len(took), 4) if took else None,
            "pass_rate_offered_not_taken": round(sum(left) / len(left), 4) if left else None,
            "excluded": n_ex,
            "exclusion_p": round(ex_p, 6),
            # one-sided exact binomial against the overall exclusion rate, Bonferroni over the relics reported
            "exclusion_flag": bool(ex_p < 0.05 / n_relics),
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
        "excluded_games": len(excluded),
        "excluded_by_outcome": {o: sum(1 for e in excluded if e["outcome"] == o) for o in sorted({e["outcome"] for e in excluded})},
        "pass_rate": round(float(y.mean()), 4),
        "classes": per_class,
        "model": {"l2": l2, "folds": FOLDS, "cross_validation": cv, "bootstrap_draws": bootstrap_draws, "min_taken": min_taken,
                  "features": len(names), "resampling_unit": "seed (the games of one seed in every class move together)",
                  "seeds": int(len(np.unique(g)))},
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
    excluded: list[dict] = []
    manifests = []
    cohorts = set()
    for d in dirs:
        mf = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
        if mf["policy"]["name"] != "rules_v2_neow" or mf["policy"]["params"].get("neow_explore", 1.0) != 1.0:
            raise SystemExit(f"{d.name}: only fully randomised rules_v2_neow batches identify the effect of a relic")
        # the class must be one of the simulator's exact ids and the batch must have been played by a harness that checked every
        # game's start against the class (ADR-049): the first version of this study was fitted on batches that were not
        character = exact_character(mf["config"]["character"])
        if mf.get("class_start_verified") is not True:
            raise SystemExit(f"{d.name}: not played with the per-game class check (class_start_verified), so it cannot be fitted")
        cohorts.add((mf["config"]["ascension"], mf["config"]["profile"]))
        episodes = read_episodes(d)
        records.extend(extract(episodes, character.lower()))
        excluded.extend(extract_excluded(episodes, character.lower()))
        manifests.append({"batch_id": mf["batch_id"], "character": character, "content_sha256": mf["content_sha256"],
                          "policy": mf["policy"], "known_simulator_gaps": [gp["id"] for gp in mf.get("known_simulator_gaps", [])]})
    if len(cohorts) != 1:
        raise SystemExit(f"batches must share one (ascension, profile); got {sorted(cohorts)}")
    ascension, profile = next(iter(cohorts))
    report = build_report(records, excluded=excluded, bootstrap_draws=args.bootstrap, min_taken=args.min_taken)
    report["ascension"], report["profile"] = ascension, profile
    report["batches"] = manifests
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out}: {report['games']} games, pass rate {report['pass_rate']}, best l2 {report['model']['l2']}")
    print(f"  excluded (never counted as losses): {report['excluded_games']} {report['excluded_by_outcome']}")
    for r in report["relics"]:
        if r["exclusion_flag"]:
            print(f"  WARNING {r['label']}: {r['excluded']} excluded games against {r['taken']} analysed (p = {r['exclusion_p']})")
    for r in report["relics"][:5] + report["relics"][-5:]:
        print(f"  {r['label']:24s} {r['kind']:8s} beta {r['beta']:+.3f}  ci95 [{r['ci95'][0]:+.3f}, {r['ci95'][1]:+.3f}]  taken={r['taken']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
