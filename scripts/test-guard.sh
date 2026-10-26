#!/usr/bin/env bash
# test-guard.sh - self-test for guard-third-party.sh using a throwaway git repo.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
guard="$here/guard-third-party.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail() { echo "test-guard: FAIL: $1" >&2; exit 1; }
expect_clean() { (cd "$tmp" && "$guard" staged >/dev/null 2>&1) || fail "expected clean: $1"; }
expect_dirty() { (cd "$tmp" && "$guard" staged >/dev/null 2>&1) && fail "expected violation: $1" || true; }

cd "$tmp"
git init -q .
git config user.email t@example.invalid
git config user.name t

# 1. ordinary files pass
mkdir -p docs && echo "hello" > docs/a.md && git add -A
expect_clean "plain markdown"
git commit -qm base

# 2. decompiled directory is rejected
mkdir -p decompiled/MegaCrit.Sts2.Core.Odds && echo "x" > decompiled/MegaCrit.Sts2.Core.Odds/CardRarityOdds.cs
git add -f decompiled
expect_dirty "decompiled/ path"
git rm -rq --cached decompiled && rm -rf decompiled

# 3. a pasted decompiled header in a text file is rejected
printf 'using MegaCrit.Sts2.Core.Odds;\nnamespace MegaCrit.Sts2.Core;\n' > docs/pasted.md
git add docs/pasted.md
expect_dirty "decompiled header in markdown"
git rm -q --cached docs/pasted.md && rm docs/pasted.md

# 4. unallow-listed C# is rejected
echo "class A {}" > Foo.cs && git add Foo.cs
expect_dirty ".cs not allow-listed"
git rm -q --cached Foo.cs && rm Foo.cs

# 5. game binaries are rejected
printf 'MZ' > game.pck && git add -f game.pck
expect_dirty ".pck artifact"
git rm -q --cached game.pck && rm game.pck

# 6. env files rejected, example allowed
echo "SECRET=1" > .env && git add -f .env
expect_dirty ".env"
git rm -q --cached .env && rm .env
echo "SECRET=" > .env.example && git add .env.example
expect_clean ".env.example"

# 7. a doc that merely *mentions* a decompiled path as provenance is fine
echo 'Verified in MegaCrit.Sts2.Core.Odds/CardRarityOdds.cs (decompiled, rights-restricted).' > docs/prov.md
git add docs/prov.md
expect_clean "provenance mention"

echo "test-guard: all checks passed"
