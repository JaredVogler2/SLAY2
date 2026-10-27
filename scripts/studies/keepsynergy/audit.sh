#!/usr/bin/env bash
# Audits of the held-out batches of ADR-054: every win re-derived, a 40-game sample of every batch.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
for C in $CLASSES; do
  l=$(lower "$C")
  for arm in astar d0star; do
    d="experiments/batches/advisor_v1-$arm-$l-a0-veteran-keeprelics-val-n2000"
    wins=$("$PY" -c "import json,sys;print(json.load(open(sys.argv[1]+'/manifest.json'))['summary']['counts']['win'])" "$d")
    [ "$wins" = 0 ] || "$PY" -m slay2_sim audit wins --batch "$d" > "$OUT/audit-wins-$(basename "$d").log" 2>&1
    echo "wins $(basename "$d") wins=$wins" >> "$OUT/audit-done.txt"
    "$PY" -m slay2_sim audit sample --batch "$d" --limit 40 > "$OUT/audit-sample-$(basename "$d").log" 2>&1
    echo "sample $(basename "$d") exit=$?" >> "$OUT/audit-done.txt"
  done
done
echo AUDIT_DONE >> "$OUT/audit-done.txt"
