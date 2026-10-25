# PROMPT 10 — NEVER-STALE PATCH-AWARE AI, EXPERIMENT PROGRAM AND CHAMPION/CHALLENGER

Build an ongoing, reproducible SLAY2 improvement program. **The game is Early Access; unchanged models can become wrong overnight.** The objective is empirical improvement in fair complete-run win probability at solo high Ascension (eventually each five-class A10) and separately team wins in co-op. Automatically marking an unverified new beta trained on old weights is forbidden.

## Patch/change tracking and compatibility workflow
1. Fetch official Steam news/changelog and reputable versioned catalog metadata as part of a configured execution, not website request, for main and beta separately. Detect build ID/version/content hash and changed card costs/effects, stats, enemy AI/encounters, event/Ancient pool, reward/rarity/RNG, shop prices, unlock behavior, mod schemas and co-op rules. Never infer latest release from a static README; check official when executing.
2. Emit machine-readable diff matrix by source/version and affected tests/methods/models. Keep data origins rights-verified. No unauthorized API scraping or unlicensed game asset extraction.
3. Hotfix invariant: disable or downgrade affected calculators/model to honest "patch unverified" while patch changes pending tests; do NOT silently apply previous game model to new build.
4. Revalidate game parity fixtures + exact mechanics probability tests + golden decisions; run small canary completed games on supported version.
5. Train updated challenger when data access and legal simulator parity allow, retain old champion for original build, never blend patch-inconsistent cohorts.

## Repeatable science program
- Experiment orchestrator configs with executable local workers, bounded CPU/GPU/cloud spend, checkpointer and resumable trajectory generation. Raw append-only game traces and SHA manifests; protected train/val/blind seed partitions and performance/compute dashboards.
- Champion policies: best simple baseline, fair search, trained action/value network plus search hybrid, adaptive budget and risk management. Do not assume the last or largest model wins.
- Failure taxonomy: Act1 Overgrowth vs Underdocks initial weak decks, early elites, A7 Scarcity effects, A9 damage/A10 two bosses, Ancient wrong value, bad shop removal, too-greedy heal/upgrade, generated card/Stars/Osty/Doom/Sly ordering, drawn status/afflictions, hidden-intent miscalibration, wrong co-op target, beta patch mismatch.
- Target experiments to failures; make one hypothesis and one ablation at a time; independent paired seeds within patch/class/ascension/mode and fixed wall-clock decision budget. Inspect CIs/effect sizes and adverse strata. Positive win rate from chance noise isn't adequate.
- Train a compact value/policy ranker, search teacher distillation or offline counterfactual ranker where experiment shows improvement; evaluate Brier/log-loss and risk-tail coverage, out-of-distribution performance, model feature schema and CPU/Vercel cold-start.
- Promote a challenger only if heldout gain credible, legality/parity/security pass, efficiency acceptable, and actual working output beneficial. Maintain previous model hash and kill switch. Source license for model/datasets checked.
- Research negative results equally carefully: failed NN vs simple heuristics should be recorded and not deployed due to prestige.
- Respect user privacy and co-op: consented run uploads only, no raw identifiable/Steam ID data in telemetry, careful multiplayer team denominators and partner opt-in.

## Artifact / UI integration
- `experiments/configs/`, `experiments/seeds/{train,val,test}`, `experiments/batches/<id>/manifest.json`, `reports/leaderboard.json`, `models/<model>/MODEL-CARD.md`, `docs/PATCH-COMPATIBILITY.md`, `docs/EXPERIMENT-TRACKER.md` only with actual data; no seeded fake leaderboard.
- `/research` shows public experiment lineage with build/main/beta badge (meaningful status), per class/A/solo/co-op mode sample and CI, champion comparison, model calibration chart, inference costs, replay limitations.
- `/odds` always states rules build and reference tests; `/advisor` API must reject incompatible model.
- Automated regression sequence runnable offline; CI only bounded smoke, not tens of thousands of compute-heavy episodes.

## Stage gate
Complete at least one genuine challenger comparison if possible, otherwise document exact dependency blocking and demonstrate resumable real orchestration. Patch-change compatibility handling tested with artificial rules change. Verified champion + rollback and no stale model re-use. Commit and proceed phase 11.
