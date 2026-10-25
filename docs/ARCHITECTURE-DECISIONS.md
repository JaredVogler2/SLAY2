# SLAY2 architecture record

## ADR-001 Platform
Vercel-hosted Next.js App Router + strict TypeScript, Tailwind + accessible UI primitives, React/Canvas/SVG graph visualization; lightweight model inference where tested. Server-side workers not permitted to launch massive full-game simulation. Python 3.11+ Torch / Gymnasium/MCTS simulation and training in isolated local/worker runtime. C#/.NET optional STS2 bridge only, with no required mod for end users.

## ADR-002 Separate game builds and modes
`GameVersion = { game: "STS2", channel: "main"|"beta", buildId, version, contentHash }`. Every reference fact/rules loader, card effect, test, trained model and result includes exact build. Incompatible build triggers no precision recommendation. Store `gameMode: solo | coop2 | coop3 | coop4`; train/evaluate each separately. Main and beta never join a training/evaluation cohort unlabelled.

## ADR-003 Current run target
For STS2 v0.107.1 main and v0.111.0 beta as researched Oct 2026: three acts, alternate Act1 Overgrowth/Underdocks, Ancients, 5 characters, Ascension A0–A10; victory end of Act3 (A10 double bosses). No STS1 Heart, Keys, Act4. Distinguish `won`, `lost`, `invalid`, `timeout`, `mod error`, `aborted`, `tutorial scripted` and `multiPlayerDisconnected`. No training or dashboard denominator blending.

## ADR-004 Truthful observable-state interface
`GameStateInternal` (RNG, shuffled draw order, future rolls, hidden enemy AI state) is separate from `PlayerObservableState` (visible cards, deck multiset, current intent, relic/Ancient boons already revealed, event choices offered, HP/gold, map nodes already exposed, party-visible state only). Policy receives observable state + enumerated legal actions, never `seed` or internal future. Must test hidden-state counterfactual invariance. Source adapters sanitize privileged mod payloads with strict allowlisted schemas; do not automatically treat a debug-visible field as player-visible.

## ADR-005 Data rights
Spire Codex source uses PolyForm Noncommercial, separate API terms, extracted Mega Crit assets. Link/reference factual values with license and rate limit checks; do not vendor data or images by assumption. Existing simulators without licenses are research/black-box reading references pending permission; no code copied. Reproducibility requires pinned SHA/version and cited originating fixtures.

## ADR-006 Real algorithm requirements
`decision = argmax_a expected(runWinValue | observableState, legalAction, beliefOverHiddenEvents)` within a budget, not simplistic single-turn damage. Analytical exact math, risk-sensitive rules, combinatorial combat enumeration on small states, fair sampled-belief MCTS/search, then trained value/policy when validated. The champion is whichever has strongest matched held-out results and acceptable latency. Fallback does not invent probability.

## ADR-007 Core contracts
`ChoiceType = cardReward | combat | nextMap | shop | rest | event | ancient | potion | relic | deckAnalysis | coopCoordination`.
`recommendation = { rulesVersion, gameMode, character, ascension, legalChoices, ranked, chosen, explanation, exactOrEmpiricalOrModelOrHeuristic, probabilityInterval?, sampleSize?, unsupportedRules, assumptions, modelVersion, latency, status }`.
All probabilities scoped to conditional question. Explicit `unsure` / abstain.

## ADR-008 User experience
Manual-first with progressive input; original premium dark fantasy tactical observatory, outstanding typography/readability and responsive interactive maps, deck cards, enemy target heatmaps and outcome histograms. Exact/estimated/unsupported distinctions meaningful; first answer in <30 seconds with minimal inputs. Offline/cached local odds available; no account/paywall mandatory. Give experts deeply inspectable distributions.

## ADR-009 Multi-player
Separate team state contains party members, cards that target allies, shared events/voting, synchronous action windows, multiple health bars, enemy target modes and action ordering. Co-op is a standalone capability and never falsely advertised supported merely because a mod provides some co-op state. Team policy needs explicit coordination and privacy controls.

## ADR-010 Dev workflow
Small completed milestone: inspect, implement, test, commit, push, update status, update repro instructions. Do not simulate fake results to decorate frontend. Vercel preview/production deployment only with actual access, correct project and verified URL. Log raw simulation to durable local/object store and version compact manifests in GitHub.
