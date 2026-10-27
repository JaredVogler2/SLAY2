#!/usr/bin/env bash
# The checks that must hold before the first held-out game of stage B2-val (ADR-050 item 4); run-val.sh sources this file.
#   ASTAR="$(python -m slay2_sim.synergydev --astar --dir experiments/synergy/dev)" MARGIN=<its margin> PREFLIGHT_ONLY=1 run-val.sh 4
# Any failed check stops the run before a val seed is played, because the test is run once.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
: "${ASTAR:?ASTAR is the registered configuration of A* as a JSON object}"
: "${MARGIN:?MARGIN is the skip margin of A*}"
fail() { echo "preflight-val: $*" >&2; exit 1; }

# 1. a clean checkout of a commit that is already on the remote (the manifests record `dirty`, and the addendum has to be public before the test)
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "tracked files are modified: start from a clean checkout of the commit that carries the addendum"
# the manifests record `dirty` for tracked files only; a new untracked source file would change what is played without showing there
[ -z "$(git ls-files --others --exclude-standard | grep -vE '^(experiments|artifacts)/')" ] || fail "untracked files outside experiments/ and artifacts/: start from a clean checkout"
git fetch -q origin 2>/dev/null || fail "cannot reach the remote to check that this commit is pushed"
[ -n "$(git branch -r --contains HEAD 2>/dev/null)" ] || fail "HEAD is not on the remote: push the addendum before the first val game"

# 2. the addendum is in the decision log and quotes the hash of each selection file it rests on
grep -q "Addendum D" docs/DECISIONS.md || fail "docs/DECISIONS.md has no Addendum D"
for f in selection-phase1 selection-phase2; do
  [ -f "experiments/synergy/dev/$f.json" ] || fail "experiments/synergy/dev/$f.json is missing"
  sha=$(sha256sum "experiments/synergy/dev/$f.json" | cut -c1-12)
  grep -q "$sha" docs/DECISIONS.md || fail "Addendum D does not quote the hash ($sha) of $f.json"
done

# 3. A* and its margin are what the selection files choose, and both the port and the page keep what A* keeps
"$PY" - "$ASTAR" "$MARGIN" <<'PYEOF' || fail "A* is not what the registration and the code say (see above)"
import json
import re
import sys
from pathlib import Path

from slay2_sim import advisor, synergydev

given, margin = json.loads(sys.argv[1]), float(sys.argv[2])
expected = synergydev.astar(Path("experiments/synergy/dev"))
if {k: float(v) for k, v in given.items()} != {k: float(v) for k, v in expected.items()}:
    raise SystemExit(f"ASTAR {given} is not what the selection files choose, {expected}")
if margin != float(expected["margin"]):
    raise SystemExit(f"MARGIN {margin} is not the margin the selection files choose, {expected['margin']}")
kept = (expected["needs"], expected["scalers"], expected["engines"])
model = advisor.DEFAULT_MODEL
if (model.needs, model.scalers, model.engines) != kept:
    raise SystemExit(f"the Python port keeps {(model.needs, model.scalers, model.engines)}, A* keeps {kept}")
source = Path("packages/decision/src/synergy.ts").read_text(encoding="utf-8")
found = re.search(r"PART_WEIGHT[^=]*=\s*\{\s*needs:\s*([\d.]+),\s*scalers:\s*([\d.]+),\s*engines:\s*([\d.]+),?\s*\}", source)
if not found or tuple(float(x) for x in found.groups()) != tuple(float(x) for x in kept):
    raise SystemExit(f"PART_WEIGHT in packages/decision/src/synergy.ts is {found.groups() if found else 'unreadable'}, A* keeps {kept}")
PYEOF

# 4. the test has not been run before: no result exists or ever existed in the history, and a val batch of these arms may exist only when an
#    interrupted run is being finished. (This stops a mistake, not a person: a person could delete files, and the history is the record.)
[ ! -e experiments/synergy/val/pooled-astar-vs-d0star.json ] || fail "the pooled result of the registered test exists: the test is run once"
[ -z "$(git log --all --oneline -1 -- experiments/synergy/val/pooled-astar-vs-d0star.json)" ] || fail "the pooled result of the registered test is in the history: the test is run once"
if ls experiments/batches 2>/dev/null | grep -Eq '^advisor_v1-(astar|d0star|d0)-.*-val-'; then
  [ "${RESUME:-}" = 1 ] || fail "batches of the val arms already exist; if a run was interrupted, finish it with RESUME=1 (a finished batch is never touched)"
fi
echo "preflight-val: ok (A* $ASTAR, margin $MARGIN, commit $(git rev-parse --short=12 HEAD))"
