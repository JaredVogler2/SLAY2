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
