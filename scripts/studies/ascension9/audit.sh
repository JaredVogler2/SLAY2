#!/usr/bin/env bash
# Audits of the batches of this study: every win re-derived, a 40-game sample of every batch (the thirty of the three tests and the ten of the
# twin of T2). Both read the game's configuration (the Ascension among it) from the batch's own manifest.
#   audit.sh [val]            (the exit lines are read from the commands' own status, before any other command can reset it)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
what=${1:-val}
[ "$what" = val ] || { echo "val" >&2; exit 2; }
dirs=""
for C in $CLASSES; do
  for id in $(arm_ids "$C") $(twin_ids "$C"); do
    [ -f "experiments/batches/$id/manifest.json" ] || { echo "audit: experiments/batches/$id has no manifest: the run is not finished" >&2; exit 1; }
    dirs="$dirs experiments/batches/$id"
  done
done
fails=0
for d in $dirs; do
  wins=$("$PY" -c "import json,sys;print(json.load(open(sys.argv[1]+'/manifest.json'))['summary']['counts']['win'])" "$d")
  if [ "$wins" = 0 ]; then rc=0; else "$PY" -m slay2_sim audit wins --batch "$d" >> "$OUT/audit-wins-$(basename "$d").log" 2>&1; rc=$?; fi
  [ "$rc" = 0 ] || fails=$((fails+1))
  echo "wins $(basename "$d") wins=$wins exit=$rc" >> "$OUT/audit-done.txt"
  "$PY" -m slay2_sim audit sample --batch "$d" --limit 40 >> "$OUT/audit-sample-$(basename "$d").log" 2>&1
  rc=$?
  [ "$rc" = 0 ] || fails=$((fails+1))
  echo "sample $(basename "$d") exit=$rc" >> "$OUT/audit-done.txt"
done
# a failed audit (a win a fresh run does not reproduce, a sample with an unverified game) must not end as AUDIT_DONE
if [ "$fails" = 0 ]; then echo AUDIT_DONE >> "$OUT/audit-done.txt"; else echo "AUDIT_FAILED=$fails" >> "$OUT/audit-done.txt"; exit 1; fi
