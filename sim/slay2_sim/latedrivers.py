"""What the deck and the run look like at the Act-1 boss and at the Act-2 boss, and what moves the odds of getting past each (exploratory).

The card values of ``cardvalue.py`` are measured at one finish line, the Act-1 boss. A run that dies in the second act has passed
that line and still lost, and the tuning study of ADR-036 showed a policy that gets past the first boss *less* often getting past the
second *more* often (taking only cards worth 0.2 or more: 52 % against 65 % past the Act-1 boss, 8.6 % against 4.4 % past the Act-2
boss, 499 development games). This module asks the question with the data that exists: every run of the randomised-drafting
batches records the deck, the HP, the potions, the relics and the gold it brought to each boss fight (``extra.boss_fights``), so the
same run can be read at both lines.

For each boss fight that a completed run reached, ``passed`` is the run's final floor beyond the boss floor (or a win), the
definition of ``cardvalue.extract``. A logistic regression with one term per feature and one per class (Ironclad is the
reference) is fitted to the Act-1 boss fights and to the Act-2 boss fights, and the interval of every coefficient, and of the
difference between the two lines, comes from resampling whole runs (the same resampled runs for both lines, so the difference
carries the correlation between them).

What this is not: a test (nothing here was registered, and the pilot's smith, shop and removal choices are rules, not chance, so only
the card picks are randomised: 60 % of them, ``rules_explore_v3``); a statement about the live game (the simulator is unverified); or
a statement about runs that never reach the second boss (the sample is the runs that got there, which is also what the question is
about). It is a measured, reproducible description of where the two lines differ.

    python -m slay2_sim.latedrivers --batches experiments/cardvalue/explore4-*-a0-keeprelics-dev-o5000-n5000 --out experiments/insights/late-drivers.json
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np

SCHEMA = 1
DRAWS = 400
BOOTSTRAP_SEED = 20261030
RIDGE = 1e-3
CLASSES = ("Ironclad", "Silent", "Regent", "Necrobinder", "Defect")

# (id, label, the unit the odds ratio is per, divisor applied to the raw value so that one unit of the model is this unit)
FEATURES: tuple[tuple[str, str, str, float], ...] = (
    ("attacks", "Attack cards", "per extra card", 1.0),
    ("skills", "Skill cards", "per extra card", 1.0),
    ("powers", "Power cards", "per extra card", 1.0),
    ("other", "Curses, statuses and quest cards", "per extra card", 1.0),
    ("starters", "Starting cards still in the deck (Strikes, Defends and the class's other basics)", "per extra card", 1.0),
    ("upgraded", "Upgraded cards", "per extra upgraded card", 1.0),
    ("hp", "HP when the boss fight starts", "per ten percentage points of the maximum", 0.1),
    ("max_hp", "Maximum HP", "per ten more", 10.0),
    ("potions", "Potions held", "per extra potion", 1.0),
    ("relics", "Relics held", "per extra relic", 1.0),
    ("gold", "Gold unspent", "per hundred more", 100.0),
)
FEATURE_IDS = tuple(f[0] for f in FEATURES)


# ---------------------------------------------------------------------------------------------- data
def read_episodes(batch_dir: Path) -> list[dict]:
    packed, plain = batch_dir / "episodes.jsonl.gz", batch_dir / "episodes.jsonl"
    if packed.exists():
        with gzip.open(packed, "rt", encoding="utf-8") as fh:
            return [json.loads(line) for line in fh if line.strip()]
    return [json.loads(line) for line in plain.read_text(encoding="utf-8").splitlines() if line.strip()]


def card_table(path: Path) -> dict[str, tuple[str, str]]:
    """Card id -> (type, rarity) from the facts-only catalog."""
    cards = json.loads(path.read_text(encoding="utf-8"))["cards"]
    return {c["id"]: (c["type"], c["rarity"]) for c in cards}


def deck_features(deck: dict[str, int], table: dict[str, tuple[str, str]]) -> dict[str, float]:
    out = dict.fromkeys(("attacks", "skills", "powers", "other", "starters", "upgraded"), 0.0)
    for key, n in deck.items():
        upgraded = key.endswith("+")
        base = key[:-1] if upgraded else key
        kind, rarity = table.get(base, ("other", "other"))
        slot = {"attack": "attacks", "skill": "skills", "power": "powers"}.get(kind, "other")
        out[slot] += n
        if rarity == "basic":
            out["starters"] += n
        if upgraded:
            out["upgraded"] += n
    return out


def boss_floors(batches: list[Path]) -> list[int]:
    """The floor of the boss fight of acts 1, 2 and 3 (index = act), as the runs themselves record it.

    A run that dies on a boss floor died in that boss fight, so the insights page counts those deaths with these numbers. Every
    boss-fight record of an act has to name one floor; an act with no record, or with two floors, is an error and not a guess.
    """
    seen: dict[int, set[int]] = {0: set(), 1: set(), 2: set()}
    for batch in batches:
        for ep in read_episodes(batch):
            for f in (ep.get("extra") or {}).get("boss_fights") or []:
                if int(f["act"]) in seen:
                    seen[int(f["act"])].add(int(f["floor"]))
    out = []
    for act in (0, 1, 2):
        if len(seen[act]) != 1:
            raise ValueError(f"act {act + 1}: the boss fights name {sorted(seen[act]) or 'no floor'}, not exactly one")
        out.append(next(iter(seen[act])))
    if not out[0] < out[1] < out[2]:
        raise ValueError(f"the boss floors {out} are not increasing")
    return out


def runs(batches: list[Path], table: dict[str, tuple[str, str]]) -> list[dict]:
    """One record per completed run that reached at least the Act-1 boss: its class and, per boss line (0 and 1), the features and the outcome."""
    out = []
    for batch in batches:
        for ep in read_episodes(batch):
            if ep.get("outcome") not in ("death", "win"):
                continue
            rec = {"seed": int(ep["seed"]), "batch": batch.name, "character": ep["character"], "lines": {}}
            for f in (ep.get("extra") or {}).get("boss_fights") or []:
                act = int(f["act"])
                if act not in (0, 1) or act in rec["lines"]:
                    continue
                feats = deck_features(f["deck"], table)
                feats.update(hp=f["hp"] / max(1, f["max_hp"]), max_hp=float(f["max_hp"]), potions=float(f["potions"]), relics=float(len(f["relics"])), gold=float(f["gold"]))
                rec["lines"][act] = {"x": feats, "passed": int(ep["outcome"] == "win" or ep["floor"] > f["floor"])}
            if 0 in rec["lines"]:
                out.append(rec)
    return out


# ---------------------------------------------------------------------------------------------- model
def design(records: list[dict], line: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """X (class terms, then the features, with the intercept first), y, and the index of the run each row belongs to."""
    rows, ys, idx = [], [], []
    for i, r in enumerate(records):
        entry = r["lines"].get(line)
        if entry is None:
            continue
        row = [1.0] + [1.0 if r["character"] == c else 0.0 for c in CLASSES[1:]]
        row += [entry["x"][fid] / div for fid, _, _, div in FEATURES]
        rows.append(row)
        ys.append(entry["passed"])
        idx.append(i)
    return np.asarray(rows), np.asarray(ys, dtype=float), np.asarray(idx, dtype=np.int64)


def fit_logistic(X: np.ndarray, y: np.ndarray, w: np.ndarray, ridge: float = RIDGE, iters: int = 60) -> np.ndarray:
    """Weighted logistic regression by Newton steps; a tiny ridge on everything but the intercept keeps a class with no passes finite."""
    lam = np.full(X.shape[1], ridge)
    lam[0] = 0.0
    beta = np.zeros(X.shape[1])
    prev = -np.inf
    for _ in range(iters):
        z = np.clip(X @ beta, -30, 30)
        p = 1.0 / (1.0 + np.exp(-z))
        ll = float(np.sum(w * (y * np.log(p + 1e-12) + (1 - y) * np.log(1 - p + 1e-12))) - 0.5 * np.sum(lam * beta * beta))
        grad = X.T @ (w * (y - p)) - lam * beta
        hess = (X * (w * p * (1 - p))[:, None]).T @ X + np.diag(lam)
        beta = beta + np.linalg.solve(hess, grad)
        if abs(ll - prev) < 1e-9 * (1 + abs(ll)):
            break
        prev = ll
    return beta


def interval(draws: np.ndarray) -> list[float]:
    lo, hi = np.quantile(draws, [0.025, 0.975])
    return [float(lo), float(hi)]


def analyse(records: list[dict], draws: int = DRAWS, seed: int = BOOTSTRAP_SEED, per_class: bool = True) -> dict:
    """The coefficients at both lines, their difference, and the intervals from resampling whole runs."""
    X0, y0, i0 = design(records, 0)
    X1, y1, i1 = design(records, 1)
    n = len(records)
    ones0, ones1 = np.ones(len(y0)), np.ones(len(y1))
    b0, b1 = fit_logistic(X0, y0, ones0), fit_logistic(X1, y1, ones1)
    rng = np.random.default_rng(seed)
    d0, d1 = np.empty((draws, X0.shape[1])), np.empty((draws, X1.shape[1]))
    for k in range(draws):
        counts = np.bincount(rng.integers(0, n, size=n), minlength=n).astype(float)
        d0[k] = fit_logistic(X0, y0, counts[i0])
        d1[k] = fit_logistic(X1, y1, counts[i1])
    offset = 1 + len(CLASSES) - 1
    feats = []
    for j, (fid, label, unit, _) in enumerate(FEATURES):
        c = offset + j
        feats.append(
            {
                "id": fid,
                "label": label,
                "unit": unit,
                "act1": {"beta": float(b0[c]), "ci95": interval(d0[:, c]), "oddsRatio": float(np.exp(b0[c])), "oddsRatioCi95": [float(np.exp(v)) for v in interval(d0[:, c])]},
                "act2": {"beta": float(b1[c]), "ci95": interval(d1[:, c]), "oddsRatio": float(np.exp(b1[c])), "oddsRatioCi95": [float(np.exp(v)) for v in interval(d1[:, c])]},
                "difference": {"beta": float(b1[c] - b0[c]), "ci95": interval(d1[:, c] - d0[:, c])},
            }
        )
    out = {
        "endpoints": {
            "act1": {"runs": int(len(y0)), "passed": int(y0.sum()), "rate": float(y0.mean())},
            "act2": {"runs": int(len(y1)), "passed": int(y1.sum()), "rate": float(y1.mean())},
        },
        "features": feats,
        "classes": {c: _class_counts(records, c) for c in CLASSES},
        "bootstrap": {"draws": draws, "seed": seed, "unit": "run", "ridge": RIDGE},
    }
    if per_class:
        out["perClass"] = {c: _per_class(records, c) for c in CLASSES}
    return out


def _class_counts(records: list[dict], cls: str) -> dict:
    mine = [r for r in records if r["character"] == cls]
    two = [r for r in mine if 1 in r["lines"]]
    return {
        "runs": len(mine),
        "reachedAct1Boss": len(mine),
        "passedAct1Boss": sum(r["lines"][0]["passed"] for r in mine),
        "reachedAct2Boss": len(two),
        "passedAct2Boss": sum(r["lines"][1]["passed"] for r in two),
    }


def _per_class(records: list[dict], cls: str, min_runs: int = 600) -> dict | None:
    """The same two fits for one class with no resampling (a sign check, not an estimate): only a class with enough Act-2 boss fights."""
    mine = [r for r in records if r["character"] == cls]
    if sum(1 for r in mine if 1 in r["lines"]) < min_runs:
        return None
    res = {}
    for line, key in ((0, "act1"), (1, "act2")):
        X, y, _ = design(mine, line)
        keep = [0] + [1 + len(CLASSES) - 1 + j for j in range(len(FEATURES))]
        beta = fit_logistic(X[:, keep], y, np.ones(len(y)))
        res[key] = {fid: float(beta[1 + j]) for j, fid in enumerate(FEATURE_IDS)}
    return res


# ---------------------------------------------------------------------------------------------- command line
def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def build(batches: list[Path], catalog: Path, draws: int = DRAWS) -> dict:
    table = card_table(catalog)
    records = runs(batches, table)
    body = analyse(records, draws=draws)
    manifests = []
    for b in batches:
        m = json.loads((b / "manifest.json").read_text(encoding="utf-8"))
        manifests.append({"batchId": b.name, "character": m["config"]["character"], "keepRelics": bool(m["config"].get("keep_relics")), "ascension": int(m["config"]["ascension"]),
                          "contentSha256": m.get("content_sha256"), "policy": m["policy"]["name"], "completed": int(m["summary"]["completed"])})
    return {
        "schema": SCHEMA,
        "kind": "late-drivers",
        "role": "exploratory",
        "definition": {
            "passed": "the run's final floor is beyond the boss floor, or the run was won (the definition of the card values)",
            "line0": "the Act-1 boss fight",
            "line1": "the Act-2 boss fight",
            "model": "logistic regression, one term per feature and one per class (Ironclad is the reference), a ridge of 1e-3 on everything but the intercept",
            "intervals": "95 % percentile intervals from resampling whole runs, the same resampled runs for both lines (the difference carries their correlation)",
            "cards": "types and rarity from packages/game-data/data/cards.sts2-main-0.107.1.json",
        },
        "catalogSha256": sha256_of(catalog),
        "bossFloors": boss_floors(batches),
        "batches": manifests,
        **body,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--batches", nargs="+", type=Path, required=True, help="randomised-drafting batch directories (episodes with extra.boss_fights)")
    ap.add_argument("--catalog", type=Path, default=Path("packages/game-data/data/cards.sts2-main-0.107.1.json"))
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--draws", type=int, default=DRAWS)
    args = ap.parse_args(argv)
    body = build(sorted(args.batches), args.catalog, args.draws)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(body, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    e = body["endpoints"]
    print(f"Act-1 boss: {e['act1']['passed']} of {e['act1']['runs']} passed; Act-2 boss: {e['act2']['passed']} of {e['act2']['runs']} passed")
    for f in body["features"]:
        a, b, d = f["act1"], f["act2"], f["difference"]
        print(f"  {f['id']:9s} Act-1 OR {a['oddsRatio']:.3f} ({a['oddsRatioCi95'][0]:.3f}-{a['oddsRatioCi95'][1]:.3f})  Act-2 OR {b['oddsRatio']:.3f} ({b['oddsRatioCi95'][0]:.3f}-{b['oddsRatioCi95'][1]:.3f})  difference {d['beta']:+.3f} ({d['ci95'][0]:+.3f} to {d['ci95'][1]:+.3f})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
