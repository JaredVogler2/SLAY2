#!/usr/bin/env bash
# The checks that must hold before the first held-out game of this study (ADR-061 items 2 and 9); run-val.sh sources this file.
# Any failed check stops the run before a val2 seed is played, because each test is run once. (This is a process control, not a lock: a val2 game
# started by hand with `slay2_sim run` is not stopped by it. The record says that none was.)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "preflight-val: $*" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "tracked files are modified: start from a clean checkout of the commit that carries the registration of ADR-061"
[ -z "$(git ls-files --others --exclude-standard | grep -vE '^(experiments|artifacts)/')" ] || fail "untracked files outside experiments/ and artifacts/: start from a clean checkout"
[ "$(git rev-parse --is-shallow-repository)" = false ] || fail "this is a shallow clone: the registration commit cannot be found reliably (git fetch --unshallow)"
git fetch -q --prune origin 2>/dev/null || fail "cannot reach the remote to check that this commit is pushed"
[ -n "$(git branch -r --contains HEAD 2>/dev/null)" ] || fail "HEAD is not on the remote: push the registration before the first val2 game"
ADR=$(adr_section)
[ -n "$ADR" ] || fail "docs/DECISIONS.md does not carry ADR-061"

# the registration is complete: the frozen choices (the text below is a heading of the record, and nothing before the registration contains it) are in the
# record AT HEAD, and the code and data the arms read are those of the first commit that carries them. REG from the environment is refused unless
# ALLOW_REG_OVERRIDE=1.
MARKER='Registration of ADR-061 (frozen choices)'
# (the marker is the record's last heading and occurs once: a second mention would make the first commit that has the text not the registration)
marks=$(grep -oF "$MARKER" <<< "$ADR" | wc -l)
[ "$marks" != 0 ] || fail "the ADR-061 record at HEAD does not carry its registration (the text '$MARKER')"
[ "$marks" = 1 ] || fail "the ADR-061 record at HEAD must carry its registration (the text '$MARKER') exactly once, it carries it $marks times"
if [ -n "${REG:-}" ]; then
  [ "${ALLOW_REG_OVERRIDE:-}" = 1 ] || fail "REG is set in the environment; refused (it would make the check that nothing changed since the registration empty). ALLOW_REG_OVERRIDE=1 allows it, for a test"
  echo "preflight-val: NOTICE: the registration commit was named from the environment (ALLOW_REG_OVERRIDE=1), not found from the record: ${REG:0:12}" >&2
fi
REG=${REG:-$(git log -S"$MARKER" --format=%H -- docs/DECISIONS.md | tail -1)}
[ -n "$REG" ] || fail "cannot find the commit that carries the registration of ADR-061 (the text '$MARKER')"
git merge-base --is-ancestor "$REG" HEAD || fail "the registration commit $REG is not an ancestor of HEAD"
bad=$(pinned_problem "$REG") || fail "code or data the arms read changed after the registration commit ${REG:0:12}: $bad"

# every file an arm reads is the file the registration names: its SHA-256 is quoted in ADR-061 itself (not elsewhere in the log), and it is committed.
# The seed file is one of them: it holds the val2 seeds (and the partitions the earlier studies were played on, which are the same as in the earlier files).
for f in $(shown_files) "$SEEDS"; do
  [ -f "$f" ] || fail "$f is missing"
  git ls-files --error-unmatch "$f" > /dev/null 2>&1 || fail "$f is not committed"
  sha=$(sha256sum "$f" | cut -d' ' -f1)
  grep -q "$sha" <<< "$ADR" || fail "ADR-061 does not quote the SHA-256 ($sha) of $f"
done
"$PY" - <<PYEOF || fail "the seed file is not a valid v3 manifest with 3,000 val2 seeds disjoint from every other partition"
import sys
from slay2_sim.manifest import load_seed_manifest
m = load_seed_manifest("$SEEDS")                      # checksum and disjointness
p = m["partitions"]
sys.exit(0 if len(p.get("val2", [])) == $VAL_N and "val2" == "$PARTITION" and len(p.get("test", [])) > 0 else 1)
PYEOF

# each test is run once: no pooled result, per-class output, identity record or interval file of the study exists, and none is in the history
for p in pooled-acts-L pooled-acts-A1 pooled-acts-A2 pooled-acts-A3 robustness-all-pairs; do
  [ ! -e "experiments/acts/$p.json" ] || fail "the result experiments/acts/$p.json exists: the test is run once"
  [ -z "$(git log --all --oneline -1 -- "experiments/acts/$p.json")" ] || fail "experiments/acts/$p.json is in the history: the test is run once"
done
for d in per-class identity; do
  if ls "experiments/acts/$d" 2>/dev/null | grep -Eq '\.json$'; then fail "experiments/acts/$d holds output: the comparisons are run once"; fi
  [ -z "$(git log --all --oneline -1 -- "experiments/acts/$d")" ] || fail "experiments/acts/$d is in the history: the comparisons are run once"
done

# no game of the val2 seeds has been played, under any batch id (the seed of a batch's first episode is looked up: a run that died before its manifest was written
# is found too), unless an interrupted run is being finished (a finished batch is checked and never touched)
played=$("$PY" "$ROOT/scripts/studies/acts/val2_played.py" --batches experiments/batches --seeds "$SEEDS" | head -3 | tr '\n' ' ') || fail "cannot look for batches on the $PARTITION seeds"
if [ -n "$played" ] || ls experiments/batches 2>/dev/null | grep -Eq -- "^acts-.*-${PARTITION}-"; then
  [ "${RESUME:-}" = 1 ] || fail "batches on the $PARTITION seeds already exist (${played:-acts-*}); if a run was interrupted, finish it with RESUME=1 (a finished batch is checked and never touched)"
fi
echo "preflight-val: ok (commit $(git rev-parse --short=12 HEAD), registration ${REG:0:12}, arms: $ARMS_ALL)"
