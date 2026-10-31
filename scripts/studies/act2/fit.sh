#!/usr/bin/env bash
# The Act-2 fit of ADR-060 item 3, run once: for each class the shown card values are the prior and the five randomised-drafting batches with the
# relics kept (explore4, dev[5000:10000), ADR-053) say whether a card-specific part predicts held-out Act-2 boss fights better than the scale of the
# shown ranking alone. Output: experiments/cardvalue/<class>-a0-act2-v1.json (a class that does not pass the gate keeps its shown values in the file).
#   fit.sh            (pure numpy: no game is played)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "fit: $*" >&2; exit 1; }
for C in $CLASSES; do
  out=$(act2_values "$C")
  [ ! -e "$out" ] || fail "$out exists: the fit is run once"
  [ -z "$(git log --all --oneline -1 -- "$out")" ] || fail "$out is in the history: the fit is run once"
  [ -f "$(exploration_batch "$C")/manifest.json" ] || fail "$(exploration_batch "$C") is missing"
done
for C in $CLASSES; do
  "$PY" -m slay2_sim.latevalues --shown "$(shown_values "$C")" --batches "$(exploration_batch "$C")" --out "$(act2_values "$C")" || fail "the fit of $C failed"
  sha256sum "$(act2_values "$C")" >> "$OUT/fit-sha256.txt" || fail "cannot hash $(act2_values "$C")"
done
echo FIT_DONE
