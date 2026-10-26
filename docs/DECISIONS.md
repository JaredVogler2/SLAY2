# SLAY2 implementation decisions (living log)

This file is initialized during prompt-authoring only. Claude Code must add a dated ADR entry with context, chosen approach, alternatives, testing evidence, patch/build and rollback conditions whenever making a consequential implementation or model-policy decision. Existing initial architecture choices and their rationales are in [ARCHITECTURE-DECISIONS.md](ARCHITECTURE-DECISIONS.md).

## 2026-10-25 — Initial scope

Original new **Slay the Spire 2**, solo-first, 5-character / 3-act / Ascension A0–A10 versioned scope as of current research, independently researched from STS1; co-op separately validated; premium manual-first Vercel web frontend; offline simulation/training; source license and patch parity gated. The application, simulation and models are not implemented yet. Changes to mechanics or current features must be reverified against newest official release.

## 2026-10-25 — ADR-011: use rights-restricted third-party references locally, never vendored

**Context.** The owner's `/goal` directed SLAY2 to use `zhiyue/sts2-rl-agent` (unlicensed; 3,426 decompiled Mega Crit C# files for v0.107.1; Python simulator; RL scripts) and `nkhoit/spire-archive` (unlicensed; data extracted from PCK + decompiled C#). Earlier project rules forbade vendoring extracted game code. See [IP-COMPLIANCE.md](IP-COMPLIANCE.md) §3 for the full text.

**Decision.** Use both as **pinned (`external/pins.json`), local, read-only, git-ignored inputs**: (1) read the decompiled sources to *verify rules* and cite facts by file path (evidence class E1); (2) execute the simulator locally for research, labelling its output *simulator, live-game parity UNVERIFIED*; (3) read spire-archive data to cross-check ids/rarity/cost/type and patch history. Nothing from either repository is copied into SLAY2; `scripts/guard-third-party.sh` (pre-commit + CI) enforces this.

**Alternatives rejected.** (a) Vendoring the simulator/decompiled code - infringes Mega Crit's copyright and the authors' default rights, and would put it on a public repo. (b) Ignoring both - loses the only available source-level ground truth for v0.107.1 and the only full-run environment. (c) Waiting for upstream licenses - indefinite.

**Evidence.** Rules verified against E1 now match two independent secondary sources (sts.wiki, Almanauts) on every value checked, and resolved the A7 base-rate contradiction (1.49 %). Simulator reward generation passes a 28-check differential against our exact model.

**Rollback.** If a rights holder objects: delete E1 citations, re-support rules with E3/E4/live-game evidence, drop any derived catalog; the guard ensures no third-party files are in history.

## 2026-10-25 — ADR-012: run-outcome taxonomy and "never trust the gym wrapper"

**Context.** `STS2RunEnv.step()` swallows every exception and calls `lose_run()`, and records timeouts as losses. Our first smoke test produced 10/10 "deaths" that were actually `FileNotFoundError`s (cwd-relative data path).

**Decision.** Evidence-grade runs drive `RunManager` directly and classify every episode as exactly one of `win | death | timeout | simulator_error | invalid_action | aborted`. Only `win`+`death` are *completed games*; the others are reported separately and never silently dropped or counted as losses. The harness runs with cwd = the simulator checkout, starts runs with `start_with_neow=True`, and treats any exception as `simulator_error`.

**Consequence.** Win rate = wins / (wins + deaths), with the denominator and all other classes printed beside it; Wilson intervals on the binomial.

## 2026-10-25 — ADR-013: exact rational arithmetic for odds

**Decision.** `packages/odds` computes with BigInt rationals (no floating point) so that distributions sum to exactly 1, golden values are exact fractions, and brute-force enumeration can be compared with `===`. Floats appear only at the display boundary. Game floats are float32 thresholds; the difference (<= 1e-7) is documented and tested as a tolerance in the simulator audits, not in the engine.

## 2026-10-25 — ADR-014: rule sets are pinned per build and the engine refuses unverified builds

**Decision.** Every calculator takes a `RuleSet` (`sts2-main-0.107.1`). Requesting beta v0.111.0 (or any unknown build) returns `status: "unsupported_build"` with the reason; there is no silent fall-back. Known main/beta differences (White Beast Statue/potion counter; card rarities) are recorded in `docs/game/MECHANICS-COVERAGE.md` §10.

## 2026-10-25 — ADR-015: Python research harness lives in `sim/`, separate from the web app

**Decision.** Simulation, policies, audits and training are Python under `sim/` (original code), importing the simulator from the ignored checkout via `SLAY2_EXTERNAL_ROOT`. The Next.js app never imports or shells out to it (Vercel is not a compute platform for simulation). Exact-odds fixtures flow one way: TS engine -> JSON golden files -> Python audits.

## 2026-10-25 — ADR-016: explicit profile cohorts and mandatory event registration

**Context.** Measurement showed (a) every simulator run defaults to the profile's *first-ever run* (scripted early packs/potions/"?" rooms) and (b) the 68 events, including Neow and the Ancients, are not registered unless `sts2_env.events` is imported - which the gym env and training scripts never do.

**Decision.** `external.activate()` imports `sts2_env.events`. Every batch records a `profile` in its config: `veteran` (default; `number_of_runs=10`, `epoch_unlock_count=20`) or `first_run`. Cohorts are never pooled in a headline metric. The profile is applied by temporarily swapping `RunManager`'s `RunState` for a subclass so the unlock state is set before the opening Ancient event (constructor flow otherwise unchanged).

**Consequence.** Batches produced before this change (which lacked events) were discarded and regenerated; none are cited.

## 2026-10-25 — ADR-017: closure-aware cloning is the only permitted forward model

**Context.** Plain `copy.deepcopy` of a run diverges from the live run at the enemy turn (38/80 sequences) because function closures are copied by reference.

**Decision.** Search and any lookahead use `slay2_sim.clone.clone_manager` (closure cells rebound through the deepcopy memo) followed by `fair_determinize` (canonical-sort-then-shuffle of the draw pile and reseeding of every reachable RNG). Both properties are tested: clone fidelity (0 divergences) and counterfactual invariance (equal observations/determinized state for different hidden states).

**Alternatives rejected.** Replay-from-scratch per node (O(history) per node); hand-written enemy-turn models (re-implements the simulator and its bugs).

## 2026-10-25 — ADR-018: toolchain pins (exact versions, verified against the npm registry on 2026-10-25)

**Decision.** Node 22 (`.node-version`, `engines >=22.12`), pnpm 10.28.0 (`packageManager`), Next.js **16.4.3** (App Router, Turbopack), React 19.3.1, **TypeScript 6.0.3**, ESLint 10.13.0 (flat config) with typescript-eslint 8.72.0 and eslint-config-next 16.4.3, Vitest 5.0.5, fast-check 4.10.2, Zod 4.6.7, Tailwind 4.3.3, Prettier 3.9.10, Playwright 1.64.1 + axe-core/playwright 4.14.0. Every version is pinned exactly; `pnpm-lock.yaml` is committed and CI installs with `--frozen-lockfile`.

**Why not the newest.** TypeScript 7.0.2 is published, but typescript-eslint 8.72.0 declares `typescript >=4.8.4 <6.1.0`, so type-aware linting would be unsupported; revisit when typescript-eslint supports 7. `jsdom` is pinned to 29.1.1 because 30.x requires Node >=22.22.2 and the build container has 22.22.0. `@types/node` is pinned to the 22 line to match the runtime.

**Known wrinkles (checked, not hidden).** (1) TypeScript 6 defaults `types` to `[]`; each package opts in (`"types": ["node"]`). (2) `eslint-config-next` pulls three plugins whose declared peer range stops at ESLint 9; ESLint 10.13 runs them cleanly on this code base (`pnpm lint` green) - if a rule crashes in future, downgrade ESLint to 9.x rather than disabling lint. (3) Licenses (2026-10-25, `pnpm licenses list`): 357 MIT, 26 Apache-2.0, 14 ISC, 9 BSD-2, 3 BSD-3 and a few others; non-permissive entries are MPL-2.0 (axe-core, lightningcss: dev/build only), CC-BY-4.0 (`caniuse-lite` data, build only), **LGPL-3.0-or-later** (`@img/sharp-libvips-*`, optional prebuilt binaries pulled in by Next's `sharp`; SLAY2 does not use `next/image` optimisation, the libraries are dynamically linked and unmodified), OFL-1.1 (Fontsource fonts: Inter, Cinzel, JetBrains Mono). `pnpm audit`: no known vulnerabilities.

**Fonts.** Fontsource (OFL-1.1) packages are bundled into the build; no request to Google Fonts is made by visitors.


## 2026-10-26 — ADR-019: facts-only card catalog (`packages/game-data`)

**Context.** The advisor, reward pools and card picker need card identity, class, rarity, cost and type. The only complete source for v0.107.1 is the pinned local decompilation (E1) cross-checked against spire-archive's extracted data, both rights-restricted (ADR-011).

**Decision.** The catalog is derived by `python -m slay2_sim catalog`; for each card it keeps **only** the canonical id, display name, class, rarity, energy cost, card type, whether it is reward-eligible, and SLAY2's own role tags written by us. **No card text, flavour text or descriptions.** The output (577 cards, sha256 `6717e3d5d311…`) is committed with provenance flags; `docs/game/CATALOG-CROSSCHECK.md` records the cross-check, including the disagreements. Solo reward pools are 20/35/25 cards per class by rarity (Q3 closed); epoch-gated cards reduce the pool for new profiles and the API says so.

**Alternatives rejected.** Mirroring a third-party card database (rights, ADR-011); hand-typing cards (error-prone); fetching a public API at request time (availability, terms, and the site must work offline).

**Rollback.** Delete the catalog and fall back to ids typed by the user; the odds engines do not depend on it (they take counts).

## 2026-10-26 — ADR-020: the card advisor is a labelled heuristic (v0), never a probability

**Context.** No fair-information policy has won a simulated game yet (0 wins in 2,499 completed veteran-profile games), so there is no outcome evidence to calibrate card values against.

**Decision.** `evaluateDraft()` ranks the offered cards and skip by the change in a **unit-less deck-quality index** (average card quality with dilution, act-dependent role coverage with diminishing returns, energy curve, deck size, strength × multi-hit synergy). The output contains legal actions only, a reason list per option, the **stability** of the top choice under ±40 % jitter of its own weights, warnings, assumptions and an explicit not-modelled list. It refuses the beta build, unknown ids and duplicates. The UI and API call it "heuristic v0, not calibrated"; `/methods` lists "advisor win delta" under *not yet evaluated*. The catalog prior is rarity-banded with a capped adjustment (an unbounded version scored one rare 95).

**Alternatives rejected.** Presenting a win-probability delta (no evidence); copying a tier list (rights and staleness); an LLM judgement (not reproducible, not testable).

**Evidence.** 13 decision tests (contract, legality, determinism, behaviour, validation, 120 random requests); e2e shows a curse is never recommended over skipping.

**Rollback / upgrade path.** Replace the index with a simulator-calibrated value (card-probing harness, phase 05) only after a paired comparison on held-out seeds shows an effect; keep v0 as the champion until then.

## 2026-10-26 — ADR-021: web state is local-first

**Decision.** The player's run lives in `localStorage` (key `slay2.run.v1`) as `RunState` v1, validated by a strict zod schema on every load and import; imports are capped at 256 KB; undo/redo is session-only (50 steps); export is plain JSON. There are no accounts, cookies, analytics or server persistence, and the pages issue no client `fetch` (checked by search). The HTTP API is stateless and exists for tools, tests and a future companion. Blocked storage degrades to in-memory state with a visible notice.

**Alternatives rejected.** Server-side accounts and a database (privacy, abuse, and legal surface for a fan site); IndexedDB (no need at this size); sync across devices (a later, opt-in feature that would need its own threat model).

**Consequence.** Support requests cannot be debugged from server data; `/about` says so, and export/import is the supported way to move a run.

## 2026-10-26 — ADR-022: nothing measured is typed by hand on the website

**Context.** A review found that `/methods` stated "about 18× slower" and "16.0 vs 18.3 mean floor on the same seeds" in prose. The data say **19.7×**, and the 18.3 was the mean over 300 games while the search batch covered the first 200 of the same seeds (**18.41 vs 16.04** on the 200 shared seeds).

**Decision.** (1) Rules, batches, comparisons and gaps reach the site only through `scripts/export-site-data.mjs`, and a test fails when the generated JSON is stale. (2) A paired comparison is a first-class committed artifact (`experiments/comparisons/*.json`, written by `slay2_sim compare --out`) with the content hashes of both batches; the exporter **throws** if either batch changed afterwards (tested by tampering with a copy). (3) Sentences about results are generated from those artifacts (`comparisonSentence`), including the verdict rule: a side is "higher" only if the whole 95 % bootstrap interval excludes zero. (4) Headline claims such as "no policy has won" are computed (`totals()`), so they flip automatically when a win appears.

**Alternatives rejected.** Reviewing prose by eye (this is how the error got in); a CMS (no editorial need).

## 2026-10-26 — ADR-023: interim Content Security Policy

**Context.** Pages are statically generated. Next.js applies nonces only during dynamic rendering, so a nonce-based `script-src` would turn every page into a per-request render and give up the CDN cache. The inlined hydration payload needs either a nonce or `'unsafe-inline'`.

**Decision.** Ship now: `default-src 'self'`, `script-src 'self' 'unsafe-inline'` (plus `'unsafe-eval'` and websockets in `next dev` only), `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `font-src 'self'` (fonts are bundled), `connect-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`; plus `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, a restrictive `Permissions-Policy` and `Strict-Transport-Security: max-age=31536000` (no `includeSubDomains`/`preload`; that is the domain owner's commitment). The interim policy is acceptable **because** the site renders no user-supplied HTML: there is no `innerHTML` sink, imports pass a strict schema, and an e2e test loads every page under the policy and fails on any violation.

**Tighten when:** any feature renders untrusted markup, a companion/bridge page is added, or monetization is considered. Then move HTML routes to dynamic rendering with a proxy-issued nonce (`strict-dynamic`) and drop `'unsafe-inline'` for scripts.

## 2026-10-26 — ADR-024: known simulator gaps are data that travel with every result

**Context.** The third-party simulator never enters the A10 Double Boss, scales three monsters' HP incorrectly at A8, crashes on `is_sovereign_blade(None)`, uses an older RNG family, and has no live-game parity. A win rate that omits these would be read as a statement about the real game.

**Decision.** `sim/slay2_sim/gaps.json` is the single source of truth (read by the harness and by the website exporter). Every batch manifest records the gaps that apply to its configuration (ascension thresholds); `/methods` prints them beside the results; the A10 Double Boss gap has a **strict xfail** test, so fixing the simulator (or our harness) turns the test red until the gap record is removed deliberately.

**Consequence.** Results from ascension 10 from this simulator cannot be described as Double Boss results.

## 2026-10-26 — ADR-025: patch diffs record ids and field names, never content

**Context.** Early Access patches change numbers weekly, and the only versioned data we may touch is rights-restricted (ADR-011). We still need to know *what to re-verify* after a patch.

**Decision.** `python -m slay2_sim patchdiff <old> <new>` compares the pinned spire-archive snapshots (0.99.1, 0.103.2, 0.107.1) and writes ids added/removed, categorical facts that changed (class, rarity, cost, type, target, tier) with old/new values, and only the **names** of other fields that changed (`text`, `vars`, `upgrade`, ...). Names, descriptions and numbers are never copied. A field the archive populated later is reported as `extraction_only`; a field present in one snapshot only is a schema difference; neither counts as a game change. `--coverage` lists v0.107.1 ids missing from the pinned simulator (after normalising the `_CARD`/`_STATUS` suffix the simulator adds).

**Evidence.** 0.103.2 -> 0.107.1: cards +2/-1 with five categorical changes that the committed catalog already carries; relics +3; potions unchanged. Simulator id coverage of v0.107.1: 577/577 cards, 296/296 relics (id coverage only; parity stays UNVERIFIED). Tests cover the semantics with synthetic snapshots, prove no content leaks, and check invariants of the committed diffs.

**Alternatives rejected.** Committing before/after values (content); trusting the archive's own change log text (content and unverifiable); diffing the simulator instead (it would hide the simulator's own errors).

**Rollback.** Delete `docs/patches/`; nothing else depends on the files at run time.

## 2026-10-26 — ADR-026: combat policy is learned from real run states with a fair encoding, and judged by paired evaluation

**Context.** Diagnostics over 160 simulated runs show the rules policy loses ~58 of ~74 HP to the Act 1 boss and dies there 48% of the time, and dies in 20% of Act 2 ordinary fights. Combat quality is the first limit on any simulated win and on any simulation-based card evidence. Search over the simulator is too slow (a clone costs ~2.5 ms), so a learned policy is the practical lever.

**Decision.**
1. *Environment* (`sim/slay2_sim/rl/env.py`): a single-combat environment whose start states are snapshots of real runs taken **before the entering action**; `reset` clones one, re-randomises every hidden stream, and enters the fight. Decks, relics, potions and HP are therefore realistic, and each reset has a new opening hand. Reward per decision is `-0.5 * HP lost / max HP`, `-0.1` per potion, `+1` win, `-1` death or step cap.
2. *Fairness*: the network input is `features.encode(observation)`, a pure function of the allow-listed observation (draw pile as a multiset, no RNG, no future). A test perturbs the draw order and every RNG stream and requires bit-identical encodings.
3. *Model*: a small transformer over entity tokens (player, hand cards, enemies, piles, relics, potions, pending choices) with slot-pointer action heads, so one set of weights serves every hand position and target. Illegal actions are masked.
4. *Training*: synchronous PPO (GAE 0.95, clip 0.2) with local-inference worker processes; training libraries come from the `train` seed partition only.
5. *Judging*: paired greedy evaluation of `rules` and the network on identical (held-out `val` snapshot, hidden-stream seed) pairs, McNemar for wins and a paired bootstrap for HP lost; then run-level paired batches (`ppo_combat_v1` vs `rules_v1`) on `val`; the sealed `test` partition is read once, for the final candidate.
6. *Artifacts*: checkpoints are never committed (weights derived from a third-party simulator are audited separately); a finished run is summarised by config, metrics and the checkpoint SHA-256.

**Alternatives rejected.** Training from scratch on the starter deck only (not the distribution the policy will meet); a flat MLP over concatenated slots (no weight sharing across slots, slow to learn); end-to-end full-run RL first (sparse reward, the combat part dominates the variance); the simulator's own gym wrapper (turns exceptions and timeouts into losses, ADR-012).

**What would count as success.** A paired improvement on held-out combats with the confidence interval excluding zero **and** a run-level improvement in mean floor on `val`. Anything less is reported as a negative result.

## 2026-10-26 — ADR-027: the odds API does not guess what the caller did not state

**Context.** The first red-team round (docs/ADVERSARIAL-AUDIT.md, RT-3-01 and RT-2-04) found two places where an omission silently became a confident number. A card-reward request with neither `counter` nor `history` was answered as if no reward had ever been offered (the start-of-run state); potion and "?" `history` were optional with the same default. `removal` and `gold` had no `build` field, so the unverified beta could not even be named, let alone refused, and the answer did not say which patch it was for.

**Decision.**
1. Calculators that depend on hidden state require the caller to say what they know: `counter`, or `history` where `[]` means "nothing has happened yet". Omission is a `400` that explains the choice. The potion and "?" `history` are required.
2. Every calculator that depends on the patch requires `build` and refuses an unverified one; `removal` and `gold` joined the others, and every answer echoes `build`.
3. Every answer states its `evidence` (`kind`: `history` or `counter`, and the number of observations), so a client can show how much a number rests on.

**Alternatives rejected.** Defaulting to the start of the run with a warning field (a client that ignores warnings shows a confident wrong number); defaulting `build` to the supported main build (hides that the caller is thinking of another patch).

**Evidence.** `apps/web/test/redteam.test.ts` RT-3-01..04 and RT-2-04 failed on the previous code and pass now; `apps/web/test/api.test.ts` was updated to the stricter contract.

**Rollback.** Revert the schema changes in `apps/web/src/lib/odds-api.ts`. Saved runs are unaffected (a run file stores its history, `[]` included).

## 2026-10-26 — ADR-028: exact arithmetic stays, untrusted input gets integer fast paths and caps taken from the game

**Context.** RT-10-07 and RT-10-13. Reward-rarity inference at Ascension 7 with a 100-pack unknown history took 179 s on the development machine because every posterior update normalised a `Rational`; a "?" history of 60 entries took about 17 s. Both histories come from strangers (API body or imported run file), so one request could occupy a serverless function for minutes.

**Decision.** `Rational` stays the specification and the public result type. The three inference hot paths are evaluated over integers instead: reward-pack tables are compiled once into integer weights over a common denominator (scale 10,000; the compiler asserts the weights are integral), posterior, forecast and position marginals are plain `bigint` sums normalised once at the end; "?" masses are integer percents (every probability there is a whole number of percent). Untrusted sizes are bounded by facts of the game: an act has fewer than 20 "?" rooms (`MAX_UNKNOWN_ROOMS_PER_ACT`, enforced in the engine, the API schema, the run-file schema and the UI), 100 pack observations, 200 potion observations.

**Evidence.** The previous rational implementations live on inside `packages/odds/test/fastpath.test.ts` as reference oracles and must agree with the fast paths on random inputs; the same file holds CPU budgets (a 20-entry "?" history in under 3 s, the A7 worst case in under 5 s, on a loaded machine). Measured on the development machine: A7 with 100 unknown packs 179 s to 0.44 s. `redteam.test.ts` RT-10-07 sends the worst legal request of every calculator through the route handlers and demands an answer in under 1.5 s each.

**Alternatives rejected.** Floating point (gives up the exactness the product is built on); memoisation only (the first request is the attack); a longer function timeout (pays for the attack instead of removing it); rate limiting alone (the expensive request is a single request).

**Rollback.** The reference implementations are still in the tests; swapping back is a one-file change that reopens RT-10-07.

## 2026-10-26 — ADR-029: the repository carries its own Vercel contract

**Context.** The owner imported the repository into a Vercel project with default settings (Root Directory `./`, no framework preset, Node 24.x). The first production build published nothing (it ran while `main` held documents only) and the second failed at install with `ERR_PNPM_UNSUPPORTED_ENGINE`: `apps/web` required Node 22.x, the project ran 24.x, and `.npmrc` sets `engine-strict=true`. Both left the production URL on a 404.

**Decision.** Make the default import work without dashboard settings, and keep the textbook layout working too (docs/DEPLOY.md): `engines.node` is the bounded `^22.12.0` in the root and in `apps/web` (Vercel maps it to the latest Node 22 and lets it override the project setting); `vercel.json` at the root sets framework `nextjs`, a frozen-lockfile install, the root `build` script and output `apps/web/.next`; `next` is also a root devDependency at the app's exact version because the Next.js builder resolves `next/package.json` from the project directory; `apps/web/vercel.json` selects the framework for the Root Directory `apps/web` layout. `apps/web/test/deploy-config.test.ts` pins all of it.

**Alternatives rejected.** Dashboard-only settings (not reproducible, and exactly what failed); the legacy `builds` key (disables project settings); `public-hoist-pattern[]=next` in `.npmrc` (an invisible pnpm detail instead of an explicit dependency); an open `>=` engines range (jumps major versions on its own and was the other half of the failure); supporting Node 24 now (not tested in CI, so not claimed).

**Evidence.** A clean checkout of the commit: `pnpm install --frozen-lockfile` and `pnpm run build` exit 0 and write the manifests the builder reads. A real Vercel preview build of the same commit: log lines "Node.js Version defined in your Project Settings ("24.x") will not apply, Node.js Version "22.x" will be used instead", "Detected Next.js version: 16.4.3", all 13 routes built, "Build Completed [33s]", deployment READY; `/`, `/api/v1/health`, `/api/v1/capabilities` and `/robots.txt` answered 200 with the security headers (through the platform's share link, protection stays on). Production verification is recorded in docs/DEPLOY.md only after the merge.

**Rollback.** Delete `vercel.json`, `apps/web/vercel.json` and the root `next` devDependency; the Root Directory `apps/web` layout keeps working.

## 2026-10-26 — ADR-030: dependency licences are a CI gate, not a review habit

**Context.** prompts/11 campaign 11: no dependency or artifact may put restricted terms inside a permissively licensed app.

**Decision.** `scripts/check-licenses.mjs` (CI step `pnpm licenses:check` after `pnpm guard`) lists licences with `pnpm licenses list --json` for the production tree and for everything. A production dependency must be MIT, Apache-2.0, ISC, BSD-2/3-Clause, 0BSD, OFL-1.1, Unlicense or CC0-1.0, or an explicit exception that names its packages and says why it is acceptable (LGPL-3.0-or-later `@img/sharp-libvips-*`: optional prebuilt libvips of Next's image optimiser, which SLAY2 does not use, dynamically linked and unmodified; CC-BY-4.0 `caniuse-lite`: build-time data; MPL-2.0 `axe-core` and `lightningcss`: unmodified file-level copyleft, test and CSS-build tools). Strong copyleft or non-commercial terms (AGPL, GPL, SSPL, BUSL, PolyForm, CC-BY-NC, Commons Clause) are refused anywhere in the tree, build tools included. An exception that no longer matches a package is reported so the list stays honest.

**Evidence.** On the current tree: production licences MIT 47, Apache-2.0 9, ISC 5, OFL-1.1 3, LGPL-3.0-or-later 2 (the exception), BSD-3-Clause 1, CC-BY-4.0 1 (the exception), 0BSD 1; "license gate: clean". `apps/web/test/licenses.test.ts` feeds synthetic trees through the script.

**Alternatives rejected.** A one-off audit (the next `pnpm add` would void it); denying all non-MIT (would drop Next's own optional image libraries and the accessibility test engine for no gain).

**Rollback.** Remove the CI step; the script is inert on its own.
