#!/usr/bin/env bash
# Copy each exploration batch into experiments/neow/ (manifest, episodes, and the win audit if the batch has wins).
# Audit the wins first where there are any:  $PY -m slay2_sim audit wins --batch artifacts/h10b/explore-<class>
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
for c in $CLASSES; do
  l=$(echo "$c" | tr 'A-Z' 'a-z'); d="experiments/neow/explore-$l-a0-train-n3000"; mkdir -p "$d"
  cp "$OUT/explore-$l/manifest.json" "$OUT/explore-$l/episodes.jsonl.gz" "$d/"
  if [ -f "$OUT/explore-$l/wins-audit.json" ]; then cp "$OUT/explore-$l/wins-audit.json" "$d/"; cp -r "$OUT/explore-$l/wins" "$d/"; fi
done
