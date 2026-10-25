# PROMPT 01 — STS2 FORENSIC RULE DISCOVERY, GAME BUILD REGISTRY, LICENSE AUDIT

Act as gameplay mechanics engineer, reproducibility scientist, source-license specialist and game-balance analyst. BEFORE implementing a trusted strategy model, deeply investigate up-to-date STS2 main/beta game builds and secure permitted, version-pinned factual data.

## Source priority and exact version work
1. Fetch official Mega Crit/Steam news and confirm current production/beta build IDs/dates/patch contents, compare to research-baseline snapshots (main 0.107.1/beta 0.111.0 as of Oct 25). Record any divergence and impact.
2. Review main and beta card/relic/monster/event/enchantment/Ancient/ascension changes; build deterministic differences: id, removed/added/changed, cost/power/damage/rarity, AI move changes, eligibility, incompatibility.
3. Research 5 classes: Ironclad; Silent/Sly discard; Regent Stars/Forge/Sovereign Blade; Necrobinder Osty/Souls/Doom/Graveyard; Defect orb + focus. Capture targeting, action/trigger order, damage/block, summon death, buff/debuff semantics. Treat beta-specific mechanics separately.
4. Research co-op 2/3/4: ally targeting, shared voting/events/map, team status, monster targeting/scaling, multiplayer-only cards, relic/potion interactions, other-player actions and synchronization. Mark co-op unimplemented until tested.
5. Full game semantics: 3-act run/terminal, alternate Act1 pools, normal/elite/boss AI by biome, Neow/Ancient per act, first scripted tutorial run, Epoch unlock gating, ascension A1–A10 modifier matrix, double Act3 boss, reward/shop/merchant/trader, enchantment limits, afflictions, rare-card offset, potion state, ? events, map generator edges, card upgrades.
6. Source every mechanic with URL + build/branch/date + method (official patch/game fixture/wiki/extracted data) + confidence, version and applicable modes; document disagreements without hiding them.

## Dataset/data rights diligence
- Consult Spire Codex public API OpenAPI and API_TERMS.md before requesting data. Its code is PolyForm Noncommercial; the extracted underlying game data/art are Mega Crit IP, and API accessibility is *not unlimited republication rights*. Use permitted point lookups, normalized facts and original analyses, not wholesale mirroring/unlicensed assets. Respect requests/min and cache terms.
- Cross-check with Almanauts stable-build facts and wiki. IDs differ across extracted catalogs/unlock subsets/beta; no unversioned numeric constants.
- Curated run histories and AgenticSTS trajectories: only approved terms, consent and provenance; observational choices omit offered alternatives often. Never infer causal card effects from winning-deck co-occurrence.
- Study linked simulators yizhang-dream/sts2-simulator, zhiyue/sts2-rl-agent, bots STS2FableBot, bridge STS2MCP and BMingSY/sts2-ai-mcp. Examine license and exact code/version commits; unlicensed repositories are not code resources. Review potential shared simulator ancestry; no false independent validation.
- Study https://simthespire.wordpress.com/ exact combinatorial fight PMFs, target HP threshold surfaces and sample-space explosion; implement independent mathematical method using **STS2** mechanics/fixtures.

## Exact probability research with executable checks
Current reference (verify exact order/limits against chosen build):
- Encounter packs normal C60/U37/R3, elite C50/U40/R10, shop C54/U37/R9, boss all rare. Rare offset initial -5 percentage points, advances +1 per nonrare encountered reward card, caps +40, reset on rare, shop reads without changing. A7 Scarcity changes rare and offset multiplier; individual cards of a pack are sequential, not independent. Some sources bypass offset/allow rerolls/widen card pools.
- Nonrare upgrades Act1 0%, Act2 25%, Act3 50% (A7 halves); note reworks/exception and relic effects.
- Potion drop starts40%, after no drop +10pp, after drop -10pp, elite one-roll +12.5pp, rarity C65/U25/R10 (exceptions and forced/scripted rolls).
- Unknown '?' first roll fight10%, chest2%, shop3% with stateful sequential checks and resets — **not simple flat independent category weights**.
- Ancient candidates depend on act, unlock and optional Darv selection; relic candidate pools conditional.
- Shops: counts, one random sale slot, equipment pricing, card removal costs affected A6 Inflation, relic discounts/special merchant; prioritize legal cost/budget constraints.
- Draw hypergeometric no-reshuffle formula `1 - C(N-K,n)/C(N,n)` and exact probability vector for at least k targets; deck additions/retains/exhaust/shuffle invalidate naive.
Construct a source-linked verified probability table, versioned fixtures, pure TS implementation and property tests (normalization, exact edge values, conditional progression, equality with enumerative brute force). Derive probabilities via code, do not copy assumptions blindly.

## Structured artifacts
- `docs/sources/SOURCE-REGISTRY.md`: source/license/build/lastChecked/reuse decision/claim status.
- `docs/game/MECHANICS-COVERAGE.md`: per character/act/A-level/co-op/parity fixture, coverage gaps and version.
- `data/game/sts2/{channel}/{build}/manifest.json`: version and hash, canonical metadata IDs, permissions.
- `packages/game-schema`: Zod/JSON Schema typed observable state, legal actions, run and multiplayer team snapshot, game version/build and special source flags.
- `packages/odds`: exact chance engines and golden/property tests.
- `docs/IP-COMPLIANCE.md`, `docs/INFORMATION-FAIRNESS.md`, `docs/SIMULATOR-CANDIDATE-MATRIX.md`, `docs/RESEARCH-OPEN-QUESTIONS.md`.
- Small original fixture scenarios (no bundled proprietary assets).

## Stage gate
100% of probabilities actually displayed in UI have explicit version-specific source and test; no unlicensed asset/data import; current main/beta determined or explicitly unknown; A0–A10, 3 acts and victory correct; initial solo character engine target chosen. Commit and push sources + **executed** tests, then phase 02.
