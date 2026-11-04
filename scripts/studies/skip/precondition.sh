#!/usr/bin/env bash
# Precondition of ADR-065 (item 6), on development seeds: does each arm play in each Act 1, in every class, and does the price bite?
# 100 dev seeds per class and arm (dev[0:100)), exact class ids; S0 is the baseline `A*`, S1 the pilot that charges for a slot, in Overgrowth and in
# Underdocks (2,000 games). The dev seeds are not held-out data; nothing here is evidence of anything but that the arms run and that the price is in force.
#   precondition.sh <workers>
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
export WORKERS=${1:-4}
DIR=$RESULTS/precondition
for LEG in $LEGS; do
  for C in $CLASSES; do
    l=$(lower "$C")
    run_batch "pre-slot-$LEG-s1-$l" "$LEG" "$C" dev 100 0 "$DIR/$LEG-s1-$l" || exit $?
    # the baseline of the same seeds, played here with the same command and no price (its batch is in this directory, apart from the held-out baselines)
    if [ ! -f "$DIR/$LEG-s0-$l/manifest.json" ]; then
      guard_tree || exit 1
      nice -n 8 "$PY" -m slay2_sim run --policy advisor_v1 --policy-params "$S0_PARAMS" --character "$C" --ascension 0 --act1 "$(act1_of "$LEG")" --profile veteran \
        --seeds "$SEEDS" --partition dev --offset 0 --n 100 --keep-relics --workers "$WORKERS" --trace 0 --batch-id "pre-slot-$LEG-s0-$l" \
        --out "$DIR/$LEG-s0-$l" >> "$OUT/dev-pre-slot-$LEG-s0-$l.log" 2>&1
      s=$?; [ "$s" = 0 ] || [ "$s" = 2 ] || { echo "precondition: baseline for $C ($LEG) failed with status $s" >&2; exit "$s"; }
    fi
    verify_batch "$DIR/$LEG-s0-$l" dev 100 "$LEG" s0 "$C" || exit $?
  done
done
"$PY" -I "$(dirname "${BASH_SOURCE[0]}")/precondition_report.py" --dir "$DIR" --out "$RESULTS/precondition.json"
