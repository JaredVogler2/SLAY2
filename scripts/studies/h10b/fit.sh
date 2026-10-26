#!/usr/bin/env bash
# The one fit: logistic regression of "got past the Act-1 boss" on the class and the relic taken, ridge on the relic columns,
# cross-validation and bootstrap by seed. Prints the SHA-256 that goes into ADR-049 and must be pushed before any val game.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
"$PY" -m slay2_sim.neowvalue \
  --batches experiments/neow/explore-ironclad-a0-train-n3000 experiments/neow/explore-silent-a0-train-n3000 experiments/neow/explore-regent-a0-train-n3000 \
            experiments/neow/explore-necrobinder-a0-train-n3000 experiments/neow/explore-defect-a0-train-n3000 \
  --out experiments/neow/neow-values-v2.json --bootstrap 200 --min-taken 30
sha256sum experiments/neow/neow-values-v2.json
