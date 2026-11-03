# Shared settings of the check of the advisor's price of a slot (ADR-065); sourced, not run.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
cd "$ROOT" || exit 1
export PYTHONPATH="${ROOT}/sim${PYTHONPATH:+:$PYTHONPATH}"
PY=${PY:-python3}
OUT=${OUT:-artifacts/skip}
RESULTS=experiments/skip                  # the study's outputs: the precondition, the per-class comparisons, the pooled checks
BATCHES=$RESULTS/batches                  # its batches (the arm that charges for a slot); the baselines are batches that already exist
SEEDS=experiments/seeds/ironclad-a0-v2.json
CLASSES="Ironclad Silent Regent Necrobinder Defect"
LEGS="og ud"                              # Act 1 in Overgrowth, Act 1 in Underdocks
LEVEL_CONFIDENCE=0.95                     # the level of the intervals the check is read at (ADR-065 item 4)
mkdir -p "$OUT"
lower() { echo "$1" | tr 'A-Z' 'a-z'; }

# --- the arms, fixed by ADR-065 --------------------------------------------------------------------------------------------------------
# S0, the baseline: the pilot of ADR-050 addendum D and ADR-054 (`A*`), which charges what version 1 of the index charged (0.6 from the 31st card on).
# S1: the same pilot, charging what the page now charges (one point from the 21st card on, `advisor.SIZE_PRICE` and `SIZE_FROM`).
S0_PARAMS='{"engines":0,"margin":0.0,"needs":1,"scalers":0.7}'
S1_PARAMS='{"engines":0,"margin":0.0,"needs":1,"scalers":0.7,"size":1.0,"size_from":20}'
# Everything the arms read or run: the code and data that must be those of the registration commit when the first held-out game is played.
PINNED_PATHS="sim scripts/studies/skip packages/decision packages/game-data/data experiments/seeds external/pins.json"
# The baseline of the Underdocks leg is the T1 arm `A*` of ADR-064, whose outcomes are not read before that study's three pooled tests exist.
ADR064_POOLED="experiments/underdocks/pooled-ud-t1-synergy-astar-vs-d0star.json experiments/underdocks/pooled-ud-t2-values-shown-vs-rules_v1.json experiments/underdocks/pooled-ud-t3-neow-keep-v1-vs-rules_v2.json experiments/underdocks/robustness-all-pairs.json"
adr064_unpooled() { local f; for f in $ADR064_POOLED; do [ -e "$f" ] || { echo "$f"; return 0; }; done; return 1; }   # prints the first pooled file of ADR-064 that is missing; fails when none is

act1_of() { if [ "$1" = ud ]; then echo underdocks; else echo overgrowth; fi; }
s1_id() { # <ExactClass> <leg> -> the batch id of the arm that charges for a slot
  local l; l=$(lower "$1")
  if [ "$2" = ud ]; then echo "advisor_v1-slot-$l-a0-veteran-keeprelics-underdocks-val-n2000"; else echo "advisor_v1-slot-$l-a0-veteran-keeprelics-val-n2000"; fi
}
s1_dir() { echo "$BATCHES/$(s1_id "$1" "$2")"; }
s0_dir() { # <ExactClass> <leg> -> the directory of the baseline batch, which exists before this study (ADR-054; the T1 arm `A*` of ADR-064)
  local l; l=$(lower "$1")
  if [ "$2" = ud ]; then echo "experiments/underdocks/batches/advisor_v1-astar-$l-a0-veteran-keeprelics-underdocks-val-n2000"
  else echo "experiments/batches/advisor_v1-astar-$l-a0-veteran-keeprelics-val-n2000"; fi
}

# The text of ADR-065 itself (its heading to the next one, or the end of the log): what the preflight reads the registration from.
adr_section() { awk '/^## .*ADR-065:/ { p = 1; print; next } /^## / { if (p) exit } p' docs/DECISIONS.md; }

# What a finished batch has to be (read from its own manifest): the policy and the parameters of the arm (the price it charges, or none), the exact
# class, the seeds, Ascension 0, the veteran profile, the Act 1 of the leg, the relics kept, the class start verified, played from a clean working tree
# (the arm that charges for a slot), no game ended in an abort or an error of ours (simulator errors, step limits and timeouts are excluded and counted,
# as the Power paragraph of ADR-065 says; item 6 (b) holds the precondition to the same) and at least 90 % of the games completed.
verify_batch() { # <batch dir> <partition> <n> <leg> <arm: s0 or s1> <ExactClass>
  [ $# = 6 ] || { echo "verify_batch: usage: verify_batch <batch dir> <partition> <n> <leg> <s0|s1> <ExactClass>" >&2; return 2; }
  local want=$S0_PARAMS
  [ "$5" != s1 ] || want=$S1_PARAMS
  "$PY" - "$@" "$want" <<'EOF'
import json, sys
d, part, n, leg, arm, cls, want_params = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4], sys.argv[5], sys.argv[6], json.loads(sys.argv[7])
if arm not in ("s0", "s1") or leg not in ("og", "ud"):
    sys.exit(f"verify_batch: {d}: the arm is s0 or s1 and the leg og or ud, not {arm!r} and {leg!r}")
try:
    m = json.load(open(d + "/manifest.json"))
except Exception as e:  # noqa: BLE001
    sys.exit(f"verify_batch: {d}: no readable manifest ({e})")
c = m["summary"]["counts"]
bad = sum(c[k] for k in ("aborted", "harness_error", "policy_error", "invalid_action"))
env = (m.get("environment") or {}).get("slay2") or {}
params = (m["policy"].get("params") or {})
problems = []
if m["policy"]["name"] != "advisor_v1": problems.append(f"policy {m['policy']['name']}")
# the parameters as parsed (1 and 1.0 are the same number): a batch of the other arm, or of other numbers, is not the arm it is filed as
if params != want_params: problems.append(f"policy parameters {json.dumps(params, sort_keys=True)}, not {json.dumps(want_params, sort_keys=True)}")
if m["config"].get("character") != cls: problems.append(f"played as {m['config'].get('character')}, not {cls}")
if m["config"]["ascension"] != 0: problems.append(f"Ascension {m['config']['ascension']}")
if m["config"].get("profile") != "veteran": problems.append(f"profile {m['config'].get('profile')}")
if m["config"].get("keep_relics") is not True: problems.append("relics not kept")
want = "underdocks" if leg == "ud" else "overgrowth"
if m["config"].get("act1", "overgrowth") != want: problems.append(f"Act 1 {m['config'].get('act1', 'overgrowth')}, not {want}")
if arm == "s1" and (params.get("size") != 1.0 or params.get("size_from") != 20.0): problems.append(f"price {params.get('size')} from {params.get('size_from')}")
if arm == "s0" and ("size" in params or "size_from" in params): problems.append("the baseline names a price")
if m["seeds"]["partition"] != part or m["seeds"]["n"] != n or m["summary"]["episodes"] != n: problems.append("seeds")
if bad: problems.append(f"{bad} games ended in an abort, a harness error, a policy error or an invalid action")
if m["summary"]["completed"] < 0.9 * n: problems.append(f"only {m['summary']['completed']} of {n} completed")
if m.get("class_start_verified") is not True or m.get("canonical_process_state") is not True: problems.append("class start or canonical process state not recorded")
if arm == "s1" and env.get("dirty") is not False: problems.append("played from a working tree with uncommitted changes")
if problems: sys.exit(f"verify_batch: {d}: " + "; ".join(problems))
EOF
}

# The working tree is the commit the study started from, with no tracked file changed (a held-out run takes hours).
guard_tree() {
  [ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "guard_tree: tracked files are modified" >&2; return 1; }
  [ -z "${STUDY_HEAD:-}" ] || [ "$(git rev-parse HEAD)" = "$STUDY_HEAD" ] || { echo "guard_tree: HEAD is not the commit the study started from ($STUDY_HEAD)" >&2; return 1; }
}

# One batch of the arm that charges for a slot: run_batch <batch id> <leg> <ExactClass> <partition> <n> <offset> [out dir]
# A batch that has a manifest is checked and never touched; one that does not is run and then checked.
run_batch() {
  local id=$1 leg=$2 cls=$3 part=$4 n=$5 off=$6 out=${7:-} W=${WORKERS:-4}
  local dest=${out:-$BATCHES/$id}
  if [ -f "$dest/manifest.json" ]; then verify_batch "$dest" "$part" "$n" "$leg" s1 "$cls"; return $?; fi
  guard_tree || return 1
  nice -n 8 "$PY" -m slay2_sim run --policy advisor_v1 --policy-params "$S1_PARAMS" --character "$cls" --ascension 0 --act1 "$(act1_of "$leg")" --profile veteran \
    --seeds "$SEEDS" --partition "$part" --offset "$off" --n "$n" --keep-relics --workers "$W" --trace 0 --batch-id "$id" \
    --out "$dest" >> "$OUT/$part-$id.log" 2>&1
  local status=$?
  echo "RUN_${id}_EXIT=$status" >> "$OUT/run-done.txt"
  # exit code 2 means that some episodes ended in a simulator error, which is normal (a usage error exits 2 as well, and leaves no manifest:
  # verify_batch is what tells them apart); anything else stops the run (RESUME=1 continues it)
  if [ "$status" != 0 ] && [ "$status" != 2 ]; then echo "run_batch: $id failed with status $status (see $OUT/$part-$id.log)" >&2; return "$status"; fi
  verify_batch "$dest" "$part" "$n" "$leg" s1 "$cls"
}
