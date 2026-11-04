#!/usr/bin/env bash
# The comparisons of ADR-065 for one leg: each class on its own (the arm that charges for a slot against the baseline), then the pooled check over the
# five classes (exact McNemar of the share past the Act-1 boss, with the whole-seed interval; the paired interval of the mean floors), each run once:
#   leg og -> experiments/skip/pooled-slot-og.json     leg ud -> experiments/skip/pooled-slot-ud.json
# It refuses to start unless the leg's ten batches (the five that charge for a slot and the five baselines) are what ADR-065 says, read again from their own
# manifests, and are finished and audited (a passing sample audit of at least 40 games for each, every win re-derived), the pairs are the two arms in the
# order the pooled file is read in, nothing of the leg's results exists yet and, for the Underdocks leg, ADR-064 has been pooled.
#   pool.sh <leg: og | ud>
LEG=${1:-}
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "pool: $*" >&2; exit 1; }
case "$LEG" in og | ud) ;; *) echo "usage: pool.sh <og|ud>" >&2; exit 2 ;; esac
[ -n "${RESULTS:-}" ] && [ -n "${BATCHES:-}" ] || fail "common.sh did not set RESULTS and BATCHES"

# the baseline of the Underdocks leg is ADR-064's T1 arm, which is read after that study's tests (the preflight holds the same rule)
if [ "$LEG" = ud ] && missing=$(adr064_unpooled); then fail "ADR-064 has not been pooled yet: its tests are read before this leg's baseline is ($missing is missing)"; fi

# every batch of the leg is what ADR-065 says, read again from its own manifest (the run checked it when it ended; a finished batch is checked again and never touched)
dirs=""
for C in $CLASSES; do
  a=$(s1_dir "$C" "$LEG"); b=$(s0_dir "$C" "$LEG")
  verify_batch "$a" val 2000 "$LEG" s1 "$C" || fail "a batch is not what ADR-065 says (see above)"
  verify_batch "$b" val 2000 "$LEG" s0 "$C" || fail "a batch is not what ADR-065 says (see above)"
  dirs="$dirs $a $b"
done
# shellcheck disable=SC2086
"$PY" - $dirs <<'EOF' || fail "a batch is not finished and audited (see above)"
import json, sys
from pathlib import Path

problems = []
for d in map(Path, sys.argv[1:]):
    try:
        m = json.loads((d / "manifest.json").read_text())
    except Exception as e:  # noqa: BLE001
        problems.append(f"{d.name}: no readable manifest ({e})")
        continue
    if m.get("batch_id") != d.name:  # the pooled file names the batches by their manifests, and the reading holds it to the names of this study
        problems.append(f"{d.name}: its manifest names the batch {m.get('batch_id')}")
    try:
        s = json.loads((d / "sample-audit.json").read_text())
        ok = (s["all_verified"] is True and s["verified"] == s["sample"]["drawn"] >= 40 and s["ledger"]["ok"] is True
              and s["batch_content_sha256"] == m["content_sha256"])
        if not ok:
            problems.append(f"{d.name}: the sample audit does not pass")
    except Exception as e:  # noqa: BLE001
        problems.append(f"{d.name}: no readable sample audit ({e})")
    wins = m["summary"]["counts"]["win"]
    if wins:
        try:
            w = json.loads((d / "wins-audit.json").read_text())
            if not (w["all_verified"] is True and w["wins_audited"] == w["wins_in_batch"] == wins):
                problems.append(f"{d.name}: not every win is re-derived")
        except Exception as e:  # noqa: BLE001
            problems.append(f"{d.name}: {wins} wins and no readable win audit ({e})")
for p in problems:
    print(p, file=sys.stderr)
sys.exit(1 if problems else 0)
EOF
[ ! -e "$RESULTS/pooled-slot-$LEG.json" ] || fail "$RESULTS/pooled-slot-$LEG.json exists: the check is run once"
if ls "$RESULTS/per-class" 2>/dev/null | grep -Eq "slot-$LEG-.*\.json$"; then fail "$RESULTS/per-class holds output of this leg: the comparisons are run once"; fi

# the pairs, all five before anything is written: a is the arm that charges for a slot and b the baseline, in this order, because the pooled file reads
# a minus b as S1 minus S0 and its policies are advisor_v1 on both sides; both are of the class and of the leg's Act 1 (a batch id is
# <arm>-<class>-a0-veteran-keeprelics[-underdocks]-val-n2000)
act1_ok() { case "$1" in *-underdocks-*) [ "$LEG" = ud ] ;; *) [ "$LEG" != ud ] ;; esac; }
PA=(); PB=(); PL=()
for C in $CLASSES; do
  l=$(lower "$C"); a=$(s1_dir "$C" "$LEG"); b=$(s0_dir "$C" "$LEG"); ia=${a##*/}; ib=${b##*/}
  [ "${ia%-$l-a0-*}" = advisor_v1-slot ] || fail "arm a of $C is $ia, not an advisor_v1-slot batch of $C"
  [ "${ib%-$l-a0-*}" = advisor_v1-astar ] || fail "arm b of $C is $ib, not an advisor_v1-astar batch of $C"
  act1_ok "$ia" && act1_ok "$ib" || fail "$C: the batch ids $ia and $ib do not say the Act 1 of leg $LEG"
  PA+=("$a"); PB+=("$b"); PL+=("$l")
done

mkdir -p "$RESULTS/per-class"
args=""
for i in "${!PL[@]}"; do
  "$PY" -m slay2_sim compare "${PA[$i]}" "${PB[$i]}" --out "$RESULTS/per-class/slot-$LEG-${PL[$i]}.json" || fail "compare failed for ${PL[$i]}"
  args="$args --pair ${PA[$i]} ${PB[$i]}"
done
# shellcheck disable=SC2086
"$PY" -m slay2_sim pool $args --iters 20000 --confidence "$LEVEL_CONFIDENCE" --out "$RESULTS/pooled-slot-$LEG.json" || fail "pool failed"
sha256sum "$RESULTS/pooled-slot-$LEG.json" || fail "cannot hash pooled-slot-$LEG.json"
echo POOL_DONE
