# SLAY2 status

**Last updated:** 2026-10-25 (session 1) - **Branch:** `claude/adoring-brahmagupta-n2irn6` - **Game target:** STS2 **main v0.107.1** (Steam build 23811903). Beta v0.111.0 is **unsupported** (rules unverified).

## Honest headline

| Item | Value |
|---|---|
| Evidence-grade completed SLAY2 simulation games | **0** (10 exploratory random-policy episodes were run on the third-party env; not manifested, not evidence) |
| Trained SLAY2 models | **0** |
| Deployed website | **none** (no site code yet) |
| Maturity (VALIDATION-PLAN levels) | **L0 in progress**: rule register + provenance done; calculators/UI not yet built |
| Simulator parity with the live game | **UNVERIFIED** (no game available in this environment) |

## Done this session (committed paths)

* **Rule verification (Phase 01).** `docs/game/MECHANICS-COVERAGE.md` - 40 rules with evidence classes; every odds/economy constant cross-checked against **decompiled v0.107.1 source (E1)**, sts.wiki (E3), Almanauts (E4), official notes (E2). Resolved: A7 base rare = **1.49 %** (not 1.5), shifted uncommon boundary, boss rewards reset the counter, potion counter unclamped, "?" counters reset per act, **3 acts / no Act 4**, win = clear final act (+ non-lethal Architect event).
* **Source registry and rights.** `docs/sources/SOURCE-REGISTRY.md`, `docs/SIMULATOR-CANDIDATE-MATRIX.md`, `docs/IP-COMPLIANCE.md`, `docs/INFORMATION-FAIRNESS.md`, `docs/RESEARCH-OPEN-QUESTIONS.md`, ADR-011..015 in `docs/DECISIONS.md`, `data/game/sts2/{main/0.107.1,beta/0.111.0}/manifest.json`.
* **Provenance guards.** `.gitignore`, `external/pins.json` (7 repos, SHAs, licenses), `scripts/external-fetch.sh`, `scripts/guard-third-party.sh` + `scripts/test-guard.sh`, `.githooks/pre-commit`.

## Evidence (commands actually run)

| What | Command | Result |
|---|---|---|
| Third-party sim test suite (HEAD `5d874e8`) | `python -m pytest -p no:cacheprovider -n 4 -q tests` (cwd = checkout, Python 3.13.17) | **4,862 passed** in 278 s |
| Reward-odds differential: sim vs SLAY2 exact model | 200,000 rewards x {A0,A7} x {regular,elite} | **28 / 28 PASS** (99.9 % Wilson intervals) |
| Model vs published figures | exact rational prototype | offset table 28/28 cells, after-rare 0 % / 16.95 %, run averages 19.72 % / 30.91 %, "?" table 6/6 rows - **all match** |
| Monster HP A0/A8 vs sts.wiki | 132 factories x 60 seeds x 2 ascensions | **97 / 100 rows exact**; 3 gaps (Living Shield, Scroll of Biting, The Merchant???) |
| Provenance guard self-test | `bash scripts/test-guard.sh` | 7/7 scenarios pass |
| Build state | Steam announcements 2026-10-25 | main v0.107.1 (2026-06-18), beta v0.111.0 (2026-08-13); nothing newer |

(The odds audits above were run from scratch scripts and are being promoted into `sim/` and `packages/odds` as committed, re-runnable tests - next milestone.)

## Findings that change the plan

1. **No legally reusable full-run simulator exists** (see matrix). The one usable engine is unlicensed and built on decompiled code; it is used **locally only** (ADR-011).
2. The gym wrapper **turns exceptions and timeouts into "losses"**; evidence-grade runs must drive `RunManager` directly (ADR-012).
3. Random play dies in Act 1; the repo's own docs record **0 % full-run PPO win rate**. Meaningful completed-win evidence needs a real policy (heuristic/search first).

## Blockers

* Live-game parity needs an owned STS2 copy on the owner's machine (Q1).
* Beta rules need a beta snapshot (Q2).
* License choice for SLAY2 itself and any monetization are owner/counsel decisions (Q14).

## Next steps

1. `packages/odds` (exact engines + golden fixtures + property tests) and promote the two audits to committed tests.
2. `sim/` harness: `doctor`, `smoke --n 10`, `run`, `audit` with the ADR-012 taxonomy, seed manifests, Wilson CIs; then baseline ladder 10 -> 100 -> 2,000 completed games.
3. Policies: random-legal -> safeguarded -> fair heuristic -> determinized combat search; compare on paired seeds.
4. Web vertical slice: landing + `/odds` + `/advisor`, Playwright + axe, Vercel build.

Exact next command: `Read docs/STATUS.md and continue at "Next steps" 1; keep committing small passing slices.`
