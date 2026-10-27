#!/usr/bin/env bash
# Stage B2-dev (ADR-050 item 3): the comparisons the selection rule reads, and the rule applied by its program.
#   select-dev.sh 1        d1..d4 against d0 (pooled over the five classes), then the phase-1 rule -> selection-phase1.json
#   select-dev.sh 2 d2     m1 and m2 against the chosen arm at margin 0, then the phase-2 rule -> selection-phase2.json
# The numbers it prints are tuning numbers, not evidence: the held-out test is stage B2-val.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
HERE="$(dirname "${BASH_SOURCE[0]}")"
case "${1:-}" in
  1)
    for arm in d1 d2 d3 d4; do bash "$HERE/compare-dev.sh" "$arm" d0 || exit 1; done
    "$PY" -m slay2_sim.synergydev --phase 1 --dir experiments/synergy/dev --out experiments/synergy/dev/selection-phase1.json || exit 1
    chosen=$("$PY" -c 'import json; print(json.load(open("experiments/synergy/dev/selection-phase1.json"))["chosen"])')
    echo "next: CHOSEN='$("$PY" -m slay2_sim.synergydev --fragment "$chosen")' bash scripts/studies/synergy/run-dev.sh 2 4" ;;
  2)
    chosen=${2:?the arm phase 1 chose, e.g. d2}
    for arm in m1 m2; do bash "$HERE/compare-dev.sh" "$arm" "$chosen" || exit 1; done
    "$PY" -m slay2_sim.synergydev --phase 2 --chosen "$chosen" --dir experiments/synergy/dev --out experiments/synergy/dev/selection-phase2.json || exit 1
    "$PY" -m slay2_sim.synergydev --astar --dir experiments/synergy/dev ;;
  *) echo "usage: select-dev.sh 1 | select-dev.sh 2 <chosen arm>" >&2; exit 2 ;;
esac
