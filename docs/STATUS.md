# SLAY2 status

**Last updated:** 2026-10-25 (session 1) - **Branch:** `claude/adoring-brahmagupta-n2irn6` ([PR #1](https://github.com/JaredVogler2/SLAY2/pull/1)) - **Game target:** STS2 **main v0.107.1** (Steam build 23811903). Beta v0.111.0 is **unsupported** (rules unverified).

## Honest headline

| Item | Value |
|---|---|
| Evidence-grade completed simulation games (third-party simulator, Ironclad A0, `veteran` profile, `random_legal` policy) | **2,000** distinct games (seeds = first 2,000 of the `train` partition): **0 wins**, 1,999 deaths, 1 `simulator_error` (excluded, reported). 95 % Wilson upper bound for the win rate: **0.19 %**. The 10- and 100-game batches are *prefixes of the same seed set*, not extra games. |
| Same, `first_run` (tutorial-scripted) profile | 100 games, 0 wins (cohort kept separate) |
| Smarter policies | `rules_v1` and `search` exist as code/exploration only; **no evidence-grade batch yet** (an exploratory 60-game trial of `rules_v1` reached Act 2 in 27/60 games and died to the Act-1 bosses in 21/60; 0 wins; not citable) |
| Trained SLAY2 models | **0** |
| Deployed website | **none** (no site code yet) |
| Simulator parity with the live game | **UNVERIFIED** (no owned game in this environment) |
| Maturity (VALIDATION-PLAN levels) | L0 rules register + provenance done; L2 harness running on an *unverified* third-party simulator; calculators/UI not yet built |

## What exists (committed)

* **Rule register** `docs/game/MECHANICS-COVERAGE.md` (40 rules, evidence classes), `docs/sources/SOURCE-REGISTRY.md`, `docs/IP-COMPLIANCE.md`, `docs/INFORMATION-FAIRNESS.md`, `docs/SIMULATOR-CANDIDATE-MATRIX.md`, `docs/RESEARCH-OPEN-QUESTIONS.md`, ADR-011..017.
* **Provenance guards**: `external/pins.json`, `scripts/external-fetch.sh`, `scripts/guard-third-party.sh` (+ self-test, pre-commit hook).
* **`sim/` research harness (original code)**: outcome taxonomy (`win|death|timeout|simulator_error|invalid_action|harness_error|policy_error|aborted`), fair allow-listed observation adapter, closure-aware clone + fair determinization, runner with step/stall/turn/wall limits, resumable parallel batches with checksummed manifests (`content_sha256` reproduces across runs), trace replay verification, seed manifests with a sealed `test` partition, Wilson / paired bootstrap / exact McNemar statistics, CLI (`doctor`, `seeds`, `smoke`, `run`, `audit replay`, `compare`).
* **Tests**: `sim/tests` (21 tests: stats, manifests, taxonomy, clone fidelity, hidden-state invariance, determinization, profile cohorts). Run: `PYTHONPATH=sim python -m pytest sim/tests`.

## Evidence (commands actually run)

| What | Command / method | Result |
|---|---|---|
| Third-party sim test suite (HEAD `5d874e8`) | `pytest -n 4 tests` (cwd = checkout) | 4,862 passed in 278 s |
| Sim reward odds vs exact model | 200k rewards x {A0,A7} x {regular,elite} | 28/28 PASS (99.9 % Wilson) |
| Exact model vs published figures | rational prototype | offset table 28/28, after-rare 0 % / 16.95 %, run averages 19.72 % / 30.91 %, "?" table 6/6 |
| Sim monster HP A0/A8 vs sts.wiki | 132 factories x 60 seeds | 97 / 100 rows exact; 3 gaps |
| Clone fidelity | 80 seeds x 30 steps, original vs clone | plain `deepcopy`: **38/80 diverge**; `clone_manager`: **0/80** (1,578 steps) |
| Determinism | same 40-game batch run twice | identical `content_sha256` |
| Replay | `smoke` replays 3 traces | observation hashes identical at every step |
| Baseline ladder | `python -m slay2_sim smoke/run --policy random_legal --profile veteran` | 10 -> 100 -> 2,000 games, 0 wins |
| Build state | Steam announcements 2026-10-25 | main v0.107.1, beta v0.111.0; nothing newer |

## Findings that change the plan (details: SIMULATOR-CANDIDATE-MATRIX.md)

1. No legally reusable full-run simulator exists; the usable engine is unlicensed and used **locally only** (ADR-011).
2. The gym wrapper turns exceptions and timeouts into losses -> SLAY2 drives `RunManager` directly (ADR-012).
3. **Events are never registered** by the simulator's own gym/training path (0 of 68), so the repo's published training ran without events/Neow/Ancients; SLAY2 imports the package (ADR-016).
4. The simulator defaults to the **tutorial first-run profile**; SLAY2 labels `veteran` vs `first_run` cohorts (ADR-016).
5. The simulator's RNG is the pre-0.107.1 .NET family; seeds cannot reproduce live runs (Q12 closed).
6. Plain `deepcopy` is not a faithful forward model; SLAY2's closure-aware clone is (ADR-017).
7. A reproducible simulator crash (`is_sovereign_blade(None)`) exists; reported, not hidden.

## Blockers

* Live-game parity needs an owned STS2 copy on the owner's machine (Q1).
* Beta rules need a beta snapshot (Q2).
* License choice for SLAY2 itself and any monetization are owner/counsel decisions (Q14).

## Next steps

1. Evidence-grade `rules_v1` batch on the `val` partition; failure analysis at the Act-1 bosses; `search_v1` (determinized combat search) and paired comparison on identical seeds.
2. `packages/odds` (exact engines + golden fixtures from the audits) and the web slice (landing, `/odds`, `/advisor`).
3. Use spire-archive data for the facts-only catalog and patch diffs; combat-PPO experiment after policies are measured.

Exact next command: `Read docs/STATUS.md; continue at "Next steps" 1; keep committing small passing slices.`
