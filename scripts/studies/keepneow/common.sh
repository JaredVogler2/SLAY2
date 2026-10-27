# Shared settings of the opening-relic study repeated with the relics kept (ADR-055); sourced, not run.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
cd "$ROOT" || exit 1
export PYTHONPATH="${ROOT}/sim${PYTHONPATH:+:$PYTHONPATH}"
PY=${PY:-python3}
OUT=${OUT:-artifacts/keepneow}
SEEDS=experiments/seeds/ironclad-a0-v2.json
CLASSES="Ironclad Silent Regent Necrobinder Defect"
mkdir -p "$OUT"
lower() { echo "$1" | tr 'A-Z' 'a-z'; }
# The card values the study's pilot follows, exactly as the `rules_v2-<class>` baselines of ADR-049 did (Ironclad: the policy's default
# file). They are fixed here, whatever ADR-053 later decides for the site's second opinion on card rewards.
policy_params() { # <ExactClass> <extra json fragment, may be empty>
  local c=$1 extra=$2 l; l=$(lower "$c")
  if [ "$c" = Ironclad ]; then echo "{\"threshold\":0.0${extra}}"; else echo "{\"threshold\":0.0,\"values\":\"experiments/cardvalue/${l}-a0-v1.json\"${extra}}"; fi
}
explore_id() { echo "neow-explore-$(lower "$1")-a0-keeprelics-train-n3000"; }
# where an exploration batch lives: the directory name is the batch id with "neow-" dropped, as the exporter reads ADR-049's
explore_dir() { echo "experiments/neow/explore-$(lower "$1")-a0-keeprelics-train-n3000"; }
NEW_VALUES=experiments/neow/neow-values-keep-v1.json   # the one fit of this study
OLD_VALUES=experiments/neow/neow-values-v2.json        # the values of ADR-049, fitted in the simulator that drops the relics
