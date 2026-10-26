# SLAY2 status

**Last updated:** 2026-10-26 (session 1, continued) - **Branch:** `claude/adoring-brahmagupta-n2irn6` ([PR #1](https://github.com/JaredVogler2/SLAY2/pull/1) merged; follow-up [PR #2](https://github.com/JaredVogler2/SLAY2/pull/2)) - **Game target:** STS2 **main v0.107.1** (Steam build 23811903). Beta v0.111.0 is **unsupported** (rules unverified).

## Honest headline

| Item | Value |
|---|---|
| Exact probability tools (rewards with the hidden pity counter, potions, "?" rooms, draws, shop prices, card removal, gold) | **Working** at `/odds` and `POST /api/v1/odds`. Exact rational arithmetic; each engine is checked against an independent Python oracle (**720 golden cases, 14 kinds**), published tables, brute-force enumeration and property tests. Rules are the ones in `docs/game/MECHANICS-COVERAGE.md` (45 rows: 28 `VERIFIED-E1`, 1 `VERIFIED`, 2 `CORROBORATED`, 1 `SECONDARY`, 13 recorded facts). |
| Card advisor | **Heuristic v0, uncalibrated** (`/advisor`, `POST /api/v1/recommend`). Ranks the offered cards and skip by a unit-less deck-quality index, with reasons and a stability check. It is **not** a win probability and **no outcome-based evaluation exists yet**. |
| Evidence-grade completed simulation games (third-party simulator, Ironclad A0, `veteran` profile) | **Held-out (`val`, the same 2,000 seeds for both policies):** `rules_v1` **1,997** completed (3 simulator errors, excluded, never counted as losses): **0 wins** (95 % Wilson upper bound 0.19 %), mean floor **18.08**, deaths by act 1,132 / 837 / 28; the Act-1 bosses Vantom, Ceremonial Beast and Kin Priest kill 834 of the 1,997. `random_legal` **2,000** completed: **0 wins**, mean floor **4.48**. Paired difference **+13.60 floors** (95 % bootstrap +13.31 to +13.90); no win on either side, so no win-rate comparison exists. **Development (`train`, not held-out):** `random_legal` 1,999 of 2,000 (mean floor 4.47), `rules_v1` 300 (mean floor 18.29), `search_v1` 200 (mean floor 16.04). The 10- and 100-game batches are prefixes of the 2,000-game seed set, not extra games. |
| Paired comparisons | `rules_v1` vs `random_legal` on `val` (above). `rules_v1` vs `search_v1` on 200 shared `train` seeds: mean floor **+2.38** for `rules_v1` (95 % bootstrap +1.24 to +3.54); `search_v1` takes **19.7x** longer per game. The search policy uses 60 nodes per turn and a crude value function; repairing it is open work (H5). |
| Trained SLAY2 models | **One research network evaluated, no improvement.** Combat PPO from scratch (`experiments/rl/results/combat-ppo-v1-run1.json`, 2.9M steps, stopped at iteration 189 of 300 because validation had plateaued): on 796 held-out `val` combat pairs the best checkpoint wins **85.7 %** against **86.6 %** for `rules_v1` (rules-only wins 33, network-only 26, McNemar p = 0.43; HP lost difference +0.004, 95 % CI -0.009 to +0.017), the latest checkpoint 84.1 % (43 vs 23, p = 0.019, worse). It uses far fewer potions (0.20 vs 0.62 per combat). Nothing is deployed and no run-level batch was run, because the ADR-026 bar (a paired improvement) was not met. A behaviour-cloning warm start (`rl/bc.py`) is the next experiment. **Behaviour cloning** of `rules_v1` (`experiments/rl/results/combat-bc-v1.json`, 159,893 decisions of 7,953 won `train` combats) reproduces the baseline on the same 796 pairs (win 85.7 % vs 86.6 %, McNemar p = 0.31, boss win 50.0 % for both): the starting point of a PPO fine-tune that is running and has no result yet. |
| Patch compatibility | `slay2_sim patchdiff` diffs the archived 0.99.1 / 0.103.2 / 0.107.1 snapshots by id and field name (no content); 577/577 card and 296/296 relic ids of v0.107.1 exist in the pinned simulator (id coverage, not parity). See `docs/PATCH-COMPATIBILITY.md`. |
| Deployed website | **NOT VERIFIED.** The owner imported the repository into Vercel (project `slay-part2`); the first two production builds left a 404 (an empty build, then `ERR_PNPM_UNSUPPORTED_ENGINE`). The repository now carries its own Vercel contract (ADR-029). A real preview build of that commit finished READY and answered 200 on `/`, `/api/v1/health`, `/api/v1/capabilities` and `/robots.txt` with the security headers; the production URL is verified only after the fix is merged. Vercel Authentication is on, so a visitor sees a Vercel login until the owner changes Deployment Protection (`docs/DEPLOY.md`). |
| Simulator parity with the live game | **UNVERIFIED** (no owned game in this environment) |
| Maturity (VALIDATION-PLAN levels) | L0 rules register + provenance done; L1 exact calculators verified three ways; L2 harness running on an *unverified* third-party simulator; policies are baselines, not competitive; advisor uncalibrated |

## What exists (committed)

* **Rule register** `docs/game/MECHANICS-COVERAGE.md`, `docs/game/CATALOG-CROSSCHECK.md`, `docs/sources/SOURCE-REGISTRY.md`, `docs/IP-COMPLIANCE.md`, `docs/INFORMATION-FAIRNESS.md`, `docs/SIMULATOR-CANDIDATE-MATRIX.md`, `docs/RESEARCH-OPEN-QUESTIONS.md`, `docs/DECISIONS.md` (ADR-011..026), `docs/DEPLOY.md`, `docs/PATCH-COMPATIBILITY.md`.
* **Provenance guards**: `external/pins.json`, `scripts/external-fetch.sh`, `scripts/guard-third-party.sh` (+ self-test, pre-commit hook, CI).
* **`packages/`** (TypeScript, strict): `game-schema` (versioned builds, ids, zod schemas; refuses the beta build), `odds` (exact engines), `game-data` (facts-only card catalog of **577** cards: ids, names, class, rarity, cost, type, our own role tags; no card text; character starting facts; solo reward pools), `decision` (draft advisor v0 and the exact opening-hand report).
* **`apps/web`** (Next.js 16, React 19): landing, `/odds` (5 calculators with the exact fraction one click away), `/advisor` (character, deck, offered cards, recommendation with reasons, rare-pity tracker, exact opening-hand odds for your deck, impossible-offer check, local-first run with undo/redo and JSON export/import), `/methods` (every rule with its evidence, verification layers, simulator ledger with intervals and paired comparisons, known gaps, what is not evaluated), `/about` (rights, provenance, privacy, open decisions), 404 and error boundaries, API v1 (`health`, `capabilities`, `manifest`, `odds`, `recommend`, `catalog/cards`, `experiments`), security headers, favicon, robots, sitemap.
* **`sim/` research harness (original code)**: outcome taxonomy, fair allow-listed observation adapter, closure-aware clone + fair determinization, runner with step/stall/turn/wall limits, resumable parallel batches with checksummed manifests, trace replay verification, seed manifests with a sealed `test` partition, Wilson / paired bootstrap / exact McNemar, the paired-comparison artifact (`experiments/comparisons/`), a registry of known simulator gaps (`sim/slay2_sim/gaps.json`), policies `random_legal`, `rules_v1`, `search_v1`, `ppo_combat_v1` (rules_v1 with a trained combat network), CLI (`doctor`, `seeds`, `smoke`, `run`, `audit`, `compare`, `oracle`, `catalog`, `patchdiff`).
* **`sim/slay2_sim/rl` (original code, needs torch)**: single-combat environment built from real run states, pure fair encoding into a 134-action masked space, entity-token transformer, synchronous PPO with local-inference workers, paired evaluation of `rules` / network agents, and a behaviour-cloning warm start from the rules policy (`bc.py`; smoke-tested on a tiny library, no result yet). Checkpoints are never committed.
* **Red-team round 1** (`docs/ADVERSARIAL-AUDIT.md`): `apps/web/test/redteam.test.ts` (HTTP and import attacks from campaigns 1, 2, 3 and 10 incl. fast-check fuzzing), five findings fixed with regression tests (ADR-027, ADR-028), integer fast paths with rational reference oracles in `packages/odds/test/fastpath.test.ts`, a scripted visitor journey `apps/web/e2e/journey.spec.ts`, original production screenshots in `docs/screenshots/` (`pnpm --filter @slay2/web screenshots`).
* **Rights and deployment gates**: `pnpm licenses:check` (dependency licence allowlist with explained exceptions, ADR-030, CI step) and the Vercel contract (`vercel.json`, bounded `engines.node`, root `next`, `apps/web/test/deploy-config.test.ts`, ADR-029).
* **Site data is exported, not typed**: rules, batches, comparisons and gaps reach the website through `scripts/export-site-data.mjs`; a test fails when the generated JSON is stale, and the exporter refuses a comparison whose batches changed.

## Tests (commands actually run on this commit)

| Suite | Command | Result |
|---|---|---|
| TypeScript, all packages + web | `pnpm check` (typecheck, lint, prettier, tests, production build) | green: game-schema 6, game-data 13, odds 84, decision 19, web 124 = **246 tests** (adds the red-team suite, the integer fast-path oracles, the licence gate and the deployment contract) |
| End to end on the production server (`next start`), desktop + mobile, axe WCAG 2.2 AA | `pnpm --filter @slay2/web e2e` | **80 passed** (landing, odds, advisor journey incl. opening-hand odds, the scripted visitor journey, methods, about, 404, navigation, security headers with zero CSP violations) |
| Python research harness | `PYTHONPATH=sim python -m pytest sim/tests` | **72 passed, 1 strict xfail** (the documented A10 Double Boss gap), 48 s; the pure layout tests run in CI, the torch/simulator tests skip there |
| Continuous integration | `.github/workflows/ci.yml` (`web`, `e2e`, `sim` jobs) | all three jobs green on `e18d4b7`, including the Playwright job on a GitHub runner (72 tests in about 70 s) |

## Evidence (earlier measurements, still valid)

| What | Command / method | Result |
|---|---|---|
| Third-party sim test suite (HEAD `5d874e8`) | `pytest -n 4 tests` (cwd = checkout) | 4,862 passed in 278 s |
| Sim reward odds vs exact model | 200k rewards x {A0,A7} x {regular,elite} | 28/28 PASS (99.9 % Wilson) |
| Exact model vs published figures | offset table, after-rare chances, run averages, "?" table | 28/28 offset cells, 0 % / 16.95 %, 19.72 % / 30.91 %, 6/6 |
| Sim monster HP A0/A8 vs sts.wiki | 132 factories x 60 seeds | 97 / 100 rows exact; 3 gaps (G2) |
| Clone fidelity | 80 seeds x 30 steps, original vs clone | plain `deepcopy`: **38/80 diverge**; `clone_manager`: **0/80** |
| Determinism | same 40-game batch run twice | identical `content_sha256` |
| Hidden-information invariance | counterfactual tests with a power-checked leak canary | leaky search differs 8/8, fair policies 0 differences |
| Build state | Steam announcements 2026-10-25 | main v0.107.1, beta v0.111.0; nothing newer |

## Findings that change the plan (details: SIMULATOR-CANDIDATE-MATRIX.md)

1. No legally reusable full-run simulator exists; the usable engine is unlicensed and used **locally only** (ADR-011).
2. The gym wrapper turns exceptions and timeouts into losses -> SLAY2 drives `RunManager` directly (ADR-012).
3. **Events are never registered** by the simulator's own gym/training path (0 of 68); SLAY2 imports the package (ADR-016).
4. The simulator defaults to the **tutorial first-run profile**; SLAY2 labels `veteran` vs `first_run` cohorts (ADR-016).
5. The simulator's RNG is the pre-0.107.1 .NET family; seeds cannot reproduce live runs.
6. Plain `deepcopy` is not a faithful forward model; SLAY2's closure-aware clone is (ADR-017).
7. Known gaps ship with every result (ADR-024): G1 A10 Double Boss not entered, G2 A8 HP scaling for three monsters, G3 `is_sovereign_blade` crash, G4 RNG family, G5 no live parity, G6 a reward path that raises a NameError (2 of 2,000 `val` games), G7 one run with no legal action (1 of 2,000); errors are excluded from win rates, never counted as losses.
8. A hand-typed figure on `/methods` ("about 18x slower") disagreed with the data (19.7x). It is now generated from the committed comparison (ADR-022).
9. The first red-team round found four P1 holes and one P2 gap in the public API (an omitted pity counter silently meant "start of run"; `removal` and `gold` could not name or refuse a build; two inference requests could burn minutes of CPU) and fixed all of them with regression tests (ADR-027, ADR-028; `docs/ADVERSARIAL-AUDIT.md`). Campaigns 4-8 were not re-attacked in that round.
10. The Vercel project the owner created failed twice for two independent reasons: it built a documents-only `main`, then died on a Node 24 / `engines` mismatch under `engine-strict`. Both are fixed in the repository (ADR-029); the platform's own warning confirms `engines` overrides the project's Node setting.

## Blockers and owner decisions

* Live-game parity needs an owned STS2 copy on the owner's machine (Q1). Until then every simulator result is labelled unverified.
* Beta rules need a beta snapshot (Q2).
* License choice for SLAY2's own code and any monetization are owner decisions (Q14).
* Publishing: merge the pull request that carries the Vercel fix, then decide whether the site stays behind Vercel Authentication (the project's default) or becomes public (Deployment Protection). Details in `docs/DEPLOY.md`.

## Next steps

1. **Competent policy** (phase 03/04): warm-start the combat network by cloning `rules_v1`, fine-tune with PPO at a low learning rate, judge it by paired held-out evaluation (ADR-026), and only then run run-level batches of `ppo_combat_v1` vs `rules_v1` on `val`; also reconsider the potion cost in the single-combat reward (the from-scratch network barely uses potions). In parallel improve drafting / elite avoidance / potion use (the Act-1 bosses Vantom, Ceremonial Beast and Kin Priest account for 126 of 300 `rules_v1` deaths), repair the `search_v1` value function, and read the sealed `test` partition once for the final candidate. Negative results are reported.
2. **Calibrate the advisor** with simulator evidence (card-probing harness), keep the heuristic prior, publish the comparison on `/methods`.
3. **More decision services** (phase 05/06): Ancient boons, map pathfinder, shop/campfire/event helpers; each needs a facts-only catalog first.
4. **Patch compatibility**: done for the three archived versions (`docs/PATCH-COMPATIBILITY.md`); the beta build v0.111.0 has no snapshot, so it stays unsupported.
5. **Deployment**: verify the production URL after the Vercel fix is merged (smoke test in `docs/DEPLOY.md`), then measure Lighthouse / Web Vitals on it and fix the two known CLS items (landing and advisor, 0.09 each).
6. **Red team round 2**: campaigns 4 (counterfactual test on a trained network), 6 (replay-verified sample of completed games) and the Ancients / shop services once they exist.

Exact next command: `Read docs/STATUS.md; continue at "Next steps" 1 (policy research in sim/); keep committing small passing slices and run pnpm check before every commit.`
