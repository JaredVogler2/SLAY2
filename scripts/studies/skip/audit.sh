#!/usr/bin/env bash
# Audits of the batches of one leg of this study: every win re-derived, a 40-game sample of every batch of the arm that charges for a slot.
#   audit.sh <leg: og | ud>      (the marker file lists exit codes only: no count of wins; the exit lines are read from the commands' own status)
LEG=${1:-}
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
case "$LEG" in og | ud) ;; *) echo "usage: audit.sh <og|ud>" >&2; exit 2 ;; esac
dirs=""
for C in $CLASSES; do
  d=$(s1_dir "$C" "$LEG")
  [ -f "$d/manifest.json" ] || { echo "audit: $d has no manifest: the leg is not finished" >&2; exit 1; }
  dirs="$dirs $d"
done
fails=0
for d in $dirs; do
  wins=$("$PY" -c "import json,sys;print(json.load(open(sys.argv[1]+'/manifest.json'))['summary']['counts']['win'])" "$d")
  if [ "$wins" = 0 ]; then rc=0; else "$PY" -m slay2_sim audit wins --batch "$d" >> "$OUT/audit-wins-$(basename "$d").log" 2>&1; rc=$?; fi
  [ "$rc" = 0 ] || fails=$((fails+1))
  echo "wins $(basename "$d") exit=$rc" >> "$OUT/audit-done-$LEG.txt"
  "$PY" -m slay2_sim audit sample --batch "$d" --limit 40 >> "$OUT/audit-sample-$(basename "$d").log" 2>&1
  rc=$?
  [ "$rc" = 0 ] || fails=$((fails+1))
  echo "sample $(basename "$d") exit=$rc" >> "$OUT/audit-done-$LEG.txt"
done
if [ "$fails" = 0 ]; then echo AUDIT_DONE >> "$OUT/audit-done-$LEG.txt"; else echo "AUDIT_FAILED=$fails" >> "$OUT/audit-done-$LEG.txt"; exit 1; fi
