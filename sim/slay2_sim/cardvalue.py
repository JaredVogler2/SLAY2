"""Card values learned from randomised drafting (H8, ADR-031).

``rules_explore`` plays thousands of simulated runs whose card rewards are picked at random, and records the deck it
brings to the Act-1 boss. Because chance, not taste, decided which cards are in the deck, the *marginal* effect of a
card can be read from a regression: logit P(the run gets past the Act-1 boss) = intercept + boss + HP + potions +
upgrades + sum over cards of beta_card * copies. ``beta_card`` is the change in log-odds from one more copy (dilution
of the deck included), with a bootstrap interval that resamples whole game seeds.

What this is not: a statement about the real game (the simulator is unverified), about other pilots (the policy that
plays the cards is rules_v1; cards a better pilot would use well are undervalued), or about synergies (the model is
additive). It is a measured, reproducible prior that can be compared with the hand-written rating.

    python -m slay2_sim.cardvalue --batches scratch/h8/rep0 scratch/h8/rep1 --out experiments/cardvalue/ironclad-a0-v1.json
"""

from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

import numpy as np

SCHEMA = 1
L2_GRID = (0.3, 1.0, 3.0, 10.0, 30.0, 100.0)
FOLDS = 5


# ---------------------------------------------------------------------------------------------- data
def read_episodes(batch_dir: Path) -> list[dict]:
    plain, packed = batch_dir / "episodes.jsonl", batch_dir / "episodes.jsonl.gz"
    if plain.exists():
        lines = plain.read_text(encoding="utf-8").splitlines()
    elif packed.exists():
        with gzip.open(packed, "rt", encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    else:
        raise FileNotFoundError(f"no episodes in {batch_dir}")
    return [json.loads(line) for line in lines if line.strip()]


def extract(episodes: list[dict]) -> list[dict]:
    """One record per run that reached the Act-1 boss: the deck it brought and whether it got past the boss.

    Passing means the run's final floor is beyond the boss floor (a run that dies in the boss fight ends on that
    floor); the record is skipped when the episode did not finish cleanly, so errors are never read as losses."""
    out = []
    for ep in episodes:
        if ep.get("outcome") not in ("death", "win"):
            continue
        fights = (ep.get("extra") or {}).get("boss_fights") or []
        if not fights or fights[0].get("act") != 0:
            continue
        f = fights[0]
        deck: dict[str, int] = {}
        upgraded = 0
        for key, n in f["deck"].items():
            base = key[:-1] if key.endswith("+") else key
            deck[base] = deck.get(base, 0) + int(n)
            if key.endswith("+"):
                upgraded += int(n)
        out.append({
            "seed": int(ep["seed"]), "boss": "+".join(f["boss"]), "hp_frac": f["hp"] / max(1, f["max_hp"]), "max_hp": f["max_hp"],
            "potions": f["potions"], "relics": f["relics"], "deck": deck, "upgraded": upgraded,
            "passed": int(ep["outcome"] == "win" or ep["floor"] > f["floor"]),
        })
    return out


def vocabulary(records: list[dict], min_games: int = 30, min_relic_share: float = 0.02) -> dict:
    """Cards seen in at least ``min_games`` decks, bosses, and relics common enough to adjust for."""
    cards: dict[str, int] = {}
    relics: dict[str, int] = {}
    bosses: dict[str, int] = {}
    for r in records:
        for c in r["deck"]:
            cards[c] = cards.get(c, 0) + 1
        for x in set(r["relics"]):
            relics[x] = relics.get(x, 0) + 1
        bosses[r["boss"]] = bosses.get(r["boss"], 0) + 1
    n = max(1, len(records))
    return {
        "cards": sorted(c for c, k in cards.items() if k >= min_games),
        # a relic every run holds (the starting relic) is the intercept in disguise: leave it out
        "relics": sorted(x for x, k in relics.items() if min_relic_share <= k / n <= 0.999 and x != "BURNING_BLOOD"),
        "bosses": sorted(bosses),
        "exposure": cards,
    }


def design(records: list[dict], vocab: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str], np.ndarray]:
    """X, y, groups, feature names, and the penalised-feature mask (cards only)."""
    cards, relics, bosses = vocab["cards"], vocab["relics"], vocab["bosses"][1:]  # first boss is the reference level
    names = ["intercept", "hp_frac", "max_hp_per_100", "potions", "upgraded"] + [f"boss:{b}" for b in bosses] + \
            [f"relic:{x}" for x in relics] + [f"card:{c}" for c in cards]
    ci = {c: 5 + len(bosses) + len(relics) + k for k, c in enumerate(cards)}
    ri = {x: 5 + len(bosses) + k for k, x in enumerate(relics)}
    bi = {b: 5 + k for k, b in enumerate(bosses)}
    X = np.zeros((len(records), len(names)))
    y = np.zeros(len(records))
    g = np.zeros(len(records), dtype=np.int64)
    for i, r in enumerate(records):
        X[i, 0] = 1.0
        X[i, 1] = r["hp_frac"]
        X[i, 2] = r["max_hp"] / 100.0
        X[i, 3] = r["potions"]
        X[i, 4] = r["upgraded"]
        if r["boss"] in bi:
            X[i, bi[r["boss"]]] = 1.0
        for x in r["relics"]:
            if x in ri:
                X[i, ri[x]] = 1.0
        for c, n in r["deck"].items():
            if c in ci:
                X[i, ci[c]] = n
        y[i] = r["passed"]
        g[i] = r["seed"]
    penalised = np.zeros(len(names), dtype=bool)
    penalised[[ci[c] for c in cards]] = True
    return X, y, g, names, penalised


# ---------------------------------------------------------------------------------------------- model
def fit_logistic(X: np.ndarray, y: np.ndarray, l2: float, penalised: np.ndarray, iters: int = 40, tol: float = 1e-8) -> np.ndarray:
    """Ridge-penalised logistic regression by Newton steps (penalty only on ``penalised`` columns; a tiny one elsewhere)."""
    lam = np.where(penalised, l2, 1e-6)
    beta = np.zeros(X.shape[1])
    prev = -np.inf
    for _ in range(iters):
        z = X @ beta
        p = 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))
        ll = float(np.sum(y * np.log(p + 1e-12) + (1 - y) * np.log(1 - p + 1e-12)) - 0.5 * np.sum(lam * beta * beta))
        grad = X.T @ (y - p) - lam * beta
        w = p * (1 - p)
        hess = (X * w[:, None]).T @ X + np.diag(lam)
        step = np.linalg.solve(hess, grad)
        beta = beta + step
        if abs(ll - prev) < tol * (1 + abs(ll)):
            break
        prev = ll
    return beta


def predict(X: np.ndarray, beta: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(X @ beta, -30, 30)))


def log_loss(y: np.ndarray, p: np.ndarray) -> float:
    return float(-np.mean(y * np.log(p + 1e-12) + (1 - y) * np.log(1 - p + 1e-12)))


def auc(y: np.ndarray, score: np.ndarray) -> float:
    """Rank-based AUC (ties get the average rank)."""
    order = np.argsort(score, kind="mergesort")
    ranks = np.empty(len(score))
    sorted_score = score[order]
    i = 0
    while i < len(score):
        j = i
        while j + 1 < len(score) and sorted_score[j + 1] == sorted_score[i]:
            j += 1
        ranks[order[i:j + 1]] = (i + j) / 2.0 + 1.0
        i = j + 1
    pos = y == 1
    n1, n0 = int(pos.sum()), int((~pos).sum())
    if n1 == 0 or n0 == 0:
        return float("nan")
    return float((ranks[pos].sum() - n1 * (n1 + 1) / 2.0) / (n1 * n0))


def cross_validate(X: np.ndarray, y: np.ndarray, g: np.ndarray, penalised: np.ndarray, l2_grid=L2_GRID, folds: int = FOLDS) -> dict:
    """Grouped K-fold (a game seed never appears on both sides): held-out log loss per penalty, plus the covariate-only baseline."""
    fold = g % folds
    base_cols = np.flatnonzero(~penalised)
    out = {"l2": {}, "baseline_log_loss": None}
    base_losses, base_n = 0.0, 0
    for k in range(folds):
        tr, te = fold != k, fold == k
        b0 = fit_logistic(X[tr][:, base_cols], y[tr], 0.0, np.zeros(len(base_cols), dtype=bool))
        base_losses += log_loss(y[te], predict(X[te][:, base_cols], b0)) * int(te.sum())
        base_n += int(te.sum())
    out["baseline_log_loss"] = base_losses / max(1, base_n)
    for l2 in l2_grid:
        total, n, scores, labels = 0.0, 0, [], []
        for k in range(folds):
            tr, te = fold != k, fold == k
            b = fit_logistic(X[tr], y[tr], l2, penalised)
            p = predict(X[te], b)
            total += log_loss(y[te], p) * int(te.sum())
            n += int(te.sum())
            scores.append(p)
            labels.append(y[te])
        out["l2"][str(l2)] = {"log_loss": total / max(1, n), "auc": auc(np.concatenate(labels), np.concatenate(scores))}
    out["best_l2"] = float(min(out["l2"], key=lambda k: out["l2"][k]["log_loss"]))
    return out


def bootstrap(X: np.ndarray, y: np.ndarray, g: np.ndarray, penalised: np.ndarray, l2: float, B: int, seed: int = 0) -> np.ndarray:
    """B refits on resamples of whole game seeds (rows of one seed move together). Returns B x p coefficients."""
    rng = np.random.default_rng(seed)
    seeds = np.unique(g)
    rows_of = {s: np.flatnonzero(g == s) for s in seeds}
    draws = []
    for _ in range(B):
        pick = rng.choice(seeds, size=len(seeds), replace=True)
        idx = np.concatenate([rows_of[s] for s in pick])
        draws.append(fit_logistic(X[idx], y[idx], l2, penalised))
    return np.asarray(draws)


# ---------------------------------------------------------------------------------------------- report
def spearman(a: list[float], b: list[float]) -> float:
    ra = np.argsort(np.argsort(a)).astype(float)
    rb = np.argsort(np.argsort(b)).astype(float)
    ra -= ra.mean()
    rb -= rb.mean()
    den = float(np.sqrt((ra * ra).sum() * (rb * rb).sum()))
    return float((ra * rb).sum() / den) if den else float("nan")


def build_report(records: list[dict], *, bootstrap_draws: int = 200, seed: int = 0, static: dict[str, float] | None = None) -> dict:
    vocab = vocabulary(records)
    X, y, g, names, penalised = design(records, vocab)
    cv = cross_validate(X, y, g, penalised)
    l2 = cv["best_l2"]
    beta = fit_logistic(X, y, l2, penalised)
    draws = bootstrap(X, y, g, penalised, l2, bootstrap_draws, seed)
    lo, hi = np.percentile(draws, [2.5, 97.5], axis=0)
    cards = []
    for j, name in enumerate(names):
        if not name.startswith("card:"):
            continue
        cid = name[5:]
        cards.append({
            "id": cid, "beta": round(float(beta[j]), 4), "ci95": [round(float(lo[j]), 4), round(float(hi[j]), 4)],
            "games_with_card": vocab["exposure"].get(cid, 0),
            **({"static_rating": round(static[cid], 3)} if static and cid in static else {}),
        })
    cards.sort(key=lambda c: -c["beta"])
    covariates = {n: round(float(beta[j]), 4) for j, n in enumerate(names) if not n.startswith("card:")}
    report = {
        "schema": SCHEMA, "kind": "card-values", "outcome": "the run gets past the Act-1 boss",
        "games": len({r["seed"] for r in records}), "boss_fights": len(records), "pass_rate": round(float(y.mean()), 4),
        "model": {"l2": l2, "folds": FOLDS, "cross_validation": cv, "bootstrap_draws": bootstrap_draws, "features": len(names)},
        "covariates": covariates, "cards": cards,
    }
    if static:
        both = [(c["beta"], c["static_rating"]) for c in cards if "static_rating" in c]
        if len(both) >= 5:
            report["spearman_with_static_rating"] = round(spearman([a for a, _ in both], [b for _, b in both]), 4)
    return report


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--batches", nargs="+", required=True, help="batch directories written by `slay2_sim run --policy rules_explore`")
    ap.add_argument("--out", required=True)
    ap.add_argument("--bootstrap", type=int, default=200)
    ap.add_argument("--no-static", action="store_true", help="skip the comparison with the hand-written rating (needs the simulator)")
    args = ap.parse_args(argv)
    out = Path(args.out).resolve()
    dirs = [Path(b).resolve() for b in args.batches]  # resolve before the simulator is activated
    records: list[dict] = []
    manifests = []
    cohorts = set()
    for d in dirs:
        records.extend(extract(read_episodes(d)))
        mf = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
        cohorts.add((mf["config"]["character"], mf["config"]["ascension"], mf["config"]["profile"]))
        manifests.append({"batch_id": mf["batch_id"], "content_sha256": mf["content_sha256"], "policy": mf["policy"],
                          "simulator": {k: mf["simulator"].get(k) for k in ("id", "head", "pinned") if k in mf["simulator"]},
                          "known_simulator_gaps": [gp["id"] for gp in mf.get("known_simulator_gaps", [])]})
    static = None
    if not args.no_static:
        from . import external

        external.activate(external.locate().root)
        from .knowledge import card_info, static_rating

        static = {c: static_rating(card_info(c, False)) for c in vocabulary(records)["cards"]}
    if len(cohorts) != 1:
        raise SystemExit(f"batches must share one cohort (character, ascension, profile); got {sorted(cohorts)}")
    character, ascension, profile = next(iter(cohorts))
    report = build_report(records, bootstrap_draws=args.bootstrap, static=static)
    report["character"], report["ascension"], report["profile"] = character, ascension, profile
    report["batches"] = manifests
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out}: {report['boss_fights']} boss fights, pass rate {report['pass_rate']}, best l2 {report['model']['l2']}")
    top, bottom = report["cards"][:5], report["cards"][-5:]
    for c in top + bottom:
        print(f"  {c['id']:28s} beta {c['beta']:+.3f}  ci95 [{c['ci95'][0]:+.3f}, {c['ci95'][1]:+.3f}]  n={c['games_with_card']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
