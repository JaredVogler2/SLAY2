# SLAY2 — Slay the Spire 2 Decision Intelligence

**Status as of 2026-10-26** (the source of truth is [docs/STATUS.md](docs/STATUS.md); nothing below is a claim beyond it):

* **Working and tested:** exact probability calculators for card-reward rarity with the hidden pity counter, potion drops, "?" rooms, draws, shop prices, card removal and gold (`/odds` and `POST /api/v1/odds`); **Route Lab** (`/routes`), which compares up to three typed routes through an act exactly (what the "?" rooms turn into, rare-card and potion odds, gold, relics) and never claims one is safer; and a manual card advisor that is a **labelled, uncalibrated heuristic**, never a win probability (`/advisor`): you say which Act 1 you are in (Overgrowth or Underdocks, with different elites and bosses) and what the opening Ancient gave you, its effect on your deck is applied as you report it, and the Act 1 version tilts the ranking by at most 30 % as its own labelled line, a judgement and not a measurement. Target: STS2 **main v0.107.1**; the beta v0.111.0 is refused. The pages are tested on phones, tablets and laptops (320 to 1280 px, enlarged text, no layout shift, no JavaScript) and make no request but to their own origin.
* **Deployed and checked:** https://slay-part2.vercel.app (Vercel, production alias; verified serving `main` at `1c4542d` on 2026-10-26, the merge of pull request #6: the pages and the health route answer, `/api/v1/health` reports the commit; evidence in [docs/DEPLOY.md](docs/DEPLOY.md)). Later work (the opening-relic study, pull request #7) reaches the site when it is merged.
* **Research harness, with measured results:** simulations run on a third-party simulator used locally only (live-game parity is unverified). Card values measured from randomised drafting are shown on `/codex` and as a labelled second opinion on `/advisor`; a rules policy that follows them got past the Act-1 boss in 65.1 % of held-out simulated Ironclad games against 43.3 % for the hand-written ratings, and won 6 of 1,994 (each win re-derived by replay); four more classes were measured and tested the same way, and the Ironclad values were measured again under the stronger tuned pilot (the new values got past the Act-1 boss in 79.4 % of held-out games against 74.8 % for the old ones, and show nothing after it). A threshold-tuned pilot (one pre-registered held-out test) got past the Act-1 boss in 74.8 % of the same games against 65.1 % for the untuned one and did not win more (6 against 5 of about 2,000); a policy that plans every fight on clones (about 2 minutes a game) got past the Act-1 boss in 74.3 % of 300 held-out games against 64.7 % for the rules and won 2 against 1 (no difference in winning can be shown at that size); no neural network beats the rules baseline yet. Details and caveats on `/methods`.
* **Audited:** three red-team rounds in [docs/ADVERSARIAL-AUDIT.md](docs/ADVERSARIAL-AUDIT.md) (API, full-run truth, UX on phones and tablets; campaigns 4, 7 and 8 are still open).

SLAY2 is an independent, unofficial, Vercel-hosted **coaching and decision-intelligence website** for players of Mega Crit's **Slay the Spire 2**. It is **not a browser clone or redistribution of the game**. The product combines conditional probability calculators, context-sensitive strategy guidance, validated fair-information simulators, search, reproducible machine learning and outstanding premium UI/UX. Gameplay is in the user's legitimately installed copy of STS2. Manual entry works without an account, mod, or subscription.

## Quickstart

**First-time player (no install):** open the site's **Odds** page, pick *Card rewards*, say how many non-rare cards you have seen since your last rare (or list the packs you have seen) and read the exact chance of a rare in your next pack; the fraction behind every number is one click away. On **Advisor** choose your character, enter your deck and the offered cards and read the ranking with its reasons and how stable it is. Your run lives in your browser only; export it as JSON whenever you like.

**Developer / competitor (local):**

```bash
node -v                                  # 22.x (see .node-version); pnpm 10.28.0 is pinned by package.json
pnpm install --frozen-lockfile
pnpm --filter @slay2/web dev             # http://localhost:3000
pnpm check                               # typecheck, lint, prettier, all unit tests, production build
pnpm --filter @slay2/web e2e             # browsers: PW_CHROMIUM_PATH=/path/to/chromium if Playwright's own is not installed
curl -s localhost:3000/api/v1/capabilities
curl -s -X POST localhost:3000/api/v1/odds -H 'content-type: application/json' \
  -d '{"calculator":"draw","pile":10,"targets":1,"draws":5}'   # {"n":"1","d":"2"}: exactly 1/2
```

The simulation harness (`sim/`, Python) needs a locally fetched, pinned third-party simulator that is **never committed**; see [docs/IP-COMPLIANCE.md](docs/IP-COMPLIANCE.md) and `scripts/external-fetch.sh`.

**Privacy and IP:** no accounts, cookies or analytics; the pages do not send your run anywhere and the public API stores nothing. SLAY2 is unofficial and non-commercial, not affiliated with or endorsed by Mega Crit; it ships no game art, card text or audio (the card catalog holds facts only: ids, names, class, rarity, cost, type and SLAY2's own role tags).

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
