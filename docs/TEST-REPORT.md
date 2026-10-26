# SLAY2 test report

**Commit under test:** `b4514aa42b17cdc3aa8bdef74a73446db0dd6baf` (the commit that adds this report changes documentation only) · **Run:** 2026-10-26 (UTC) · **Build:** Slay the Spire 2 main v0.107.1

**Machine:** Node v22.22.0, pnpm 10.28.0, Python 3.13.17; 4 cores (Intel Xeon at 2.10 GHz), 15 GB of memory, Linux 6.18; Chromium from `/opt/pw-browsers/chromium` driven by Playwright 1.64.1 (a desktop at 1440 × 900 and an emulated Pixel 7). The tracked tree was clean when the run started and no tracked file was edited while it ran. The third-party simulator checkout (git-ignored, pinned at `5d874e8`) was present, so the simulator tests ran instead of skipping themselves; the CI job has no simulator and skips them.

Every number below was read from the output of the command beside it (logs of this run), not typed from memory. Wall times are for this machine with nothing else running.

## Results

| # | Suite | Command | Result | Wall time |
|---|---|---|---|---|
| 1 | Provenance guard | `pnpm guard` | clean: no third-party file or text is tracked | 4 s |
| 2 | Licence gate | `pnpm licenses:check` | clean (production dependencies: MIT 47, Apache-2.0 9, ISC 5, OFL-1.1 3, LGPL-3.0-or-later 2 and CC-BY-4.0 1 as documented exceptions, BSD-3-Clause 1, 0BSD 1) | 4 s |
| 3 | TypeScript: typecheck, lint, format, unit tests, production build | `pnpm check` | **457 tests passed, none skipped** (game-schema 6, game-data 24, odds 100, decision 29, web 298); typecheck, ESLint and Prettier clean; Next.js 16.4.3 build succeeded with 12 static pages and 7 dynamic routes | 1:17 |
| 4 | Dependency audit | `pnpm audit --audit-level high` | "No known vulnerabilities found" | 1 s |
| 5 | Guard self-test | `bash scripts/test-guard.sh` | "all checks passed" | 0 s |
| 6 | Python research harness | `PYTHONPATH=sim python -m pytest sim/tests -q --durations=10` | **230 passed, 1 xfailed** (the strict expected failure is the documented Ascension 10 Double Boss gap, G1), none skipped | 6:08 (366.86 s in pytest) |
| 7 | Browser: production build, desktop + mobile, axe WCAG 2.2 AA | `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium PORT=3210 pnpm --filter @slay2/web e2e` | **317 passed, 0 failed, 133 skipped by design** | 6.0 min |

`pnpm check` is `pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build`; the `web` job of CI runs these plus the two gates above and the audit.

## TypeScript unit tests

| Package | Test files | Tests |
|---|---|---|
| `packages/game-schema` | 1 | 6 |
| `packages/game-data` | 3 | 24 |
| `packages/odds` | 8 | 100 |
| `packages/decision` | 3 | 29 |
| `apps/web` | 20 | 298 |
| **Total** | **35** | **457** |

The tests of `apps/web`, by file:

| File | Tests | What it pins |
|---|---|---|
| `api.test.ts` | 14 | the HTTP contract of the odds, recommend, capabilities, catalog and experiments routes |
| `bundle-weight.test.ts` | 2 | only the methods page, the experiments route and the page metadata may import the evidence and rules files (the browser is not sent 120 KB of evidence) |
| `cardvalues.test.ts` | 13 | the measured card values: a set per class with the facts needed to read it, one catalog card per measurement, intervals, helpful or harmful only when the whole interval is on one side of zero |
| `codex.test.ts` | 8 | the facts-only card browser: the catalog partitions into the codex classes, exact-name ranking, filters combine with AND |
| `content.test.ts` | 5 | the exported site data is current with its sources; one row per rule; no win rate without sample size and interval |
| `deploy-config.test.ts` | 5 | the Vercel contract (`vercel.json`, bounded `engines.node`, root `next`) |
| `error-boundary.test.tsx` | 4 | the route error boundary shows a reference and never the message or stack; retry; clearing only the saved run |
| `licenses.test.ts` | 5 | the dependency licence gate |
| `methods-data.test.ts` | 45 | the methods page's helpers: headline reports per class, variants, comparisons, refusals of stale or partial files |
| `neow-offer.test.tsx` | 17 | the opening-relic comparison panel: gate, per-class advice, the Necrobinder note |
| `neow.test.ts` | 25 | the opening-relic data: fitted before the test, mapped onto catalog options, best first, exactly what the exporter wrote |
| `opening.test.ts` | 27 | the start of a run: deck helpers and the effect of the opening Ancient's options on the deck and HP |
| `patch-watch.test.ts` | 8 | the weekly Steam announcement check, on the real feed of 2026-10-26 and on synthetic newer builds |
| `redteam.test.ts` | 74 | hostile input to the API and the run import, including fast-check fuzzing (campaigns 1, 2, 3, 10) |
| `route-api.test.ts` | 20 | Route Lab's API limits and cost-weighted rate limit |
| `route-lab.test.ts` | 9 | the route shorthand: letters, separators, errors, round trip, a bad link parameter is ignored |
| `run-store.test.tsx` | 3 | the saved run and its versioned key: the old key is read, only the new one is written, a cleared run stays cleared |
| `simulation-pick.test.ts` | 9 | the TypeScript port of the card-pick rule against 80 golden cases from the Python policy |
| `smoke.test.tsx` | 1 | the landing page renders the promise, calls to action and the honest coverage table |
| `start-hp-note.test.tsx` | 4 | the Necrobinder start-HP note |

The unit tests of the packages: `game-schema` (builds, ids, schemas, refusal of the beta), `game-data` (catalog, deck rules, the opening Ancient and Act 1 facts), `odds` (golden cases from the independent Python oracle, published tables, brute force, properties, integer fast paths against rational references, CPU budgets), `decision` (the draft advisor and the exact opening-hand report).

## Python tests

| File | Tests |
|---|---|
| `test_ancient_heal.py` | 3 |
| `test_cardcompare.py` | 5 |
| `test_cardvalue.py` | 9 |
| `test_catalog.py` | 4 |
| `test_classes.py` | 16 |
| `test_cli_paths.py` | 4 |
| `test_clone_and_fairness.py` | 5 |
| `test_compare.py` | 27 |
| `test_docs_tables.py` | 1 |
| `test_isolation.py` | 3 |
| `test_map_rules.py` | 7 |
| `test_neow_explore.py` | 8 |
| `test_neowvalue.py` | 9 |
| `test_oracle_odds.py` | 10 |
| `test_patchdiff.py` | 6 |
| `test_pickgolden.py` | 2 |
| `test_policy_fairness.py` | 18 |
| `test_policy_regression.py` | 4 |
| `test_process_state_determinism.py` | 2 |
| `test_rl_bc.py` | 4 |
| `test_rl_features.py` | 6 |
| `test_rl_layout.py` | 9 |
| `test_rl_summary.py` | 3 |
| `test_rules_explore.py` | 5 |
| `test_rules_v2.py` | 11 |
| `test_rules_v3.py` | 2 |
| `test_run_offset.py` | 3 |
| `test_sample_audit.py` | 4 |
| `test_search_v3.py` | 7 |
| `test_stats_manifest.py` | 17 |
| `test_terminal_semantics.py` | 4 |
| `test_tune.py` | 10 |
| `test_win_audit.py` | 3 |
| **Total collected** | **231** (230 passed + 1 xfailed) |

The slowest five: 47.46 s `test_neow_explore.py::test_the_measured_rule_takes_the_offered_relic_with_the_largest_value`; 44.79 s `test_neow_explore.py::test_exploration_takes_each_of_the_three_options_about_a_third_of_the_time`; 39.83 s `test_oracle_odds.py::test_golden_file_is_reproducible`; 18.11 s `test_neow_explore.py::test_the_choice_is_reproducible_per_seed_and_does_not_depend_on_the_policy_rng_stream`; 13.56 s `test_neow_explore.py::test_without_exploration_it_is_exactly_rules_v2_and_still_logs_the_offer`.

Tests worth naming: `test_policy_regression.py` replays committed batches seed by seed (a policy change that moves a published result fails here); `test_sample_audit.py` and `test_win_audit.py` re-derive games and wins; `test_process_state_determinism.py` fails without the warm-up of ADR-037; `test_policy_fairness.py` is the counterfactual hidden-state test (with a leak canary); `test_classes.py` is the guard that would have stopped the void study; `test_oracle_odds.py` regenerates the 739 golden cases; `test_docs_tables.py` keeps the tables of the cards, the audit and the status current.

## Browser tests

The suite starts `next start` on the production build and runs every spec in two projects. **317 passed**; the **133 skipped** are by design: the width sweeps (`phone-widths.spec.ts`, `rich-states.spec.ts`) set their own viewports and run in the mobile project only, so the desktop project skips them (91 in `[desktop] e2e/phone-widths.spec.ts`, 42 in `[desktop] e2e/rich-states.spec.ts`). Nothing is skipped for lack of data.

| Spec | Passed | What it covers |
|---|---|---|
| `e2e/phone-widths.spec.ts` | 91 | no sideways scroll and no cut-off text at 320, 360, 375, 390, 412, 640, 768, 1024 and 1280 px; every class selected; a returning visitor's header |
| `e2e/rich-states.spec.ts` | 42 | rich states (a full run, every ranked option) at 360, 768 and 1280 px, and enlarged text (150 % and 200 %) on phones |
| `e2e/odds.spec.ts` | 30 | the five calculators, exact fractions, impossible histories |
| `e2e/advisor.spec.ts` | 26 | the card advisor, its combobox (ARIA, keyboard), the simulated second opinion per class |
| `e2e/opening.spec.ts` | 26 | the start of a run: Act 1 version and boss, the Ancient's options and their effects, ascension, export and import, the opening-relic comparison |
| `e2e/routes.spec.ts` | 22 | Route Lab: typing, link persistence, hidden counters, Poverty, impossible histories, exact fractions |
| `e2e/stability.spec.ts` | 20 | layout shift per page (phone and desktop, with and without a slow network), the server-drawn advisor |
| `e2e/pages.spec.ts` | 18 | methods, about, 404, navigation, the measured-value panels |
| `e2e/landing.spec.ts` | 12 | the promise and the live demo, coverage table, axe, skip link, reduced motion |
| `e2e/codex.spec.ts` | 10 | the card codex: filters, the measured-value tile and sort, keyboard |
| `e2e/journey.spec.ts` | 6 | the scripted visitor journey from the landing page to a recommendation in at most 8 interactions |
| `e2e/security.spec.ts` | 6 | security headers, no-store API, zero CSP violations while pages hydrate |
| `e2e/no-javascript.spec.ts` | 4 | a visitor without JavaScript is told why the tools do not run |
| `e2e/privacy.spec.ts` | 2 | one origin, no cookies, no request that carries data |
| `e2e/share.spec.ts` | 2 | the link-preview image |
| **Total** | **317** | |

Accessibility is axe-core at WCAG 2.2 AA on every page in both projects, plus keyboard paths (skip link, the combobox, the codex filters), a reduced-motion test with a power check, enlarged-text and width sweeps; it is not a screen-reader session by a person.

## Continuous integration

`.github/workflows/ci.yml` on pull request #7 at `b4514aa`:

| Job | Result | Time |
|---|---|---|
| web (typecheck, lint, format, test, build) | success | 1 min 49 s |
| sim (python unit tests, provenance guard self-test) | success | 1 min 12 s |
| e2e (production build, Playwright desktop + mobile, axe WCAG 2.2 AA) | success | 4 min 10 s |

The `sim` job installs only `numpy` and `pytest`, so the simulator tests skip themselves there; the docs-tables test, the guard self-test, the golden-case reproducibility and the pure layout tests run. GitHub Actions is free for this public repository.

## Hosted site

Checked with `curl` against https://slay-part2.vercel.app at 2026-10-26 20:20 UTC (production serves `main`; pull request #7 is not merged): `/api/v1/health` reports commit `1c4542d10153c6a53864a8cfb5d613d6eb214434`, and `/`, `/advisor`, `/methods`, `/routes`, `/odds`, `/codex`, `/about`, `/sitemap.xml`, `/robots.txt`, `/api/v1/capabilities` and `/api/v1/manifest` answer 200. The full browser suite was last run against the hosted site at `453864d` (`docs/DEPLOY.md`); after the merge of pull request #7 the same checks are repeated. Web Vitals of the hosted site, measured with `pnpm --filter @slay2/web vitals` on 2026-10-26 (idle machine): layout shift 0 on all seven pages, largest contentful paint 0.53 to 0.95 s on a desktop and 1.4 to 2.2 s on a phone throttled to slow 4G with a 4x CPU slowdown, blocking time on that phone 243 to 535 ms ("needs improvement"). Lighthouse and Interaction to Next Paint were not measured.

## What these tests do not show

* **Nothing here tests the game.** The simulator tests prove the harness is deterministic, fair and audited, not that the simulator is the game; no live-game fixture exists (G5).
* **The browser is one engine.** Chromium only (a desktop viewport and an emulated Pixel 7); no Firefox, WebKit, real phone, or screen reader; iOS Safari's address bar and safe areas are not reproduced.
* **Statistics are not unit tests.** The registered held-out comparisons (ADR-031 to ADR-049) are experiments with their own manifests; `test_policy_regression.py` only guards that the committed batches still replay.
* **Not run here:** Lighthouse, Interaction to Next Paint, a load test of the hosted API beyond the limits that the tests assert, the heavy simulator audits (`audit rederive` over whole batches is an experiment, not a test), and the paused PPO run.
* **Expected failure kept visible:** one strict `xfail` (G1, the Ascension 10 second boss that the simulator does not enter); it turns red the day the simulator is fixed or the gap is closed.

## Reproduce on a fresh clone

```bash
git clone https://github.com/JaredVogler2/SLAY2 && cd SLAY2
node -v                                # 22.x (.node-version); pnpm 10.28.0 is pinned by package.json
pnpm install --frozen-lockfile
pnpm guard && pnpm licenses:check && pnpm check && pnpm audit --audit-level high
bash scripts/test-guard.sh
pip install numpy pytest && PYTHONPATH=sim python -m pytest sim/tests -q     # simulator tests skip without the pinned checkout
pnpm --filter @slay2/web exec playwright install chromium
pnpm --filter @slay2/web e2e                                                  # PW_CHROMIUM_PATH=/path/to/chromium if Playwright's own is absent
```

The simulator tests need the pinned third-party checkout (`scripts/external-fetch.sh`, `docs/IP-COMPLIANCE.md`) and the Python environment of `docs/REPRODUCIBILITY.md`.
