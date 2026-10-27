"""Do `rules_v2_neow` (exploration off) and `rules_v2` play the same games, relics kept? (ADR-055 item 7)

Reads <dir>/v2-<class>/ and <dir>/neow0-<class>/ (episode files of the same 200 development seeds per class) and compares them per seed on
every field of the episode record except the batch id, the policy's name and version, the wall time and the trace hash. Standard library only.
"""

import argparse
import gzip
import hashlib
import json
from pathlib import Path

CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"]
IGNORED = {"batch_id", "policy", "policy_version", "wall_seconds", "trace_sha256", "extra"}


def load(batch: Path) -> tuple[dict[int, dict], str]:
    gz = batch / "episodes.jsonl.gz"
    raw = gzip.open(gz, "rt", encoding="utf-8").read() if gz.exists() else (batch / "episodes.jsonl").read_text(encoding="utf-8")
    rows = [json.loads(line) for line in raw.splitlines() if line.strip()]
    return {r["seed"]: r for r in rows}, hashlib.sha256(raw.encode("utf-8")).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    base = Path(args.dir)
    classes: dict[str, dict] = {}
    total = {"games": 0, "identical": 0, "differ": 0, "only_one_side": 0}
    for cls in CLASSES:
        a, a_sha = load(base / f"v2-{cls}")
        b, b_sha = load(base / f"neow0-{cls}")
        identical = differ = only_one = 0
        for seed in sorted(set(a) | set(b)):
            if seed not in a or seed not in b:
                only_one += 1
                continue
            ra = {k: v for k, v in a[seed].items() if k not in IGNORED}
            rb = {k: v for k, v in b[seed].items() if k not in IGNORED}
            if ra == rb:
                identical += 1
            else:
                differ += 1
        classes[cls] = {
            "games": len(set(a) | set(b)),
            "identical": identical,
            "differ": differ,
            "only_one_side": only_one,
            "characters": sorted({r["character"] for r in list(a.values()) + list(b.values())}),
            "rules_v2": {"batch": f"pre-v2-{cls}", "episodes_sha256": a_sha},
            "rules_v2_neow_explore_0": {"batch": f"pre-neow0-{cls}", "episodes_sha256": b_sha},
        }
        for key in total:
            total[key] += classes[cls]["games" if key == "games" else key]
    report = {
        "schema": 1,
        "kind": "neow-precondition",
        "claim": "rules_v2_neow with neow_explore 0 plays exactly as rules_v2, with the relics kept (ADR-055 item 7)",
        "partition": "dev",
        "compared": "every field of the episode record except " + ", ".join(sorted(IGNORED)),
        "classes": classes,
        "total": total,
    }
    Path(args.out).write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(total))
    return 0 if total["differ"] == 0 and total["only_one_side"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
