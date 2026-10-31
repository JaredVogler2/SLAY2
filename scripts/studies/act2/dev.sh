#!/usr/bin/env bash
# The development stage of ADR-060 (item 5): on the development seeds dev[1000:1600) of every class (the same seeds in each; none of them was used to
# fit a value), S, the lead L, the six Act-2 late-threshold candidates and, if some class kept its fitted Act-2 values, the Act-2 values V, each in
# 600 games per class: 3,000 games an arm. Resumable (a batch with a manifest is checked and never touched). Start from a clean checkout of the commit
# that carries the fitted value files and the registration, and push nothing until it is done.
#   dev.sh <workers>
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
export WORKERS=${1:-4}
fail() { echo "dev: $*" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "tracked files are modified: start from a clean checkout"
for f in $(act2_files); do
  git ls-files --error-unmatch "$f" > /dev/null 2>&1 || fail "$f is not committed: run fit.sh and commit its files first"
done
[ ! -e experiments/act2/dev-selection.json ] || fail "experiments/act2/dev-selection.json exists: the screen is read once"
exec 9> "$OUT/dev.lock"
flock -n 9 || fail "another run holds $OUT/dev.lock"
here=$(git rev-parse HEAD)
if [ -f "$OUT/dev-head.txt" ]; then
  [ "$(cat "$OUT/dev-head.txt")" = "$here" ] || fail "this stage started from $(cat "$OUT/dev-head.txt"), not from $here"
else
  echo "$here" > "$OUT/dev-head.txt"
fi
export STUDY_HEAD=$here
anyfit=$("$PY" - <<'PYEOF'
import json
print(any(json.load(open(f"experiments/cardvalue/{c}-a0-act2-v1.json"))["fitted"] for c in ("ironclad", "silent", "regent", "necrobinder", "defect")))
PYEOF
) || fail "cannot read the fitted value files"
arms="s lead $P_TAGS"
[ "$anyfit" = True ] && arms="s v lead $P_TAGS"
for arm in $arms; do
  for C in $CLASSES; do
    run_batch "$(dev_id "$arm" "$C")" "$(arm_policy "$arm")" "$(arm_params "$arm" "$C")" "$C" dev "$DEV_N" "$DEV_OFFSET" || exit $?
  done
  echo "DEV_${arm}_DONE" >> "$OUT/run-done.txt"
done
echo DEV_DONE >> "$OUT/run-done.txt"
echo DEV_DONE
