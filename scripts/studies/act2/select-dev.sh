#!/usr/bin/env bash
# Apply the selection rule of ADR-060 item 5 to the development batches, once: writes experiments/act2/dev-selection.json (which arms go to the
# held-out test, with every candidate's pooled gain, McNemar p and the check that the Act-2-only arms are identical to S in Act 1).
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "select-dev: $*" >&2; exit 1; }
[ ! -e experiments/act2/dev-selection.json ] || fail "experiments/act2/dev-selection.json exists: the screen is read once"
[ -z "$(git log --all --oneline -1 -- experiments/act2/dev-selection.json)" ] || fail "experiments/act2/dev-selection.json is in the history: the screen is read once"
grep -q DEV_DONE "$OUT/run-done.txt" 2>/dev/null || fail "the development stage is not finished (DEV_DONE is missing from $OUT/run-done.txt)"
mkdir -p experiments/act2
"$PY" -m slay2_sim.act2study dev --batches experiments/batches --values experiments/cardvalue --out experiments/act2/dev-selection.json || fail "the selection failed"
sha256sum experiments/act2/dev-selection.json
