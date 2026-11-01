# SLAY2 release audit

**Audited:** 2026-10-26, brought up to date on 2026-10-27 after the three studies repeated with the relics kept (ADR-053, ADR-054, ADR-055) on 2026-10-28 after the same three results were tested at Ascension 9 (ADR-058) and on 2026-10-31 for the Insights page (ADR-059) · **Against:** `prompts/11-RED-TEAM-ACCEPTANCE.md` (the final bar and the required documentation) and `docs/VALIDATION-PLAN.md` (the levels and the go/no-go list) · **Build:** Slay the Spire 2 main v0.107.1 · **Commands and observed results:** [docs/TEST-REPORT.md](TEST-REPORT.md) · **Reproduction:** [docs/REPRODUCIBILITY.md](REPRODUCIBILITY.md)

## Verdict

**SLAY2 is an honest, partial product. By the bar of prompt 11 it is not finished.** What exists, runs and is verified on a public URL is the exact probability tools, Route Lab, a manual draft advisor with a start-of-run recorder, and a methods page that shows how far each claim is backed. What does not exist is any evidence that SLAY2 plays or advises the *live game* well: the only full-run evidence comes from a third-party simulator whose parity with the game has never been checked, the pilots that were measured win about 0.3 % of simulated Ironclad games, and no trained network has beaten the hand-written baseline. The site says all of this in its own words next to every simulated number.

The six clauses of the final bar, each with what backs it and what is missing:

| Clause of the final bar | State | What backs it | What is missing |
|---|---|---|---|
| **Premium UI and manual advisor actually run** | **Met for what exists** | https://slay-part2.vercel.app serves `main` at `037cb8f` (the merge of pull request #14; the health route reports the commit, every page answered 200 and the whole browser suite passed against the hosted site, checked 2026-10-27 17:48 UTC). The browser suite runs the visitor journey from the landing page to a recommendation on a phone and a desktop, axe WCAG 2.2 AA on every page, widths from 320 to 1280 px, enlarged text, no JavaScript, reduced motion, layout shift 0 on all seven pages. Original screenshots from the running UI: `docs/screenshots/` | No human walk-through and no real device (Chromium emulation only); Lighthouse was not run (it downloads an external package; the owner has not approved it); blocking time on a throttled phone is 243 to 535 ms ("needs improvement"); whether the UI is "premium" is the owner's judgement, not a measurement |
| **Exact odds tested** | **Met** | 739 golden cases from an independent Python oracle (16 kinds), the figures published by two outside sources, brute-force enumeration, property tests and fuzzing, integer fast paths proven equal to the rational reference | Ancients' odds and conditional "?" variants have no service yet; first-run scripting and relic hooks are stated as not modelled on every result |
| **App correct under the supported patch, class and legal choices** | **Met for odds and the draft; partial for the rest** | Main v0.107.1 only (the beta is refused with a 422 and a reason); five classes; Ascension 0 to 10 (11 and above are refused); impossible histories are refused, not repaired; STS1 ideas (Heart, Act 4, keys, A20) are rejected by tests | No fixture from the live game exists, so "correct" means "equal to the source as read and to two outside sources"; the advisor's model of synergies over 27 mechanics (Strength, poison, Stars, Osty, Doom, orbs and the rest) is a judgement, tested once in simulation for the cards (the section below), not a measurement of the live game, and its reading of relics (a relic that provides a mechanic counts as a supplier; ADR-051) has no registered test (read once, as an exploration on development seeds, against runs that keep their relics: ADR-053 item 6); there are no map, shop, rest, event or combat advisors; no Ancient advice beyond the opening choice |
| **Simulator and ML claims backed by raw evidence** | **Met for the claims that are made; no ML claim is made** | Per-seed records, checksummed manifests and replayable traces are committed for every batch; every one of the 1,084 held-out wins is re-derived by replay; a 40-game sample of every held-out batch, all 10,000 games of the five `rules_v2` batches and all 20,000 games of the ten held-out batches of the synergy test (`A*` and `d0*`, five classes: every one reproduced its stored record) are re-derived; the 80,000 games of the Ascension 9 study (ADR-058) have all 294 of their wins re-derived and a 40-game sample audit of each of their 40 batches (40 of 40), and each of its four pooled files was recomputed from the episode files by `scripts/verify-pooled.py`, which shares no code with the harness (97 checks per file, all agreeing); each comparison was registered before its first game; the void study is quarantined and explained. No network beat the baseline, so none is claimed | The simulator is unverified against the live game (G5); not every game is re-derived (the development batches and the older baselines have a sample audit or none); the same 2,000 `val` seeds serve several registered tests with no correction between them; the pilots win rarely, so the evidence is about getting past the first boss, not about winning |
| **Deployment verified if executed** | **Met for `c63ad31`** | Production serves the merge commit of pull request #20 (checked 2026-10-31 at 18:05 UTC: `/api/v1/health` reports it, the eight pages answer 200, `/insights` carries the page of ADR-059 as its audit corrected it, the results of ADR-053, ADR-054, ADR-055 and ADR-058 are on `/methods`, and the whole browser suite passed against the hosted site: 367 passed, 0 failed, 139 skipped by design); `docs/DEPLOY.md` records the checks, the two earlier failed deployments and why | Web Vitals were not measured on the hosted site after ADR-056; preview deployments are behind Vercel login by default; the canonical URL is deliberately unset |
| **Rights, security and accessibility checked** | **Checked, with open items** | Rights: `pnpm guard` and `pnpm licenses:check` in CI, `docs/IP-COMPLIANCE.md`, a scan of the tree and the history for secrets. Security: campaign 10 attacked with fuzzing, size, rate and time limits, security headers and a CSP with zero violations. Accessibility: see the first row | **No LICENSE file** (the code is visible but not licensed for reuse; owner decision); Mega Crit's fan-content policy is not quoted verbatim; no screen-reader session by a person; campaigns 4 (on a trained network), 7 and 8 are open |

## Findings of the audit

Every finding has a reproduction, a fix and a regression test in [docs/ADVERSARIAL-AUDIT.md](ADVERSARIAL-AUDIT.md). The counts, written from that table:

<!-- table:findings:begin -->
| Severity | Meaning (prompts/11) | Found and fixed | Ids |
|---|---|---|---|
| P0 | false probability certainty, wrong game, hidden information, illegal play, security | 0 | none found |
| P1 | an unsupported simulator or model shipped as validated, or a production error | 6 | RT-3-01, RT-2-04, RT-10-07, RT-10-13, RT-10-14, RT-6-02 |
| P2 | accessibility or user flow | 12 | RT-9-01, RT-9-02, RT-9-03, RT-9-04, RT-9-05, RT-9-07, RT-3-08, RT-3-10, RT-3-11, RT-6-01, RT-5-02, RT-3-13 |
| P3 | polish | 11 | RT-9-06, RT-3-12, RT-9-08, RT-9-09, RT-6-03, RT-3-14, RT-9-10, RT-10-15, RT-9-11, RT-3-15, RT-3-17 |
<!-- table:findings:end -->

No P0 was found. One finding was reported by a user, not found by a test, and is **addressed in part**: the advisor had no model of synergies between cards (the next section). The two findings of the first opening-relic study are worth stating plainly: a class id in the wrong letter case made four classes play as Ironclad, and **every audit passed**, because an audit re-runs a game from its manifest and reproduces the same wrong class (RT-6-02). It was found by an independent read of the site code, not by a test; the guards that now exist (exact class ids, a per-game start check, a pairing refusal) are the answer to *that* failure, and no list of tests can promise there is no other of its kind.

## Finding addressed in part: no synergy model (user feedback, 2026-10-26)

A user who knows the game gave three observations: the product is a deck-building advisor and does not cover playing cards against enemies (correct, and stated since the start); it does not evaluate card synergies, which is essential; and because it does not, it overrates card quality. The code confirmed the second and third: the v0 deck-quality index was the mean of static per-card ratings plus role-coverage, energy-curve and deck-size terms, with a single interaction term that existed only for Ironclad.

**What changed (ADR-050, heuristic v1).** 385 cards are tagged by what they supply to a deck and what their worth depends on, over 27 mechanics, with each class's starting relic counted as a supplier; the index holds back a card whose needs the deck does not meet and lifts the cards that Strength, Dexterity and Focus help (at 0.7 of the first judgement); it finds the engines a deck is building and names them, but counts none of their value (chosen on development seeds, ADR-050 addendum D); the page names the engines a deck is building and the cards still waiting for support (`/advisor`), and the study is on `/methods#synergy`. The simulated second opinion stays additive and says so.

**How far it is checked.** The strengths are a judgement, not a fit. An exploratory reading of 19,717 simulated runs (stage B1; held-out by seed) found the synergy term improves the prediction of getting past the Act-1 boss (log loss lower by 0.0078, 95 % interval 0.0056 to 0.0094), supports the unmet-needs part at about the weight it was given and the Strength/Dexterity/Focus lifts at about 0.7 of it, and gives no support to an engine credit (0.07 of a rating point per index point, interval -0.08 to 0.27); the gain is clear for Ironclad, Regent and Defect, not for Silent and Necrobinder. The same reading found, and the table now corrects, three needs that ran the wrong way because a class's starting relic already supplies them; an independent second reading of every card by six readers then corrected 51 more cards (second effects not written, needs a card meets by itself or its class cannot meet, the Defect's Status payoffs). Those figures flatter the tags (read against the same runs). A development stage on separate simulated seeds (stage B2-dev: 35 batches of 1,000 games, a rule fixed before the first game and applied by a program; tuning numbers, not evidence) then chose how much of each part the index keeps: with the term and no engine credit the simulated pilot got past the Act-1 boss in 32.6 % of games against 25.4 % without it, every step of engine credit lowered that, and a skip margin made it worse; the page now keeps unmet needs in full, the lift at 0.7 and no engine credit, which flipped four orderings of a payoff over a plain card that the tests had asserted (ADR-050 addendum D lists them). **The one registered held-out test (stage B2-val: a pilot that picks cards by the index against the same pilot without the term, the 2,000 `val` seeds of each class, five classes pooled, one exact McNemar test) was run once and is published as it came out:** the pilot with the term got past the Act-1 boss in 33.0 % of games against 26.0 % (1,273 pairs only with the term, 577 only without, p = 3.8e-60; every class ahead), so adding the term improves what the heuristic index picks, in simulated play, on held-out seeds. It shows nothing about the second boss (0.4 % against 0.4 %), nothing about winning (2 wins against 0), and the pilot that follows the measured card values is far ahead of both (61.8 % past the Act-1 boss): the hand-set index is far from what the simulator rewards, so the measured values stay the better second opinion. The simulator is unverified and the pilot builds no engine on purpose.

**What remains true.** The advisor advises the draft only, not how to play cards against enemies; it is a judgement checked in simulation, not a measurement of the live game; and the simulator's parity with the game is unverified. Read it as a structured way to see what a deck is building and what a card still needs, not as a verdict.

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
| Defect | held-out (val) | 24 | 48,000 | 47,302 | 674 | 698 | 0 |
| Defect | development (train, dev) | 24 | 30,400 | 30,031 | 371 | 369 | 0 |
| Ironclad | held-out (val) | 27 | 52,300 | 51,389 | 912 | 909 | 2 |
| Ironclad | development (train, dev) | 36 | 40,310 | 39,825 | 524 | 474 | 11 |
| Necrobinder | held-out (val) | 24 | 48,000 | 47,486 | 7 | 505 | 9 |
| Necrobinder | development (train, dev) | 26 | 31,400 | 31,134 | 2 | 260 | 6 |
| Regent | held-out (val) | 24 | 48,000 | 47,305 | 75 | 354 | 341 |
| Regent | development (train, dev) | 24 | 30,400 | 29,879 | 32 | 265 | 256 |
| Silent | held-out (val) | 24 | 48,000 | 47,867 | 0 | 133 | 0 |
| Silent | development (train, dev) | 24 | 30,400 | 30,339 | 0 | 61 | 0 |
| **All classes** | **held-out (val)** | **123** | **244,300** | **241,349** | **1,668** | **2,599** | **352** |
| **All classes** | **development (train, dev)** | **134** | **162,910** | **161,208** | **929** | **1,429** | **273** |
<!-- table:games:end -->

## The twelve campaigns

Detail and evidence per campaign: the coverage table in [docs/ADVERSARIAL-AUDIT.md](ADVERSARIAL-AUDIT.md).

| # | Campaign | State |
|---|---|---|
| 1 | Game confusion | attacked; no STS1 assumption survives |
| 2 | Patch contamination | attacked; no beta snapshot exists, so "same id, different cost" cannot be tested and the beta is refused instead |
| 3 | Statistical fake certainty | attacked; three P1 findings fixed |
| 4 | Hidden RNG oracle | counterfactual tests on every pilot behind a published number, with a leak canary; **not run on a trained network** (none earned a place) |
| 5 | Simulator fidelity | not re-attacked; 14 known gaps travel with every result; no live-game fixture |
| 6 | Full-run truth | attacked in two rounds; the class-id failure found and fixed; development batches not all re-derived |
| 7 | Model science | no network is shipped or claimed; the negative results are committed and the paused run is retired (ADR-057) |
| 8 | Co-op | by construction unsupported |
| 9 | UX and design | attacked; phones, tablets, enlarged text, no-JS, layout shift, reduced motion; no real device or person |
| 10 | Security | attacked; no bridge exists, so CORS and rebinding do not apply yet |
| 11 | Rights | partial; no LICENSE; fan policy not quoted |
| 12 | Deployment | production verified at `037cb8f` (pull request #14), including the browser suite against the hosted site |

The **40-fixture bar** is met in count and not in shape: 73 request-level attack tests and the unit, simulator and browser suites exist, but there are no gameplay scenario fixtures for Regent or Necrobinder state, multi-target battles or Ancients, because the product has no service for them. They are marked intentionally not passed in the audit, not counted as passes.

## What a visitor can and cannot rely on today

**Can:** every number from `/odds`, `/routes` and the odds API is exact for the rules recorded in the register, for main v0.107.1, with the assumptions listed; the draft advisor says what its ranking is (a labelled deck-quality index with a synergy term that is a judgement, tested once in simulation: a pilot that follows it got past the first boss more often on held-out seeds) and why; the simulated second opinions say they are simulated, name the pilot, the class, the sample and the interval, and are shown only for classes where a registered held-out test supported them; nothing is stored about the visitor.

**Cannot:** treat any simulated rate as a rate in the live game; read a card or relic value as "this wins runs" (it is a value for one rules pilot, additive, in Overgrowth at Ascension 0); expect advice for the map, shops, rest sites, events, fights, acts two and three Ancients, co-op or the beta; expect a Necrobinder number to hold at the game's 66 HP.

## Blockers and owner decisions

1. **No pull request is waiting for a merge.** Pull requests #7 to #14 are merged and live (`/api/v1/health` reports the merge commit `037cb8f`, checked 2026-10-27 17:48 UTC; every page answers 200 and the browser suite passed against the hosted site).
2. Measure Web Vitals again on the hosted site: the shared script is about 78 KB (gzipped) lighter on `/about` and `/methods` and 75 KB on the landing page since ADR-056, and no timing was re-measured after it.
3. **A licence for SLAY2's own code** and any monetization or donation (counsel, and Mega Crit's confirmation): until chosen the repository is visible but all rights are reserved.
4. **Live-game parity** needs an owned copy of STS2 on the owner's machine: until then every simulator result stays labelled unverified.
5. **Vercel**: whether non-production deployments stay behind login and the canonical URL (`NEXT_PUBLIC_SITE_URL`, deliberately unset).
6. **Lighthouse**: permission to download and run an external package.
7. **Beta rules** need a beta snapshot before the beta can be supported.

## Not done, and why

* No network is deployed or claimed: three combat networks were trained and judged on 796 held-out combats and none improved on the rules baseline; a fourth run, paused with only a monitor-set number, is retired (ADR-057).
* Pilots are weak: about 0.3 % of simulated Ironclad games are won, and Silent and Necrobinder won none of their held-out games in that simulator (with the relics kept, the 10,000 baseline games of ADR-055 give 91 Ironclad wins in 1,936 completed games, 62 for Defect in 1,934, 6 for Regent, 2 for Necrobinder and none for Silent). The evidence is about surviving the first boss. **That level belongs to a simulator that drops every relic a run gains after its first fight (G14, ADR-052):** with the relics kept, the same pilot got past the Act-1 boss in 63.1 % of 2,444 paired development games instead of 52.5 %, went 3.04 floors further and won 34 games against 2 (Ironclad 25 of 482 against 0 of 499).
* The simulator plays Overgrowth only, with no Ancients in acts two and three, a Necrobinder at 75 HP, and, the largest of its known gaps, **no relic kept after a run's first fight (G14)**. No registered result is withdrawn (each compared two arms inside the simulator as it is), but none that was not played again is evidence that its ordering holds with relics kept: the synergy test was played again with them (ADR-054: the term still helps) and so was the card-value test (ADR-053: four classes adopt the values measured again), the opening-relic study was played again with them (ADR-055: the rule of taking the best-measured relic still helps, 69.2 % against 64.5 % past the Act-1 boss), and the tuned thresholds and the search policy were not played again (STATUS, Next steps 0b). **Every result above was measured at Ascension 0 until ADR-058 tested three of them at Ascension 9** (the synergy term, the card values and the opening-relic rule each came out ahead there, by fewer points, since the pilots get past the first boss far less often; the opening-relic advice is named at Ascension 1 to 10 for four classes and withheld for Silent, whose own games did not show the rule ahead at the bar set in advance); the levels 1 to 8 are not tested, Ascension 10 adds a second boss the simulator never plays (G1), and nothing fitted at Ascension 9 itself exists.
* No local companion or bridge to the running game, so nothing reads a live run and no game-control surface exists.
* No re-verification against a newer main build: a patch needs the rules, the catalog and the simulations redone; `patch-watch` only tells when to.

## Next actions, in order

00. **The three registered replications with the relics kept are done** (ADR-052 found the gap; ADR-053 card values: the values measured again beat the earlier ones, so four classes adopt them; ADR-054 synergy test: the term still helps, +7.1 points against +7.0; ADR-055 opening relics: the rule still helps, +4.7 points against +6.8). Open: the tuned thresholds (H9, tuned where elite relics were dropped, so possibly wrong for a game that keeps them) and the search policy were not played again; a report to the simulator's maintainers is the owner's call.
02. **The Insights page was built from existing results (ADR-059, 2026-10-31)**: levers on one axis, where runs end, an exploratory reading of the second boss, card surprises, the synergy atlas, the Ascension ladder, a table of what the site holds of the game and the questions not yet answered, every figure read from committed files and labelled by the kind of evidence it is. What it does not do: no new held-out game was played; the second-boss reading is exploratory and associational (60 % of the card picks were random, the pilot's other choices were rules, and runs that reach the second boss have already survived two acts); the earlier lead that thinner decks do better later was not reproduced and is not refuted; a headline that said bosses end most runs was wrong (47 % of the deaths at Ascension 0, 37 % at 9, from the floors the games record) and was replaced before it shipped. The studies it points at (values and a picky pilot at the Act-2 boss, elites with the relics kept, relic values, events and enchantments, shops) are open registrations.
01. **The three results were tested at Ascension 9 and all passed (ADR-058, 2026-10-28)**, each by fewer points than at Ascension 0; the pages say so, and what they say follows the exported numbers. Open: the question the numbers raise without answering, whether the pilot that follows the measured card values (24.6 % past the Act-1 boss at Ascension 9) against the one that picks by the advisor's index with the synergy term (10.1 %) means the measured values should be the advisor's headline recommendation: a registered paired test of those two pilots, and a product decision for the owner, with the simulator still unverified against the live game.
0. **The synergy study (the user's feedback) is finished** as registered in ADR-050 and played again in ADR-054: the model, the exploratory reading (B1), the development stage (addendum D) and the held-out tests, published as they came out, with the page's weights and wording set by them. Open, each a new registration: a second pilot, the levels 1 to 8 and values fitted at Ascension 9 (the term itself passed at Ascension 9: ADR-058), the tags re-read with the table unfrozen, and whether the strengths hold for the beta build.
1. Measure Web Vitals on the hosted site again now that ADR-056 (smaller scripts) and the synergy work are live.
2. Registered questions with the largest use for a player: the pilot's thresholds tuned again with the relics kept (H9 repeated; the route policy it implies), the three repetitions at the game's own Necrobinder HP (`--game-hp`, G13), then the full re-derivation of the older batches.
3. Reduce what `/methods` (a 1.27 MB document, 127 KB gzipped, up from 944 KB with the evidence of ADR-058) and `/advisor` (332 KB of gzipped script) send; the shell and the landing page are done (ADR-056).
4. A map editor that feeds Route Lab; rest-site, shop and Ancient helpers, each starting from a facts-only catalog and its own red-team campaign.
5. Quote the fan-content policy verbatim; choose the licence.

Exact next command: `Read docs/STATUS.md and docs/RELEASE-AUDIT.md. Then write the registration of the next question (docs/DECISIONS.md, docs/STATUS.md Next steps) and push it before its first game: the pilot's thresholds tuned again with the relics kept, or the three repetitions at the game's own Necrobinder HP; or take one of the owner decisions under Blockers (licence and monetization, preview protection, live-game parity, Lighthouse).`
