# PROMPT 06 — WORLD-CLASS SLAY2 STRATEGY WEBSITE UI/UX

You are an award-winning digital-product designer, competitive Slay the Spire 2 player, accessible interaction designer and front-end visualization engineer. **Ship a fully functioning experience, not a static mockup.** This is an independent coach for a game the user plays elsewhere, not a browser remake. Priorities: actionable correctness > fast input > decision transparency > astonishing visual polish.

## Product positioning
SLAY2 — *The Spire Intelligence Observatory*. Premium tactical control room: original dark-fantasy atmosphere balanced with crisp, scientific interface, restrained glowing copper/ember/gold and mineral cyan, generous information hierarchy, responsive topography-like map lines, legible fantasy-influenced display type + accessible UI typography, premium microinteractions and original icons. Distinct from Mega Crit art/logo; no copied cards/backgrounds/sprites/fonts/music. Calm, high-signal strategy companion used on phone next to a monitor. Original illustration hero, not licensed game art.

Build actual tokens: charcoal #0B0F15, ink #111924, warm copper #D49A62, parchment #E9E0D0, cool teal #72D7C8, risk rose #E58B92. Token values are direction, validate contrast rather than blindly applying. Strong typography, disciplined 8-point grid, state-aware edge patterns, low-motion alternatives, limited motion budgets.

## Definitive user journeys / screens

**Landing (/)**: animated but lightweight original Spire geometry, one immediate "Get my next decision" CTA, "Resume run" (local session), "Explore exact odds", clear solo/co-op and patch-coverage notice. Authentic demo scenario with clearly marked fixture and no fake performance stats. Responsive first viewport must be beautiful and useful.

**Instant Advisor (/advisor)**: start character picker (Ironclad, Silent, Regent, Necrobinder, Defect), Steam branch/build, Ascension 0–10 and game mode; choose decision card/card reward, Ancient, map, shop, campfire, event, potion, combat. Minimum input: offered choices, optionally HP/floor/deck/relic. Search autocomplete real canonical IDs, upgrade/enchantment controls, skip. Immediate top-ranked legal action, strongest alternative, why, short-term tradeoff, missing data and exact/empirical/model/heuristic evidence flag. Human-readable no account.

**Run Command Center (/run/[id])**: page tracked by local private ID, all known state (act, floor, Ancient/relic, HP/maxHP, gold, potions, Stars/Osty/Doom/orbs, deck, enchantments, current map, choice history), quick action, last suggestion, undo/redo, browser save/restore, optional JSON import/export, change patch/ascension with clear compatibility warnings. Avoid forcing full hand input after every action in casual mode.

**Cards & Deck Studio (/deck)**: collectible-looking ORIGINAL informational card tiles with true class filters, rarity/cost/upgrades/enchantments, synergy network, energy/star curve, tempo, scaling, draw/discard cycles, vulnerable matchup, encounter pressure, deck thinning; compare offered cards versus SKIP for currently owned deck. Interactive what-if card add/remove/upgrade and animated impact differences. No fake "win delta" if model unvalidated.

**Map Pathfinder (/pathfinder)**: gorgeous branching DAG with only legal edges highlighted, hover/tap/keyboard details, elite/shop/rest/event/boss transitions, Overgrowth vs Underdocks when actually visible, Ancient inter-act boons, expected HP risk intervals, safe/balanced/aggressive paths, annotated rationale; zoom/pan, fixed sidebar on desktop, responsive list alternative on mobile, accessible route selection not dependent on colors.

**Combat Laboratory (/combat)**: manual, ultra-fast hand/energy/Stars and enemy intent editor, minion/ally tracking and relevant status/potion/relic counters, move sequence timeline and first action with conditional next steps, energy/HP after each deterministic move, chance outcomes for unknown draws, labeled search budget. Powerful original visualization: interactive enemy HP-threshold targeting heatmap; compare target/sequence, expected damage or HP-loss distribution, P(lethal), CVaR/tail loss from validated simulator. Exact enumeration separate from approximate MC, with sample/coverage and no pretending bot has unseen shuffled order. Correctly handle Sly/Forge/Doom/Osty/orbs where engine coverage supports.

**Ancient Decision Chamber (/ancients)**: dedicated original UI for boon/relic offerings, character + deck compatibility, resource/hp tradeoffs and unlock eligibility, Ancient event sequencing by Act, transparent effect comparisons; don't reuse STS1 Neow mechanics blindly.

**Probability Observatory (/odds)**: exact hypergeometric draw calculator, reward rarity sequential conditional counter, A7 Scarcity, potion drop pity/distribution, map '?'/eligibility, merchant removal inflation, event/relic conditioned pools, simulated HP-loss histograms when actual trace available. Inputs + formula + provenance + confidence + patch always visible; current settings shareable via local URL with no private data.

**Shops/Rest/Events (/decisions)**: purpose-built quick choosers showing spend/save/remove, upgrade/rest, legal events and conditional costs. Current decision framed as action candidates rather than encyclopedic wall of text.

**Codex (/codex)**: responsive fuzzy searchable factual reference for cards, upgrades, enchantments, afflictions, relics, potions, enemies, Ancients, events; version/source status, rights-approved factual short descriptions and original icon placeholders.

**Evidence & Methodology (/methods)**: genuine recorded model benchmark table with build/class/A0–A10/solo-or-coop, full-game wins + n/CI, model version, privacy/fairness statement, coverage status, blockers and date. Empty evidence must say "not yet evaluated" not fake win rate.

**Multiplayer Chamber (/coop)**: optional separate panel for 2/3/4 seats, ally target validation and cooperation, resource coordination, shared room decisions and team risk; keep honest limited support until co-op parity proven. Do not use single-player win % for teams.

## High-quality interaction principles
- Get first actionable low-information recommendation **within 30 seconds** from initial landing; no account or game mod.
- Progressive optional expert detail, keyboard command/search palette, fuzzy aliases/card search, local saved run, visible undo, input correction, quick HP/gold controls.
- Every control functional; controlled inputs update decisions and history. No inert buttons or false badges. Missing state is explicitly unknown, not implicitly max HP. Patch incompatible disables bogus precise advice, offers qualitative fallback with warning.
- Show exact vs fair-enumerated vs sampled vs calibrated vs heuristic **only where meaningfully distinguishing confidence**. A score is not a probability. Method explanation popover includes mathematical assumptions and links.
- Accessible WCAG 2.2 AA intent: visible focus, arrows and keyboard route access, screen-reader summaries, contrast, reduced-motion, color-blind safe charts, semantic forms, touch targets, 320px+ mobile, iPhone portrait, tablet, 1440px desktop and ultrawide.
- Visual originality with custom layout rather than generic widget-grid. Crisp empty/loading/error/OOD/unsupported/reconnect states. Animation purposeful, no FPS-heavy 3D requirement.
- Detailed responsive UI tests and visuals: Playwright screenshots at 375/768/1440/1920, authentic 8-flow journey tests, Lighthouse Core Web Vitals, axe/keyboard checks; document measured numbers, not aspirational fabricated score.
- Establish and protect brand/licensing: Mega Crit owns game content, clear independent fan advisor label, original assets/graphs, no copyrighted sprites.

## Acceptance
Beautiful responsive functioning screens tied to real odds and decision-engine APIs, keyboard/touch accessible. At minimum, full user journey character→card options→recommendation→change HP/deck→recompute→save/reload works end-to-end. Run visuals and actual screenshot inspections, fix friction until polished. Commit tested components incrementally. Continue phase 07.
