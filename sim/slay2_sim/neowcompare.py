"""Do two fits of the opening-relic values agree? (ADR-055)

A descriptive comparison of two ``neow-values`` files, not a test, in the manner of ``cardcompare`` (ADR-046) and with the same
reference for how much two measurements of the *same* pilot differ by chance:

* the Spearman correlation of the two sets of values over the relics measured in both;
* how many of the ``k`` best and ``k`` worst relics of one are among the ``k`` best and ``k`` worst of the other;
* how many relics have disjoint 95 % intervals (two independent intervals of equal width are disjoint with probability about 0.6 %
  when nothing has changed, so fewer than one relic in a hundred);
* **noise reference**: the second fit's games split by the parity of the game seed, each half fitted like the full data (no
  bootstrap), the Spearman correlation of the two halves, corrected to the full number of games as 2r / (1 + r). A correlation
  between the two files near that figure says the two games rank the relics alike; one clearly below it says the game matters.

The relics a file measures are the ones taken in at least ``min_taken`` games; the halves use half of that, since each holds half
of the games.

    python -m slay2_sim.neowcompare --a experiments/neow/neow-values-v2.json --b experiments/neow/neow-values-keep-v1.json \
        --batches-b experiments/neow/explore-ironclad-a0-keeprelics-train-n3000 ... --out experiments/neow/compare-v2-keep-v1.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from . import external
from .cardcompare import compare_betas
from .cardvalue import cross_validate, fit_logistic, read_episodes
from .classes import exact_character
from .neowvalue import design, extract, vocabulary

SCHEMA = 1
K_RELICS = 5  # the relics are about 27, not 90: the five best and the five worst


def compare_reports(a: dict, b: dict, k: int = K_RELICS) -> dict:
    """Two ``neow-values`` reports: the statistics above, with the interval check."""
    ra = {r["label"]: r for r in a["relics"]}
    rb = {r["label"]: r for r in b["relics"]}
    out = compare_betas({i: r["beta"] for i, r in ra.items()}, {i: r["beta"] for i, r in rb.items()}, k)
    both = sorted(set(ra) & set(rb))
    out["relics_in_both"] = out.pop("cards_in_both")
    out["disjoint_ci95"] = sum(1 for i in both if ra[i]["ci95"][1] < rb[i]["ci95"][0] or rb[i]["ci95"][1] < ra[i]["ci95"][0])
    out["relics_only_in_a"] = sorted(set(ra) - set(rb))
    out["relics_only_in_b"] = sorted(set(rb) - set(ra))
    # the relic each file would take first, and whether the other file's best-valued relic is in the first file's best k
    out["best_in_a"] = max(ra, key=lambda i: (ra[i]["beta"], i))
    out["best_in_b"] = max(rb, key=lambda i: (rb[i]["beta"], i))
    return out


def fit_betas(records: list[dict], min_taken: int) -> dict[str, float]:
    """The point estimates of ``neowvalue.build_report`` (same vocabulary, features and grouped choice of the penalty, one fit on
    all of the data), without the bootstrap."""
    vocab = vocabulary(records, min_taken=min_taken)
    X, y, g, names, penalised = design(records, vocab)
    l2 = cross_validate(X, y, g, penalised)["best_l2"]
    beta = fit_logistic(X, y, l2, penalised)
    return {n[6:]: float(beta[j]) for j, n in enumerate(names) if n.startswith("relic:")}


def split_half(records: list[dict], min_taken: int = 30, k: int = K_RELICS) -> dict:
    """Two measurements of the same pilot: the games with an even seed against the games with an odd seed."""
    halves = ([r for r in records if r["seed"] % 2 == 0], [r for r in records if r["seed"] % 2 == 1])
    comp = compare_betas(fit_betas(halves[0], max(1, min_taken // 2)), fit_betas(halves[1], max(1, min_taken // 2)), k)
    comp["relics_in_both"] = comp.pop("cards_in_both")
    r = comp["spearman"]
    comp["seeds"] = [len({x["seed"] for x in h}) for h in halves]
    # the correction is defined for a positive correlation between the halves; a zero or negative one has nothing to correct
    comp["spearman_brown"] = (2 * r / (1 + r)) if r is not None and r > 0 else None
    return comp


def _file_info(path: Path) -> dict:
    raw = path.read_bytes()
    report = json.loads(raw.decode("utf-8"))
    return {
        "file": str(path),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "games": report.get("games"),
        "pass_rate": report.get("pass_rate"),
        "relics": len(report.get("relics", [])),
    }


def read_records(batches: list[str]) -> list[dict]:
    """The games of exploration batches as ``neowvalue.extract`` reads them (exact class ids, as the fit requires)."""
    records: list[dict] = []
    for d in batches:
        path = Path(d).resolve()
        manifest = json.loads((path / "manifest.json").read_text(encoding="utf-8"))
        records.extend(extract(read_episodes(path), exact_character(manifest["config"]["character"]).lower()))
    return records


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--a", required=True, help="the first opening-relic values file (the reference)")
    ap.add_argument("--b", required=True, help="the second opening-relic values file")
    ap.add_argument("--batches-b", nargs="+", required=True, help="the exploration batches the second file was fitted from")
    ap.add_argument("--min-taken", type=int, default=30)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    pa, pb, out = Path(args.a).resolve(), Path(args.b).resolve(), Path(args.out).resolve()
    a, b = json.loads(pa.read_text(encoding="utf-8")), json.loads(pb.read_text(encoding="utf-8"))

    def rel(p: Path) -> str:
        return str(p.relative_to(external.REPO_ROOT)) if external.REPO_ROOT in p.parents else str(p)

    report = {
        "schema": SCHEMA,
        "kind": "neow-value-comparison",
        "a": {**_file_info(pa), "file": rel(pa)},
        "b": {**_file_info(pb), "file": rel(pb)},
        "comparison": compare_reports(a, b),
        "noise_reference": {
            "definition": "the second file's games split by the parity of the game seed, each half fitted like the full data, "
            "Spearman correlation of the two halves and the same corrected to the full number of games as 2r/(1+r)",
            **split_half(read_records(args.batches_b), args.min_taken),
        },
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    c, n = report["comparison"], report["noise_reference"]

    def f(x: float | None) -> str:
        return "n/a" if x is None else f"{x:+.3f}"

    print(f"wrote {out}")
    print(f"  relics in both: {c['relics_in_both']}  Spearman {f(c['spearman'])}  best {c['k']}: {c['best_k_in_both']} shared  worst {c['k']}: {c['worst_k_in_both']} shared  disjoint 95% intervals: {c['disjoint_ci95']}")
    print(f"  best relic: {c['best_in_a']} in the first file, {c['best_in_b']} in the second")
    print(f"  noise reference (halves of the second data, {n['seeds']} seeds): Spearman {f(n['spearman'])}, corrected {f(n['spearman_brown'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
