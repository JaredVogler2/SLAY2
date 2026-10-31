"""The Act-2 study's own tools (ADR-060): the development screen's selection rule and the determinism record of the baseline.

``dev`` reads the development batches of the study (arm by arm, class by class, all on the same development seeds), pools each candidate
against the baseline S over the five classes (the exact McNemar test of ``slay2_sim pool``, the endpoint the study reads: got past the
Act-2 boss) and applies the rule that ADR-060 item 5 fixed before any of those games was played:

* a candidate is *eligible* when its pooled share past the Act-2 boss is higher than S's and the exact two-sided McNemar p is below 0.10;
* the late-threshold rule P goes to the held-out test with the eligible threshold whose pooled gain is largest (ties: the smaller absolute
  threshold, then the smaller one); if none is eligible, P is not played on held-out seeds;
* the Act-2 values V go to the held-out test when they are eligible *and* at least one class kept its fitted values (otherwise V is S);
* the lead L (the card-pick threshold 0.2 in every act, ADR-036) is always tested; its development result is read for information only.

It also checks what the design relies on: the arms that differ from S in Act 2 only (P and V) must agree with S about the Act-1 boss in every
pair (they play the same game until the first Act-2 card reward), and reports the number of pairs in which they do not.

``determinism`` compares two batches of the same policy and seeds episode by episode, ignoring the wall clock: the baseline of the held-out
test is played again under the study's commit, and this says how many of its games are the games of the earlier batch.

    python -m slay2_sim.act2study dev --batches experiments/batches --out experiments/act2/dev-selection.json
    python -m slay2_sim.act2study determinism experiments/batches/<replayed> experiments/batches/<earlier> --out experiments/act2/determinism-s.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .compare import build_pooled_comparison

SCHEMA = 1
CLASSES = ("Ironclad", "Silent", "Regent", "Necrobinder", "Defect")
DEV_OFFSET, DEV_N, VAL_N = 1000, 600, 2000
SCREEN_ALPHA = 0.10
# the late-threshold candidates (tag -> threshold of the Act-2 card reward); -100 takes the best card offered, +100 never takes one
P_TAGS: dict[str, float] = {"pall": -100.0, "p010": 0.1, "p020": 0.2, "p035": 0.35, "p050": 0.5, "pnone": 100.0}
LEAD_THRESHOLD = 0.2


def dev_id(arm: str, cls: str) -> str:
    return f"act2dev-{arm}-{cls.lower()}-a0-veteran-keeprelics-dev-o{DEV_OFFSET}-n{DEV_N}"


def val_id(arm: str, cls: str) -> str:
    return f"act2-{arm}-{cls.lower()}-a0-veteran-keeprelics-val-n{VAL_N}"


def pool_arms(root: Path, arm: str, base: str, ident, *, iters: int = 2000, seed: int = 0, confidence: float | None = None) -> dict:
    """The pooled comparison of ``arm`` (a) against ``base`` (b) over the five classes, the Act-2 boss as the endpoint of the interval."""
    pairs = [(root / ident(arm, c), root / ident(base, c)) for c in CLASSES]
    return build_pooled_comparison(pairs, iters=iters, seed=seed, confidence=confidence, endpoint="act2")


def summarise(pooled: dict) -> dict:
    t, r = pooled["reachedAct3"]["pairedTable"], pooled["reachedAct3"]
    one = pooled["reachedAct2"]["pairedTable"]
    per = {m["character"]: {"pairs": m["bothCompleted"]} for m in pooled["members"]}
    return {
        "pairs": pooled["bothCompleted"],
        "excluded": pooled["excludedNotCompleted"],
        "pastAct2Boss": {"arm": r["a"]["rate"], "baseline": r["b"]["rate"]},
        "difference": r["a"]["rate"] - r["b"]["rate"],
        "armOnly": t["a_only"], "baselineOnly": t["b_only"], "p": t["mcnemar_p"],
        "pastAct1Boss": {"arm": pooled["reachedAct2"]["a"]["rate"], "baseline": pooled["reachedAct2"]["b"]["rate"]},
        "actOneDiffers": one["a_only"] + one["b_only"],
        "wins": {"arm": pooled["wins"]["a"], "baseline": pooled["wins"]["b"]},
        "meanFloorDifference": pooled["floorDifference"]["meanAMinusB"],
        "perClass": per,
        "contentSha256": pooled["contentSha256"],
    }


def eligible(row: dict) -> bool:
    return row["difference"] > 0 and row["p"] < SCREEN_ALPHA


def fitted_classes(values_dir: Path) -> dict[str, bool]:
    """Which classes kept their fitted Act-2 values (the gate of ``latevalues``), read from the committed value files."""
    out = {}
    for c in CLASSES:
        body = json.loads((values_dir / f"{c.lower()}-a0-act2-v1.json").read_text(encoding="utf-8"))
        out[c] = bool(body["fitted"])
    return out


def select(root: Path, values_dir: Path) -> dict:
    fitted = fitted_classes(values_dir)
    rows: dict[str, dict] = {}
    pooled_hash: dict[str, str] = {}
    for tag in P_TAGS:
        rows[tag] = summarise(pool_arms(root, tag, "s", dev_id))
    rows["lead"] = summarise(pool_arms(root, "lead", "s", dev_id))
    if any(fitted.values()):
        rows["v"] = summarise(pool_arms(root, "v", "s", dev_id))
    candidates = sorted((t for t in P_TAGS if eligible(rows[t])), key=lambda t: (-rows[t]["difference"], abs(P_TAGS[t]), P_TAGS[t]))
    p_pick = candidates[0] if candidates else None
    v_ok = "v" in rows and eligible(rows["v"])
    for tag, row in rows.items():
        pooled_hash[tag] = row.pop("contentSha256")
    return {
        "schema": SCHEMA, "kind": "act2-dev-selection", "role": "development: not a held-out result",
        "slice": {"partition": "dev", "offset": DEV_OFFSET, "n": DEV_N},
        "rule": {
            "eligible": f"the pooled share past the Act-2 boss is higher than the baseline's and the exact two-sided McNemar p is below {SCREEN_ALPHA}",
            "P": "the eligible late threshold with the largest pooled gain; none eligible: P is not played on held-out seeds",
            "V": "eligible, and at least one class kept its fitted Act-2 values; otherwise V is not played",
            "L": "always tested on held-out seeds; its development row is for information",
        },
        "fittedClasses": fitted,
        "baseline": "s",
        "arms": {tag: {**row, "lateThreshold": P_TAGS.get(tag), "eligible": eligible(row), "pooledSha256": pooled_hash[tag]} for tag, row in rows.items()},
        "P": {"advance": p_pick is not None, "arm": p_pick, "lateThreshold": P_TAGS[p_pick] if p_pick else None},
        "V": {"advance": bool(v_ok), "anyClassFitted": any(fitted.values())},
        "L": {"advance": True},
        "actOneIdentical": all(rows[t]["actOneDiffers"] == 0 for t in rows if t != "lead"),
    }


def determinism(replayed: Path, earlier: Path) -> dict:
    """Episode-by-episode comparison of a batch with the batch it replays (the wall clock and the batch id aside)."""
    a = {int(r["seed"]): r for r in _rows(replayed)}
    b = {int(r["seed"]): r for r in _rows(earlier)}
    ignore = {"wall_seconds", "batch_id"}
    differing = []
    fields: dict[str, int] = {}
    for s in sorted(set(a) & set(b)):
        diff = sorted(k for k in set(a[s]) | set(b[s]) if k not in ignore and a[s].get(k) != b[s].get(k))
        if diff:
            differing.append(s)
            for k in diff:
                fields[k] = fields.get(k, 0) + 1
    shared = len(set(a) & set(b))
    return {
        "replayed": replayed.name, "earlier": earlier.name, "seedsReplayed": len(a), "seedsEarlier": len(b), "shared": shared,
        "identical": shared - len(differing), "different": len(differing), "differingSeeds": differing[:50], "fieldsThatDiffer": dict(sorted(fields.items())),
    }


def _rows(batch: Path) -> list[dict]:
    """The batch's raw episode records (every field), not the typed rows ``batch.read_episodes`` returns."""
    import gzip

    gz, plain = batch / "episodes.jsonl.gz", batch / "episodes.jsonl"
    if gz.exists():
        with gzip.open(gz, "rt", encoding="utf-8") as fh:
            return [json.loads(line) for line in fh if line.strip()]
    return [json.loads(line) for line in plain.read_text(encoding="utf-8").splitlines() if line.strip()]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("dev", help="apply the registered selection rule to the development batches")
    d.add_argument("--batches", type=Path, default=Path("experiments/batches"))
    d.add_argument("--values", type=Path, default=Path("experiments/cardvalue"))
    d.add_argument("--out", type=Path, required=True)
    t = sub.add_parser("determinism", help="how many games of a replayed batch are the games of the earlier batch")
    t.add_argument("replayed", type=Path)
    t.add_argument("earlier", type=Path)
    t.add_argument("--out", type=Path)
    args = ap.parse_args(argv)
    if args.cmd == "dev":
        body = select(args.batches, args.values)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(body, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        for tag, row in body["arms"].items():
            print(f"  {tag:6s} pairs {row['pairs']:5d}  past the Act-2 boss {row['pastAct2Boss']['arm']:.4f} vs {row['pastAct2Boss']['baseline']:.4f}  "
                  f"diff {row['difference']:+.4f}  only-arm {row['armOnly']} only-S {row['baselineOnly']}  p {row['p']:.4g}  "
                  f"Act-1 differs {row['actOneDiffers']}  {'ELIGIBLE' if row['eligible'] else ''}")
        print(f"P: {body['P']}\nV: {body['V']}\nact-1 identical for the Act-2-only arms: {body['actOneIdentical']}")
        return 0
    rec = determinism(args.replayed, args.earlier)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(rec, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"{rec['replayed']} against {rec['earlier']}: {rec['identical']} of {rec['shared']} shared episodes identical, {rec['different']} different {rec['fieldsThatDiffer']}")
    return 0 if rec["different"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
