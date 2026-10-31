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

# The text of ADR-060 itself (its heading to the next one, or the end of the log): what the preflight reads the quoted hashes from.
adr_section() { awk '/^## .*ADR-060:/ { p = 1; print; next } /^## / { if (p) exit } p' docs/DECISIONS.md; }

# What a finished batch has to be (read from its own manifest): the policy, the seeds and the Ascension it was asked to play, the relics
# kept, the class start verified, played from a clean working tree, no game ended in an abort or an error of ours (simulator errors, step
# limits and timeouts are excluded and counted, as ADR-060 item 3 says) and at least 90 % of the games completed.
verify_batch() { # <batch dir> <policy> <partition> <n> <offset>
  "$PY" - "$@" <<'PYEOF'
import json, sys
d, policy, part, n, off = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
try:
    m = json.load(open(d + "/manifest.json"))
except Exception as e:  # noqa: BLE001
    sys.exit(f"verify_batch: {d}: no readable manifest ({e})")
c = m["summary"]["counts"]
bad = sum(c[k] for k in ("aborted", "harness_error", "policy_error", "invalid_action"))
env = (m.get("environment") or {}).get("slay2") or {}
problems = []
if m["policy"]["name"] != policy: problems.append(f"policy {m['policy']['name']}")
if m["config"]["ascension"] != 0: problems.append(f"Ascension {m['config']['ascension']}")
if m["config"].get("keep_relics") is not True: problems.append("relics not kept")
s = m["seeds"]
if s["partition"] != part or s["n"] != n or m["summary"]["episodes"] != n or int(s.get("offset", 0)) != off: problems.append("seeds")
if bad: problems.append(f"{bad} games ended in an abort, a harness error, a policy error or an invalid action")
if m["summary"]["completed"] < 0.9 * n: problems.append(f"only {m['summary']['completed']} of {n} completed")
if m.get("class_start_verified") is not True or m.get("canonical_process_state") is not True: problems.append("class start or canonical process state not recorded")
if env.get("dirty") is not False: problems.append("played from a working tree with uncommitted changes")
if problems: sys.exit(f"verify_batch: {d}: " + "; ".join(problems))
PYEOF
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
  if [ -f "$dest/manifest.json" ]; then verify_batch "$dest" "$policy" "$part" "$n" "$off"; return $?; fi
  guard_tree || return 1
  nice -n 8 "$PY" -m slay2_sim run --policy "$policy" --policy-params "$params" --character "$cls" --ascension 0 --profile veteran \
    --seeds "$SEEDS" --partition "$part" --offset "$off" --n "$n" --keep-relics --workers "$W" --trace 0 --batch-id "$id" >> "$OUT/$part-$id.log" 2>&1
  local status=$?
  echo "RUN_${id}_EXIT=$status" >> "$OUT/run-done.txt"
  # exit code 2 means that some episodes ended in a simulator error, which is normal (a usage error exits 2 as well, and leaves no manifest:
  # verify_batch is what tells them apart); anything else stops the run (RESUME=1 continues it)
  if [ "$status" != 0 ] && [ "$status" != 2 ]; then echo "run_batch: $id failed with status $status (see $OUT/$part-$id.log)" >&2; return "$status"; fi
  verify_batch "$dest" "$policy" "$part" "$n" "$off"
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
