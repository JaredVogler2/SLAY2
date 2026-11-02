#!/usr/bin/env bash
# Audits of the batches of this study: every win re-derived, a 40-game sample of every batch. Both read the game's configuration from the batch's own manifest.
#   audit.sh dev|val      AUDIT_JOBS=4 audits that many batches at a time (the record says how many were); the exit lines are read from the commands' own
# status, before any other command can reset it, and a failed audit must not end as AUDIT_DONE.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
stage=${1:-}
case "$stage" in
  dev) arms="s $GRID_TAGS"; ident=dev_id ;;
  val) arms=$(val_arms) || { echo "audit: cannot read the development selection" >&2; exit 1; }; ident=val_id ;;
  *) echo "usage: audit.sh dev|val" >&2; exit 2 ;;
esac
JOBS=${AUDIT_JOBS:-1}
dirs=""
for arm in $arms; do
  for C in $CLASSES; do
    id=$($ident "$arm" "$C")
    [ -f "experiments/batches/$id/manifest.json" ] || { echo "audit: experiments/batches/$id has no manifest: the $stage stage is not finished" >&2; exit 1; }
    dirs="$dirs experiments/batches/$id"
  done
done
audit_one() { # <batch dir>: its wins, then its sample; fails if either audit does
  local d=$1 name wins rc w
  name=$(basename "$d")
  wins=$("$PY" -c "import json,sys;print(json.load(open(sys.argv[1]+'/manifest.json'))['summary']['counts']['win'])" "$d") || return 1
  if [ "$wins" = 0 ]; then rc=0; else "$PY" -m slay2_sim audit wins --batch "$d" >> "$OUT/audit-wins-$name.log" 2>&1; rc=$?; fi
  w=$rc
  echo "wins $name wins=$wins exit=$rc" >> "$OUT/audit-$stage-done.txt"
  "$PY" -m slay2_sim audit sample --batch "$d" --limit 40 >> "$OUT/audit-sample-$name.log" 2>&1
  rc=$?
  echo "sample $name exit=$rc" >> "$OUT/audit-$stage-done.txt"
  [ "$w" = 0 ] && [ "$rc" = 0 ]
}
export -f audit_one
export PY OUT stage
# shellcheck disable=SC2086
printf '%s\n' $dirs | xargs -P "$JOBS" -I{} bash -c 'audit_one "$1"' _ {}
status=$?
if [ "$status" = 0 ]; then echo AUDIT_DONE >> "$OUT/audit-$stage-done.txt"; else echo "AUDIT_FAILED=$status" >> "$OUT/audit-$stage-done.txt"; exit 1; fi
