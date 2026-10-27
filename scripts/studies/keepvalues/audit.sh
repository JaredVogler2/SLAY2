#!/usr/bin/env bash
# Audits of the batches of this study: every win re-derived, a 40-game sample of every batch.
#   audit.sh explore|val
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
what=${1:?explore or val}
dirs=""
for C in $CLASSES; do
  l=$(lower "$C")
  case "$what" in
    explore) dirs="$dirs experiments/cardvalue/$(explore_id "$C")" ;;
    val) dirs="$dirs experiments/batches/rules_v3-keepvals-$l-a0-veteran-keeprelics-val-n2000 experiments/batches/rules_v3-curvals-$l-a0-veteran-keeprelics-val-n2000" ;;
    *) echo "explore or val" >&2; exit 2 ;;
  esac
done
for d in $dirs; do
  wins=$("$PY" -c "import json,sys;print(json.load(open(sys.argv[1]+'/manifest.json'))['summary']['counts']['win'])" "$d")
  [ "$wins" = 0 ] || "$PY" -m slay2_sim audit wins --batch "$d" > "$OUT/audit-wins-$(basename "$d").log" 2>&1
  echo "wins $(basename "$d") wins=$wins exit=$?" >> "$OUT/audit-done.txt"
  "$PY" -m slay2_sim audit sample --batch "$d" --limit 40 > "$OUT/audit-sample-$(basename "$d").log" 2>&1
  echo "sample $(basename "$d") exit=$?" >> "$OUT/audit-done.txt"
done
echo AUDIT_DONE >> "$OUT/audit-done.txt"
