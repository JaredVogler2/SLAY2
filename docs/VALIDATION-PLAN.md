# SLAY2 quantitative acceptance, research and release gates

## Product success
A user playing a legitimately installed STS2 should get a more useful, faster and more accurate recommendation than generic static lists. Real value is improvement in **complete-run victory rate** and decisions under legal information limits. Competitive target solo A10, all five classes eventually, with 2–4 co-op a separately gated milestone. Website must be premium-grade but cannot substitute beauty for correct advice.

## Measured levels
- L0: versioned factual reference, validated analytical probability calculators, manual app with honest qualitative assistance, original UI.
- L1: fully working manual advisor across common choices, tests, safe unsupported handling and conditional visible info model.
- L2: executable complete-run simulator at least one character on supported build, real-game differential parity proof where owner's game available, audited game traces.
- L3: actual thousands of completed games, first fair baseline; independently trained and evaluated competing policies on disjoint seeds with confidence intervals and calibrated uncertainty.
- L4: reliable all-5-character solo support, patch migration/regression.
- L5: independently validated 2–4 player co-op, optional secure local bridge and verified production Vercel deployment.

## Baselines and target runs (targets, not claims of actual execution)
1. First a deterministic 10-episode smoke with full action/state/terminal audit.
2. >=100 end-to-end random/heuristic baseline runs; reject invalid actions and timeouts explicitly.
3. >=2,000 **complete solo games** for first validated class/main-build/mode/difficulty cohort to estimate baseline and gather data.
4. Target >=10,000 complete games per major policy family as resource budget allows, with run manifest/trace SHA and replay audit. Report actual completed count and exact compute.
5. Final challenge >=1,000 unseen independent paired seeds per policy comparison when feasible; harder A10 low-frequency wins need power analysis and potentially more.
6. Do not mix separate game versions, solo/co-op, Ascensions or characters in a headline metric. Research oracle with hidden RNG has separate excluded leaderboard.

## Distinguish metrics
- Run win: Act3-clear outcome as the real patched game defines it; for A10 second boss required.
- Tactical fight survival/expected HP loss: scenario-conditioned distribution, not overall win.
- Model win probability: calibrated and reliability-checked across comparable state buckets, never just rank score.
- User run community stats: observational, selection biased, no causal uplift.
- Multiplayer: one match = one team outcome; do not create 2–4 independent wins from single match.
- Simulation rate: `completed games per CPU-hour` is NOT `search rollout nodes per second`.

## Fair benchmark procedure
Train/tune/blind-test split by seed & episode & game build, with immutable manifest IDs; paired policy comparisons use identical seeds, same allowed observation fields, legal actions and compute wall-time budgets. Bootstrap CI for paired gain, Wilson intervals on binomial, predeclared sample sizes, report invalid/truncated/abort reason not silently excluded. Evaluate class x A x act x map x boss x Ancient x meta progression coverage and map branch. Baselines random legal, simple heuristics, risk-aware route + tactical search, supervised ranker, learned actor/critic, MCTS hybrid and simple abstain fallback.

## Exact math parity gates
- Sequential rare offset, A7 Scarcity, rarity pool exclusions, unknown '?' roll order, conditional potion drop and rarity, Act2/3 nonrare upgrade chance, shop discounts/removal inflation, Ancient pools, encounter odds and drawing without replacement.
- Pin authoritative numerical fixture source and build. All analytical distributions sum to one (within tolerance), symmetry/monotonic properties hold, exact enumeration agrees with Monte Carlo on tractable cases, and same visible state/changed hidden future does not change fair policy outputs.
- Confront simulator disagreement with official game. Unsupported game mechanics flagged and fallback rather than silently approximated as exact.

## Frontend + deployment thresholds
- First-time user obtains manual card guidance in <=30 seconds and sees rationale, alternative, confidence kind.
- Accessible WCAG 2.2 AA intention, keyboard/screen reader, 320px–ultrawide, touch and reduced motion.
- p95 browser exact-odds computations <250 ms on defined test device, lightweight warm API <2s; budgeted search honestly displays waiting/approximate.
- Actual Playwright interaction tests, visual screenshots and Lighthouse defined profile Core Web Vitals goals (LCP <=2.5s, INP <=200ms, CLS <=0.1).
- No fabricated stats, score/fake simulation buttons, copyrighted sprites/music. Safe import, rate limits, no private state in logs and cross-user caches.

## Required evidence artifact
For each run experiment: engine/game build/hash, policy+model hashes, RNG exposure audit, seed set manifest, exact command, CPU/GPU, number completed, wins, losses, invalids/timeouts, latency/budget, point estimates and CI, log storage and replay integrity. For each code phase: file paths, tests actually run, expected vs observed, screenshot if UI, CI link, commit SHA, blocker. Each source: owner, source URL, build, retrieval date, license/permission, what it supports, remaining unknown.

## Go/no-go
Do not claim game-accurate AI if real-game parity failed; do not claim model improvement without paired blind benchmark; do not claim production hosted without verified Vercel URL; do not claim full five characters/co-op without proper coverage tests; do not serve STS1 Heart/A20 assumptions in STS2; no default copied game art or unapproved dataset mirroring.
