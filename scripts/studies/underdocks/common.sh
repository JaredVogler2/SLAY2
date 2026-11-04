# Shared settings of the Underdocks transfer study (ADR-064); sourced, not run.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
cd "$ROOT" || exit 1
export PYTHONPATH="${ROOT}/sim${PYTHONPATH:+:$PYTHONPATH}"
PY=${PY:-python3}
OUT=${OUT:-artifacts/underdocks}
RESULTS=experiments/underdocks            # the study's outputs: the precondition, the per-class comparisons, the pooled tests
BATCHES=$RESULTS/batches                  # its batches, apart from experiments/batches: no reader of that directory can pool a game of Underdocks into an Overgrowth cohort
SEEDS=experiments/seeds/ironclad-a0-v2.json
CLASSES="Ironclad Silent Regent Necrobinder Defect"
ASC=0                                     # Ascension 0 and the relics kept: the game of ADR-054, ADR-055 and ADR-058's twin, with Act 1 as the only change
ACT1=underdocks
LEVEL_CONFIDENCE=0.98333333333333   # 1 - 0.05 / 3: the level each of the three tests is read at (ADR-064 item 4)
mkdir -p "$OUT"
lower() { echo "$1" | tr 'A-Z' 'a-z'; }

# --- the arms, all fixed by ADR-064 (nothing is fitted in this study) ------------------------------------------------------------------
# T1: the arms of ADR-050 addendum D and of ADR-054, unchanged (the card table's hash is in ADR-054 and ADR-058).
ASTAR='{"engines":0,"margin":0.0,"needs":1,"scalers":0.7}'
D0STAR='{"synergy":0,"margin":0}'
# T2: `rules_v2` following the card values the site shows (experiments/cardvalue/site-sets.json) against the hand-written `rules_v1`.
shown_values() { # <ExactClass> -> the value file the site shows for the class
  local l; l=$(lower "$1")
  if [ "$1" = Ironclad ]; then echo "experiments/cardvalue/ironclad-a0-v2.json"; else echo "experiments/cardvalue/${l}-a0-keep-v1.json"; fi
}
shown_params() { echo "{\"threshold\":0.0,\"values\":\"$(shown_values "$1")\"}"; }
# T3: the opening-relic rule of ADR-055 against its baseline, the card values exactly as ADR-049 and ADR-055 had them (Ironclad: the
# policy's default file; the others experiments/cardvalue/<class>-a0-v1.json), so that the only change from ADR-055 is the Act 1.
NEOW_VALUES=experiments/neow/neow-values-keep-v1.json
base_params() { # <ExactClass> <extra json fragment, may be empty>
  local c=$1 extra=$2 l; l=$(lower "$c")
  if [ "$c" = Ironclad ]; then echo "{\"threshold\":0.0${extra}}"; else echo "{\"threshold\":0.0,\"values\":\"experiments/cardvalue/${l}-a0-v1.json\"${extra}}"; fi
}
# Every value file the arms read, with the file the registration quotes the hash of.
VALUE_FILES="experiments/cardvalue/ironclad-a0-v1.json experiments/cardvalue/ironclad-a0-v2.json \
experiments/cardvalue/silent-a0-v1.json experiments/cardvalue/silent-a0-keep-v1.json \
experiments/cardvalue/regent-a0-v1.json experiments/cardvalue/regent-a0-keep-v1.json \
experiments/cardvalue/necrobinder-a0-v1.json experiments/cardvalue/necrobinder-a0-keep-v1.json \
experiments/cardvalue/defect-a0-v1.json experiments/cardvalue/defect-a0-keep-v1.json"
SYNERGY_TABLE=packages/game-data/data/synergy.sts2-main-0.107.1.json
# the card table carries its own content hash in its `sha256` field (not the hash of the file); this is the one ADR-050 addendum B and ADR-054 name
SYNERGY_TABLE_SHA=bd0b8a9fd4f96fd974e318c4d1e71efd4dda0e9359f61b73410f24baace7f49a
# Everything the arms read or run: the code and data that must be those of the registration commit when the first held-out game is played.
PINNED_PATHS="sim scripts/studies/underdocks packages/game-data/data experiments/cardvalue experiments/neow experiments/seeds external/pins.json"

# The batch ids of the six held-out arms of each class (the two of every test), named after what ADR-064 calls them.
arm_ids() { # <ExactClass> -> "<T1 A*> <T1 d0*> <T2 shown> <T2 rules_v1> <T3 rule> <T3 baseline>"
  local l; l=$(lower "$1")
  echo "advisor_v1-astar-$l-a0-veteran-keeprelics-underdocks-val-n2000 advisor_v1-d0star-$l-a0-veteran-keeprelics-underdocks-val-n2000 \
rules_v2-shownvals-$l-a0-veteran-keeprelics-underdocks-val-n2000 rules_v1-$l-a0-veteran-keeprelics-underdocks-val-n2000 \
rules_v2_neow_values-keepvals-$l-a0-veteran-keeprelics-underdocks-val-n2000 rules_v2-$l-a0-veteran-keeprelics-underdocks-val-n2000"
}
arm_policies() { echo "advisor_v1 advisor_v1 rules_v2 rules_v1 rules_v2_neow_values rules_v2"; }   # the policy of each batch of arm_ids, in the same order
arm_params() { # <ExactClass> -> the parameters (JSON) each batch of arm_ids is played with, one per line, in the same order
  local C=$1
  echo "$ASTAR"; echo "$D0STAR"; shown_params "$C"; echo "{}"; base_params "$C" ",\"neow_values\":\"$NEOW_VALUES\""; base_params "$C" ""
}
# The same six arms in Overgrowth, on the same seeds, with the same everything else: batches the earlier studies played (T1 ADR-054, T2 the
# twin of ADR-058, T3 ADR-055). They are read, never played again, and they are what an Underdocks result is set beside (ADR-064 item 5).
overgrowth_ids() { # <ExactClass> -> the same order as arm_ids
  local l; l=$(lower "$1")
  echo "advisor_v1-astar-$l-a0-veteran-keeprelics-val-n2000 advisor_v1-d0star-$l-a0-veteran-keeprelics-val-n2000 \
rules_v2-shownvals-$l-a0-veteran-keeprelics-val-n2000 rules_v1-$l-a0-veteran-keeprelics-val-n2000 \
rules_v2_neow_values-keepvals-$l-a0-veteran-keeprelics-val-n2000 rules_v2-$l-a0-veteran-keeprelics-val-n2000"
}

# The text of ADR-064 itself (its heading to the next one, or the end of the log): what the preflight reads the quoted hashes from.
adr_section() { awk '/^## .*ADR-064:/ { p = 1; print; next } /^## / { if (p) exit } p' docs/DECISIONS.md; }

# What a finished batch has to be (read from its own manifest): the policy, the seeds, Ascension 0, the veteran profile and Act 1 in Underdocks, the relics kept, the
# class start verified, played from a clean working tree, no game ended in an abort or an error of ours (simulator errors, step limits and
# timeouts are excluded and counted, as ADR-064 item 4 says) and at least 90 % of the games completed (item 10).
verify_batch() { # <batch dir> <policy> <partition> <n> [ExactClass [policy parameters as JSON]]
  "$PY" - "$@" <<'EOF'
import json, sys
d, policy, part, n = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
cls = sys.argv[5] if len(sys.argv) > 5 else None
want_params = json.loads(sys.argv[6]) if len(sys.argv) > 6 else None
try:
    m = json.load(open(d + "/manifest.json"))
except Exception as e:  # noqa: BLE001
    sys.exit(f"verify_batch: {d}: no readable manifest ({e})")
c = m["summary"]["counts"]
bad = sum(c[k] for k in ("aborted", "harness_error", "policy_error", "invalid_action"))
env = (m.get("environment") or {}).get("slay2") or {}
problems = []
if m["policy"]["name"] != policy: problems.append(f"policy {m['policy']['name']}")
if cls is not None and m["config"].get("character") != cls: problems.append(f"played as {m['config'].get('character')}, not {cls}")
if want_params is not None and m["policy"].get("params") != want_params: problems.append(f"policy parameters {m['policy'].get('params')}, not {want_params}")
if m["config"]["ascension"] != 0: problems.append(f"Ascension {m['config']['ascension']}")
if m["config"].get("profile") != "veteran": problems.append(f"profile {m['config'].get('profile')}")
if m["config"].get("act1") != "underdocks": problems.append(f"Act 1 {m['config'].get('act1', 'overgrowth')}")
if m["config"].get("keep_relics") is not True: problems.append("relics not kept")
if m["seeds"]["partition"] != part or m["seeds"]["n"] != n or m["summary"]["episodes"] != n: problems.append("seeds")
if bad: problems.append(f"{bad} games ended in an abort, a harness error, a policy error or an invalid action")
if m["summary"]["completed"] < 0.9 * n: problems.append(f"only {m['summary']['completed']} of {n} completed")
if m.get("class_start_verified") is not True or m.get("canonical_process_state") is not True: problems.append("class start or canonical process state not recorded")
if env.get("dirty") is not False: problems.append("played from a working tree with uncommitted changes")
if problems: sys.exit(f"verify_batch: {d}: " + "; ".join(problems))
EOF
}

# The working tree is the commit the study started from, with no tracked file changed (a held-out run takes hours).
guard_tree() {
  [ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "guard_tree: tracked files are modified" >&2; return 1; }
  [ -z "${STUDY_HEAD:-}" ] || [ "$(git rev-parse HEAD)" = "$STUDY_HEAD" ] || { echo "guard_tree: HEAD is not the commit the study started from ($STUDY_HEAD)" >&2; return 1; }
}

# One batch: run_batch <batch id> <policy> <params json> <ExactClass> <partition> <n> <offset> [out dir]
# A batch that has a manifest is checked and never touched; one that does not is run and then checked, so that no usage error, no stale
# manifest and no batch with games that ended in an error of ours reaches the next step as "finished".
run_batch() {
  local id=$1 policy=$2 params=$3 cls=$4 part=$5 n=$6 off=$7 out=${8:-} W=${WORKERS:-4}
  local dest=${out:-$BATCHES/$id}
  if [ -f "$dest/manifest.json" ]; then verify_batch "$dest" "$policy" "$part" "$n" "$cls" "$params"; return $?; fi
  guard_tree || return 1
  nice -n 8 "$PY" -m slay2_sim run --policy "$policy" --policy-params "$params" --character "$cls" --ascension "$ASC" --act1 "$ACT1" --profile veteran \
    --seeds "$SEEDS" --partition "$part" --offset "$off" --n "$n" --keep-relics --workers "$W" --trace 0 --batch-id "$id" \
    --out "$dest" >> "$OUT/$part-$id.log" 2>&1
  local status=$?
  echo "RUN_${id}_EXIT=$status" >> "$OUT/run-done.txt"
  # exit code 2 means that some episodes ended in a simulator error, which is normal (a usage error exits 2 as well, and leaves no manifest:
  # verify_batch is what tells them apart); anything else stops the run (RESUME=1 continues it)
  if [ "$status" != 0 ] && [ "$status" != 2 ]; then echo "run_batch: $id failed with status $status (see $OUT/$part-$id.log)" >&2; return "$status"; fi
  verify_batch "$dest" "$policy" "$part" "$n" "$cls" "$params"
}
