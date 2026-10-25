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
