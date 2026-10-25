# PROMPT 02 — FAIR OBSERVATION FULL-RUN STS2 SIMULATOR, REAL-GAME PARITY

Build an auditable, license-compliant simulator/game observation foundation. A fast incorrect simulator will produce false AI confidence; prioritize source licensing, actual game build parity, correct legal action space and reproducible complete 3-act gameplay.

## Candidate selection
Compare yizhang-dream/sts2-simulator (Gymnasium `STS2RunEnv` full run, May snapshot and externally held beta override), zhiyue/sts2-rl-agent (five-character and PPO claims, no root license fetched), other slaythespire.dev STS2 sims and native game bridge/STS2MCP. Verify license before copying any code; no root LICENSE is NOT permission. Audit upstream code commit, character coverage, terminal semantics (upstream README mentions "Act 1–4" vs currently *3 acts*), scripted first-run handling, patch changes, item source rights, known parity holes, unsupported status effects and test independence. Document legally reproducible alternative if no license or owner game access; no fake exact simulator.

## Mandatory engine interfaces
`reset(config, seed)` internal state; `observe(internal)->strictPlayerVisibleObservation`; `legalActions(internal|observation)->typed actions`; `step(internal,legalAction)->observable transition + terminal + reward`; `snapshot/replay`; `version/build/hash`; `capabilities`. GameMode solo first, then co-op independently.

- Game internal: RNG streams, actual hidden draw/encounter rolls, future reward sequence, unrevealed intent state, patch-specific flags.
- Production agent observation: current visible hand, deck multiset (not shuffled hidden order), currently visible enemy intent, actual HP/block/status/energy/Stars/Souls/Osty/orbs, relic/counters explicitly tracked, upgrades/enchantments, current chosen Ancient and offered relics, currently known map, revealed offers/events and floor, current party-visible info for co-op.
- Research oracle: privileged simulator debug only; cannot enter webpage policy or public report. Implement strict allowlist/fair-state hashing, seed excluded as model feature and cache key, counterfactual same observation/different hidden future output invariance tests.
- Legal actions typed: card and target/order/endturn, discard/exhaust/replay decisions, created card choices, potion/ally/enemy target, route neighbor, card reward/skip/reroll/sacrifice, merchant purchase/removal, resting options, event decision, Ancient boon, boss reward and simultaneous/multiplayer votes (future).

## Coverage and game rules
At minimum first release targets Ironclad solo A0 main, all 3 actual acts, both Act1 variants, full map/Ancient/merchants/campfires/encounters/terminal and progression flags. Expand Regent/Necrobinder/Defect/Silent separately after parity. Character-specific special cases get explicit unsupported reason if unknown; never silently resolve unknown cards as approximate damage. Validate A7 scarcity and A10 double boss on high-difficulty cohorts before those outputs become authoritative. Co-op separate environment including team actions and enemy-party targeting.

## Differential parity, invariants, fuzzing
When legitimate locally installed STS2 game available, use safe authorized C# mod/bridge to produce player-visible fixtures and compare simulator after SAME seed and legal actions on chosen build. Record expected/actual state diff, engine/model commit hashes and data version. Reconstruct 3-act terminal wins and two A10 bosses; optional future content from different version explicitly separated.
- Properties: card conservation across pile/hand/exhaust and generated cards, energy/resource accounting, no invalid targets, block/damage ordering, Doom death threshold, Stars persistence, Forge outputs, Osty actions, Sly discard side effects, orb evoke, Ancient effects, enchantment legality, relic/potion triggers, correct map edges and shop prices.
- First ever/tutorial scripted rewards versus later normal runs; unlock pools; patch-specific event AI.
- Random legal action fuzz with bounded steps and minimized repro seeds; no infinite turn loops; inspect all lost/corrupted state.
- Simulation/future RNG hidden internally and **unavailable to the policy**, including exact randomized enemy behavior not currently visible.
- Cross-check against a real game; upstream test suites are not independent parity proof, especially when source game build differs.
- Benchmark actual **completed full-run games/sec** and **turn playouts/sec** separately. Count invalid game attempts and walls. If game isn't accessible for real parity, state UNVERIFIED and limit training claims.

## Exact combinatorial combat solver
Following Sim the Spire's *method* without copying its charts: on tiny known combat states, enumerate all valid hand/target/play sequences and conditional next-draw and enemy intent branches, aggregate outcome PMF for fight HP loss/turn count/death/remaining resources. Memoize equivalent states. Distinguish total probability exact vs bounded/incomplete; explicit fallback MC for state explosion, no impossible exactness. Cross-validate with Monte Carlo and real observed fights. Generate target-HP threshold and turn-1 hand fixtures for 2+ opponents.

## Deliverables
Simulator selection ADR and license decision, pinned dependency and patches, typed legal action adapter + fair-state serializer, repeatable build test harness, golden differential fixtures, exact-small-combat PMF analyzer and performance report, game build & coverage matrix, executable smoke-run examples and tests. If blocked, ship working independent odds and precise subset, clear status. Commit and proceed phase 03 only when real completed solo episodes possible.
