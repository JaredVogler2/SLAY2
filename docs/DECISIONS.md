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

