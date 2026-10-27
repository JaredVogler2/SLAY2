# Shared settings of the synergy test repeated with the relics kept (ADR-054); sourced, not run.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
cd "$ROOT" || exit 1
export PYTHONPATH="${ROOT}/sim${PYTHONPATH:+:$PYTHONPATH}"
PY=${PY:-python3}
OUT=${OUT:-artifacts/keepsynergy}
SEEDS=experiments/seeds/ironclad-a0-v2.json
CLASSES="Ironclad Silent Regent Necrobinder Defect"
mkdir -p "$OUT"
lower() { echo "$1" | tr 'A-Z' 'a-z'; }
# the arms of ADR-050 addendum D, unchanged
ASTAR='{"engines":0,"margin":0.0,"needs":1,"scalers":0.7}'
D0STAR='{"synergy":0,"margin":0}'
