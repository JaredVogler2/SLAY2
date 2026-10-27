# Shared settings of the Ascension 9 transfer study (ADR-058); sourced, not run.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
cd "$ROOT" || exit 1
export PYTHONPATH="${ROOT}/sim${PYTHONPATH:+:$PYTHONPATH}"
PY=${PY:-python3}
OUT=${OUT:-artifacts/ascension9}
SEEDS=experiments/seeds/ironclad-a0-v2.json
CLASSES="Ironclad Silent Regent Necrobinder Defect"
ASC=9
LEVEL_CONFIDENCE=0.98333333333333   # 1 - 0.05 / 3: the level each of the three tests is read at (ADR-058 item 3)
mkdir -p "$OUT"
lower() { echo "$1" | tr 'A-Z' 'a-z'; }

# --- the arms, all fixed by ADR-058 (nothing is fitted in this study) ------------------------------------------------------------------
# T1: the arms of ADR-050 addendum D and of ADR-054, unchanged (the card table's hash is in ADR-054).
ASTAR='{"engines":0,"margin":0.0,"needs":1,"scalers":0.7}'
D0STAR='{"synergy":0,"margin":0}'
# T2: `rules_v2` following the card values the site shows (experiments/cardvalue/site-sets.json) against the hand-written `rules_v1`.
shown_values() { # <ExactClass> -> the value file the site shows for the class
  local l; l=$(lower "$1")
  if [ "$1" = Ironclad ]; then echo "experiments/cardvalue/ironclad-a0-v2.json"; else echo "experiments/cardvalue/${l}-a0-keep-v1.json"; fi
}
shown_params() { echo "{\"threshold\":0.0,\"values\":\"$(shown_values "$1")\"}"; }
# T3: the opening-relic rule of ADR-055 against its baseline, the card values exactly as ADR-049 and ADR-055 had them (Ironclad: the
# policy's default file; the others experiments/cardvalue/<class>-a0-v1.json), so that the only change from ADR-055 is the Ascension.
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
PINNED_PATHS="sim scripts/studies/ascension9 packages/game-data/data experiments/cardvalue experiments/neow experiments/seeds external/pins.json"

# The batch ids of the six held-out arms of each class (the two of every test), named after what ADR-058 calls them.
arm_ids() { # <ExactClass> -> "<T1 A*> <T1 d0*> <T2 shown> <T2 rules_v1> <T3 rule> <T3 baseline>"
  local l; l=$(lower "$1")
  echo "advisor_v1-astar-$l-a9-veteran-keeprelics-val-n2000 advisor_v1-d0star-$l-a9-veteran-keeprelics-val-n2000 \
rules_v2-shownvals-$l-a9-veteran-keeprelics-val-n2000 rules_v1-$l-a9-veteran-keeprelics-val-n2000 \
rules_v2_neow_values-keepvals-$l-a9-veteran-keeprelics-val-n2000 rules_v2-$l-a9-veteran-keeprelics-val-n2000"
}
# The twin of T2 at Ascension 0 with the relics kept (ADR-058 item 1b, descriptive): T2's two arms once more, in the game of the earlier studies.
twin_ids() { # <ExactClass> -> "<shown> <rules_v1>"
  local l; l=$(lower "$1")
  echo "rules_v2-shownvals-$l-a0-veteran-keeprelics-val-n2000 rules_v1-$l-a0-veteran-keeprelics-val-n2000"
}

# The text of ADR-058 itself (its heading to the next one, or the end of the log): what the preflight reads the quoted hashes from.
adr_section() { awk '/^## .*ADR-058:/ { p = 1; print; next } /^## / { if (p) exit } p' docs/DECISIONS.md; }

# What a finished batch has to be (read from its own manifest): the policy, the seeds and the Ascension it was asked to play, the relics
# kept, the class start verified, played from a clean working tree, no game ended in an abort or an error of ours (simulator errors, step
# limits and timeouts are excluded and counted, as ADR-058 item 3 says) and at least 90 % of the games completed.
verify_batch() { # <batch dir> <policy> <partition> <n> <ascension>
  "$PY" - "$@" <<'EOF'
import json, sys
d, policy, part, n, asc = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
try:
    m = json.load(open(d + "/manifest.json"))
except Exception as e:  # noqa: BLE001
    sys.exit(f"verify_batch: {d}: no readable manifest ({e})")
c = m["summary"]["counts"]
bad = sum(c[k] for k in ("aborted", "harness_error", "policy_error", "invalid_action"))
env = (m.get("environment") or {}).get("slay2") or {}
problems = []
if m["policy"]["name"] != policy: problems.append(f"policy {m['policy']['name']}")
if m["config"]["ascension"] != asc: problems.append(f"Ascension {m['config']['ascension']}")
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

# One batch: run_batch <batch id> <policy> <params json> <ExactClass> <partition> <n> <offset> <ascension> [out dir]
# A batch that has a manifest is checked and never touched; one that does not is run and then checked, so that no usage error, no stale
# manifest and no batch with games that ended in an error of ours reaches the next step as "finished".
run_batch() {
  local id=$1 policy=$2 params=$3 cls=$4 part=$5 n=$6 off=$7 asc=$8 out=${9:-} W=${WORKERS:-4}
  local dest=${out:-experiments/batches/$id}
  if [ -f "$dest/manifest.json" ]; then verify_batch "$dest" "$policy" "$part" "$n" "$asc"; return $?; fi
  guard_tree || return 1
  nice -n 8 "$PY" -m slay2_sim run --policy "$policy" --policy-params "$params" --character "$cls" --ascension "$asc" --profile veteran \
    --seeds "$SEEDS" --partition "$part" --offset "$off" --n "$n" --keep-relics --workers "$W" --trace 0 --batch-id "$id" \
    ${out:+--out "$out"} >> "$OUT/$part-$id.log" 2>&1
  local status=$?
  echo "RUN_${id}_EXIT=$status" >> "$OUT/run-done.txt"
  # exit code 2 means that some episodes ended in a simulator error, which is normal (a usage error exits 2 as well, and leaves no manifest:
  # verify_batch is what tells them apart); anything else stops the run (RESUME=1 continues it)
  if [ "$status" != 0 ] && [ "$status" != 2 ]; then echo "run_batch: $id failed with status $status (see $OUT/$part-$id.log)" >&2; return "$status"; fi
  verify_batch "$dest" "$policy" "$part" "$n" "$asc"
}
