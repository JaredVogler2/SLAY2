# PROMPT 11 — INDEPENDENT WORLD-CLASS SLAY2 RED-TEAM ACCEPTANCE REVIEW

You are an independent expert audit board attempting to disprove that SLAY2 is accurate, fair, secure, compelling or better than existing tools. Assume original project developers have made optimistic modeling and design assumptions. Run real tests; reproduce failures, create failing regression, implement fixes, verify, commit. Do not merely congratulate or summarize.

## Twelve adversarial campaigns
1. **Game confusion:** Try to force STS1 Heart, Act4/keys/A20/card IDs, Java mod references and stale STS1 code into STS2. Verify actual three acts, A10 double boss, Ancients, Regent/Necrobinder, co-op independence.
2. **Patch contamination:** Swap main vs beta content while keeping IDs; ensure wrong card costs/damage/enchant relic values trigger revalidation or fallback. First-run scripted packs vs ordinary rewards.
3. **Statistical fake certainty:** Recalculate rarity offsets, A7 Scarcity and sequential pack rolls, potion 40% counter and elite roll, '?' conditional checks, exact draw chances, different Ancients. Try to find outputs that are unconditional when rules were conditional.
4. **Hidden RNG oracle:** Manipulate simulator seed/future draw/order/enemy AI with same normal-player observation; policy output must be same (modulo independently sampled policy randomness) and not learn from labeled future proxies.
5. **Simulator fidelity:** Challenge supported characters with rare buffs/enchantments, generated card effects, resources Stars/Osty/Doom/Sly/orbs, multi-target/party state, status/afflictions, map/merchant/campfire and A10 boss. Real-game fixture disagreement -> bug, not silently "approximation exact."
6. **Full-run truth:** Audit actual raw complete game traces and manifests. Can every reported win be replayed, did run really reach terminal success, were invalids/timeouts omitted, are samples enough for claim? Does agent mistakenly call 1,200 combats/sec evidence of full-run speed?
7. **Model science:** Review legal action masks, train/test seed & patch leakage, overfitting and tiny evidence, paired confidence interval, ablations vs stronger simple search, calibration/OOD and search time budgets. Reject false promise of universally optimal play.
8. **Co-op:** Count one victory per team instead of 4, validate ally-targeting privacy, synchronized decision actions, forbidden off-turn cards/unknown partner secrets, encounter scaling and patch-specific features. Unsupported co-op should not imply AI optimized.
9. **UX and design:** Real human walk-through (or scripted proxy) from homepage to quick decision in <=30s, compare beautiful mobile 375/390 and desktop 1440 screenshots against high-end aesthetic brief, inspect hierarchy, interactive utility, good error states, keyboard/a11y/reduced motion, graph accessibility, meaningful 2D targeting sensitivity charts. All controls do real work, not fake sliders.
10. **Security:** Fuzz inputs/imports/maps/notes for XSS, SSRF, injection, denial-of-service simulation workloads, corrupted model weights, caching cross-user leak, exposed keys, localhost bridge CORS/Origin/DNS rebinding/PNA, no rogue gameplay control.
11. **Rights:** Check every dependency/artifact, public API rate limit/API_TERMS, noncommercial code licensing and copyright of game assets, third-party article images, Mega Crit fan/mod policy. Do not expose copied copyrighted assets under a permissive app license.
12. **Deployment/handoff:** Fresh environment clone/install/test/build for Vercel; preview/production URL verified if claimed; no unbounded training in API routes, model hash matches tested, environment template accurate, independent update rollback.

## Active findings process
Build table with test ID, severity P0/P1/P2/P3, expected/actual, reproduction command/screenshot, source rule, affected patch/classes, proposed fix, commit and regression test. P0 false probability certainty, mislabel game, hidden info, illegal gameplay and security; P1 unsupported simulator/model shipped as validated or production error; P2 a11y/user flow; P3 polish.

Construct at least 40 authentic adversarial scenario fixtures across 5 characters and all major decision types, including 10 scenarios for Regent or Necrobinder's unique state, 10 multi-target battles and 10 Ancients/patch cases. For unsupported classes clearly mark tests intentionally not passed, not false positive.

## Final documentation
- docs/ADVERSARIAL-AUDIT.md with exact blockers/fixes/tests, independent references.
- docs/STATUS.md with L0–L5 levels by class/A/patch/solo/co-op and real completed game counts.
- docs/TEST-REPORT.md and docs/RELEASE-AUDIT.md exact commands/observed results.
- docs/REPRODUCIBILITY.md with artifact location, hashes, source/engine version and seed manifest.
- docs/MODEL-AND-DATA-CARDS.md including provenance/CI/license/fairness.
- docs/DEPLOY.md actual URL if authorized/verified; no invented success.
- README onboarding, first-time user and advanced competitor quickstart, IP disclaimer and privacy.
- Original production screenshots from running UI.

## Final bar
SLAY2 is finished only when premium UI and manual advisor actually run, exact odds tested, app correct under supported patch/class and legal choices, simulator and ML claims backed by raw evidence, deployment verified if executed and rights/security/accessibility checked. Otherwise provide an honest partial product status, next action and blockers. Commit all fixes/evidence in small safe pushes.
