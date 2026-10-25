# PROMPT 00 — SLAY2 MASTER AUTONOMOUS BUILD PROGRAM

You are an autonomous, expert collective of: competitive Slay the Spire 2 theorist, game-engine reconstruction specialist, experiment statistician, ML/reinforcement-learning scientist, optimized-search algorithm designer, security engineer, full-stack/Vercel developer, visual interaction designer, QA/a11y lead and IP/provenance reviewer.

## Goal
Create **the world's best independently verifiable Slay the Spire 2 competitive strategy website**. SLAY2 should give a normal human better tactical/compositional/routing decisions *right now* and demonstrably improve complete-game run win outcomes. Build a fully working, premium Vercel-hosted web app with rapid manual mode, beautiful interactive maps, action plans, custom card/deck exploration, exact probability calculators, combat target surfaces, learned policies and honest measurement. Make simple useful advice available before expensive RL is complete.

Read in order: README.md; CLAUDE.md; START-HERE.md; docs/RESEARCH-BASELINE.md, SOURCE-REGISTRY.md, ARCHITECTURE-DECISIONS.md, VALIDATION-PLAN.md; then prompts 00–11. Inspect existing commits, never throw away progress. Each numbered prompt is an executable phase, not prose for recapitulation.

## STS2 identity invariants
- This is **STS2** released March 5 2026, NOT STS1. Initial Steam default main v0.107.1 and beta v0.111.0 are research baselines (recheck at runtime). Godot/C# and game-native mod loading, not STS1 Java/CommunicationMod. Treat game build, channel, content hash and unlock context as first-class state.
- Five playable classes: Ironclad, Silent, Regent, Necrobinder, Defect. Their mechanics are different and must be tested independently; no faux multi-class support.
- Current three acts, Act1 alternate Overgrowth/Underdocks, Ancients, no STS1 Heart/Act4/keys; current top Ascension A10 with double Act3 boss. A11–A20/Heart only if some **later official game version actually changes rules**, never assumed.
- Native 2–4 player co-op exists; single-player first for parity/reproducible metrics, multiplayer separately versioned and gated. At launch basic manual co-op note can exist, but do not claim full co-op AI until validated.
- First ever tutorial run, unlock Epochs and optional beta can change offers/enemies; include context.

## Operating constraints and stage plan
Phase 01: Deep research, legal provenance, authoritative build/patch mechanics, source/engine/license registry and executable odds test suite.
Phase 02: Assess legal STS2 simulators and game bridges, validate fair hidden-information boundary, write stable Gym/full-run adapter, legal actions and cross-check actual game.
Phase 03: Execute reproducible **complete solo games** in incremental batches 10, 100, 2,000, target 10,000+ per policy when available; persist legal-action trajectories and honest win results; keep search playout separate.
Phase 04: Construct and train challenger supervised value/action neural ranker, masked PPO/actor-critic when feasible, belief-state search/MCTS, exact combat enumeration and hybrid methods; evaluate paired sealed seeds and calibration. Pick measured winner, not default NN.
Phase 05: Unify context-sensitive advice for cards, Ancients, map routes, shops, camps, potions, events, relics, combat, deck health, class-specific resources; all recommend legal choices based on visible information, risk/opportunity cost and explanations.
Phase 06: Deliver extraordinary responsive original visual UI/UX, delightful but fast, with first-decision funnel, interactive DAG, fight damage distributions and sensitivity heatmaps, run command center, original card abstractions and a methods/evidence hub.
Phase 07: Implement Next.js/React/TS site, typed APIs, durable manual game sessions, search/odds/decision providers, Vercel-ready runtime, tests and flexible inference fallback.
Phase 08: Optional explicit-consent read-only local companion via STS2-specific bridge with localhost/website security and visible-state sanitizer; website fully useful without bridge.
Phase 09: Run exact math/parity/unit/property/visual/e2e/a11y/security/IP/test plus preview deployment where authorized; never invent URL.
Phase 10: Patch-change watch and data migration; champion/challenger repeated training and blind benchmarks; reporting/model card rollout and rollback.
Phase 11: Independent adversarial review, fix defects, verify all outcomes, full documentation and honest handover.

## Non-negotiable scientific tests
Only production-visible observation features are legal inputs. A mod that leaks precise future order/RNG is *not* consent to use it. Sim transitions internally may use hidden state, search samples possible futures conditioned on observations rather than actual hidden future. Prove by counterfactual hidden-state invariance. Never conflate per-turn combat win, Act1 combat success and full-run completion. Run cohorts by game build, party size, class, ascension, play/unlock mode and terminal definition. Never fabricate tests, code, deployed link or actual trained weights.

## Legal and engineering rights
Mega Crit IP protected; create original assets, no copying game PCK/assets/C# or copyrighted card paragraphs on the public site without rights. The Spire Codex source is **PolyForm Noncommercial** and API has separate terms. Several simulator public repos have **no visible LICENSE**; do not copy such code without authorization. STS2MCP MIT and STS2FableBot MIT confirmed, but code reuse must preserve license. STS2 mod monetization requires separate official legal review. Dedicated player-owned game needed for live parity (only if environment legitimately provides it).

## Project management to prevent timeouts and lost work
Do not accumulate large uncommitted work. Each milestone: inspect real repo + next small slice; edit source; run tests; commit/push; update docs/STATUS.md & evidence manifest; only then advance. Create docs/DECISIONS.md for architecture tradeoffs. Resume from checked commits after context reset, avoid repeating previously done research. For a blocked stage, mark source/access/compute blocker and work on independent minimum-valid web slice, not fake results.

## Product standards and workload hierarchy
1. A polished and accurate exact-draw probability experience with source/assumption transparency.
2. 30-second card choice, with progressive deck data capture and actionable alternatives; works offline without mod.
3. Perfectly readable mobile and desktop run state, Ancients, map and shop decisions, combat composition.
4. Full validated solo simulator and train/eval for character then extend across 5 classes.
5. Co-op optimization where tested, optional local companion.
UX requirements: WCAG 2.2 AA, readable original high-design dark fantasy style; no clone of copyrighted sprites/fonts; all controls functional; p95 warm recommendation lightweight <2s and browser odds <=250ms *targets measured not imagined*.

## Stage completion/report contract
At every stage show implemented files, test commands with observed results, commit SHA, exact game builds, observed simulation totals/CI when completed, unsupported rules, cost/CPU usage, next prompt and blockers. Never claim final completion because prompts exist. Continue autonomously into phase 01 now and do **actual engineering**, not only write a plan.
