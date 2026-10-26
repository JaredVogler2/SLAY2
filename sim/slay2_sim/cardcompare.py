"""Do two sets of card values agree? (ADR-046)

A descriptive comparison of two fitted value files, not a test, with a reference for how much two measurements of the
*same* pilot differ by chance:

* the Spearman correlation of the two sets of coefficients over the cards measured in both;
* how many of the ``k`` best and ``k`` worst cards of one are among the ``k`` best and ``k`` worst of the other;
* how many cards have disjoint 95 % intervals (about one card in a hundred would under no change at all);
* **noise reference**: the second set's games split by the parity of the game seed, each half fitted exactly like the full
  data (no bootstrap: only the point estimates are compared), the Spearman correlation of the two halves, corrected to the
  full number of games as 2r / (1 + r) (Spearman-Brown). A correlation between the two value files near that figure says
  the two pilots value the cards alike; one clearly below it says the pilot matters.

    python -m slay2_sim.cardcompare --a experiments/cardvalue/ironclad-a0-v1.json --b experiments/cardvalue/ironclad-a0-v2.json \
        --batches-b experiments/cardvalue/explore3-ironclad-a0-dev-o5000-n5000 --out experiments/cardvalue/compare-ironclad-v1-v2.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from . import external
from .cardvalue import (
    cross_validate,
    design,
    extract,
    fit_logistic,
    read_episodes,
    spearman,
    vocabulary,
)

SCHEMA = 1
K = 10


def _ranks_overlap(a: dict[str, float], b: dict[str, float], k: int) -> tuple[int, int]:
    """Of the k highest and the k lowest coefficients of ``a``, how many are also among those of ``b``."""
    ids = sorted(set(a) & set(b))
    k = min(k, len(ids))
    best_a = set(sorted(ids, key=lambda i: (-a[i], i))[:k])
    best_b = set(sorted(ids, key=lambda i: (-b[i], i))[:k])
    worst_a = set(sorted(ids, key=lambda i: (a[i], i))[:k])
    worst_b = set(sorted(ids, key=lambda i: (b[i], i))[:k])
    return len(best_a & best_b), len(worst_a & worst_b)


def compare_betas(a: dict[str, float], b: dict[str, float], k: int = K) -> dict:
    ids = sorted(set(a) & set(b))
    top, bottom = _ranks_overlap(a, b, k)
    return {
        "cards_in_both": len(ids),
        "spearman": spearman([a[i] for i in ids], [b[i] for i in ids]) if len(ids) >= 3 else None,
        "k": min(k, len(ids)),
        "best_k_in_both": top,
        "worst_k_in_both": bottom,
    }


def compare_reports(a: dict, b: dict, k: int = K) -> dict:
    """Two card-value reports (``cardvalue.build_report``): the statistics above, with the interval check."""
    ca = {c["id"]: c for c in a["cards"]}
    cb = {c["id"]: c for c in b["cards"]}
    out = compare_betas({i: c["beta"] for i, c in ca.items()}, {i: c["beta"] for i, c in cb.items()}, k)
    both = sorted(set(ca) & set(cb))
    out["disjoint_ci95"] = sum(
        1 for i in both if ca[i]["ci95"][1] < cb[i]["ci95"][0] or cb[i]["ci95"][1] < ca[i]["ci95"][0]
    )
    out["cards_only_in_a"] = sorted(set(ca) - set(cb))
    out["cards_only_in_b"] = sorted(set(cb) - set(ca))
    return out


def fit_betas(records: list[dict]) -> dict[str, float]:
    """The point estimates of ``cardvalue.build_report`` (same vocabulary, features, grouped five-fold choice of the
    penalty, one fit on all of the data), without the bootstrap."""
    vocab = vocabulary(records)
    X, y, g, names, penalised = design(records, vocab)
    l2 = cross_validate(X, y, g, penalised)["best_l2"]
    beta = fit_logistic(X, y, l2, penalised)
    return {n[5:]: float(beta[j]) for j, n in enumerate(names) if n.startswith("card:")}


def split_half(records: list[dict], k: int = K) -> dict:
    """Two measurements of the same pilot: the games with an even seed against the games with an odd seed."""
    halves = ([r for r in records if r["seed"] % 2 == 0], [r for r in records if r["seed"] % 2 == 1])
    comp = compare_betas(fit_betas(halves[0]), fit_betas(halves[1]), k)
    r = comp["spearman"]
    comp["games"] = [len({x["seed"] for x in h}) for h in halves]
    comp["spearman_brown"] = (2 * r / (1 + r)) if r is not None and r > -1 else None
    return comp


def _file_info(path: Path) -> dict:
    raw = path.read_bytes()
    report = json.loads(raw.decode("utf-8"))
    return {
        "file": str(path),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "games": report.get("games"),
        "boss_fights": report.get("boss_fights"),
        "pass_rate": report.get("pass_rate"),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--a", required=True, help="the first card-value file (the reference)")
    ap.add_argument("--b", required=True, help="the second card-value file")
    ap.add_argument("--batches-b", nargs="+", required=True, help="the exploration batches the second file was fitted from")
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    pa, pb, out = Path(args.a).resolve(), Path(args.b).resolve(), Path(args.out).resolve()
    a, b = json.loads(pa.read_text(encoding="utf-8")), json.loads(pb.read_text(encoding="utf-8"))
    records: list[dict] = []
    for d in args.batches_b:
        records.extend(extract(read_episodes(Path(d).resolve())))

    def rel(p: Path) -> str:
        return str(p.relative_to(external.REPO_ROOT)) if external.REPO_ROOT in p.parents else str(p)

    report = {
        "schema": SCHEMA,
        "kind": "card-value-comparison",
        "a": {**_file_info(pa), "file": rel(pa)},
        "b": {**_file_info(pb), "file": rel(pb)},
        "comparison": compare_reports(a, b),
        "noise_reference": {
            "definition": "the second file's games split by the parity of the game seed, each half fitted like the full data, "
            "Spearman correlation of the two halves and the same corrected to the full number of games as 2r/(1+r)",
            **split_half(records),
        },
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    c, n = report["comparison"], report["noise_reference"]

    def f(x: float | None) -> str:
        return "n/a" if x is None else f"{x:+.3f}"

    print(f"wrote {out}")
    print(f"  cards in both: {c['cards_in_both']}  Spearman {f(c['spearman'])}  best {c['k']}: {c['best_k_in_both']} shared  worst {c['k']}: {c['worst_k_in_both']} shared  disjoint 95% intervals: {c['disjoint_ci95']}")
    print(f"  noise reference (halves of the second data, {n['games']} games): Spearman {f(n['spearman'])}, corrected {f(n['spearman_brown'])}; best {n['k']}: {n['best_k_in_both']} shared  worst: {n['worst_k_in_both']} shared")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
