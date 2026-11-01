# Shared settings of the acts study (ADR-061); sourced, not run.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
cd "$ROOT" || exit 1
export PYTHONPATH="${ROOT}/sim${PYTHONPATH:+:$PYTHONPATH}"
PY=${PY:-python3}
OUT=${OUT:-artifacts/acts}
SEEDS=experiments/seeds/ironclad-a0-v3.json
PARTITION=val2                      # 3,000 seeds nobody has played: v3 appends them to v2's partitions (the sealed test partition is not touched)
CLASSES="Ironclad Silent Regent Necrobinder Defect"
LEVEL_CONFIDENCE=0.9875             # 1 - 0.05 / 4: the level each of the four tests is read at (ADR-061 item 4)
VAL_N=3000
LEAD_THRESHOLD=0.2                  # the card-pick threshold of the ADR-036 lead, applied in every act (and in the one act of A1, A2 and A3)
mkdir -p "$OUT"
lower() { echo "$1" | tr 'A-Z' 'a-z'; }

# --- the arms (ADR-061 item 1) --------------------------------------------------------------------------------------------------------
# S: rules_v2 following the card values the site shows (experiments/cardvalue/site-sets.json), threshold 0, in every act.
shown_values() { # <ExactClass> -> the value file the site shows for the class
  local l; l=$(lower "$1")
  if [ "$1" = Ironclad ]; then echo "experiments/cardvalue/ironclad-a0-v2.json"; else echo "experiments/cardvalue/${l}-a0-keep-v1.json"; fi
}
ARMS_ALL="s lead a1 a2 a3"
# arm -> policy name and parameters, for a class. Arms: s (the baseline), lead (threshold 0.2 in every act), a1 / a2 / a3 (threshold 0.2 in the
# card rewards of Act 1 / Act 2 / Act 3 only and S's threshold 0 in the others; the acts are counted from 0 in the policy's parameters).
arm_policy() { case "$1" in s|lead) echo rules_v2 ;; a1|a2|a3) echo rules_v2_late ;; *) return 1 ;; esac; }
arm_params() { # <arm> <ExactClass>
  local arm=$1 c=$2 sv; sv=$(shown_values "$c")
  case "$arm" in
    s)    echo "{\"threshold\":0.0,\"values\":\"$sv\"}" ;;
    lead) echo "{\"threshold\":$LEAD_THRESHOLD,\"values\":\"$sv\"}" ;;
    a1)   echo "{\"threshold\":0.0,\"values\":\"$sv\",\"late_threshold\":$LEAD_THRESHOLD,\"late_acts\":[0]}" ;;
    a2)   echo "{\"threshold\":0.0,\"values\":\"$sv\",\"late_threshold\":$LEAD_THRESHOLD,\"late_acts\":[1]}" ;;
    a3)   echo "{\"threshold\":0.0,\"values\":\"$sv\",\"late_threshold\":$LEAD_THRESHOLD,\"late_acts\":[2]}" ;;
    *)    return 1 ;;
  esac
}
val_id() { echo "acts-$1-$(lower "$2")-a0-veteran-keeprelics-${PARTITION}-n${VAL_N}"; }   # <arm> <ExactClass>

# The test each non-baseline arm belongs to: L (the lead), A1 / A2 / A3 (pickier in one act only)
test_name() { case "$1" in lead) echo L ;; a1) echo A1 ;; a2) echo A2 ;; a3) echo A3 ;; *) return 1 ;; esac; }
TESTS="L A1 A2 A3"

# Every value file an arm reads: the five shown sets (their SHA-256 is quoted in ADR-061).
shown_files() { local c; for c in $CLASSES; do shown_values "$c"; done; }
# Everything the arms read or run, and the tools that decide what is read: the code and data that must be those of the registration commit when
# the first held-out game is played.
PINNED_PATHS="sim scripts/studies/acts scripts/verify-pooled.py packages/game-data/data experiments/cardvalue experiments/seeds external/pins.json"
# The reading code: frozen at the registration commit, checked again when the tests are pooled.
READING_PATHS="scripts/lib/acts.mjs scripts/lib/pooled.mjs scripts/verify-pooled.py"
arm_table() { # every arm's policy and parameters, batch ids and value file for every class, and the seeds, the partition and the sizes (what the arms are)
  local arm C
  for arm in $ARMS_ALL; do
    for C in $CLASSES; do
      echo "$arm|$C|$(arm_policy "$arm")|$(arm_params "$arm" "$C")|$(val_id "$arm" "$C")|$(shown_values "$C")"
    done
  done
  echo "$SEEDS|$PARTITION|$VAL_N|$LEAD_THRESHOLD|$LEVEL_CONFIDENCE|$TESTS"
}

# The text of ADR-061 itself (its heading to the next one, or the end of the log): what the preflight reads the quoted hashes from.
adr_section() { awk '/^## .*ADR-061:/ { p = 1; print; next } /^## / { if (p) exit } p' docs/DECISIONS.md; }

# What a finished batch has to be (read from its own manifest): the policy and the parameters, the class, the seeds and the Ascension it was
# asked to play, the relics kept, the class start verified, played from a clean working tree of the commit the stage started from ($STUDY_HEAD,
# when set), no game ended in an abort or an error of ours (simulator errors, step limits and timeouts are excluded and counted, as ADR-061
# item 3 says) and at least 90 % of the games completed.
verify_batch() { # <batch dir> <policy> <params json> <ExactClass> <partition> <n> <offset>   (scripts/studies/acts/verify_batch.py)
  STUDY_HEAD_EXPECTED="${STUDY_HEAD:-}" "$PY" "$ROOT/scripts/studies/acts/verify_batch.py" "$@"
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
