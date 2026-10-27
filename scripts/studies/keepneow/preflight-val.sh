#!/usr/bin/env bash
# The checks that must hold before the first held-out game of this study (ADR-055 item 4); run-val.sh sources this file.
# Any failed check stops the run before a val seed is played, because the test is run once.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "preflight-val: $*" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "tracked files are modified: start from a clean checkout of the commit that records the hash"
[ -z "$(git ls-files --others --exclude-standard | grep -vE '^(experiments|artifacts)/')" ] || fail "untracked files outside experiments/ and artifacts/: start from a clean checkout"
git fetch -q origin 2>/dev/null || fail "cannot reach the remote to check that this commit is pushed"
[ -n "$(git branch -r --contains HEAD 2>/dev/null)" ] || fail "HEAD is not on the remote: push the record of the hash before the first val game"
[ -f "$NEW_VALUES" ] || fail "$NEW_VALUES is missing"
sha=$(sha256sum "$NEW_VALUES" | cut -d' ' -f1)
grep -q "$sha" docs/DECISIONS.md || fail "docs/DECISIONS.md does not quote the SHA-256 ($sha) of $NEW_VALUES"
git ls-files --error-unmatch "$NEW_VALUES" > /dev/null 2>&1 || fail "$NEW_VALUES is not committed"
old=$(sha256sum "$OLD_VALUES" | cut -d' ' -f1)
[ "$old" = b1afa02c47c5bc74df31ed2d8d40ae53dc5b514c34a07e4e5399ed474845877c ] || fail "$OLD_VALUES is not the file ADR-049 froze"
for p in pooled-neow-values-keep-v1-vs-rules_v2-keeprelics-val pooled-neow-values-v2-vs-rules_v2-keeprelics-val; do
  [ ! -e "experiments/neow/$p.json" ] || fail "the pooled result experiments/neow/$p.json exists: the test is run once"
  [ -z "$(git log --all --oneline -1 -- "experiments/neow/$p.json")" ] || fail "experiments/neow/$p.json is in the history: the test is run once"
done
if ls experiments/batches 2>/dev/null | grep -Eq '^rules_v2(_neow_values)?-.*keeprelics-val-'; then
  [ "${RESUME:-}" = 1 ] || fail "batches of the val arms already exist; if a run was interrupted, finish it with RESUME=1 (a finished batch is never touched)"
fi
echo "preflight-val: ok (commit $(git rev-parse --short=12 HEAD))"
