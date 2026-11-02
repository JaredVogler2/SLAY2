#!/usr/bin/env python3
"""Whether the batches of a stage of the threshold study are finished and audited, read from the batches themselves (ADR-062 item 11).

    python3 scripts/studies/thresh/audits_ok.py <batch id> [<batch id> ...]          (run from the repository root; the batches are in experiments/batches)

Every problem is printed to stderr and the exit status is 1 if there is any. For each batch: it has a readable manifest; its 40-game sample audit passes (every
sampled game verified, at least 40 of them, the ledger complete, and the audit was made from the content the manifest records); if it has wins, its win audit
re-derived every one of them. All the batches were played from one commit. `select-dev.sh` asks it of the development batches before the screen is applied and
`pool.sh` of the held-out batches before anything is pooled; a marker file left by `audit.sh` is not what either relies on.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

BATCHES = Path("experiments") / "batches"


def problems(ids: list[str], root: Path = BATCHES) -> list[str]:
    out: list[str] = []
    heads: set = set()
    for bid in ids:
        d = root / bid
        try:
            m = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            out.append(f"{bid}: no readable manifest ({e})")
            continue
        heads.add(((m.get("environment") or {}).get("slay2") or {}).get("head"))
        try:
            s = json.loads((d / "sample-audit.json").read_text(encoding="utf-8"))
            ok = (s["all_verified"] is True and s["verified"] == s["sample"]["drawn"] >= 40 and s["ledger"]["ok"] is True
                  and s["batch_content_sha256"] == m["content_sha256"])
            if not ok:
                out.append(f"{bid}: the sample audit does not pass")
        except Exception as e:  # noqa: BLE001
            out.append(f"{bid}: no readable sample audit ({e})")
        wins = m["summary"]["counts"]["win"]
        if wins:
            try:
                w = json.loads((d / "wins-audit.json").read_text(encoding="utf-8"))
                if not (w["all_verified"] is True and w["wins_audited"] == w["wins_in_batch"] == wins):
                    out.append(f"{bid}: not every win is re-derived")
            except Exception as e:  # noqa: BLE001
                out.append(f"{bid}: {wins} wins and no readable win audit ({e})")
    if len(heads) != 1:
        out.append(f"the batches were played from {len(heads)} different commits ({sorted(str(h)[:12] for h in heads)}); ADR-062 item 10 has one")
    return out


def main(argv: list[str]) -> int:
    if not argv:
        print("usage: audits_ok.py <batch id> [<batch id> ...]", file=sys.stderr)
        return 2
    found = problems(argv)
    for line in found:
        print(line, file=sys.stderr)
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
