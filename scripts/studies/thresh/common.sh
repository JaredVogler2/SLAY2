# Shared settings of the threshold study (ADR-062); sourced, not run.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
cd "$ROOT" || exit 1
export PYTHONPATH="${ROOT}/sim${PYTHONPATH:+:$PYTHONPATH}"
PY=${PY:-python3}
OUT=${OUT:-artifacts/thresh}
SEEDS=experiments/seeds/ironclad-a0-v4.json
DEV_PARTITION=dev2                  # 3,000 development seeds nobody has played (v4 appends them to v3's partitions; the sealed test partition is not touched)
DEV_N=3000
VAL_PARTITION=val3                  # 15,000 held-out seeds nobody has played
VAL_N=15000
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
# first development game is played, and (part 2) when the first held-out game is played and again when the tests are pooled. The tests of the harness, the README
# of this folder and part2.py (which prints the numbers of the second part of the record from files and decides nothing) run nothing.
PINNED_PATHS=(sim scripts/studies/thresh scripts/verify-pooled.py packages/game-data/data experiments/cardvalue experiments/seeds external/pins.json ':(exclude)sim/tests' ':(exclude)scripts/studies/thresh/README.md' ':(exclude)scripts/studies/thresh/part2.py')
# What the arms execute: the code and data that must be the same in the commit the development stage was played from (DEV_HEAD, quoted in part 2 of the
# record) and in the commit that registers the held-out run, so that the arms chosen are the arms that were screened. The analysis tool of the study
# (threshstudy.py) plays no game and is left out; the definitions of the arms in this file are compared as a table of what each arm runs (arm_table, below).
SCREENED_PATHS=(sim/slay2_sim ':(exclude)sim/slay2_sim/threshstudy.py' packages/game-data/data experiments/cardvalue experiments/seeds external/pins.json)
# The reading code, which turns the pooled files into "passed", "not shown" or "reversed" (item 5 of the record): written, tested and committed before the registration and
# frozen from it like the rest. The development stage does not read it; the held-out tests are read by it.
READING_PATHS=(scripts/lib/thresh.mjs scripts/lib/pooled.mjs)
# What the registration (part 1) froze is what the common.sh OF THAT COMMIT lists in PINNED_PATHS and READING_PATHS, read from the commit (one pathspec a line), so that an
# edit of this file after the registration cannot loosen what is compared. Fails if the commit has no such lists.
registered_paths() { # <registration commit (part 1)>
  local defs
  defs=$(git show "$1:scripts/studies/thresh/common.sh" 2>/dev/null | grep -E '^(PINNED_PATHS|READING_PATHS)=\(') || return 1
  [ "$(printf '%s\n' "$defs" | wc -l)" = 2 ] || return 1
  ( eval "$defs" && printf '%s\n' "${PINNED_PATHS[@]}" "${READING_PATHS[@]}" )
}
# The change of the frozen paths between two commits as git's raw diff, which gives the mode and the full object id of each side of each changed file and which no
# setting of git alters (the textual diff abbreviates the ids to core.abbrev, which grows with the repository); the SHA-256 of these lines is what part 2 quotes
# as PINNED_DIFF=.
frozen_change() { # <commit 1> <commit 2> <pathspec>...
  local r1=$1 r2=$2; shift 2
  git diff --raw --no-abbrev --no-renames "$r1" "$r2" -- "$@"
}
# What differs between a commit and the working tree (tracked files, so uncommitted edits count) in the paths the registration (part 1) froze. Prints it and fails if
# anything does, or if a path the registration pins does not exist (a pathspec that matches nothing would make `git diff --quiet` succeed).
pinned_problem() { # <commit> <registration commit (part 1)>
  local ref=$1 p paths=()
  while IFS= read -r p; do paths+=("$p"); done < <(registered_paths "$2")
  [ "${#paths[@]}" -gt 0 ] || { echo "cannot read from the registration commit ${2:0:12} which paths it froze"; return 1; }
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

# The two headings of the record that the scripts look for (each occurs once in it: the first commit that adds its text is the commit that registers that part).
MARKER_ONE='Registration of ADR-062 (part 1, frozen choices)'
MARKER_TWO='Frozen choices of ADR-062 (part 2)'
# The text of ADR-062 itself (its heading to the next one, or the end of the log): what the preflights read the quoted hashes from.
adr_text() { awk '/^## .*ADR-062:/ { p = 1; print; next } /^## / { if (p) exit } p'; }   # stdin: the decision log
adr_section() { adr_text < docs/DECISIONS.md; }
first_commit_with() { git log -S"$1" --format=%H -- docs/DECISIONS.md | tail -1; }          # the first commit whose decision log adds the text
# The design text of the record: the section up to the line that carries the heading of the registration (the context, what I had seen, the items of the design, the
# limits, the power, the cost, the rollback and the review). The registration fixes it; what is learned afterwards is added below it, as addenda and as part 2.
design_text_of() { git show "$1:docs/DECISIONS.md" 2>/dev/null | adr_text | awk -v m="$MARKER_ONE" 'index($0, m) { exit } { print }'; }
design_text_now() { adr_section | awk -v m="$MARKER_ONE" 'index($0, m) { exit } { print }'; }
design_problem() { # <registration commit>: the design text at HEAD is the one the registration commit carries
  local a b
  a=$(design_text_of "$1" | sha256sum | cut -d' ' -f1); b=$(design_text_now | sha256sum | cut -d' ' -f1)
  [ -n "$(design_text_of "$1")" ] && [ "$a" = "$b" ] && return 0
  echo "the design text of ADR-062 (everything before the registration paragraph) is not the one the registration commit ${1:0:12} carries: later notes belong in addenda, below part 2"
  return 1
}
part_diff_problem() { # <part-1 commit> <part-2 commit> <ADR text>: what the registration froze (the paths its common.sh lists) is unchanged at part 2, or part 2 quotes the SHA-256 of the change
  local r1=$1 r2=$2 adr=$3 sha quoted p paths=()
  while IFS= read -r p; do paths+=("$p"); done < <(registered_paths "$r1")
  [ "${#paths[@]}" -gt 0 ] || { echo "cannot read from the registration commit ${r1:0:12} which paths it froze"; return 1; }
  [ -z "$(frozen_change "$r1" "$r2" "${paths[@]}")" ] && return 0
  sha=$(frozen_change "$r1" "$r2" "${paths[@]}" | sha256sum | cut -d' ' -f1)
  quoted=$(grep -oE 'PINNED_DIFF=[0-9a-f]{64}' <<< "$adr" | head -1 | cut -d= -f2)
  [ "$quoted" = "$sha" ] && return 0
  echo "what the registration froze changed between the registration commit ${r1:0:12} and part 2 ($(git diff --name-only --no-renames "$r1" "$r2" -- "${paths[@]}" | head -5 | tr '\n' ' ')); part 2 has to quote the SHA-256 of that change as PINNED_DIFF=$sha, and an addendum has to say why"
  return 1
}

# What a finished batch has to be (read from its own manifest): the policy and the parameters, the class, the seeds and the Ascension it was
# asked to play, the relics kept, the class start verified, played from a clean working tree of the commit the stage started from ($STUDY_HEAD,
# when set), no game ended in an abort or an error of ours (simulator errors, step limits and timeouts are excluded and counted, as ADR-062
# item 3 says) and at least 90 % of the games completed.
verify_batch() { # <batch dir> <policy> <params json> <ExactClass> <partition> <n> <offset>   (scripts/studies/thresh/verify_batch.py)
  STUDY_HEAD_EXPECTED="${STUDY_HEAD:-}" SEEDS_FILE_EXPECTED="$SEEDS" "$PY" "$ROOT/scripts/studies/thresh/verify_batch.py" "$@"
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
