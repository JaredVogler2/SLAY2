# Shared settings of the Act-2 study (ADR-060); sourced, not run.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
cd "$ROOT" || exit 1
export PYTHONPATH="${ROOT}/sim${PYTHONPATH:+:$PYTHONPATH}"
PY=${PY:-python3}
OUT=${OUT:-artifacts/act2}
SEEDS=experiments/seeds/ironclad-a0-v2.json
CLASSES="Ironclad Silent Regent Necrobinder Defect"
LEVEL_CONFIDENCE=0.98333333333333   # 1 - 0.05 / 3: the level each of the three tests is read at (ADR-060 item 4)
DEV_OFFSET=1000                     # the development slice dev[1000:1600): five classes, the same seeds in each
DEV_N=600
VAL_N=2000
LEAD_THRESHOLD=0.2                  # the card-pick threshold of the ADR-036 lead, applied in every act
mkdir -p "$OUT"
lower() { echo "$1" | tr 'A-Z' 'a-z'; }

# --- the arms (ADR-060 item 1) --------------------------------------------------------------------------------------------------------
# S: rules_v2 following the card values the site shows (experiments/cardvalue/site-sets.json), threshold 0, in every act.
shown_values() { # <ExactClass> -> the value file the site shows for the class
  local l; l=$(lower "$1")
  if [ "$1" = Ironclad ]; then echo "experiments/cardvalue/ironclad-a0-v2.json"; else echo "experiments/cardvalue/${l}-a0-keep-v1.json"; fi
}
act2_values() { echo "experiments/cardvalue/$(lower "$1")-a0-act2-v1.json"; } # the shown values with the Act-2 fit of ADR-060 item 3
exploration_batch() { echo "experiments/cardvalue/explore4-$(lower "$1")-a0-keeprelics-dev-o5000-n5000"; }
# the late-threshold candidates of the development screen: tag -> threshold. pall takes the best card offered in Act 2 whatever its value
# (unless the deck is full), pnone never takes a card in Act 2; the thresholds in between are on the scale of the shown values.
P_TAGS="pall p010 p020 p035 p050 pnone"
p_threshold() { case "$1" in pall) echo -100.0 ;; p010) echo 0.1 ;; p020) echo 0.2 ;; p035) echo 0.35 ;; p050) echo 0.5 ;; pnone) echo 100.0 ;; *) return 1 ;; esac; }

# arm -> policy name and parameters, for a class. Arms: s (the baseline), lead (the ADR-036 lead: threshold 0.2 in every act), a P tag
# (Act-2 threshold only; every other act is S), v (the Act-2 values in Act 2 only, Act-2 threshold 0).
arm_policy() { case "$1" in s|lead) echo rules_v2 ;; *) echo rules_v2_late ;; esac; }
arm_params() { # <arm> <ExactClass>
  local arm=$1 c=$2 sv; sv=$(shown_values "$c")
  case "$arm" in
    s)    echo "{\"threshold\":0.0,\"values\":\"$sv\"}" ;;
    lead) echo "{\"threshold\":$LEAD_THRESHOLD,\"values\":\"$sv\"}" ;;
    v)    echo "{\"threshold\":0.0,\"values\":\"$sv\",\"late_values\":\"$(act2_values "$c")\",\"late_threshold\":0.0}" ;;
    p*)   echo "{\"threshold\":0.0,\"values\":\"$sv\",\"late_threshold\":$(p_threshold "$arm")}" ;;
    *)    return 1 ;;
  esac
}
dev_id() { echo "act2dev-$1-$(lower "$2")-a0-veteran-keeprelics-dev-o${DEV_OFFSET}-n${DEV_N}"; }   # <arm> <ExactClass>
val_id() { echo "act2-$1-$(lower "$2")-a0-veteran-keeprelics-val-n${VAL_N}"; }                     # <arm> <ExactClass>

# Every value file an arm reads, with the file the registration quotes the hash of (the five shown sets and the five Act-2 fits).
shown_files() { local c; for c in $CLASSES; do shown_values "$c"; done; }
act2_files() { local c; for c in $CLASSES; do act2_values "$c"; done; }
# Everything the arms read or run: the code and data that must be those of the registration commit when the first held-out game is played.
PINNED_PATHS="sim scripts/studies/act2 scripts/verify-pooled.py packages/game-data/data experiments/cardvalue experiments/seeds external/pins.json"
# What the arms execute: the code and data that must be the same in the commit the development stage was played from (DEV_HEAD, quoted in
# part 2 of the record) and in the commit that registers the held-out run, so that the arms chosen are the arms that were screened (addendum B).
# The analysis tool of the study (act2study.py) plays no game and is left out; the definitions of the arms in this file are compared as a table
# of what each arm runs (arm_table, below) and not as text, so that the scripts around them can be hardened without moving the arms.
SCREENED_PATHS=(sim/slay2_sim ':(exclude)sim/slay2_sim/act2study.py' packages/game-data/data experiments/cardvalue experiments/seeds external/pins.json)
arm_table() { # every arm's policy and parameters, batch ids and value files for every class, and the seeds and sizes (what the arms are)
  local arm C
  for arm in s v lead $P_TAGS; do
    for C in $CLASSES; do
      echo "$arm|$C|$(arm_policy "$arm")|$(arm_params "$arm" "$C")|$(dev_id "$arm" "$C")|$(val_id "$arm" "$C")|$(shown_values "$C")|$(act2_values "$C")"
    done
  done
  echo "$SEEDS|$DEV_OFFSET|$DEV_N|$VAL_N|$LEAD_THRESHOLD|$P_TAGS"
}
# The reading code: frozen at the registration commit, checked again when the tests are pooled (addendum B).
READING_PATHS="scripts/lib/act2.mjs scripts/lib/pooled.mjs scripts/verify-pooled.py"

# The text of ADR-060 itself (its heading to the next one, or the end of the log): what the preflight reads the quoted hashes from.
adr_section() { awk '/^## .*ADR-060:/ { p = 1; print; next } /^## / { if (p) exit } p' docs/DECISIONS.md; }

# What a finished batch has to be (read from its own manifest): the policy and the parameters, the class, the seeds and the Ascension it was
# asked to play, the relics kept, the class start verified, played from a clean working tree of the commit the stage started from ($STUDY_HEAD,
# when set), no game ended in an abort or an error of ours (simulator errors, step limits and timeouts are excluded and counted, as ADR-060
# item 3 says) and at least 90 % of the games completed (ADR-060 addendum B hardened this: a finished batch left under the same id by another
# policy, class, parameters or commit no longer passes).
verify_batch() { # <batch dir> <policy> <params json> <ExactClass> <partition> <n> <offset>   (scripts/studies/act2/verify_batch.py)
  STUDY_HEAD_EXPECTED="${STUDY_HEAD:-}" "$PY" "$ROOT/scripts/studies/act2/verify_batch.py" "$@"
}

# The working tree is the commit the stage started from, with no tracked file changed (a held-out run takes hours).
guard_tree() {
  [ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "guard_tree: tracked files are modified" >&2; return 1; }
  [ -z "${STUDY_HEAD:-}" ] || [ "$(git rev-parse HEAD)" = "$STUDY_HEAD" ] || { echo "guard_tree: HEAD is not the commit the stage started from ($STUDY_HEAD)" >&2; return 1; }
}

# One batch: run_batch <batch id> <policy> <params json> <ExactClass> <partition> <n> <offset>
# A batch that has a manifest is checked and never touched; one that does not is run and then checked, so that no usage error, no stale
# manifest and no batch with games that ended in an error of ours reaches the next step as "finished".
run_batch() {
  local id=$1 policy=$2 params=$3 cls=$4 part=$5 n=$6 off=$7 W=${WORKERS:-4}
  local dest=experiments/batches/$id
  if [ -f "$dest/manifest.json" ]; then verify_batch "$dest" "$policy" "$params" "$cls" "$part" "$n" "$off"; return $?; fi
  guard_tree || return 1
  nice -n 8 "$PY" -m slay2_sim run --policy "$policy" --policy-params "$params" --character "$cls" --ascension 0 --profile veteran \
    --seeds "$SEEDS" --partition "$part" --offset "$off" --n "$n" --keep-relics --workers "$W" --trace 0 --batch-id "$id" >> "$OUT/$part-$id.log" 2>&1
  local status=$?
  echo "RUN_${id}_EXIT=$status" >> "$OUT/run-done.txt"
  # exit code 2 means that some episodes ended in a simulator error, which is normal (a usage error exits 2 as well, and leaves no manifest:
  # verify_batch is what tells them apart); anything else stops the run (RESUME=1 continues it)
  if [ "$status" != 0 ] && [ "$status" != 2 ]; then echo "run_batch: $id failed with status $status (see $OUT/$part-$id.log)" >&2; return "$status"; fi
  verify_batch "$dest" "$policy" "$params" "$cls" "$part" "$n" "$off"
}

# The arms of the held-out run: S (replayed under the study's commit, the baseline of all three tests), the lead L, and P and V if the development
# screen sent them forward (experiments/act2/dev-selection.json, whose SHA-256 the registration quotes).
val_arms() {
  "$PY" - <<'PYEOF'
import json
d = json.load(open("experiments/act2/dev-selection.json"))
arms = ["s", "lead"]
if d["P"]["advance"]:
    arms.append(d["P"]["arm"])
if d["V"]["advance"]:
    arms.append("v")
print(" ".join(arms))
PYEOF
}
# the test each non-baseline arm belongs to: L (the lead), P (the late threshold the screen chose), V (the Act-2 values)
test_name() { case "$1" in lead) echo L ;; v) echo V ;; p*) echo P ;; *) return 1 ;; esac; }
