# Shared settings of the H10b scripts; sourced, not run.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
cd "$ROOT" || exit 1
export PYTHONPATH="${ROOT}/sim${PYTHONPATH:+:$PYTHONPATH}"
PY=${PY:-python3}
OUT=${OUT:-artifacts/h10b}
SEEDS=experiments/seeds/ironclad-a0-v2.json
CLASSES="Ironclad Silent Regent Necrobinder Defect"
mkdir -p "$OUT"

# the card-value file of a class as the baselines used it (Ironclad: the policy's default values)
policy_params() { # <ExactClass> <extra json fragment, may be empty>
  local c=$1 extra=$2 l; l=$(echo "$c" | tr 'A-Z' 'a-z')
  if [ "$c" = Ironclad ]; then echo "{\"threshold\":0.0${extra}}"; else echo "{\"threshold\":0.0,\"values\":\"experiments/cardvalue/${l}-a0-v1.json\"${extra}}"; fi
}
