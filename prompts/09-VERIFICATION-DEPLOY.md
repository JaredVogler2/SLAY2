# PROMPT 09 — COMPREHENSIVE VERIFICATION, SECURITY, RIGHTS, PERFORMANCE AND VERCEL DELIVERY

Be the independent production-quality gatekeeper. SLAY2 is a scientific tool giving costly in-game advice: a beautiful UI with wrong card math is unsafe for credibility. Make extensive tests **actually execute**; independent parity, zero fake claims, robust error handling and version discipline before deployment.

## Scientific quality audit
- Re-check current official STS2 Steam main/beta version. Verify exact patch-dependent Ascension levels, three-act victory, A10 double boss, first-run unlock/script flags, character mechanics/Ancients/conditional card/potion/map probability counters and content IDs. Compare source registry with actual observed tests; list uncovered rules.
- Golden/mutation/property tests for rarity offsets (including A7 Scarcity), source-specific card distributions, conditional potion drops + elite modifiers, unknown-room transitions, enchantments/afflictions, shop removal inflation A6 and draws/shuffles. No stated percentages unless source and rules match test.
- Legal actions and action order: Regent Stars/Forge, Necrobinder Osty/Souls/Doom, Silent Sly, Defect orbs and Ironclad effects, enemy targeting, end-turn and campfires. Assert no illegal card, false purchase or unreachable route.
- Hidden-info adversarial attack: change internal RNG/unknown draw/hidden rewards while holding observation fixed; advice must not depend on true future beyond policy's independently sampled belief uncertainty. Stress mod debug payloads and cached state.
- Simulator-to-game differential parity with actual installed legitimate STS2 where available. If absent or patch mismatched, report UNVERIFIED and don't claim model game accuracy.
- Replay/checksum stored **completed** game episodes; no double counted seeds, timeouts counted explicitly. Model comparison on heldout paired seeds with confidence intervals and training split separation. Reject any invented win percentage, fake samples or conflated Act1 combat rate.
- Check co-op support independently (2/3/4 seats, team win one outcome, ally target legality, independent Ascension). Unsupported mode must not reuse single-player model claims.
- Evaluate fallback correctness, abstention, rare state uncertainty/calibration, latency and exact semantics. Display model confidence only if empirically tested.

## App, UX and accessibility
- All authored interactive components work (forms, save/edit/undo, map DAG path, deck choices, combat target heatmap if supported, Ancients, event/shop/rest decisions).
- Automated `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; unit/feature/API contract tests, Playwright mobile/desktop critical path and visual snapshot reviews. WCAG2.2 AA-oriented axe/keyboard focus and reduced-motion. Test slow/failed backend, closed browser, mobile orientation, iPad, invalid saved schema, old patch and unknown card.
- Measure real Core Web Vitals and performance budget; no huge JS/canvas memory leaks. Warm API and cold-start test, avoid unbounded backend search/cost.

## Security/IP release gate
- Treat imported runs and localhost companion as untrusted. Fuzz JSON, XSS, prototype pollution, file path access, SSRF, forged cookie/Origin/CORS, DNS rebinding, Private Network Access/HTTPS-to-loopback constraints, websocket sessions and token replay.
- Verify no game binary/decompilation payload shipped, and all game art/text/code/data license approvals documented. Spire Codex PolyForm Noncommercial code is not permission to mirror data. Clearly state independent unofficial fan site. Do not enable monetized mod features until counsel/Mega Crit permissions.
- Vercel deploy scope: UI + light endpoints, bounded inference; compute-heavy training and game simulations separated. Verify actual Vercel docs at deployment, costs, team/project/env permissions before linking. Use preview first, smoke test a real URL, only then production if authorized. Never invent hosted address. Include explicit .env.example.
- Threat-model storage: local-only default, optional user auth secure if added, cache partitioned by visible state/version and no private raw user-state logs.
- CI: lint/test/typecheck/build/a11y, dependency scan, signed model/experiment provenance, true seed-smoke only when simulator available and licensed. Add rollback/champion flip and patch-incompatible kill switch.
- Observability without unconsented telemetry; log availability/latency/fallback rates in aggregate with secrets redacted, explicit error bounds and incident runbook.

## Artifacts and go/no-go
`docs/RELEASE-AUDIT.md`, `docs/DEPLOY.md`, `docs/TEST-REPORT.md`, `docs/IP-LICENSES.md`, `docs/SECURITY-THREAT-MODEL.md`, CI workflows and checked traces. Every gate mark PASS/FAIL/UNVERIFIED with exact commands/build/commit and evidence. Acceptable to ship safe limited early product, **not** to call incomplete beta-game simulator state support fully verified. Commit/push and next phase 10.
