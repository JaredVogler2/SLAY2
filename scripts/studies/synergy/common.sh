# Shared settings of the synergy-study scripts (ADR-050); sourced, not run.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
cd "$ROOT" || exit 1
export PYTHONPATH="${ROOT}/sim${PYTHONPATH:+:$PYTHONPATH}"
PY=${PY:-python3}
OUT=${OUT:-artifacts/synergy}
SEEDS=experiments/seeds/ironclad-a0-v2.json
CLASSES="Ironclad Silent Regent Necrobinder Defect"
DEV_OFFSET=4000
DEV_N=1000
mkdir -p "$OUT"

# The arms of stage B2-dev: advisor_v1 (rules_v3 with its card rewards decided by the page's deck index) with the index's parameters.
#   d0  no synergy term at all (the index of heuristic v0)
#   d1  needs and scalers at what stage B1 measured on the corrected table (1.0, 0.70), no engine credit
#   d2  d1 with engine credit at 0.25
#   d3  d1 with engine credit at 0.5
#   d4  every part at its first judgement (1, 1, 1)
arm_params() {
  case "$1" in
    d0) echo '{"synergy":0}' ;;
    d1) echo '{"needs":1,"scalers":0.7,"engines":0}' ;;
    d2) echo '{"needs":1,"scalers":0.7,"engines":0.25}' ;;
    d3) echo '{"needs":1,"scalers":0.7,"engines":0.5}' ;;
    d4) echo '{"needs":1,"scalers":1,"engines":1}' ;;
    *) echo "unknown arm $1" >&2; return 1 ;;
  esac
}
