#!/usr/bin/env bash
# The comparisons of ADR-064, each class on its own, then the three pooled tests (exact McNemar over the five classes, with the whole-seed
# interval of the pooled difference at the level the tests are read at), each run once:
#   T1  A* against d0* (the synergy term)           -> experiments/underdocks/pooled-ud-t1-synergy-astar-vs-d0star.json
#   T2  the shown card values against rules_v1      -> experiments/underdocks/pooled-ud-t2-values-shown-vs-rules_v1.json
#   T3  the opening-relic rule against the baseline -> experiments/underdocks/pooled-ud-t3-neow-keep-v1-vs-rules_v2.json
# and the all-pairs analysis of the three, which the reading rule needs to agree -> experiments/underdocks/robustness-all-pairs.json
# It refuses to start unless all thirty batches are finished and audited (a passing sample audit of at least 40 games for each, every win
# re-derived) and nothing of the study's results exists yet.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "pool: $*" >&2; exit 1; }
[ -n "${RESULTS:-}" ] && [ -n "${BATCHES:-}" ] || fail "common.sh did not set RESULTS and BATCHES"

# every batch is what ADR-064 says, read again from its own manifest (the run checked it when it ended; item 10: a finished batch is checked again and never touched)
read -r -a policies <<< "$(arm_policies)"
for C in $CLASSES; do
  read -r -a cids <<< "$(arm_ids "$C")"
  mapfile -t params < <(arm_params "$C")
  for i in 0 1 2 3 4 5; do
    verify_batch "$BATCHES/${cids[$i]}" "${policies[$i]}" val 2000 "$C" "${params[$i]}" || fail "a batch is not what ADR-064 says (see above)"
  done
done

ids=""
for C in $CLASSES; do ids="$ids $(arm_ids "$C")"; done
# shellcheck disable=SC2086
BATCHES="$BATCHES" "$PY" - $ids <<'EOF' || fail "a batch is not finished and audited (see above)"
import json, os, re, sys
from pathlib import Path

problems = []
heads = set()
for bid in sys.argv[1:]:
    d = Path(os.environ["BATCHES"]) / bid
    try:
        m = json.loads((d / "manifest.json").read_text())
    except Exception as e:  # noqa: BLE001
        problems.append(f"{bid}: no readable manifest ({e})")
        continue
    if m.get("batch_id") != bid:  # the pooled file, the reader and the independent recomputation name the batches by their manifests
        problems.append(f"{bid}: its manifest names the batch {m.get('batch_id')}")
    heads.add(((m.get("environment") or {}).get("slay2") or {}).get("head"))
    try:
        s = json.loads((d / "sample-audit.json").read_text())
        ok = (s["all_verified"] is True and s["verified"] == s["sample"]["drawn"] >= 40 and s["ledger"]["ok"] is True
              and s["batch_content_sha256"] == m["content_sha256"])
        if not ok:
            problems.append(f"{bid}: the sample audit does not pass")
    except Exception as e:  # noqa: BLE001
        problems.append(f"{bid}: no readable sample audit ({e})")
    wins = m["summary"]["counts"]["win"]
    if wins:
        try:
            w = json.loads((d / "wins-audit.json").read_text())
            if not (w["all_verified"] is True and w["wins_audited"] == w["wins_in_batch"] == wins):
                problems.append(f"{bid}: not every win is re-derived")
        except Exception as e:  # noqa: BLE001
            problems.append(f"{bid}: {wins} wins and no readable win audit ({e})")
# one commit for the whole run (run-val.sh holds a resumed run to the commit it started from, but only inside one worktree, and the reader refuses a result
# whose batches were played from different commits after the pooled files exist and cannot be made again)
if len(heads) != 1 or not all(isinstance(h, str) and re.fullmatch(r"[0-9a-f]{40}", h) for h in heads):
    problems.append(f"the thirty batches were not all played from one commit: {sorted(str(h) for h in heads)}")
for p in problems:
    print(p, file=sys.stderr)
sys.exit(1 if problems else 0)
EOF
for f in pooled-ud-t1-synergy-astar-vs-d0star pooled-ud-t2-values-shown-vs-rules_v1 pooled-ud-t3-neow-keep-v1-vs-rules_v2 robustness-all-pairs; do
  [ ! -e "$RESULTS/$f.json" ] || fail "$RESULTS/$f.json exists: each test is run once"
done
if ls "$RESULTS/per-class" 2>/dev/null | grep -Eq '\.json$'; then fail "$RESULTS/per-class holds output: the comparisons are run once"; fi
# the three tests, and the arms each one compares: <test key> <file name> <position of arm a in the class's id list> <position of arm b> <batch id prefix of arm a> <of arm b>
# (a batch id is <arm>-<class>-a0-...; arm a is the one the pooled file reads first)
TESTS=(
  "ud-t2 pooled-ud-t2-values-shown-vs-rules_v1 2 3 rules_v2-shownvals rules_v1"
  "ud-t3 pooled-ud-t3-neow-keep-v1-vs-rules_v2 4 5 rules_v2_neow_values-keepvals rules_v2"
  "ud-t1 pooled-ud-t1-synergy-astar-vs-d0star 0 1 advisor_v1-astar advisor_v1-d0star"
)

# every pair of every test, before anything is written: the positions have to be the arms the test compares
for t in "${TESTS[@]}"; do
  read -r key name ia ib pa pb <<< "$t"
  for C in $CLASSES; do
    l=$(lower "$C")
    read -r -a ids <<< "$(arm_ids "$C")"
    [ "${ids[$ia]%-$l-a0-*}" = "$pa" ] || fail "$key: arm a of $C is ${ids[$ia]}, not an $pa batch"
    [ "${ids[$ib]%-$l-a0-*}" = "$pb" ] || fail "$key: arm b of $C is ${ids[$ib]}, not an $pb batch"
  done
done

mkdir -p "$RESULTS/per-class"
pool_test() { # <test key> <file name> <position of arm a in the class's id list> <position of arm b>
  local key=$1 name=$2 ia=$3 ib=$4 args="" C l ids a b
  for C in $CLASSES; do
    l=$(lower "$C")
    read -r -a ids <<< "$(arm_ids "$C")"
    a="$BATCHES/${ids[$ia]}"; b="$BATCHES/${ids[$ib]}"
    "$PY" -m slay2_sim compare "$a" "$b" --out "$RESULTS/per-class/$key-$l.json" || fail "compare failed for $C ($key)"
    args="$args --pair $a $b"
  done
  # shellcheck disable=SC2086
  "$PY" -m slay2_sim pool $args --iters 20000 --confidence "$LEVEL_CONFIDENCE" --out "$RESULTS/$name.json" || fail "pool failed ($key)"
  sha256sum "$RESULTS/$name.json" || fail "cannot hash $name.json"
}
for t in "${TESTS[@]}"; do
  read -r key name ia ib pa pb <<< "$t"
  pool_test "$key" "$name" "$ia" "$ib"
done
# the all-pairs analysis the reading rule asks for (ADR-064 item 5): every pair of seeds, the endpoint as observed; code of its own, no part of slay2_sim
"$PY" scripts/studies/underdocks/robustness.py --batches "$BATCHES" --out "$RESULTS/robustness-all-pairs.json" || fail "the all-pairs analysis failed"
echo POOL_DONE
