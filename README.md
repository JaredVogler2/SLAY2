# SLAY2 — Slay the Spire 2 Decision Intelligence

**Status as of 2026-10-25: independently researched engineering specifications. The game assistant, simulation experiments, models, and website are NOT yet implemented or deployed.**

SLAY2 is an independent, unofficial, Vercel-hosted **coaching and decision-intelligence website** for players of Mega Crit's **Slay the Spire 2**. It is **not a browser clone or redistribution of the game**. The product combines conditional probability calculators, context-sensitive strategy guidance, validated fair-information simulators, search, reproducible machine learning and outstanding premium UI/UX. Gameplay is in the user's legitimately installed copy of STS2. Manual entry works without an account, mod, or subscription.

## Start Claude Code

**First:** read [CLAUDE.md](CLAUDE.md) and [START-HERE.md](START-HERE.md). Then execute [prompts/00-MASTER-ORCHESTRATOR.md](prompts/00-MASTER-ORCHESTRATOR.md) and phase files 01–11 in numeric order, with tests, evidence and small GitHub commits. These are build instructions, not claims of work already accomplished.

| Stage | Prompt | Outcome |
|---|---|---|
| 00 | [Master/orchestrator](prompts/00-MASTER-ORCHESTRATOR.md) | Autonomous incremental build contract |
| 01 | [Research & legal](prompts/01-RESEARCH-DATA-RIGHTS.md) | Versioned game source/move registries and licensed data |
| 02 | [Engine & parity](prompts/02-SIMULATOR-PARITY.md) | STS2-accurate fair-observation full-run environment |
| 03 | [Mass gameplay](prompts/03-MASS-SIMULATION.md) | Thousands of **actual completed games** with auditable traces |
| 04 | [Neural ML/search](prompts/04-MACHINE-LEARNING.md) | Trained/evaluated hybrid policy on blind seeds |
| 05 | [Decision engine](prompts/05-DECISION-ENGINE.md) | Explainable, lawful, confident-enough game advice |
| 06 | [World-class product UX](prompts/06-EXPERIENCE-DESIGN.md) | Exceptional accessible visual game-intelligence interface |
| 07 | [Next.js/Vercel](prompts/07-WEB-IMPLEMENTATION.md) | Production-grade working manual-first web app |
| 08 | [Optional local companion](prompts/08-LOCAL-COMPANION.md) | Secure consented read-only STS2 state integration |
| 09 | [Testing/deployment](prompts/09-VERIFICATION-DEPLOY.md) | Correctness, security, accessibility and verified delivery |
| 10 | [Self-improvement](prompts/10-IMPROVEMENT-LOOP.md) | Patch-aware champion/challenger empirical model program |
| 11 | [Independent audit](prompts/11-RED-TEAM-ACCEPTANCE.md) | Adversarial gate and honest project handoff |

Read [docs/RESEARCH-BASELINE.md](docs/RESEARCH-BASELINE.md), [docs/SOURCE-REGISTRY.md](docs/SOURCE-REGISTRY.md), [docs/ARCHITECTURE-DECISIONS.md](docs/ARCHITECTURE-DECISIONS.md), and [docs/VALIDATION-PLAN.md](docs/VALIDATION-PLAN.md) before coding.

## Critical differences from SLAY (original game)

- STS2 released Early Access March 5, 2026; official game built using **Godot with C#**, with native mod support. The initial scope is the STS2 official default Steam channel **v0.107.1**; latest separately recorded beta **v0.111.0** as checked October 2026; always re-verify on startup. **Never combine main/beta data or training artifacts.**
- Five characters: **Ironclad, Silent, Regent, Necrobinder, Defect**. Class-specific mechanics include Regent Stars/Forge/Sovereign Blade, Necrobinder Osty/Souls/Doom/Graveyard/Ethereal, Silent Sly, Defect orb systems, and Ironclad unique new cards.
- STS2 currently uses **three acts**, with alternate Act 1 **Overgrowth / Underdocks**, new Ancients and relic-choice systems. Highest current Ascension **A10**, not A20, and A10 requires an Act 3 double-boss clear. **No STS1 Heart/keys/Act 4 assumptions.**
- Solo first, with **2–4 player co-op** a separately validated workstream: multiplayer-only cards, ally targeting, synchronized decisions, scaling, seat-level outcomes. Do not promise co-op parity until tested.
- First-ever tutorial/progression runs can have scripted rewards and Neow availability. Ancients/unlocks/Epoch Timeline and reward changes may alter observation and game state.
- Everything changes across Early Access builds: card values, prices, monsters, AI moves, rarities, event eligibility, RNG and even mod protocols. A model that works on the wrong patch should abstain or fall back.

## Non-negotiable rules

1. **No fabricated facts**: never claim simulations, trained models, win rates, parity, website deployments, or probability certainty without checked artifacts and explicit version, cohort and sample.
2. **Honest information**: visible-only policy; raw mod/engine RNG state, future draw order, hidden map/rewards, scripted scenario seed and unseen intents MUST NOT leak to player-facing agents.
3. **Real game experimentation**: `1000 combat playouts` ≠ `1000 completed games`. Validate full-run outcomes against real STS2 before trusting simulated win rates.
4. **Research-specific rights**: Mega Crit retains game IP. Independent original UI art; no bundling extracted art/C# or bulk publishing copyrighted content. Verify data API terms/third-party repository licenses before copying.
5. **Hybrid intelligent coaching**: exact probability calculators when valid; robust rules & search; neural networks **only when measured better** on fair matched held-out runs.
6. **No serverless training jobs**: Vercel hosts the site and lightweight APIs, intensive training and full-run simulations run on local/isolated workers.
7. **Incremental resilience**: commits after small passing steps, status/evidence update after every stage; resume from real repository state.

## Primary research sources

Official: https://www.megacrit.com/press-kits/slay-the-spire-2/ ; https://www.megacrit.com/faq/ ; https://steamcommunity.com/app/2868840/announcements/

Facts: https://slaythespire.wiki.gg/wiki/Slay_the_Spire_2:Ascension ; https://sts.wiki/guides/card-rewards ; https://almanauts.com/slaythespire2/ ; https://simthespire.wordpress.com/

Reference API (terms/rights caution): https://github.com/ptrlrd/spire-codex

Simulator candidates: https://github.com/yizhang-dream/sts2-simulator ; https://github.com/zhiyue/sts2-rl-agent

Agent/bridge: https://github.com/cicero225/STS2FableBot ; https://github.com/Gennadiyev/STS2MCP ; https://github.com/BMingSY/sts2-ai-mcp

**This repository is a research-driven prompt program. Claude Code must deliver executable artifacts and measured evidence, not only additional documents.**
