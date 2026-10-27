#!/usr/bin/env bash
# Regenerate apps/web/src/content/*.generated.json from a CLEAN checkout of HEAD and copy them back.
#
# CI runs the exporter on a clean checkout, so the committed generated files must equal its output there. Running
# `node scripts/export-site-data.mjs` in a working tree that also holds uncommitted experiments (batches still being
# written, scratch results) gives different files and a red CI. This runs the exporter in a temporary worktree of HEAD
# instead, so the result is what CI will compute.
#
#   1. commit the sources (experiments/, sim/slay2_sim/gaps.json, ...)
#   2. scripts/export-site-data-clean.sh
#   3. commit the regenerated files
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
tmp=$(mktemp -d)
trap 'git worktree remove --force "$tmp/wt" >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
git worktree add --detach "$tmp/wt" HEAD >/dev/null
(cd "$tmp/wt" && node scripts/export-site-data.mjs >/dev/null)
changed=0
for f in rules evidence cardvalues synergy neow; do
  src="$tmp/wt/apps/web/src/content/$f.generated.json"
  dst="apps/web/src/content/$f.generated.json"
  if ! cmp -s "$src" "$dst"; then
    cp "$src" "$dst"
    echo "updated $dst"
    changed=1
  fi
done
if [ "$changed" = 0 ]; then
  echo "generated site data already matches a clean checkout of $(git rev-parse --short HEAD)"
fi
