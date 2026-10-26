# SLAY2 adversarial audit (prompts/11), round 1

**Status: partial, on purpose.** This round attacked campaigns **1, 2, 3 and 10** with executable cases that now run in CI, fixed every hole they found, and touched **9, 11 and 12** only where stated below. Campaigns **4-8 were not re-attacked in this round**; the evidence that already exists for them is listed so a reader can judge it, and what is missing is named. Nothing here is a claim about how well any playing policy plays.

**Attacked code:** `POST /api/v1/odds`, `POST /api/v1/recommend`, `GET /api/v1/capabilities`, the run-file import (`parseRunState`), the exact-odds engines and the draft advisor, at STS2 **main v0.107.1** (the beta v0.111.0 is unsupported). **Method:** every case is a request or file that was actually sent to the running handlers (`new Request(...)` into the route functions, the same code Vercel runs); a finding is only recorded when a case failed on the code as it stood, and its fix is only counted once that case passes.

## Reproduce

```bash
pnpm --filter @slay2/web exec vitest run test/redteam.test.ts      # the HTTP / import attacks (73 tests)
pnpm --filter @slay2/odds exec vitest run test/fastpath.test.ts     # integer fast paths vs rational reference oracles, CPU budgets
pnpm --filter @slay2/web exec vitest run test/licenses.test.ts      # dependency licence gate (campaign 11)
pnpm licenses:check                                                 # the gate itself, on the real dependency tree
pnpm --filter @slay2/web e2e                                        # journey + a11y, desktop and mobile (campaign 9)
```

## Findings

Severity follows prompts/11: P0 false certainty / wrong game / hidden information / illegal play / security, P1 unsupported thing shipped as validated or a production error, P2 accessibility / user flow, P3 polish. No P0 was found. Each row was **reproduced on the code before the fix** (the test ids are the reproduction commands' case names).

| ID | Sev | Campaign | Expected | Actual before the fix | Fix | Regression test |
|---|---|---|---|---|---|---|
| RT-3-01 | **P1** | 3 fake certainty | A card-reward rarity request must say what is known about the hidden pity counter, because the answer is conditional on it | A request with neither `counter` nor `history` was accepted and answered as if no card reward had ever been offered (the start-of-run state) and nothing in the response said so. Potion and "?" `history` were optional with the same silent default | `400 invalid_request` ("Say what you know about the hidden counter ... `[]` only if no card reward has been offered yet"); `history` is now required for potion and "?"; every answer carries `evidence: {kind, observations}` so a client can show how much the number rests on | RT-3-01, RT-3-02, RT-3-04; `api.test.ts` |
| RT-2-04 | **P1** | 2 patch contamination | Calculators whose numbers depend on the patch name the build and refuse an unverified one | `removal` and `gold` had no `build` field (strict schema), so a caller could not name the build, the service could not refuse the beta, and the answer did not say which patch it was for | `build` required on both, validated like the other calculators, echoed in the response | RT-2-04 |
| RT-10-07 | **P1** | 10 security (DoS) | Any legal request answers in bounded time; the history comes from strangers | Reward-rarity inference at Ascension 7 with a 100-pack unknown history took **179 s** on the development machine (exact rational arithmetic on every posterior update), enough to hold a serverless function for minutes | Pack tables are compiled once to integer weights over a common denominator (scale 10,000); posterior, forecast and position marginals are plain `bigint` sums normalised once at the end. Same worst case: **0.44 s**. The fast path is proven identical to the rational reference | RT-10-07 (1.5 s budget per legal worst-case request); `fastpath.test.ts` (reference oracles for `inferCounter`, `forecastPack`, `positionMarginals`, CPU budgets) |
| RT-10-13 | **P1** | 10 security (DoS) | A "?" history longer than any act is not a real act and is refused | 60 entries took about **17 s**; the run-file import accepted the same 60 | `MAX_UNKNOWN_ROOMS_PER_ACT = 20` enforced in the engine (`RangeError`), the API schema (400), the run-state schema (import rejected) and the UI (buttons disabled with a status note); the engine uses integer-percent masses (every probability there is a whole number of percent) | RT-10-13; `fastpath.test.ts` (cap and CPU budget) |
| RT-3-08 | P2 | 3 / 5 fidelity | The advisor lists what it does not model, including the resources that decide cards in each class | `notModelled` named generic gaps only; a Necrobinder deck was scored with no hint that Osty, Souls and Doom are not modelled | Per-class entries (Ironclad Strength/exhaust, Silent poison/Sly/shiv, Regent Stars/Forge, Necrobinder Osty/Souls/Doom, Defect Orbs/Focus) are appended to `notModelled` | RT-3-08 |

## What held (attacked, no defect found)

* **Game confusion (campaign 1).** Ascension 11, 12, 15, 19, 20, -1, 10.5, `"10"`, `null`, `1e9` are `400` on both the odds and the advisor endpoints (RT-1-01); act index 3, 4, -1, 1.5, `"2"`, `null` are `400`, there is no Act 4 (RT-1-02); `watcher`, `Watcher`, `"ironclad "`, empty, `null`, an injection string, `heart`, `7` are not characters (RT-1-03); the five real characters are accepted (RT-1-04); STS1 card ids (`Strike_R`, `Bash`, `CORRUPT_HEART`, `HEART_OF_IRON`, `BURNING_BLOOD`), a path traversal and a Cyrillic look-alike are not STS2 cards (RT-1-05); `sts1-2.3`, other casing, an older build and a NUL-suffixed id are not builds (RT-1-06); the public capability statement never lists Heart, Act 4, keys or A20 and says co-op is unsupported (RT-1-07).
* **Patch contamination (campaign 2).** The advisor answers the beta build with `422` and "not verified" (RT-2-02); a saved run from the beta build loads but is never advised on (RT-2-03).
* **Fake certainty (campaign 3).** An explicit empty history is the documented way to say "first reward of the run" and is echoed back (RT-3-02); an impossible history is a `422` with no number (RT-3-03); a counter and a history together are refused (RT-3-04); more target copies than cards in the pile is refused, not clamped (RT-3-05); needing more copies than are drawn is exactly zero, never `NaN` (RT-3-06); the advisor never reports a win probability and always says it is not calibrated (RT-3-07).
* **Hostile input (campaign 10).** Wrong content type `415`, unparseable body `400` (RT-10-01); an oversized body is `413` whether or not the length is declared (RT-10-02); `__proto__` / `constructor` pollution is inert, for the API and the run import (RT-10-03); absurd nesting and magnitudes are `400` (RT-10-04); error messages do not echo a huge hostile input (RT-10-05); one client cannot exhaust the per-address rate limit for others (RT-10-06); property-based fuzzing with fast-check: arbitrary JSON into the odds endpoint, near-valid advisor requests with one corrupted field, and arbitrary imported run files never produce a 5xx, a non-JSON body, a throw or a prototype change (RT-10-08..10); hostile text in id fields is rejected before it can reach the page or a file name (RT-10-11); an import above the size cap is refused unparsed (RT-10-12).

## Coverage of the twelve campaigns

| # | Campaign | This round | Evidence that exists | Not done |
|---|---|---|---|---|
| 1 | Game confusion | **attacked** (RT-1-01..07) | above | STS1 *mod* references and Java ids were not enumerated beyond the card/character/build/ascension/act fields |
| 2 | Patch contamination | **attacked** (RT-2-02..04) | `docs/PATCH-COMPATIBILITY.md`, `slay2_sim patchdiff` (ids and field names across three archived versions) | no beta snapshot exists, so "wrong card cost under the same id" cannot be tested; the beta is refused instead |
| 3 | Fake certainty | **attacked** (RT-3-01..08) | exact engines checked against a Python oracle (720 golden cases, 14 kinds), published tables, brute force | conditional-check variants of "?" rooms and Ancients are not covered (no Ancients service yet) |
| 4 | Hidden RNG oracle | not re-attacked | `sim/tests/test_clone_and_fairness.py`, `sim/tests/test_policy_fairness.py` (counterfactual invariance with a power-checked leak canary), `docs/INFORMATION-FAIRNESS.md` | the PPO observation encoder has layout tests, but no counterfactual test on a trained network yet |
| 5 | Simulator fidelity | not re-attacked | `sim/slay2_sim/gaps.json` (5 known gaps shipped with every result), `docs/game/MECHANICS-COVERAGE.md` | no real-game fixtures exist (no owned game copy): parity is **UNVERIFIED** |
| 6 | Full-run truth | not re-attacked | `sim/tests/test_terminal_semantics.py`, outcome taxonomy, checksummed batch manifests, replayable traces | no policy has won a simulated game; no claim is made |
| 7 | Model science | not re-attacked | paired-evaluation design in ADR-026, sealed `test` partition | the combat network is still below the rules baseline on held-out combats; no result is claimed |
| 8 | Co-op | by construction | co-op is `unsupported` in `GET /api/v1/capabilities` (RT-1-07) | nothing is built; no team or ally model exists |
| 9 | UX and design | partly | scripted journey `apps/web/e2e/journey.spec.ts` (landing to a recommendation, desktop and mobile), axe WCAG 2.2 AA on every page, production screenshots in `docs/screenshots/` | no real human walk-through; landing CLS 0.09 (web-font swap) and advisor CLS 0.09 (skeleton to content) are known and unfixed |
| 10 | Security | **attacked** (RT-10-01..13) | security headers and zero-violation CSP hydration test (`e2e/security.spec.ts`) | no localhost bridge exists, so CORS / DNS-rebinding / PNA do not apply yet; corrupted model weights are not loaded by the web app |
| 11 | Rights | partly | `pnpm licenses:check` gate in CI (permissive allowlist; strong copyleft refused anywhere; explicit, documented exceptions: LGPL-3.0-or-later `@img/sharp-libvips-*`, CC-BY-4.0 `caniuse-lite`, MPL-2.0 `axe-core` and `lightningcss`), `pnpm guard` (no third-party files or text in git), `docs/IP-COMPLIANCE.md` | the code licence of SLAY2 itself is an open owner decision; Mega Crit fan policy has not been quoted verbatim |
| 12 | Deployment | partly | a clean checkout of the exact commit installed with `--frozen-lockfile` and built as Vercel's `buildCommand` would; a real Vercel preview build of the same commit finished READY and answered `200` on `/`, `/api/v1/health`, `/api/v1/capabilities`, `/robots.txt` with the security headers intact (`docs/DEPLOY.md`) | production URL after the merge is not yet verified; Lighthouse / Web Vitals on the hosted URL not measured |

## Scenario fixtures against the 40-fixture bar

prompts/11 asks for at least 40 adversarial fixtures across five characters and all major decision types, including 10 for Regent or Necrobinder unique state, 10 multi-target battles and 10 Ancients / patch cases. Honest accounting:

* **Count met, shape only partly:** 73 request-level attack tests exist in `redteam.test.ts` (several are parameterised over many hostile values, and three are property-based and generate hundreds of further inputs each), and all five characters appear in them (campaign 1 enumerates the five, campaign 3 attacks the advisor's disclosure for four of them and uses the default Ironclad deck everywhere else). They are hostile-input and contract tests, not gameplay scenario fixtures across decision types: the product has two decision services today (the exact odds calculators and the draft advisor), so those are the only decision types with fixtures.
* **Not met, intentionally not passed:** *Regent / Necrobinder unique state* (the advisor reads Stars, Forge, Osty, Souls and Doom through role tags only and says so, RT-3-08; no engine for them exists); *multi-target battles* (the web product has no combat advisor; the research harness has single-combat evaluation only); *Ancients* (an Ancient service is planned, not built). These are gaps in the product, recorded as such, not false positives.

## Next attacks (ordered)

1. Counterfactual observation test on a trained network (campaign 4), once a checkpoint beats the baseline.
2. Replay-verified completed-game audit sample (campaign 6) before any win-rate sentence is written anywhere.
3. Lighthouse and Web Vitals on the verified production URL; fix the two CLS items (campaign 9).
4. Ancients and shop services with a facts-only catalog first, then their own red-team campaign (campaigns 3, 5).
