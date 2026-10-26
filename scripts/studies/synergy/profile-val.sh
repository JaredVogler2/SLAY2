#!/usr/bin/env bash
# Stage B2-val, secondary descriptives (ADR-050 item 6): how often each arm skipped a card reward and what the decks it brought to the
# Act-1 boss held (the parts of the advisor's index), A* against d0* paired by class and seed. Read-only on the batches; run after pool-val.sh.
#   profile-val.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
mkdir -p experiments/synergy/val
B=experiments/batches
"$PY" -m slay2_sim.synergyreport \
  --arm astar "$B/advisor_v1-astar-{class}-a0-veteran-val-n2000" \
  --arm d0star "$B/advisor_v1-d0star-{class}-a0-veteran-val-n2000" \
  --diff astar d0star \
  --out experiments/synergy/val/arm-profile.json
