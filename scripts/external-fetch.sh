#!/usr/bin/env bash
# external-fetch.sh - recreate the pinned, git-ignored external checkouts listed in external/pins.json.
#
#   scripts/external-fetch.sh                 # fetch the two default research inputs
#   scripts/external-fetch.sh sts2-rl-agent   # fetch specific ids
#   scripts/external-fetch.sh --all           # fetch every pinned repo
#
# Checkouts land in external/checkouts/<id> (ignored by git; enforced by guard-third-party.sh).
# We use a blob-less partial clone and check out the *pinned SHA*, never a moving branch.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pins="$root/external/pins.json"
dest_root="${SLAY2_EXTERNAL_ROOT:-$root/external/checkouts}"
mkdir -p "$dest_root"

mapfile -t all_ids < <(python3 -I - "$pins" <<'PY'
import json, sys
for r in json.load(open(sys.argv[1]))["repos"]:
    print(r["id"])
PY
)

if [ "$#" -eq 0 ]; then ids=(sts2-rl-agent spire-archive)
elif [ "$1" = "--all" ]; then ids=("${all_ids[@]}")
else ids=("$@"); fi

for id in "${ids[@]}"; do
  read -r url sha < <(python3 -I - "$pins" "$id" <<'PY'
import json, sys
pins, want = sys.argv[1], sys.argv[2]
for r in json.load(open(pins))["repos"]:
    if r["id"] == want:
        print(r["url"], r["sha"]); break
else:
    sys.exit("unknown id: " + want)
PY
)
  dir="$dest_root/$id"
  if [ -e "$dir/.git" ] || [ -L "$dir" ]; then
    have="$(git -C "$dir" rev-parse HEAD 2>/dev/null || echo none)"
    if [ "$have" = "$sha" ]; then echo "== $id: already at pinned $sha"; continue; fi
    echo "== $id: present at $have, expected $sha -> fetching pin"
  else
    echo "== $id: cloning $url"
    GIT_LFS_SKIP_SMUDGE=1 git clone --quiet --filter=blob:none --no-checkout "$url" "$dir"
  fi
  GIT_LFS_SKIP_SMUDGE=1 git -C "$dir" fetch --quiet origin "$sha" || GIT_LFS_SKIP_SMUDGE=1 git -C "$dir" fetch --quiet --depth=1000 origin
  GIT_LFS_SKIP_SMUDGE=1 git -C "$dir" checkout --quiet "$sha"
  echo "   pinned at $(git -C "$dir" rev-parse HEAD)"
done
