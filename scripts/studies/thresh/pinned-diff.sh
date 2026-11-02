#!/usr/bin/env bash
# What the registration (part 1) froze and the commit at HEAD has changed since: "no change", or the files and the line part 2 of the record has to quote
# (PINNED_DIFF=<SHA-256 of the change>), so that a change of the frozen code or data between the two parts is part of the record and not only of the history.
# What is frozen is what the common.sh of the registration commit lists (PINNED_PATHS and READING_PATHS, read from that commit), and the change is hashed as git's raw
# diff with full object ids and modes (`frozen_change` in common.sh), which no setting of git alters.
#   pinned-diff.sh        (run from the commit that will be the parent of part 2: commit the change of the frozen paths first, the hash is of commits)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
REG1=$(first_commit_with "$MARKER_ONE")
[ -n "$REG1" ] || { echo "pinned-diff: cannot find the registration commit (part 1)" >&2; exit 1; }
paths=()
while IFS= read -r p; do paths+=("$p"); done < <(registered_paths "$REG1")
[ "${#paths[@]}" -gt 0 ] || { echo "pinned-diff: cannot read from the registration commit ${REG1:0:12} which paths it froze" >&2; exit 1; }
new=$(git ls-files --others --exclude-standard -- "${paths[@]}")
[ -z "$new" ] || { echo "pinned-diff: files in the frozen paths are not tracked yet (git add them and commit): $new" >&2; exit 1; }
dirty=$(git status --porcelain --untracked-files=no -- "${paths[@]}")
[ -z "$dirty" ] || { echo "pinned-diff: the frozen paths have changes that are not committed (commit them first: the quote is the hash of the commits part 2 will carry): $(printf '%s' "$dirty" | head -5 | tr '\n' ' ')" >&2; exit 1; }
if [ -z "$(frozen_change "$REG1" HEAD "${paths[@]}")" ]; then echo "no change"; exit 0; fi
git diff --name-only --no-renames "$REG1" HEAD -- "${paths[@]}"
echo "PINNED_DIFF=$(frozen_change "$REG1" HEAD "${paths[@]}" | sha256sum | cut -d' ' -f1)"
