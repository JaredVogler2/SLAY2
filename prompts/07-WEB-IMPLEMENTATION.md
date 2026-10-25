# PROMPT 07 — BUILD COMPLETE VERCEL NEXT.JS SLAY2 WEB APP

Act as production full-stack architect and performance/security engineer. Implement the high-quality front end from phase 06 with real functional tested decision APIs from phase 05. Must remain usable **without an installed game mod, account, GPU, or inference service**.

## Stack recommendation with validation
Monorepo Next.js App Router (supported stable version), React, strict TypeScript, Tailwind and accessible component primitives, Zod/JSON Schema, Vitest/Jest + fast-check, Playwright + axe; lightweight SVG/D3/React Flow DAG with fallback, typed query state and local IndexedDB persistence. Select libs only after current dependency/license/size audit. Python simulator/training independent (outside Next/Vercel function); short pure TS odds/browser and bounded Node/server model inference. Prefer pnpm package workspace and reproducible lockfiles only where genuinely justified. Do not hide core logic in proprietary paid API calls.

Suggested:
```text
apps/web/src/app/{page.tsx,advisor,run/[id],deck,cards,combat,combat/targeting,pathfinder,ancients,shop,campfire,event,potions,odds,codex,co-op,research,about}
apps/web/src/app/api/v1/{health,capabilities,manifest,cards,relics,ancients,recommend,odds,import,experiments}
apps/web/src/components/{shell,inputs,card,deck,charts,combat,map,ancient,probability,feedback}
packages/{game-schema,odds,decision,ui}
engine/ training/ experiments/ eval/ data/ docs/ prompts/
```
Use valid Next.js parallel route syntax, avoid gratuitous routing complexity and unstable build settings.

## Core function design
- GET /api/v1/health returns build/schema/supported methods.
- GET /api/v1/capabilities returns exact character, difficulty, mode, encounter, mechanics and game version coverage with statuses rather than false all-classes support.
- GET /api/v1/manifest returns game build data sources and update flags.
- GET /api/v1/catalog/cards, /relics, /ancients, /monsters, /events with typeahead; cache rights-reviewed factual metadata only. Build-typed IDs.
- POST /api/v1/odds (small pure calculator, validates parameters and assumptions) and browser local equivalent.
- POST /api/v1/recommend (typed visible state, user options, known action set, bounded runtime) returns ranked actions, source-conditioned reasons, confidence method and full provenance.
- POST /api/v1/import/validate if server needed; default client-only local file import with versioned schema and size limits.
- GET /api/v1/experiments returns **only actual checksummed reports**; no empty fake generated leaderboard rows.
- Error envelopes consistent, explicit invalid input 400, unsupported patch/mode 422 or status as documented, bounded request deadlines/rate limits.

## Persistence & modes
Local-first IndexedDB/Zustand or equivalent typed with versioned migrations, privacy defaults, no forced signup, export/import portable JSON state, session undo, card/relic updates and run history. No login required; optional user sync behind future infrastructure gate. No raw personalized run state logged to analytics. Exact class/A/main-vs-beta/version optional user choice; user should see support warning if unknown. Tutorial/Epoch flags and first run assumed unknown rather than false normal.

## Inference architecture and cost
- Browser exact algorithms for drawing and deterministic outcomes, cache computation with memoization and brief tooltips.
- Server bounded heuristic/context evaluator and optional deployed calibrated tiny ONNX/TS inference if measured compatible; handle model missing/unknown build/unsupported actions by explicit fallback. Do not label a heuristic as neural network.
- Heavy multi-second search can use opt-in local worker or independent queued service with rate limit, auth, cost budget and timeout; never put training loops or thousands of game runs in Vercel route handlers.
- Clear callback/time out; show currently available instant answer while advanced search computes where genuinely supported; never promise background outcomes without an actual backend worker.
- Avoid leaking model data from another user's private state or wrong cache key; include build/model/candidate set in digest.
- Patch-driven content refresh via controlled PR and revalidation/clean semantic diffs, not silent changing live values.

## Security, data and rights
Validate impossible costs, HP above max, unsupported class/Ascension, class-specific features, illegal targets/actions, invalid/unknown item ID, unrecognized build/channel, extra/hidden RNG fields, malicious imported JSON, oversized deck/route, XSS, SSRF, origin attack on local bridge, request flood and unbounded compute. CSP and safe headers; secrets in server env only, sandbox no arbitrary code, policy model artifacts hash verified. Document dependencies/licenses; no proprietary artwork/copyrighted source import without permission, including "public API" dumps. Sensitive user state remains on local by default.

## Test-first working slices
1. Vercel-buildable shell/home: beautiful visual, fast, working CTA and nav.
2. Real exact draw tool and conditional rare reward calculator, with golden fixtures/conditional test.
3. Manual 3-option card reward + skip, rich contextual ranking for one fully supported character on pinned build; local save/undo and published method/limitation.
4. Searchable factual library and tested Ancients chooser; live deck builder.
5. Map/campfire/shop/potion/event services, conditional risk UI and realistic fixture snapshots.
6. Combat sequence planner and original targeting heatmap from actually evaluated STS2 simulations; no fake heatmaps.
7. Extend to characters and co-op only after parity; release toggle for experimental model.

## Quality/deployment
Use strict `tsc`, lint, format, dependency audit, pure math/property tests, API schemas, Playwright flows at mobile/desktop, visual regressions, a11y/keyboard, unavailable worker, session refresh/import, upgrade/multiplayer unsupported and patch mismatch. Track LCP/INP/CLS measurements, browser bundle, cold start, server latency and allowed cost. Write .env.example, docs/DEPLOY.md and preview/production launch checklist. Do not invent live URL; Vercel credentials/team/project might need user's action. Commit tested slices and proceed 08.
