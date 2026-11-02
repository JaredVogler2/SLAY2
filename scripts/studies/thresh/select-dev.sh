#!/usr/bin/env bash
# Apply the selection rule of ADR-062 item 3 to the development batches, once: writes experiments/thresh/dev-selection.json (every threshold's pooled net wins
# against S, the head-to-head of the largest against 0.2, the design checks, and whether the screen's choice goes to the held-out tests T2 and T3).
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "select-dev: $*" >&2; exit 1; }
[ ! -e experiments/thresh/dev-selection.json ] || fail "experiments/thresh/dev-selection.json exists: the screen is read once"
[ -z "$(git log --all --oneline -1 -- experiments/thresh/dev-selection.json)" ] || fail "experiments/thresh/dev-selection.json is in the history: the screen is read once"
grep -q DEV_DONE "$OUT/run-done.txt" 2>/dev/null || fail "the development stage is not finished (DEV_DONE is missing from $OUT/run-done.txt)"
ids=""
for arm in s $GRID_TAGS; do for C in $CLASSES; do ids="$ids $(dev_id "$arm" "$C")"; done; done
# the audit is read from the batches (each one's sample audit and win audit, made from its content), not from the marker file audit.sh leaves
# shellcheck disable=SC2086
"$PY" "$ROOT/scripts/studies/thresh/audits_ok.py" $ids || fail "the development batches are not finished and audited (see above): run audit.sh dev first, so that no win the screen counts is one that cannot be re-derived"
mkdir -p experiments/thresh
"$PY" -m slay2_sim.threshstudy dev --batches experiments/batches --out experiments/thresh/dev-selection.json || fail "the selection failed"
sha256sum experiments/thresh/dev-selection.json
