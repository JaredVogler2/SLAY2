# SLAY2 release audit

**Audited:** 2026-10-26 · **Against:** `prompts/11-RED-TEAM-ACCEPTANCE.md` (the final bar and the required documentation) and `docs/VALIDATION-PLAN.md` (the levels and the go/no-go list) · **Build:** Slay the Spire 2 main v0.107.1 · **Commands and observed results:** [docs/TEST-REPORT.md](TEST-REPORT.md) · **Reproduction:** [docs/REPRODUCIBILITY.md](REPRODUCIBILITY.md)

## Verdict

**SLAY2 is an honest, partial product. By the bar of prompt 11 it is not finished.** What exists, runs and is verified on a public URL is the exact probability tools, Route Lab, a manual draft advisor with a start-of-run recorder, and a methods page that shows how far each claim is backed. What does not exist is any evidence that SLAY2 plays or advises the *live game* well: the only full-run evidence comes from a third-party simulator whose parity with the game has never been checked, the pilots that were measured win about 0.3 % of simulated Ironclad games, and no trained network has beaten the hand-written baseline. The site says all of this in its own words next to every simulated number.

The six clauses of the final bar, each with what backs it and what is missing:

| Clause of the final bar | State | What backs it | What is missing |
|---|---|---|---|
| **Premium UI and manual advisor actually run** | **Met for what exists** | https://slay-part2.vercel.app serves `main` at `1c4542d` (checked 2026-10-26; the health route reports the commit; every page answers 200). The browser suite runs the visitor journey from the landing page to a recommendation on a phone and a desktop, axe WCAG 2.2 AA on every page, widths from 320 to 1280 px, enlarged text, no JavaScript, reduced motion, layout shift 0 on all seven pages. Original screenshots from the running UI: `docs/screenshots/` | No human walk-through and no real device (Chromium emulation only); Lighthouse was not run (it downloads an external package; the owner has not approved it); blocking time on a throttled phone is 243 to 535 ms ("needs improvement"); whether the UI is "premium" is the owner's judgement, not a measurement |
| **Exact odds tested** | **Met** | 739 golden cases from an independent Python oracle (16 kinds), the figures published by two outside sources, brute-force enumeration, property tests and fuzzing, integer fast paths proven equal to the rational reference | Ancients' odds and conditional "?" variants have no service yet; first-run scripting and relic hooks are stated as not modelled on every result |
| **App correct under the supported patch, class and legal choices** | **Met for odds and the draft; partial for the rest** | Main v0.107.1 only (the beta is refused with a 422 and a reason); five classes; Ascension 0 to 10 (11 and above are refused); impossible histories are refused, not repaired; STS1 ideas (Heart, Act 4, keys, A20) are rejected by tests | No fixture from the live game exists, so "correct" means "equal to the source as read and to two outside sources"; the advisor does not model per-class mechanics (Strength, poison, Stars, Osty, Doom, orbs) and says so; there are no map, shop, rest, event or combat advisors; no Ancient advice beyond the opening choice |
| **Simulator and ML claims backed by raw evidence** | **Met for the claims that are made; no ML claim is made** | Per-seed records, checksummed manifests and replayable traces are committed for every batch; every one of the 53 held-out wins is re-derived by replay; a 40-game sample of every held-out batch and all 10,000 games of the five `rules_v2` batches are re-derived; each comparison was registered before its first game; the void study is quarantined and explained. No network beat the baseline, so none is claimed | The simulator is unverified against the live game (G5); not every game is re-derived (the development batches and the older baselines have a sample audit or none); the same 2,000 `val` seeds serve several registered tests with no correction between them; the pilots win rarely, so the evidence is about getting past the first boss, not about winning |
| **Deployment verified if executed** | **Met for `1c4542d`** | Production serves the merge commit of pull request #6; `docs/DEPLOY.md` records the checks, the two earlier failed deployments and why | Pull request #7 (the opening-relic result) is not merged, so production does not show it; it needs the same check after the owner merges; preview deployments are behind Vercel login by default; the canonical URL is deliberately unset |
| **Rights, security and accessibility checked** | **Checked, with open items** | Rights: `pnpm guard` and `pnpm licenses:check` in CI, `docs/IP-COMPLIANCE.md`, a scan of the tree and the history for secrets. Security: campaign 10 attacked with fuzzing, size, rate and time limits, security headers and a CSP with zero violations. Accessibility: see the first row | **No LICENSE file** (the code is visible but not licensed for reuse; owner decision); Mega Crit's fan-content policy is not quoted verbatim; no screen-reader session by a person; campaigns 4 (on a trained network), 7 and 8 are open |

## Findings of the audit

Every finding has a reproduction, a fix and a regression test in [docs/ADVERSARIAL-AUDIT.md](ADVERSARIAL-AUDIT.md). The counts, written from that table:

<!-- table:findings:begin -->
| Severity | Meaning (prompts/11) | Found and fixed | Ids |
|---|---|---|---|
| P0 | false probability certainty, wrong game, hidden information, illegal play, security | 0 | none found |
| P1 | an unsupported simulator or model shipped as validated, or a production error | 6 | RT-3-01, RT-2-04, RT-10-07, RT-10-13, RT-10-14, RT-6-02 |
| P2 | accessibility or user flow | 9 | RT-9-01, RT-9-02, RT-9-03, RT-9-04, RT-9-05, RT-9-07, RT-3-08, RT-6-01, RT-5-02 |
| P3 | polish | 4 | RT-9-06, RT-9-08, RT-9-09, RT-6-03 |
<!-- table:findings:end -->

No P0 was found. One finding is **open** and was reported by a user, not found by a test: the advisor has no model of synergies between cards (the next section). The two findings of the first opening-relic study are worth stating plainly: a class id in the wrong letter case made four classes play as Ironclad, and **every audit passed**, because an audit re-runs a game from its manifest and reproduces the same wrong class (RT-6-02). It was found by an independent read of the site code, not by a test; the guards that now exist (exact class ids, a per-game start check, a pairing refusal) are the answer to *that* failure, and no list of tests can promise there is no other of its kind.

## Open finding: no synergy model (user feedback, 2026-10-26)

A user who knows the game gave three observations: the product is a deck-building advisor and does not cover playing cards against enemies (correct, and stated since the start); it does not evaluate card synergies, which is essential; and because it does not, it overrates card quality. The code confirms the second and third: the deck-quality index is the mean of static per-card ratings plus role-coverage, energy-curve and deck-size terms, with a single interaction term that exists only for Ironclad (Strength cards times multi-hit attacks). A card is rated by its own rating and by what role the deck lacks, not by what the cards in the deck make of it. The simulated second opinion is additive for a related reason (a card that needs partners rarely meets them in a random draft). Until this is fixed the advisor should be read as a way to check a deck's roles and a card's standalone rating, not as an evaluation of a build. It is the first item of the next steps in [docs/STATUS.md](STATUS.md).

## Required documentation (prompts/11)

| Required | Where | State |
|---|---|---|
| Adversarial audit with exact blockers, fixes, tests and independent references | [docs/ADVERSARIAL-AUDIT.md](ADVERSARIAL-AUDIT.md) | present, five rounds; the independent references are the Python oracle, the published tables and brute-force enumeration |
| Status with L0 to L5 levels by class, ascension, patch, solo and co-op, and real completed game counts | [docs/STATUS.md](STATUS.md) ("Levels by cohort", with the completed-game counts) | present |
| Test report and release audit with exact commands and observed results | [docs/TEST-REPORT.md](TEST-REPORT.md), this file | present |
| Reproducibility: artifact locations, hashes, source and engine version, seed manifest | [docs/REPRODUCIBILITY.md](REPRODUCIBILITY.md) | present; every batch listed with its hashes |
| Model and data cards with provenance, intervals, licence, fairness | [docs/MODEL-AND-DATA-CARDS.md](MODEL-AND-DATA-CARDS.md) | present; its tables are written from the files and a test keeps them current |
| Deploy: the actual URL if authorised and verified | [docs/DEPLOY.md](DEPLOY.md) | present; the URL is verified, with the date and the commit |
| README onboarding for a first-time user and an advanced competitor, IP disclaimer, privacy | [README.md](../README.md) | present (Quickstart, privacy and IP lines) |
| Original production screenshots from the running UI | [docs/screenshots/](screenshots) | present; made from the running production build by `pnpm --filter @slay2/web screenshots` |

## Levels by class, ascension, patch and mode

The levels are those of `docs/VALIDATION-PLAN.md`, claimed only for the cohort named and never mixed across cohorts. The table is kept in one place, [docs/STATUS.md](STATUS.md) ("Levels by cohort"); in short, **L0 is reached** for the exact calculators and Route Lab (five classes, Ascension 0 to 10, main v0.107.1, solo), **L1 and L2 are partial** (a manual advisor for the draft and the start of a run only; a simulator whose parity with the game is unproven), **L3 is reached for Ironclad's baselines at Ascension 0 and partial for the other four classes**, and **L4 and L5 are not reached** (the beta and co-op are unsupported; the only L5 element that holds is a verified production deployment).

**Real completed games** (a win or a death; withdrawn batches excluded; the same seeds are played by several policies, so these are not independent games). Held-out means the `val` seeds on which comparisons were registered before their first game:

<!-- table:games:begin -->
| Class | Seeds used for | Batches | Games started | Completed (win or death) | Wins | Simulator errors | Timeouts |
|---|---|---|---|---|---|---|---|
| Defect | held-out (val) | 3 | 6,000 | 5,985 | 23 | 15 | 0 |
| Defect | development (train, dev) | 2 | 8,000 | 7,989 | 18 | 11 | 0 |
| Ironclad | held-out (val) | 7 | 12,300 | 12,263 | 28 | 37 | 0 |
| Ironclad | development (train, dev) | 14 | 17,910 | 17,873 | 21 | 27 | 10 |
| Necrobinder | held-out (val) | 3 | 6,000 | 5,988 | 0 | 12 | 0 |
| Necrobinder | development (train, dev) | 4 | 9,000 | 8,993 | 0 | 5 | 2 |
| Regent | held-out (val) | 3 | 6,000 | 5,950 | 2 | 8 | 42 |
| Regent | development (train, dev) | 2 | 8,000 | 7,931 | 0 | 1 | 68 |
| Silent | held-out (val) | 3 | 6,000 | 5,999 | 0 | 1 | 0 |
| Silent | development (train, dev) | 2 | 8,000 | 7,999 | 0 | 1 | 0 |
| **All classes** | **held-out (val)** | **19** | **36,300** | **36,185** | **53** | **73** | **42** |
| **All classes** | **development (train, dev)** | **24** | **50,910** | **50,785** | **39** | **45** | **80** |
<!-- table:games:end -->

## The twelve campaigns

Detail and evidence per campaign: the coverage table in [docs/ADVERSARIAL-AUDIT.md](ADVERSARIAL-AUDIT.md).

| # | Campaign | State |
|---|---|---|
| 1 | Game confusion | attacked; no STS1 assumption survives |
| 2 | Patch contamination | attacked; no beta snapshot exists, so "same id, different cost" cannot be tested and the beta is refused instead |
| 3 | Statistical fake certainty | attacked; three P1 findings fixed |
| 4 | Hidden RNG oracle | counterfactual tests on every pilot behind a published number, with a leak canary; **not run on a trained network** (none earned a place) |
| 5 | Simulator fidelity | not re-attacked; 13 known gaps travel with every result; no live-game fixture |
| 6 | Full-run truth | attacked in two rounds; the class-id failure found and fixed; development batches not all re-derived |
| 7 | Model science | not re-attacked; one negative result committed |
| 8 | Co-op | by construction unsupported |
| 9 | UX and design | attacked; phones, tablets, enlarged text, no-JS, layout shift, reduced motion; no real device or person |
| 10 | Security | attacked; no bridge exists, so CORS and rebinding do not apply yet |
| 11 | Rights | partial; no LICENSE; fan policy not quoted |
| 12 | Deployment | production verified at `1c4542d`; the next merge needs the same check |

The **40-fixture bar** is met in count and not in shape: 73 request-level attack tests and the unit, simulator and browser suites exist, but there are no gameplay scenario fixtures for Regent or Necrobinder state, multi-target battles or Ancients, because the product has no service for them. They are marked intentionally not passed in the audit, not counted as passes.

## What a visitor can and cannot rely on today

**Can:** every number from `/odds`, `/routes` and the odds API is exact for the rules recorded in the register, for main v0.107.1, with the assumptions listed; the draft advisor says what its ranking is (a labelled, uncalibrated deck-quality index) and why; the simulated second opinions say they are simulated, name the pilot, the class, the sample and the interval, and are shown only for classes where a registered held-out test supported them; nothing is stored about the visitor.

**Cannot:** treat any simulated rate as a rate in the live game; read a card or relic value as "this wins runs" (it is a value for one rules pilot, additive, in Overgrowth at Ascension 0); expect advice for the map, shops, rest sites, events, fights, acts two and three Ancients, co-op or the beta; expect a Necrobinder number to hold at the game's 66 HP.

## Blockers and owner decisions

1. **Synergy-aware evaluation** is the priority of the work (the open finding above); it needs no owner decision.
2. **Merge pull request #7** to put the opening-relic study on the live site; then re-check production (`/api/v1/health` reports the merge commit, `/methods#opening-ancient` shows the passed test) and measure Web Vitals again (the advisor's script is about 120 KB lighter).
3. **A licence for SLAY2's own code** and any monetization or donation (counsel, and Mega Crit's confirmation): until chosen the repository is visible but all rights are reserved.
4. **Live-game parity** needs an owned copy of STS2 on the owner's machine: until then every simulator result stays labelled unverified.
5. **Vercel**: whether non-production deployments stay behind login and the canonical URL (`NEXT_PUBLIC_SITE_URL`, deliberately unset).
6. **Lighthouse**: permission to download and run an external package.
7. **Beta rules** need a beta snapshot before the beta can be supported.

## Not done, and why

* No network is deployed or claimed: three combat networks were trained and judged on 796 held-out combats and none improved on the rules baseline; a fourth run is paused with only a monitor-set number.
* Pilots are weak: about 0.3 % of simulated Ironclad games are won, and Silent and Necrobinder won none of their held-out games. The evidence is about surviving the first boss.
* The simulator plays Overgrowth only, at Ascension 0, with no Ancients in acts two and three and a Necrobinder at 75 HP.
* No local companion or bridge to the running game, so nothing reads a live run and no game-control surface exists.
* No re-verification against a newer main build: a patch needs the rules, the catalog and the simulations redone; `patch-watch` only tells when to.

## Next actions, in order

0. **Synergy-aware card evaluation** (the user's feedback): a facts table of what each card provides and needs, a deck-context model measured in simulated runs and cross-validated, one registered held-out test, then the advisor.
1. The owner merges pull request #7; verify production and Web Vitals as above.
2. Registered question with the largest use for a player: the opening-relic rule at the game's own Necrobinder HP (`--game-hp`, G13), then the full re-derivation of the older batches, then the decision on the paused network.
3. Reduce the script that runs after first paint on `/methods` and `/codex`.
4. A map editor that feeds Route Lab; rest-site, shop and Ancient helpers, each starting from a facts-only catalog and its own red-team campaign.
5. Quote the fan-content policy verbatim; choose the licence.

Exact next command: `Read docs/STATUS.md and docs/RELEASE-AUDIT.md. Then: (1) check that pull request #7 (JaredVogler2/SLAY2) is green and, once merged, that https://slay-part2.vercel.app/api/v1/health reports the merge commit; (2) write the registration of the next question (docs/DECISIONS.md) and push it before its first game.`
