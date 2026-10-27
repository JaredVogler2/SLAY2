#!/usr/bin/env bash
# The checks that must hold before the first held-out game of ADR-054; run-val.sh sources this file. Any failed check stops the run before a
# val seed is played, because the test is run once.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "preflight-val: $*" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "tracked files are modified: start from a clean checkout of the commit that carries ADR-054"
[ -z "$(git ls-files --others --exclude-standard | grep -vE '^(experiments|artifacts)/')" ] || fail "untracked files outside experiments/ and artifacts/: start from a clean checkout"
git fetch -q origin 2>/dev/null || fail "cannot reach the remote to check that this commit is pushed"
[ -n "$(git branch -r --contains HEAD 2>/dev/null)" ] || fail "HEAD is not on the remote: push ADR-054 before the first val game"
grep -q "ADR-054" docs/DECISIONS.md || fail "docs/DECISIONS.md has no ADR-054"
# A* is what the page keeps and what the registration says
"$PY" - <<'PYEOF' || fail "A* is not what the registration and the code say (see above)"
import re
from pathlib import Path

from slay2_sim import advisor

model = advisor.DEFAULT_MODEL
if (model.needs, model.scalers, model.engines) != (1.0, 0.7, 0.0):
    raise SystemExit(f"the Python port keeps {(model.needs, model.scalers, model.engines)}, A* is (1.0, 0.7, 0.0)")
source = Path("packages/decision/src/synergy.ts").read_text(encoding="utf-8")
found = re.search(r"PART_WEIGHT[^=]*=\s*\{\s*needs:\s*([\d.]+),\s*scalers:\s*([\d.]+),\s*engines:\s*([\d.]+),?\s*\}", source)
if not found or tuple(float(x) for x in found.groups()) != (1.0, 0.7, 0.0):
    raise SystemExit(f"PART_WEIGHT in packages/decision/src/synergy.ts is {found.groups() if found else 'unreadable'}, A* is (1, 0.7, 0)")
card_table = advisor.synergy_table()["sha256"]
if not card_table.startswith("bd0b8a9f"):
    raise SystemExit(f"the card table is {card_table[:12]}, the registered one is bd0b8a9f")
PYEOF
[ ! -e experiments/synergy/keep-val/pooled-astar-vs-d0star.json ] || fail "the pooled result of the registered test exists: the test is run once"
[ -z "$(git log --all --oneline -1 -- experiments/synergy/keep-val/pooled-astar-vs-d0star.json)" ] || fail "the pooled result is in the history: the test is run once"
if ls experiments/batches 2>/dev/null | grep -Eq '^advisor_v1-(astar|d0star)-.*-keeprelics-val-'; then
  [ "${RESUME:-}" = 1 ] || fail "batches of the val arms already exist; if a run was interrupted, finish it with RESUME=1 (a finished batch is never touched)"
fi
echo "preflight-val: ok (commit $(git rev-parse --short=12 HEAD))"
