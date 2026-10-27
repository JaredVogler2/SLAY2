#!/usr/bin/env bash
# The audits a committed batch needs: every win re-derived (the site exporter refuses a batch with wins that were not, ADR-032) and, for the
# arms of a held-out test, a 40-game sample (ADR-050 item 6). A batch that already has the audit is skipped.
#   audit-batches.sh wins   experiments/batches/advisor_v1-*-dev-*     only the batches that have wins are audited
#   audit-batches.sh sample experiments/batches/advisor_v1-astar-*-val-n2000 experiments/batches/advisor_v1-d0star-*-val-n2000
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
mode=${1:?wins or sample}; shift
status=0
for B in "$@"; do
  [ -f "$B/manifest.json" ] || { echo "audit-batches: $B is not a batch" >&2; status=1; continue; }
  case "$mode" in
    wins)
      [ -f "$B/wins-audit.json" ] && continue
      wins=$("$PY" -c 'import json, sys; print(json.load(open(sys.argv[1] + "/manifest.json"))["summary"]["counts"]["win"])' "$B")
      [ "$wins" -gt 0 ] || continue
      "$PY" -m slay2_sim audit wins --batch "$B" || status=1 ;;
    sample)
      [ -f "$B/sample-audit.json" ] && continue
      "$PY" -m slay2_sim audit sample --batch "$B" --limit 40 || status=1 ;;
    *) echo "audit-batches: wins or sample" >&2; exit 2 ;;
  esac
done
exit $status
