# Shared settings of the threshold study (ADR-062); sourced, not run.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
cd "$ROOT" || exit 1
export PYTHONPATH="${ROOT}/sim${PYTHONPATH:+:$PYTHONPATH}"
PY=${PY:-python3}
OUT=${OUT:-artifacts/thresh}
SEEDS=experiments/seeds/ironclad-a0-v4.json
DEV_PARTITION=dev2                  # 3,000 development seeds nobody has played (v4 appends them to v3's partitions; the sealed test partition is not touched)
DEV_N=3000
VAL_PARTITION=val3                  # 10,000 held-out seeds nobody has played
VAL_N=10000
CLASSES="Ironclad Defect"           # the classes that win: 94 % of the baseline's wins in ADR-061 (the other three almost never win)
STUDY_ALPHA=0.05                    # split over the held-out tests that are played (ADR-062 item 4)
mkdir -p "$OUT"
lower() { echo "$1" | tr 'A-Z' 'a-z'; }

# --- the arms (ADR-062 item 1) --------------------------------------------------------------------------------------------------------
# S: rules_v2 following the card values the site shows (experiments/cardvalue/site-sets.json), threshold 0, in every act.
shown_values() { # <ExactClass> -> the value file the site shows for the class
  local l; l=$(lower "$1")
  if [ "$1" = Ironclad ]; then echo "experiments/cardvalue/ironclad-a0-v2.json"; else echo "experiments/cardvalue/${l}-a0-keep-v1.json"; fi
}
# The thresholds of the card reward of Act 2 (tag -> threshold of late_threshold; every other act is S): +100 never takes a card in Act 2. The values are the
# shown values, so the thresholds are on that scale (a reward is skipped when its best card is not worth more than the threshold; how many are skipped is
# not stated here: the development stage reports each arm's mean final deck size).
GRID_TAGS="t010 t020 t030 t045 t060 tnone"
tag_threshold() { case "$1" in t010) echo 0.1 ;; t020) echo 0.2 ;; t030) echo 0.3 ;; t045) echo 0.45 ;; t060) echo 0.6 ;; tnone) echo 100.0 ;; *) return 1 ;; esac; }
REPLICATION_TAG=t020                # the threshold ADR-061 tested; T1 replicates it
arm_policy() { case "$1" in s) echo rules_v2 ;; t*) tag_threshold "$1" > /dev/null && echo rules_v2_late ;; *) return 1 ;; esac; }
arm_params() { # <arm> <ExactClass>
  local arm=$1 c=$2 sv; sv=$(shown_values "$c")
  case "$arm" in
    s)  echo "{\"threshold\":0.0,\"values\":\"$sv\"}" ;;
    t*) echo "{\"threshold\":0.0,\"values\":\"$sv\",\"late_threshold\":$(tag_threshold "$arm"),\"late_acts\":[1]}" ;;
    *)  return 1 ;;
  esac
}
dev_id() { echo "thresh-dev-$1-$(lower "$2")-a0-veteran-keeprelics-${DEV_PARTITION}-n${DEV_N}"; }   # <arm> <ExactClass>
val_id() { echo "thresh-val-$1-$(lower "$2")-a0-veteran-keeprelics-${VAL_PARTITION}-n${VAL_N}"; }   # <arm> <ExactClass>

# Every value file an arm reads: the shown sets of the study's classes (their SHA-256 is quoted in ADR-062).
shown_files() { local c; for c in $CLASSES; do shown_values "$c"; done; }
# Everything the arms read or run, and the tools that decide how they are read: the code and data that must be those of the registration commit when the
# first development game is played, and (part 2) when the first held-out game is played and again when the tests are pooled. The tests of the harness and
# the README of this folder run nothing.
PINNED_PATHS=(sim scripts/studies/thresh scripts/verify-pooled.py packages/game-data/data experiments/cardvalue experiments/seeds external/pins.json ':(exclude)sim/tests' ':(exclude)scripts/studies/thresh/README.md')
# What the arms execute: the code and data that must be the same in the commit the development stage was played from (DEV_HEAD, quoted in part 2 of the
# record) and in the commit that registers the held-out run, so that the arms chosen are the arms that were screened. The analysis tool of the study
# (threshstudy.py) plays no game and is left out; the definitions of the arms in this file are compared as a table of what each arm runs (arm_table, below).
SCREENED_PATHS=(sim/slay2_sim ':(exclude)sim/slay2_sim/threshstudy.py' packages/game-data/data experiments/cardvalue experiments/seeds external/pins.json)
# The reading code: written during the development stage and frozen by part 2 of the record (before the first held-out game), checked again when the tests are
# pooled. The development stage does not read it.
READING_PATHS=(scripts/lib/thresh.mjs scripts/lib/pooled.mjs)
# What differs between a commit and the working tree (tracked files, so uncommitted edits count) in the pinned paths (and, from part 2 on, the reading paths).
# Prints it and fails if anything does, or if a path the registration pins does not exist (a pathspec that matches nothing would make `git diff --quiet` succeed).
pinned_problem() { # <commit> [with-reading]
  local ref=$1 p paths=("${PINNED_PATHS[@]}")
  [ "${2:-}" = with-reading ] && paths+=("${READING_PATHS[@]}")
  for p in "${paths[@]}"; do
    case "$p" in ':('*) continue ;; esac
    [ -e "$p" ] || { echo "$p does not exist"; return 1; }
  done
  git diff --quiet "$ref" -- "${paths[@]}" && return 0
  git diff --name-only "$ref" -- "${paths[@]}" | head -5 | tr '\n' ' '
  return 1
}
arm_table() { # every arm's policy and parameters, batch ids and value file for every class, and the seeds, the partitions and the sizes (what the arms are)
  local arm C
  for arm in s $GRID_TAGS; do
    for C in $CLASSES; do
      echo "$arm|$C|$(arm_policy "$arm")|$(arm_params "$arm" "$C")|$(dev_id "$arm" "$C")|$(val_id "$arm" "$C")|$(shown_values "$C")"
    done
  done
  echo "$SEEDS|$DEV_PARTITION|$DEV_N|$VAL_PARTITION|$VAL_N|$GRID_TAGS|$REPLICATION_TAG|$STUDY_ALPHA"
}

# The text of ADR-062 itself (its heading to the next one, or the end of the log): what the preflights read the quoted hashes from.
adr_section() { awk '/^## .*ADR-062:/ { p = 1; print; next } /^## / { if (p) exit } p' docs/DECISIONS.md; }

# What a finished batch has to be (read from its own manifest): the policy and the parameters, the class, the seeds and the Ascension it was
# asked to play, the relics kept, the class start verified, played from a clean working tree of the commit the stage started from ($STUDY_HEAD,
# when set), no game ended in an abort or an error of ours (simulator errors, step limits and timeouts are excluded and counted, as ADR-062
# item 3 says) and at least 90 % of the games completed.
verify_batch() { # <batch dir> <policy> <params json> <ExactClass> <partition> <n> <offset>   (scripts/studies/thresh/verify_batch.py)
  STUDY_HEAD_EXPECTED="${STUDY_HEAD:-}" "$PY" "$ROOT/scripts/studies/thresh/verify_batch.py" "$@"
}

# The working tree is the commit the stage started from, with no tracked file changed (a stage takes hours).
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

# The arms and tests of the held-out run: S, 0.2 and, if the development screen advanced a threshold, that threshold; T1 always, T2 and T3 then
# (experiments/thresh/dev-selection.json, whose SHA-256 part 2 of the record quotes). The tests' level is the study-wise 0.05 divided by their number.
val_arms() { "$PY" -m slay2_sim.threshstudy tests --selection experiments/thresh/dev-selection.json | "$PY" -c "import json,sys; print(' '.join(json.load(sys.stdin)['arms']))"; }
val_level() { "$PY" -m slay2_sim.threshstudy tests --selection experiments/thresh/dev-selection.json | "$PY" -c "import json,sys; print(repr(1 - json.load(sys.stdin)['level']))"; }
# the held-out tests, one a line: "<key> <arm> <baseline>" (T1 always; T2 and T3 if the screen advanced a threshold)
test_lines() { "$PY" -m slay2_sim.threshstudy tests --selection experiments/thresh/dev-selection.json | "$PY" -c "import json,sys; [print(t['key'], t['arm'], t['baseline']) for t in json.load(sys.stdin)['tests']]"; }
