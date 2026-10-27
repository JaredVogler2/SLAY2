# SLAY2 test report

**Commit under test:** `03ec6ce` (the head of pull request #14, merged into `main` as `037cb8f`; the commit after it changes documents, the screenshots and the script pattern of one browser test, this report among them) · **Run:** 2026-10-27 (UTC), from a clean `git worktree` of that commit · **Build:** Slay the Spire 2 main v0.107.1

**Machine:** Node v22.22.0, pnpm 10.28.0, Python 3.13.17; 4 cores (Intel Xeon at 2.80 GHz), 15.7 GiB of memory, Linux 6.18; Chromium from `/opt/pw-browsers/chromium` driven by Playwright 1.64.1 (a desktop at 1440 × 900 and an emulated Pixel 7). The worktree was clean when the run started and nothing edited it while it ran (`pnpm install --frozen-lockfile` from the lockfile). The third-party simulator checkout (git-ignored, pinned at `5d874e8`) was present, so the simulator tests ran instead of skipping themselves; the CI job has no simulator and skips them. Nothing heavy used the machine while the commands ran (a few small formatting checks and edits of documents).

Every number below was read from the output of the command beside it (the logs of this run), not typed from memory. Wall times are for this machine.

## Results

| # | Suite | Command | Result | Wall time |
|---|---|---|---|---|
| 1 | Provenance guard | `pnpm guard` | clean: no third-party file or text is tracked | 10 s |
| 2 | Licence gate | `pnpm licenses:check` | clean (production dependencies within the allowed licences; the documented exceptions are the optional prebuilt libvips pulled in by Next's image optimiser, LGPL-3.0-or-later ×2, and browser-support data used at build time, CC-BY-4.0 ×1) | 4 s |
| 3 | TypeScript: typecheck, lint, format, unit tests, production build | `pnpm check` | **781 tests passed, none skipped** (game-schema 6, game-data 50, odds 100, decision 115, web 510 in 60 files); typecheck, ESLint and Prettier clean; Next.js 16.4.3 (Turbopack) build succeeded with 16 static pages | 2:48 |
| 4 | Script budget per page | `pnpm --filter @slay2/web bytes:check` | every page within its budget (ADR-056): `/about` and `/methods` 177.1 KB of gzipped script, `/` 184.0, `/odds` 265.0, `/routes` 257.6, `/codex` 265.3, `/advisor` 323.8 | 1 s |
| 5 | Dependency audit | `pnpm audit --audit-level high` | "No known vulnerabilities found" | 1 s |
| 6 | Guard self-test | `bash scripts/test-guard.sh` | "all checks passed" | 0 s |
| 7 | Generated files are current | `node scripts/export-site-data.mjs --check` and `python3 scripts/docs-tables.py --check` | both current | 4 s |
| 8 | Python research harness | `PYTHONPATH=sim python -m pytest sim/tests -q --durations=10` | **623 passed, 1 xfailed** (the strict expected failure is the documented Ascension 10 Double Boss gap, G1), none skipped | 9:04 (541.25 s in pytest) |
| 9 | Browser: production build, desktop + mobile, axe WCAG 2.2 AA | `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium PORT=3210 pnpm --filter @slay2/web e2e` (2 workers) | **335 passed, 0 failed, 133 skipped by design** | 8:05 (8.1 min in Playwright) |

`pnpm check` is `pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build`; the `web` job of CI runs these plus the gates above, the script budget and the audit.

## TypeScript unit tests

| Package | Test files | Tests |
|---|---|---|
| `packages/game-schema` | 1 | 6 |
| `packages/game-data` | 6 | 50 |
| `packages/odds` | 8 | 100 |
| `packages/decision` | 7 | 115 |
| `apps/web` | 38 | 510 |
| **Total** | **60** | **781** |

The tests of `apps/web`, by file:

| File | Tests | What it pins |
|---|---|---|
| `advisor-unreadable-run.test.tsx` | 2 | a saved run the advisor refuses (a card the catalog does not know) is explained with its reason where "Resume" leads, and the notice goes once a new run replaces it |
| `api.test.ts` | 14 | the HTTP contract of the odds, recommend, capabilities, catalog and experiments routes |
| `bundle-weight.test.ts` | 11 | what the browser is sent: only the methods page, the experiments route and the page metadata may import the evidence and rules files; the shell, the landing page, the About page and the methods page may not reach the catalog, the schema library or the run store (ADR-056); every workspace package declares `sideEffects: false` |
| `card-values-drift-keep.test.tsx` | 3 | the card-value panel's account of how values moved when the relics were kept (pilot change, wording) |
| `card-values-keep-export.test.ts` | 13 | the exporter reads the card-value test of ADR-053 only when it belongs together, and applies the registered adoption rule to the numbers |
| `card-values-keep.test.tsx` | 8 | the card values measured again with the relics kept, on `/methods`: registered, result, adopted classes |
| `cardvalues.test.ts` | 16 | the measured card values: a set per class with the facts needed to read it, one catalog card per measurement, intervals, helpful or harmful only when the whole interval is on one side of zero |
| `codex.test.ts` | 8 | the facts-only card browser: the catalog partitions into the codex classes, exact-name ranking, filters combine with AND |
| `content.test.ts` | 6 | the exported site data is current with its sources; one row per rule; no win rate without sample size and interval |
| `deploy-config.test.ts` | 5 | the Vercel contract (`vercel.json`, bounded `engines.node`, root `next`) |
| `error-boundary.test.tsx` | 5 | the route error boundary shows a reference and never the message or stack; retry; clearing only the saved run (the run store is fetched on demand, with a direct fallback) |
| `licenses.test.ts` | 5 | the dependency licence gate |
| `measured-value.test.tsx` | 3 | the Codex's measured value and what the runs behind it kept (gap G14) |
| `methods-data.test.ts` | 46 | the methods page's helpers: headline reports per class, variants, comparisons, refusals of stale or partial files |
| `neow-keep-export.test.ts` | 16 | the exporter reads the opening-relic repetition (fit, held-out test, secondary arm) only when it belongs together and as strictly as the other registered tests: exact p-values, sums, audits, the fit's hash in the decision log, one clean commit |
| `neow-offer.test.tsx` | 18 | the opening-relic comparison panel: gate, per-class advice, the Necrobinder note |
| `neow-repeat.test.tsx` | 11 | the pages on the opening-relic repetition: which study they follow, registered, fitted and tested whichever way, the wording the reading rule licenses |
| `neow.test.ts` | 25 | the opening-relic data: fitted before the test, mapped onto catalog options, best first, exactly what the exporter wrote |
| `opening.test.ts` | 27 | the start of a run: deck helpers and the effect of the opening Ancient's options on the deck and HP |
| `patch-watch.test.ts` | 8 | the weekly Steam announcement check, on the real feed of 2026-10-26 and on synthetic newer builds |
| `redteam.test.ts` | 74 | hostile input to the API and the run import, including fast-check fuzzing (campaigns 1, 2, 3, 10) |
| `relic-browser.test.tsx` | 3 | the relic list of the Codex |
| `relic-codex.test.ts` | 5 | relic catalog filtering and search |
| `relics-panel.test.tsx` | 9 | the advisor's relics panel: add, remove, keyboard, relics counted as suppliers |
| `route-api.test.ts` | 20 | Route Lab's API limits and cost-weighted rate limit |
| `route-lab.test.ts` | 9 | the route shorthand: letters, separators, errors, round trip, a bad link parameter is ignored |
| `run-state-relics.test.ts` | 6 | the relics of a saved run: ids, order, older saves |
| `run-store.test.tsx` | 7 | the saved run and its versioned key (the old key is read, only the new one is written, a cleared run stays cleared), a run started or cleared in another tab, and why a saved run is not shown |
| `run-summary.test.ts` | 9 | what the header and the landing page read of the saved run, against the full parser (ADR-056) |
| `simulation-opinion-keep.test.tsx` | 3 | the advisor's simulated opinion says what the runs behind the values kept, and how a set was licensed |
| `simulation-pick.test.ts` | 9 | the TypeScript port of the card-pick rule against 80 golden cases from the Python policy |
| `smoke.test.tsx` | 1 | the landing page renders the promise, calls to action and the honest coverage table |
| `start-hp-note.test.tsx` | 5 | the Necrobinder start-HP note |
| `synergy-b2-export.test.ts` | 40 | the exporter's reading of the synergy test, its development stage and its repetition with the relics kept |
| `synergy-keep-test-panel.test.tsx` | 18 | the synergy test repeated with the relics kept, on `/methods`, and the label of the advisor's synergy panel |
| `synergy-panel.test.tsx` | 15 | the advisor's synergy panel: what the index keeps, in words, and the label after the registered test |
| `synergy-study-panel.test.tsx` | 12 | the `/methods` synergy section (the exploratory reading and the development stage) |
| `synergy-test-panel.test.tsx` | 15 | the registered synergy test on `/methods` |

The unit tests of the packages: `game-schema` (builds, ids, schemas, refusal of the beta), `game-data` (catalog, relic catalog, the synergy and relic tables, deck rules, the opening Ancient and Act 1 facts), `odds` (golden cases from the independent Python oracle, published tables, brute force, properties, integer fast paths against rational references, CPU budgets), `decision` (the draft advisor, the synergy model and the exact opening-hand report).

## Python tests

| File | Tests |
|---|---|
| `test_advisor_port.py` | 282 |
| `test_advisor_v1.py` | 12 |
| `test_ancient_heal.py` | 3 |
| `test_cardcompare.py` | 5 |
| `test_cardvalue.py` | 9 |
| `test_catalog.py` | 10 |
| `test_classes.py` | 16 |
| `test_cli_paths.py` | 4 |
| `test_clone_and_fairness.py` | 5 |
| `test_compare.py` | 44 |
| `test_docs_tables.py` | 1 |
| `test_g14_batches.py` | 7 |
| `test_isolation.py` | 3 |
| `test_keep_relics.py` | 3 |
| `test_map_rules.py` | 7 |
| `test_neow_explore.py` | 8 |
| `test_neowcompare.py` | 6 |
| `test_neowvalue.py` | 9 |
| `test_oracle_odds.py` | 10 |
| `test_patchdiff.py` | 6 |
| `test_pickgolden.py` | 2 |
| `test_policy_fairness.py` | 19 |
| `test_policy_regression.py` | 4 |
| `test_process_state_determinism.py` | 2 |
| `test_relicpower.py` | 8 |
| `test_relicreading.py` | 6 |
| `test_rl_bc.py` | 4 |
| `test_rl_features.py` | 6 |
| `test_rl_layout.py` | 9 |
| `test_rl_summary.py` | 3 |
| `test_rules_explore.py` | 5 |
| `test_rules_v2.py` | 11 |
| `test_rules_v3.py` | 2 |
| `test_run_offset.py` | 3 |
| `test_sample_audit.py` | 6 |
| `test_search_v3.py` | 7 |
| `test_stats_manifest.py` | 17 |
| `test_synergydev.py` | 10 |
| `test_synergykeep.py` | 4 |
| `test_synergymechanics.py` | 12 |
| `test_synergyreport.py` | 9 |
| `test_synergystudy.py` | 8 |
| `test_terminal_semantics.py` | 4 |
| `test_tune.py` | 10 |
| `test_win_audit.py` | 3 |
| **Total collected** | **624** (623 passed + 1 xfailed) |

The slowest five: 60.10 s `test_neow_explore.py::test_exploration_takes_each_of_the_three_options_about_a_third_of_the_time`; 59.20 s `test_neow_explore.py::test_the_measured_rule_takes_the_offered_relic_with_the_largest_value`; 50.68 s `test_oracle_odds.py::test_golden_file_is_reproducible`; 24.81 s `test_neow_explore.py::test_the_choice_is_reproducible_per_seed_and_does_not_depend_on_the_policy_rng_stream`; 18.75 s `test_neow_explore.py::test_without_exploration_it_is_exactly_rules_v2_and_still_logs_the_offer`.

Tests worth naming: `test_policy_regression.py` replays committed batches seed by seed (a policy change that moves a published result fails here); `test_sample_audit.py` and `test_win_audit.py` re-derive games and wins; `test_process_state_determinism.py` fails without the warm-up of ADR-037; `test_policy_fairness.py` is the counterfactual hidden-state test (with a leak canary); `test_classes.py` is the guard that would have stopped the void study; `test_oracle_odds.py` regenerates the 739 golden cases; `test_advisor_port.py` holds the golden cases that tie the TypeScript advisor to its Python port number for number; `test_g14_batches.py` checks that the registry's quotation of the relic-gap measurement is what the committed batches give; `test_neowcompare.py` and `test_keep_relics.py` pin the statistics and the harness variant of ADR-052 and ADR-055; `test_docs_tables.py` keeps the tables of the cards, the audit and the status current.

## Browser tests

The suite starts `next start` on the production build and runs every spec in two projects. **335 passed**; the **133 skipped** are by design: the width sweeps (`phone-widths.spec.ts`, `rich-states.spec.ts`) set their own viewports and run in the mobile project only, so the desktop project skips them (91 in `[desktop] e2e/phone-widths.spec.ts`, 42 in `[desktop] e2e/rich-states.spec.ts`). Nothing is skipped for lack of data.

| Spec | Passed | What it covers |
|---|---|---|
| `e2e/phone-widths.spec.ts` | 91 | no sideways scroll and no cut-off text at 320, 360, 375, 390, 412, 640, 768, 1024 and 1280 px; every class selected; a returning visitor's header |
| `e2e/rich-states.spec.ts` | 42 | rich states (a full run, every ranked option) at 360, 768 and 1280 px, and enlarged text (150 % and 200 %) on phones |
| `e2e/advisor.spec.ts` | 38 | the card advisor, its combobox (ARIA, keyboard), the relics panel (add, remove, the keyboard stays in the list), the synergy reading, and the simulated second opinion per class with the basis that licenses it (own test or the pooled test) |
| `e2e/odds.spec.ts` | 30 | the five calculators, exact fractions, impossible histories |
| `e2e/opening.spec.ts` | 26 | the start of a run: Act 1 version and boss, the Ancient's options and their effects, ascension, export and import, the opening-relic comparison |
| `e2e/routes.spec.ts` | 22 | Route Lab: typing, link persistence, hidden counters, Poverty, impossible histories, exact fractions |
| `e2e/pages.spec.ts` | 20 | methods, about, 404, navigation, the measured-value panels and the registered blocks of the studies |
| `e2e/stability.spec.ts` | 20 | layout shift per page (phone and desktop, with and without a slow network), the server-drawn advisor |
| `e2e/codex.spec.ts` | 14 | the card and relic codex: filters, the measured-value tile and sort, keyboard |
| `e2e/landing.spec.ts` | 12 | the promise and the live demo, coverage table, axe, skip link, reduced motion |
| `e2e/journey.spec.ts` | 6 | the scripted visitor journey from the landing page to a recommendation in at most 8 interactions |
| `e2e/security.spec.ts` | 6 | security headers, no-store API, zero CSP violations while pages hydrate |
| `e2e/no-javascript.spec.ts` | 4 | a visitor without JavaScript is told why the tools do not run |
| `e2e/privacy.spec.ts` | 2 | one origin, no cookies, no request that carries data |
| `e2e/share.spec.ts` | 2 | the link-preview image |
| **Total** | **335** | |

Accessibility is axe-core at WCAG 2.2 AA on every page in both projects, plus keyboard paths (skip link, the combobox, the codex filters), a reduced-motion test with a power check, enlarged-text and width sweeps; it is not a screen-reader session by a person.

## Continuous integration

`.github/workflows/ci.yml` on pull request #14 at `03ec6ce`:

| Job | Result | Time |
|---|---|---|
| web (typecheck, lint, format, test, build, script budget) | success | 2 min 4 s |
| sim (python unit tests, provenance guard self-test) | success | 1 min 12 s |
| e2e (production build, Playwright desktop + mobile, axe WCAG 2.2 AA) | success | 5 min 58 s |

The `sim` job installs only `numpy` and `pytest`, so the simulator tests skip themselves there; the docs-tables test, the guard self-test, the golden-case reproducibility and the pure layout tests run. GitHub Actions is free for this public repository.

## Hosted site

Checked against https://slay-part2.vercel.app at 2026-10-27 17:48 UTC (production serves `main` at `037cb8f`, the merge of pull request #14): `/api/v1/health` reports commit `037cb8fc0e7b6b3cd9e16d5fe7e59ff88ae06f12`, and `/`, `/advisor`, `/codex`, `/methods`, `/about`, `/routes` and `/odds` answer 200. **The whole browser suite was run against the hosted site** (`BASE_URL=https://slay-part2.vercel.app`, 3 workers, 6.8 min): 333 passed and 2 failed, 133 skipped by design. The two failures were one test, `stability.spec.ts` "the advisor is drawn before the page is interactive", in both projects: it blocks the scripts to see the server-drawn page and matched only `/_next/static/chunks/…`, while the hosted build serves its chunks under `/_next/static/immutable/chunks/…`, so nothing was blocked and the page hydrated. The pattern is now `**/_next/static/**/*.js`; the test passes against the hosted site and against the local build, which makes **335 of 335** (a fault of the test, not of the site).

## What these tests do not show

* **Nothing here tests the game.** The simulator tests prove the harness is deterministic, fair and audited, not that the simulator is the game; no live-game fixture exists (G5).
* **The browser is one engine.** Chromium only (a desktop viewport and an emulated Pixel 7); no Firefox, WebKit, real phone, or screen reader; iOS Safari's address bar and safe areas are not reproduced.
* **Statistics are not unit tests.** The registered held-out comparisons (ADR-031 to ADR-055) are experiments with their own manifests; `test_policy_regression.py` only guards that the committed batches still replay.
* **Not run here:** Lighthouse, Interaction to Next Paint, a load test of the hosted API beyond the limits that the tests assert, the heavy simulator audits (`audit rederive` over whole batches is an experiment, not a test), and the retired PPO run (ADR-057).
* **Expected failure kept visible:** one strict `xfail` (G1, the Ascension 10 second boss that the simulator does not enter); it turns red the day the simulator is fixed or the gap is closed.

## Reproduce on a fresh clone

```bash
git clone https://github.com/JaredVogler2/SLAY2 && cd SLAY2
node -v                                # 22.x (.node-version); pnpm 10.28.0 is pinned by package.json
pnpm install --frozen-lockfile
pnpm guard && pnpm licenses:check && pnpm check && pnpm --filter @slay2/web bytes:check && pnpm audit --audit-level high
bash scripts/test-guard.sh
pip install numpy pytest && PYTHONPATH=sim python -m pytest sim/tests -q     # simulator tests skip without the pinned checkout
pnpm --filter @slay2/web exec playwright install chromium
pnpm --filter @slay2/web e2e                                                  # PW_CHROMIUM_PATH=/path/to/chromium if Playwright's own is absent
```

The simulator tests need the pinned third-party checkout (`scripts/external-fetch.sh`, `docs/IP-COMPLIANCE.md`) and the Python environment of `docs/REPRODUCIBILITY.md`.
