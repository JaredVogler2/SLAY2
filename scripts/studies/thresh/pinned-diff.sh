#!/usr/bin/env bash
# What the registration (part 1) froze and the tracked files of the working tree have changed since: "no change", or the files and the line part 2 of the record has
# to quote (PINNED_DIFF=<SHA-256 of the change>), so that a change of the frozen code or data between the two parts is part of the record and not only of the history.
#   pinned-diff.sh        (run from the worktree that is about to be committed as part 2; commit the change first or the hash is of the working tree, which is the same)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
REG1=$(first_commit_with "$MARKER_ONE")
[ -n "$REG1" ] || { echo "pinned-diff: cannot find the registration commit (part 1)" >&2; exit 1; }
new=$(git ls-files --others --exclude-standard -- "${PINNED_PATHS[@]}")
[ -z "$new" ] || { echo "pinned-diff: files in the frozen paths are not tracked yet (git add them first): $new" >&2; exit 1; }
if git diff --quiet "$REG1" -- "${PINNED_PATHS[@]}"; then echo "no change"; exit 0; fi
git diff --name-only "$REG1" -- "${PINNED_PATHS[@]}"
echo "PINNED_DIFF=$(git diff --binary "$REG1" -- "${PINNED_PATHS[@]}" | sha256sum | cut -d' ' -f1)"
