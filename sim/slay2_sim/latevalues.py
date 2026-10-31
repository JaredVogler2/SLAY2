"""Card values for getting past the Act-2 boss, with the shown (Act-1) values as the prior (ADR-060).

The card values the site shows were measured at one finish line, the Act-1 boss (``cardvalue.py``). The exploratory reading of the second
boss (``latedrivers.py``) found that what a deck holds separates the runs that get past the Act-2 boss much less than it separates the
runs that get past the first. So the question is whether *which* cards help at the second boss is different from which help at the first,
and whether a pilot that takes the cards of the second ranking does better there. This module asks the first half with the data that exist:
the randomised-drafting runs with the relics kept, which record the deck, HP, potions and relics each run brought to each boss.

Only a few thousand runs reach the Act-2 boss, and a class that rarely does has too few to say anything about a hundred cards. So the fit is
not "values from scratch": the values the site shows are the prior, and the data are asked for two things only,

    logit P(the run gets past the Act-2 boss) = covariates + kappa * S + sum over cards of delta_c * copies_c,
    S = the sum over the deck of the card's shown value,    value_c(Act 2) = kappa * shown_c + delta_c,

where ``kappa`` (not penalised, kept at 0 or more: a negative estimate is set to 0) scales the shown ranking and
``delta_c`` is what is left for one card (ridge-penalised, the penalty chosen by 5-fold cross-validation grouped by game seed). The
covariates are those of ``cardvalue.design`` (HP share, maximum HP, potions, upgraded cards, the boss, the relics held). A class whose
cross-validation does not find that the card-specific part predicts held-out Act-2 boss fights better than the scale alone (``GATE`` nats per
boss fight) keeps its shown values: ``fitted`` is false and every ``beta`` is the shown one. ``scaleOnly`` is the scale of the shown
ranking when nothing card-specific is allowed (the cross-validation's baseline model), with a bootstrap interval over game seeds: it is the
figure to read as "how much of the shown ranking carries over", because the joint ``kappa`` can be absorbed by the deviations when the
penalty is weak (the values, ``kappa * shown + delta``, do not depend on how the two share it).

What this is not: a test of anything (the pilot that follows the values is tested on held-out seeds, ADR-060); a statement about the live
game (the simulator is unverified); about other pilots; about synergies (the model is additive); or about causes (only the card picks were
randomised, 60 % of them, and who reaches the second boss depends on the pilot's other choices).

    python -m slay2_sim.latevalues --shown experiments/cardvalue/ironclad-a0-v2.json \\
        --batches experiments/cardvalue/explore4-ironclad-a0-keeprelics-dev-o5000-n5000 --out experiments/cardvalue/ironclad-a0-act2-v1.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np

from . import cardvalue as cv

SCHEMA = 1
L2_GRID = (1.0, 3.0, 10.0, 30.0, 100.0, 300.0, 1000.0)
GATE = 0.002        # nats per boss fight: the best penalty has to beat the scale-only model by this much, held out
DRAWS = 200
BOOTSTRAP_SEED = 20261031
MIN_FIGHTS = 100    # fewer Act-2 boss fights than this, or fewer passes or fails than MIN_OUTCOMES, and nothing is fitted (the gate is not even asked)
MIN_OUTCOMES = 30
ACT = 1             # the Act-2 boss, as the runs number their acts


def prior_score(records: list[dict], shown: dict[str, float]) -> np.ndarray:
    """The sum over each deck of the shown values of its cards (a card the shown file does not know counts 0)."""
    return np.asarray([sum(shown.get(c, 0.0) * n for c, n in r["deck"].items()) for r in records], dtype=float)


def design(records: list[dict], vocab: dict, shown: dict[str, float]) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str], np.ndarray]:
    """``cardvalue.design`` with the prior score as one more, unpenalised, column placed just before the cards."""
    X, y, g, names, penalised = cv.design(records, vocab)
    at = names.index(f"card:{vocab['cards'][0]}") if vocab["cards"] else len(names)
    X = np.insert(X, at, prior_score(records, shown), axis=1)
    names = names[:at] + ["prior"] + names[at:]
    penalised = np.insert(penalised, at, False)
    return X, y, g, names, penalised


def fit_records(
    records: list[dict], shown: dict[str, float], *, l2_grid: tuple[float, ...] = L2_GRID, gate: float = GATE, draws: int = DRAWS,
    seed: int = BOOTSTRAP_SEED, min_fights: int = MIN_FIGHTS, min_outcomes: int = MIN_OUTCOMES,
) -> dict:
    """The fit for one class: kappa, the deviations, the cross-validation, the gate, and the value of every card (``cards``)."""
    vocab = cv.vocabulary(records)
    shown_cards = sorted(shown)
    out: dict = {
        "boss_fights": len(records),
        "passed": int(sum(r["passed"] for r in records)),
        "gate": {"required": gate, "grid": list(l2_grid), "minFights": min_fights, "minOutcomes": min_outcomes},
    }
    passes = out["passed"]
    if len(records) < min_fights or not vocab["cards"] or min(passes, len(records) - passes) < min_outcomes:
        out.update(
            fitted=False, kappa=None, cards=_shown_cards(shown_cards, shown, {}),
            reason=f"fewer than {min_fights} Act-2 boss fights, or fewer than {min_outcomes} runs that passed or that did not: nothing fitted, the shown values are kept",
        )
        out["gate"].update(passed=False, bestL2=None, gain=None)
        return out
    X, y, g, names, penalised = design(records, vocab, shown)
    cross = cv.cross_validate(X, y, g, penalised, l2_grid=l2_grid)
    best = float(cross["best_l2"])
    baseline = float(cross["baseline_log_loss"])
    gain = baseline - float(cross["l2"][str(best)]["log_loss"])
    passed = bool(gain >= gate)
    out["crossValidation"] = {"folds": cv.FOLDS, "baselineLogLoss": baseline, "byPenalty": cross["l2"], "bestL2": best, "gain": gain}
    out["gate"].update(passed=passed, bestL2=best, gain=gain)
    j_prior = names.index("prior")
    beta = cv.fit_logistic(X, y, best, penalised)
    clipped = bool(beta[j_prior] < 0)
    if clipped:  # a negative scale would turn the shown ranking upside down: drop the term and fit the deviations alone
        keep = [j for j in range(len(names)) if j != j_prior]
        sub = cv.fit_logistic(X[:, keep], y, best, penalised[keep])
        beta = np.insert(sub, j_prior, 0.0)
    draws_b = cv.bootstrap(X, y, g, penalised, best, draws, seed) if draws else np.empty((0, len(names)))
    if clipped and draws:
        draws_b[:, j_prior] = np.maximum(draws_b[:, j_prior], 0.0)
    kappa = float(beta[j_prior])
    kappa_ci = [float(v) for v in np.percentile(draws_b[:, j_prior], [2.5, 97.5])] if draws else None
    # the scale of the shown ranking when nothing card-specific is allowed (the cross-validation's baseline model): the number to read as
    # "how much of the shown ranking carries over"; the joint kappa above is not, because with a weak penalty the deviations can absorb it
    base = np.flatnonzero(~penalised)
    j0 = int(np.flatnonzero(base == j_prior)[0])
    off = np.zeros(len(base), dtype=bool)
    scale = float(cv.fit_logistic(X[:, base], y, 0.0, off)[j0])
    scale_ci = None
    if draws:
        scale_draws = cv.bootstrap(X[:, base], y, g, off, 0.0, draws, seed)[:, j0]
        scale_ci = [float(v) for v in np.percentile(scale_draws, [2.5, 97.5])]
    delta: dict[str, dict] = {}
    for j, name in enumerate(names):
        if name.startswith("card:"):
            cid = name[5:]
            row = {"delta": float(beta[j]), "games_with_card": int(vocab["exposure"].get(cid, 0))}
            if draws:
                lo, hi = np.percentile(draws_b[:, j], [2.5, 97.5])
                row["delta_ci95"] = [float(lo), float(hi)]
            delta[cid] = row
    out.update(
        fitted=passed, reason=None if passed else "the card-specific part does not predict held-out Act-2 boss fights better than the shown ranking's scale alone: the shown values are kept",
        kappa={"estimate": kappa, "ci95": kappa_ci, "clippedAtZero": clipped},
        scaleOnly={"estimate": scale, "ci95": scale_ci},
        covariates={n: float(beta[j]) for j, n in enumerate(names) if not n.startswith("card:")},
        l2=best, bootstrap={"draws": draws, "seed": seed, "unit": "game seed"},
        cards=_values(shown_cards, shown, delta, kappa) if passed else _shown_cards(shown_cards, shown, delta),
        deviationsKept=bool(passed),
    )
    return out


def _shown_cards(ids: list[str], shown: dict[str, float], delta: dict[str, dict]) -> list[dict]:
    """Every card of the shown file with its shown value (the class keeps the shown ranking); the fitted deviations, if any, are listed for reading."""
    rows = []
    for cid in ids:
        row = {"id": cid, "beta": round(shown[cid], 4), "shown_beta": round(shown[cid], 4)}
        if cid in delta:
            row.update(delta=round(delta[cid]["delta"], 4), games_with_card=delta[cid]["games_with_card"])
            if "delta_ci95" in delta[cid]:
                row["delta_ci95"] = [round(v, 4) for v in delta[cid]["delta_ci95"]]
        rows.append(row)
    return sorted(rows, key=lambda r: (-r["beta"], r["id"]))


def _values(ids: list[str], shown: dict[str, float], delta: dict[str, dict], kappa: float) -> list[dict]:
    """value_c = kappa * shown_c + delta_c; a card the data cannot speak for (too few decks) keeps kappa * shown_c."""
    rows = []
    for cid in sorted(set(ids) | set(delta)):
        s = shown.get(cid, 0.0)
        d = delta.get(cid)
        row = {"id": cid, "beta": round(kappa * s + (d["delta"] if d else 0.0), 4), "shown_beta": round(s, 4), "games_with_card": d["games_with_card"] if d else 0}
        if d:
            row.update(delta=round(d["delta"], 4))
            if "delta_ci95" in d:
                row["delta_ci95"] = [round(v, 4) for v in d["delta_ci95"]]
        rows.append(row)
    return sorted(rows, key=lambda r: (-r["beta"], r["id"]))


# ---------------------------------------------------------------------------------------------- files
def sha256_of(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def build(shown_path: Path, batches: list[Path], *, draws: int = DRAWS, seed: int = BOOTSTRAP_SEED) -> dict:
    shown_file = json.loads(Path(shown_path).read_text(encoding="utf-8"))
    if shown_file.get("kind") != "card-values":
        raise ValueError(f"{shown_path} is not a card-values file")
    shown = {c["id"]: float(c["beta"]) for c in shown_file["cards"]}
    records: list[dict] = []
    manifests = []
    cohorts = set()
    for d in batches:
        d = Path(d)
        records.extend(cv.extract(cv.read_episodes(d), act=ACT))
        mf = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
        cohorts.add((mf["config"]["character"], mf["config"]["ascension"], mf["config"]["profile"], bool(mf["config"].get("keep_relics"))))
        manifests.append({"batch_id": mf["batch_id"], "content_sha256": mf["content_sha256"], "policy": mf["policy"]["name"], "keep_relics": bool(mf["config"].get("keep_relics"))})
    if len(cohorts) != 1:
        raise SystemExit(f"batches must share one cohort (character, ascension, profile, relics kept); got {sorted(cohorts)}")
    character, ascension, profile, keep = next(iter(cohorts))
    declared = shown_file.get("character")
    if declared and declared != character:
        raise SystemExit(f"the shown values are for {declared}, the batches are {character}")
    body = fit_records(records, shown, draws=draws, seed=seed)
    return _json_safe({
        "schema": SCHEMA, "kind": "card-values", "outcome": "the run gets past the Act-2 boss", "act": 2,
        "character": character, "ascension": ascension, "profile": profile, "keepRelics": keep,
        "prior": {"file": str(shown_path), "sha256": sha256_of(shown_path)},
        "games": len({r["seed"] for r in records}), "pass_rate": round(body["passed"] / max(1, body["boss_fights"]), 4),
        "batches": manifests,
        **body,
    })


def _json_safe(x):
    """NaN and infinity are not JSON (a held-out fold with one outcome has no AUC): they become null."""
    if isinstance(x, float) and not math.isfinite(x):
        return None
    if isinstance(x, dict):
        return {k: _json_safe(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_json_safe(v) for v in x]
    return x


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--shown", type=Path, required=True, help="the card-values file the site shows for the class (the prior)")
    ap.add_argument("--batches", nargs="+", type=Path, required=True, help="randomised-drafting batches with extra.boss_fights (the relics kept)")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--draws", type=int, default=DRAWS)
    args = ap.parse_args(argv)
    body = build(args.shown, [p.resolve() for p in args.batches], draws=args.draws)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(body, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    g = body["gate"]
    k = body["kappa"]
    print(
        f"{body['character']}: {body['boss_fights']} Act-2 boss fights ({body['passed']} passed); "
        + (f"gain {g['gain']:+.5f} nats at penalty {g['bestL2']} (gate {g['required']}): {'FITTED' if body['fitted'] else 'shown values kept'}"
           + (f"; kappa {k['estimate']:.3f}" if k else "") if g.get("gain") is not None else body["reason"])
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
