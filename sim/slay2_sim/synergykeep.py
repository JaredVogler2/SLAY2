"""Stage B1 of ADR-050 read again on random drafts played with the relics kept (ADR-053 item 6; exploratory, no decision rests on it).

``slay2_sim.synergystudy`` (unchanged) asks whether simulated runs carry signal for the parts of the advisor's synergy term: random
drafts, the deck each run brought to the Act-1 boss, whether it got past. The simulator drops the relics a run gains after its first
fight (G14), so those runs held two relics and a relic's supply could not matter. The exploration batches of ADR-053 keep them:
about half of the boss decks hold a relic the relic table of ADR-051 tags. This program reads the same question on those runs,
twice, with the same controls and the same cross-validation:

* the index parts as the class alone gives them (the card table and the starting relic, as the page computed them before ADR-051);
* the index parts with the relics each run held counted as suppliers (ADR-051).

The gap between the two held-out log losses (seed-grouped five-fold, 95 % interval from resampling whole seeds) is the only new
number: negative says the relic-aware parts predict getting past the boss better. Nothing here changes a tag table, and the
controls already hold a column for every relic that 2 % or more of the runs held, so a relic's own effect is not what the gap reads.

    python -m slay2_sim.synergykeep --out experiments/synergy/keep-b1.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from . import advisor
from .synergystudy import (
    FEATURES,
    Cohort,
    Table,
    analyse,
    controls,
    cv_loss,
    deck_features,
    design,
    load_cohort,
    paired_loss_gap,
    select,
)

SCHEMA = 1
CLASSES = ("Ironclad", "Silent", "Regent", "Necrobinder", "Defect")


def cohorts() -> tuple[Cohort, ...]:
    return tuple(
        Cohort(f"{c.lower()}-keep", c, "dev", f"experiments/cardvalue/explore4-{c.lower()}-a0-keeprelics-dev-o5000-n5000") for c in CLASSES
    )


def build_tables(cohort_set: tuple[Cohort, ...]) -> tuple[Table, Table, list[dict], dict]:
    """The block-diagonal table of ``synergystudy.build_table`` twice: the parts from the class alone and with the runs' relics counted."""
    blocks, metas, held = [], [], {"runs": 0, "with_a_tagged_relic": 0, "parts_differ": 0}
    relic_table = advisor.relic_synergy_table()["relics"]
    for c in cohort_set:
        records, meta = load_cohort(c)
        X0, _ = controls(records)
        card, relic = [], []
        for r in records:
            alone = deck_features(r["deck"], c.character.lower())
            counted = deck_features(r["deck"], advisor.Setting(c.character.lower(), tuple(r["relics"])))
            card.append([alone[f] for f in FEATURES])
            relic.append([counted[f] for f in FEATURES])
            held["runs"] += 1
            held["with_a_tagged_relic"] += int(any(x in relic_table for x in r["relics"]))
            held["parts_differ"] += int(card[-1] != relic[-1])
        blocks.append((X0, np.array(card), np.array(relic), np.array([r["passed"] for r in records], dtype=float), np.array([r["seed"] for r in records], dtype=np.int64)))
        metas.append(meta)
    width = sum(b[0].shape[1] for b in blocks)
    rows = sum(len(b[3]) for b in blocks)
    X0 = np.zeros((rows, width))
    Fc, Fr = np.zeros((rows, len(FEATURES))), np.zeros((rows, len(FEATURES)))
    y, g, which = np.zeros(rows), np.zeros(rows, dtype=np.int64), np.zeros(rows, dtype=np.int64)
    r = col = 0
    for k, (x, fc, fr, yy, gg) in enumerate(blocks):
        n = len(yy)
        X0[r:r + n, col:col + x.shape[1]] = x
        Fc[r:r + n], Fr[r:r + n], y[r:r + n], g[r:r + n], which[r:r + n] = fc, fr, yy, gg, k
        r += n
        col += x.shape[1]
    return Table(X0, Fc, y, g, which), Table(X0, Fr, y, g, which), metas, held


def build_report(draws: int = 200, seed: int = 0, cohort_set: tuple[Cohort, ...] | None = None) -> dict:
    cohort_set = cohort_set or cohorts()
    card, relic, metas, held = build_tables(cohort_set)
    names = [m["name"] for m in metas]
    everything = list(range(len(names)))
    losses = {}
    for label, table in (("class_alone", card), ("relics_counted", relic)):
        losses[label] = cv_loss(design(table, FEATURES), table.y, table.g)[1]
    per_class = {}
    for k, name in enumerate(names):
        rows = card.cohort == k
        per_class[name] = {
            "rows": int(rows.sum()),
            "gap_relics_counted_minus_class_alone": paired_loss_gap(losses["class_alone"][rows], losses["relics_counted"][rows], card.g[rows], draws, seed),
        }
    return {
        "schema": SCHEMA, "kind": "synergy-calibration-relics-kept", "stage": "ADR-053 item 6 (exploratory: development seeds, relics kept)",
        "outcome": "the run gets past the Act-1 boss", "relic_synergy_table_sha256": advisor.relic_synergy_table()["sha256"],
        "synergy_table_sha256": advisor.synergy_table()["sha256"],
        "folds": 5, "bootstrap_draws": draws, "cohorts": metas,
        "runs": held,
        "class_alone": analyse(select(card, everything), draws, seed),
        "relics_counted": analyse(select(relic, everything), draws, seed),
        "held_out_log_loss": {k: round(float(v.mean()), 5) for k, v in losses.items()},
        "gap_relics_counted_minus_class_alone": paired_loss_gap(losses["class_alone"], losses["relics_counted"], card.g, draws, seed),
        "per_class": per_class,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--bootstrap", type=int, default=200)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args(argv)
    report = build_report(args.bootstrap, args.seed)
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    runs = report["runs"]
    print(f"wrote {out}: {runs['runs']} boss fights, {runs['with_a_tagged_relic']} hold a tagged relic, the parts differ in {runs['parts_differ']}")
    for label in ("class_alone", "relics_counted"):
        pooled = report[label]
        print(f"  {label}: held-out log loss with the synergy term {pooled['cross_validation']['index+synergy']['log_loss']}")
        for part in ("unmet", "scaler", "engines"):
            r = pooled["ratios"][part]
            print(f"    {part:8s} ratio to quality {r['to_quality']:+.2f} {r['ci95']}")
    gap = report["gap_relics_counted_minus_class_alone"]
    print(f"  held-out log loss, relics counted minus class alone: {gap['mean']:+.5f} {gap['ci95']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
