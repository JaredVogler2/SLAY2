#!/usr/bin/env bash
# The checks that must hold before the first held-out game of this study (ADR-053 item 4); run-val.sh sources this file.
# Any failed check stops the run before a val seed is played, because the test is run once.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "preflight-val: $*" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "tracked files are modified: start from a clean checkout of the commit that records the hashes"
[ -z "$(git ls-files --others --exclude-standard | grep -vE '^(experiments|artifacts)/')" ] || fail "untracked files outside experiments/ and artifacts/: start from a clean checkout"
git fetch -q origin 2>/dev/null || fail "cannot reach the remote to check that this commit is pushed"
[ -n "$(git branch -r --contains HEAD 2>/dev/null)" ] || fail "HEAD is not on the remote: push the record of the hashes before the first val game"
for C in $CLASSES; do
  f=$(new_values "$C")
  [ -f "$f" ] || fail "$f is missing"
  sha=$(sha256sum "$f" | cut -d' ' -f1)
  grep -q "$sha" docs/DECISIONS.md || fail "docs/DECISIONS.md does not quote the SHA-256 ($sha) of $f"
  git ls-files --error-unmatch "$f" > /dev/null 2>&1 || fail "$f is not committed"
done
[ ! -e experiments/cardvalue/pooled-keepvals-vs-curvals-val.json ] || fail "the pooled result of the registered test exists: the test is run once"
[ -z "$(git log --all --oneline -1 -- experiments/cardvalue/pooled-keepvals-vs-curvals-val.json)" ] || fail "the pooled result is in the history: the test is run once"
if ls experiments/batches 2>/dev/null | grep -Eq '^rules_v3-(keepvals|curvals)-.*-val-'; then
  [ "${RESUME:-}" = 1 ] || fail "batches of the val arms already exist; if a run was interrupted, finish it with RESUME=1 (a finished batch is never touched)"
fi
echo "preflight-val: ok (commit $(git rev-parse --short=12 HEAD))"
