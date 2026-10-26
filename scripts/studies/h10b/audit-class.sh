#!/usr/bin/env bash
# One held-out arm's secondary audits: every win re-derived, then a 40-game sample. A batch without wins keeps no wins-audit.json.
# usage: audit-class.sh <lower-case class>
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
B=experiments/batches/rules_v2_neow_values-$1-a0-veteran-val-n2000
"$PY" -m slay2_sim audit wins --batch "$B"
"$PY" -m slay2_sim audit sample --batch "$B" --limit 40
"$PY" - "$B" <<'PYEOF'
import json, os, sys
b = sys.argv[1]
if json.load(open(b + "/manifest.json"))["summary"]["counts"]["win"] == 0 and os.path.exists(b + "/wins-audit.json"):
    os.remove(b + "/wins-audit.json")
PYEOF
