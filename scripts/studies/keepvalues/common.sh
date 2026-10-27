# Shared settings of the card-value replication with the relics kept (ADR-053); sourced, not run.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
cd "$ROOT" || exit 1
export PYTHONPATH="${ROOT}/sim${PYTHONPATH:+:$PYTHONPATH}"
PY=${PY:-python3}
OUT=${OUT:-artifacts/keepvalues}
SEEDS=experiments/seeds/ironclad-a0-v2.json
CLASSES="Ironclad Silent Regent Necrobinder Defect"
mkdir -p "$OUT"
lower() { echo "$1" | tr 'A-Z' 'a-z'; }
# the first-round values of a class: they guide the 40 % of the exploration's card rewards that are not random (ADR-031, ADR-046)
first_values() { echo "experiments/cardvalue/$(lower "$1")-a0-v1.json"; }
# the values the site shows now (Ironclad: its second measurement, ADR-046), which the new ones are tested against
current_values() { if [ "$1" = Ironclad ]; then echo experiments/cardvalue/ironclad-a0-v2.json; else first_values "$1"; fi; }
# the new values of a class: the one fit of ADR-053
new_values() { echo "experiments/cardvalue/$(lower "$1")-a0-keep-v1.json"; }
explore_id() { echo "explore4-$(lower "$1")-a0-keeprelics-dev-o5000-n5000"; }
