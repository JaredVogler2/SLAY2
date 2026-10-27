# SLAY2 model and data cards

**Written:** 2026-10-26 · **Game build:** Slay the Spire 2 main **v0.107.1** (Steam build 23811903); the beta v0.111.0 is unsupported · **Simulator:** the third-party `zhiyue/sts2-rl-agent` pinned at `5d874e8`, run locally and never published; its parity with the live game is **unverified** (gap G5).

The tables in this file are written by `python3 scripts/docs-tables.py --write` from the files in `experiments/`, `sim/slay2_sim/gaps.json` and `apps/web/src/content/`, and `sim/tests/test_docs_tables.py` fails when one is stale. The prose around them is hand-written and says what the numbers do and do not mean. Where a card says a number, the file it comes from is named.

## How to read these cards

**What "model" means here.** SLAY2 ships **no neural network and no learned policy** to visitors. What reaches them is (1) exact probability calculators, which are mathematics with nothing fitted (M1); (2) a hand-written, uncalibrated draft heuristic (M2); and (3) two kinds of **fitted tables measured in simulated runs**, shown as labelled second opinions: a value per card for each class (M3) and a value per opening relic (M4). The pilots that generated and tested those tables (M5) and the combat networks (M6) are research tools; none of them runs on the website.

**Evidence vocabulary.** *Held-out* means the `val` seeds of `experiments/seeds/ironclad-a0-v2.json`, on which a comparison was registered (question, endpoint, test and reading rule) in `docs/DECISIONS.md` and pushed before the first game of the compared policy. *Development* means the `train` and `dev` seeds, where things were explored, tuned and fitted; development numbers are never headlines. *Sealed* means the `test` seeds, which no code path has read (no manifest uses them; reading them needs an explicit flag that is recorded).

**Intervals.** A single proportion carries a Wilson 95 % interval. A paired difference of means (floors) carries a percentile bootstrap that resamples whole seeds (20,000 resamples, generator seed 0). A paired binary outcome (got past a boss, won) is tested with the exact two-sided McNemar test on the seeds both games completed; pairs where either game did not finish are excluded **and counted**, and a simulator error or a timeout is never counted as a loss. A per-card or per-relic value carries a 95 % bootstrap over seeds (200 draws). Several registered tests share the same 2,000 `val` seeds, and no correction is made between them: each was registered on its own, but a later study on the same seeds is not independent of what earlier ones showed about those seeds (ADR-046 says so where it happens).

## Index

| ID | Artifact | Kind | Reaches visitors? | Evidence status |
|---|---|---|---|---|
| D1 | Rule register | facts | yes: `/methods`, every calculator | read from the game's source and checked three ways |
| D2 | Card catalog | facts | yes: `/codex`, `/advisor` | consistent with a second extraction of the same build |
| D3 | Character, opening-Ancient and Act 1 facts | facts | yes: `/advisor` | read from the game's source |
| D4 | Seed manifests | experiment design | no | hashed; the sealed partition is unread |
| D5 | Simulation batches | measurements | summaries on `/methods` | counts, audits and hashes below |
| D6 | Card-value sets (five classes) | fitted tables | yes: `/advisor`, `/codex` | each passed its registered held-out test |
| D7 | Opening-relic values | fitted table | yes: `/advisor`, `/methods` | the one pooled test passed |
| D8 | Combat libraries and demonstrations | training data | no | local only |
| D9 | Withdrawn data (`experiments/void/`) | **not evidence** | no | invalid, kept so the failure can be inspected |
| D10 | Synergy tags | judgement (facts of mechanics) | yes: `/advisor` | a judgement, read against simulated runs (M8) |
| D11 | Relic catalog | facts | yes: `/codex` | every relic has a model class and a pool in the decompiled build of the same version |
| D12 | Relic synergy tags | judgement (facts of mechanics) | yes: `/advisor` | a judgement read twice by blind readers and reconciled by a written rule; **not yet tested in simulation** |
| M1 | Exact calculators | mathematics | yes | 739 golden cases, published tables, brute force, properties |
| M2 | Draft advisor v1 (the deck index) | heuristic | yes | **uncalibrated**, never a probability; its synergy term is M8 |
| M3 | Card-value second opinion | ridge logistic regression | yes | held-out tests, per class |
| M4 | Opening-relic second opinion | ridge logistic regression | yes | pooled held-out test |
| M5 | Simulated pilots and searchers | policies | summaries only | paired held-out comparisons |
| M6 | Combat networks (BC v1, PPO v1, PPO v2) | neural networks | **no** | no improvement over the baseline |
| M7 | What does not exist | | | co-op, map, shop, rest, combat and Ancient-boon advisors; a live bridge |
| M8 | The synergy term and its evidence | heuristic, read against simulated runs and tested once on held-out seeds | yes | stage B1 read; the registered held-out stage B2 ran once and the term improves what a rules pilot picks in simulation (33.0 % against 26.0 % past the Act-1 boss, ADR-050) |

---

# Data cards

## D1. Rule register

* **What:** the rules of STS2 main v0.107.1 that SLAY2's calculators and advisor depend on, one row each with an id, the rule in our own words, its evidence and its status: run structure, ascension, card-reward rarity and the hidden pity counter, upgrades on reward cards, potions, "?" rooms, the merchant, gold, draw mathematics, build facts, the act map, rest sites, the Ancient heal, treasure, the opening Ancient, the two Act 1 versions and what can be done to a card.
* **Where:** `docs/game/MECHANICS-COVERAGE.md` is the source of truth; `scripts/export-site-data.mjs` exports it to `apps/web/src/content/rules.generated.json`, and a test fails when the export is stale.
* **Evidence classes:** E1 the decompiled game source, read locally from a rights-restricted checkout (ADR-011), recorded as facts and constants with a file-path citation and no copied code or text; E2 official statements; E3 sts.wiki; E4 Almanauts; E5 slaythespire.wiki.gg; E6 our own exact computation.

<!-- table:rules:begin -->
| Status | Rules |
|---|---|
| Verified against the game's own logic or official statements | 44 |
| Corroborated by independent secondary sources | 2 |
| Single secondary source or unverified | 0 |
| Recorded fact (build, implementation note) | 11 |
| **All rules in the register** (57 distinct ids) | **57** |
<!-- table:rules:end -->

* **Checked three ways** (docs/game/MECHANICS-COVERAGE.md, `packages/odds/test`): an independent Python oracle that shares no code with the TypeScript engines (739 golden cases of 16 kinds), the figures published by sts.wiki and Almanauts, brute-force enumeration and property tests (probabilities sum to one, monotonicity, symmetry).
* **Rights:** SLAY2's wording; no game text, art or code is copied. Third-party sources are cited, not mirrored.
* **Limits:** main v0.107.1 only. "Verified" means the rule matches the source as read on 2026-10-25 and 26, not an observation of the live game. The game is in Early Access, so any patch can change a rule; `scripts/patch-watch.mjs` compares Steam's announcements with the supported build weekly (it cannot see a patch with no announcement).

## D2. Card catalog

* **What:** 577 cards of v0.107.1: id, display name, class, rarity, type, cost, keywords, our own role tags (`roles`), a heuristic static-power estimate (`prior`, 0 to 100: not a probability and not validated against outcomes), whether the card can appear in a solo reward, the multiplayer-only flag and the unlock epoch that adds it to its class pool. **No card text, art or effect numbers.**
* **Where:** `packages/game-data/data/cards.sts2-main-0.107.1.json`, SHA-256 `6717e3d5d311588dda139d2c5dde1f5fe8493be3f9628ff013ac675f9608b147` (the site's `/api/v1/manifest` reports it).
* **Composition:** Defect, Necrobinder, Regent and Silent 88 cards each, Ironclad 87, colourless 64, event 27, curse 18, token 14, status 12, quest 3; by rarity 100 common, 219 uncommon, 155 rare, 19 basic, 18 ancient, 19 event, 18 curse, 16 status, 10 token, 3 quest. A solo reward pool per class holds 20 common, 35 uncommon and 25 rare cards.
* **Provenance:** derived by `sim/slay2_sim/catalog.py` on 2026-10-25 from two local, pinned, git-ignored, unlicensed references: `nkhoit/spire-archive` @ `4e6b0e0` (identifiers, names, class, rarity, type, cost, keywords) and `zhiyue/sts2-rl-agent` @ `5d874e8` (pool membership, unlock epochs, multiplayer constraints). Only facts are kept; the structured fields used to compute `roles` and `prior` are discarded.
* **Cross-check** (`docs/game/CATALOG-CROSSCHECK.md`): 576 of 577 ids have a counterpart in the simulator, with no cost, type or rarity mismatch. Two extractions of the same build agreeing is a consistency check on the extraction, **not** independent proof about the live game.
* **Rights:** ids, names, costs and types are factual identifiers, kept minimal with attribution (`docs/IP-COMPLIANCE.md`). The role tags and the prior are ours. A takedown request would mean removing the E1-derived parts and re-validating against other evidence.
* **Limits:** one build. The beta changes some cards, and the catalog does not follow it.

## D3. Character, opening-Ancient and Act 1 facts

* **What:** per class the starting HP (Ironclad 80, Silent 70, Regent 75, Necrobinder 66, Defect 75), gold, energy, starter deck and starter relic (`packages/game-data/data/characters.sts2-main-0.107.1.json`); the **28 opening options** of the Ancient Neow (20 helpful, of which 14 are always in the pool and 6 enter it in pairs, and 8 costly) with the counts and amounts each changes (`packages/game-data/src/ancient.ts`); and the two versions of Act 1, Overgrowth and Underdocks, with their elites and bosses (`src/acts.ts`).
* **Provenance:** read from the game's source on 2026-10-26 (E1), in our own words. Several opening results are random, so the advisor asks the player what the option did to the deck instead of guessing.
* **Limits:** the Ancients of acts two and three are not covered (the advisor gives no advice about them, and the simulator plays none, G11).

## D4. Seed manifests

* **What:** `experiments/seeds/ironclad-a0-v2.json` (SHA-256 `83340c3bad2eb48d369674172922646fc5c39fd8baa345908cd0f36e97e9f2e3`; `v1` is kept because older batches name it, and v2 keeps its `train`, `val` and `test` lists list for list): master seed 20261025, each seed `int(sha256("slay2-seed:{master}:{i}")[:4]) % 2147483647`, disjoint across partitions: `train` 5,000, `val` 2,000, `dev` 10,000, `test` 4,000 (sealed).
* **Use:** `train` and `dev` for exploration, fitting and tuning; `val` for registered held-out comparisons; `test` never. The same seed list is used for every class and every policy, so comparisons are paired by seed.
* **Limit:** the seeds drive the pinned simulator's .NET-family generator, not the game's, so a seed does not reproduce a live run (G4).

## D5. Simulation batches

* **What:** one directory per batch under `experiments/batches/` (and the exploration batches under `experiments/neow/` and `experiments/cardvalue/`): `manifest.json` (policy and resolved parameters with the SHA-256 of every values file it read, simulator id and pinned SHA, harness commit and whether tracked files were modified, the seed file and partition, the run configuration, the known gaps, `class_start_verified`, outcome counts with Wilson interval, hashes of the episode file), `episodes.jsonl.gz` (one record per seed, errors and timeouts included with their outcome) and the audits that were run (`sample-audit.json`, `wins-audit.json` with the replayed traces, `rederivation-audit.json`). Every batch is listed with its hashes in `docs/REPRODUCIBILITY.md`.
* **Completed games** (a win or a death; every batch of the repository except the withdrawn ones; the same seeds are played by several policies, so these are not independent games):

<!-- table:games:begin -->
| Class | Seeds used for | Batches | Games started | Completed (win or death) | Wins | Simulator errors | Timeouts |
|---|---|---|---|---|---|---|---|
| Defect | held-out (val) | 6 | 12,000 | 11,981 | 33 | 19 | 0 |
| Defect | development (train, dev) | 14 | 22,000 | 21,912 | 54 | 88 | 0 |
| Ironclad | held-out (val) | 9 | 16,300 | 16,258 | 30 | 42 | 0 |
| Ironclad | development (train, dev) | 26 | 31,910 | 31,768 | 109 | 132 | 10 |
| Necrobinder | held-out (val) | 6 | 12,000 | 11,980 | 0 | 20 | 0 |
| Necrobinder | development (train, dev) | 16 | 23,000 | 22,909 | 0 | 86 | 5 |
| Regent | held-out (val) | 6 | 12,000 | 11,918 | 2 | 10 | 72 |
| Regent | development (train, dev) | 14 | 22,000 | 21,781 | 1 | 60 | 159 |
| Silent | held-out (val) | 6 | 12,000 | 11,999 | 0 | 1 | 0 |
| Silent | development (train, dev) | 14 | 22,000 | 21,989 | 0 | 11 | 0 |
| **All classes** | **held-out (val)** | **33** | **64,300** | **64,136** | **65** | **92** | **72** |
| **All classes** | **development (train, dev)** | **84** | **120,910** | **120,359** | **164** | **377** | **174** |
<!-- table:games:end -->

* **Outcome rule:** a win is an episode that ended won after the third act's boss (`docs/game/MECHANICS-COVERAGE.md` RUN-2); a death ends it lost; a timeout (step, stall, turn or 900-second wall-clock limit), a simulator error and an invalid action are separate outcomes, are shown, and are never counted as losses or silently dropped. A timeout or an error is excluded from the denominator of a rate and the exclusion is reported.
* **Audits:** every win of every held-out batch is re-run and replayed observation hash for observation hash (`audit wins`: 53 wins in held-out batches, all verified); a 40-game random sample of every held-out batch is re-derived (`audit sample`); all 10,000 games of the five `rules_v2` held-out batches were re-derived in full and 9,994 reproduced exactly, the six that differ kept their outcome and act (RT-6-01, ADR-037). Not every game is re-derived: the development batches and the older `rules_v1` and `random_legal` batches have the sample audit or none (`docs/ADVERSARIAL-AUDIT.md`, campaign 6).
* **Known gaps of the simulator** travel with every batch (`gaps.json`, ADR-024):

<!-- table:gaps:begin -->
| Gap | Affects | From Ascension | What is different |
|---|---|---|---|
| G1 | results | 10 | A10 Double Boss is not modelled: the second Act-3 boss is rolled but the map has no second boss point and the run is won after the first boss (game: StandardActMap.SecondBossMapPoint, one row above the boss). Simulator A10 win rates are therefore NOT Double Boss win rates. |
| G2 | coverage | 8 | Living Shield, Scroll of Biting and The Merchant??? ignore the A8 HP increase (97 of 100 audited enemy rows match). |
| G3 | coverage | 0 | is_sovereign_blade(None) raises in rare power/attack interactions (~1 in 2,000 random games); such games are reported as simulator_error and excluded from win rates. |
| G4 | results | 0 | The simulator ports .NET System.Random; the game uses xoshiro256** (v0.107.1). Distributions match where audited, but no seed reproduces a live run and per-card roll order differs. |
| G5 | results | 0 | State transitions have not been compared with a live STS2 build (no owned game in this environment). |
| G6 | coverage | 0 | The three options of a trading event (`events/act2.py`) call `_roll_random_relic_rewards`, which that module does not import from `events/shared.py`, where it is defined (NameError): 2 of 2,000 rules_v1 validation games ended as simulator_error and are excluded from win rates, never counted as losses. With the relics a run gains kept (G14) the event is reached more often: 32 of 2,500 development games. |
| G7 | coverage | 0 | In 1 of 2,000 rules_v1 validation games the run was not over but the simulator offered no legal action; the episode is reported as simulator_error and excluded from win rates. |
| G8 | coverage | 0 | Buying a card in a shop while holding Lucky Fysh (+15 gold per card added) and Dragon Fruit (max HP on gold gained) raises `TypeError: unhashable type: 'PlayerState'` in the pinned simulator (Dragon Fruit's gold handler looks the owner up in a dict keyed by creature). Seen in 1 of 2,000 rules_v1 Silent validation games (seed 605866524, Act 2); the episode is reported as simulator_error and excluded from win rates and paired comparisons. |
| G9 | coverage | 0 | Regent's Particle Wall (catalog: 0 energy and 2 stars; gains block and returns to hand) is offered again at cost 0 after every play in the pinned simulator, and the rules policies keep playing it: 33 of 5,000 Regent exploration games (0.66 %) reached the 20,000-step limit with block in the hundreds of thousands. Such games end as timeout, are excluded from card values and paired comparisons and are never read as losses. Whether the simulator charges the stars was not examined; the policies have no guard against replaying a card that returns to hand. |
| G10 | coverage | 0 | The pinned simulator caches some card lookups lazily; the first lookup of a card in a process takes the next card-instance id without returning it (e.g. the first upgrade of a Vicious card, via capture_self_mutating_card_progress). So a game's ids, and in rare situations a pile (Anger's added copy was missing from the discard pile), depended on how many games its process had already played. The harness now puts every process in the same state before its first game (warmup.py, ADR-037); batches written before that fix were produced with the first games of each worker in the other state, and are checked by `audit rederive`. |
| G11 | results | 0 | The game opens every act with an Ancient event that first heals the player (all the missing HP, 80 % of it from Ascension 2) and then offers a boon. The pinned simulator plays the opening event of a run (Neow) but has none in acts two and three: its runs start those acts on the map with the HP the previous boss left, and the boons are not modelled. A harness variant (`ancient_heal`, off in every other batch) restores the heal. On 498 paired development games of `rules_v2` (Ironclad, A0) it removes most deaths in the first five rooms of Act 2 (135 to 53) but the games end a little later instead of not at all: 25 to 28 games reach Act 3, mean floors +0.96 (95 % bootstrap +0.53 to +1.39), wins 2 against 0 (p = 0.5). Simulated results here are therefore from a simulator that is harsher than the game at the start of acts two and three, by an amount measured to be small for this pilot (ADR-039). |
| G12 | coverage | 0 | Act 1 of the game comes in two versions, Overgrowth and Underdocks, with different elites, bosses and ordinary fights. The pinned simulator's three-act run is Overgrowth, Hive, Glory; Underdocks exists in it only as the simulator's 'extra act' (an act index beyond the third) and the harness never plays it, so every simulated game, and every card value measured from them, is an Overgrowth game. This is not a fourth act: the game has three (ADR-048). |
| G13 | results (Necrobinder) | 0 | The pinned simulator starts a Necrobinder run with 75 HP; the game's own source (CharacterModel.StartingHp of the Necrobinder) says 66. Every simulated Necrobinder result, the card values and the held-out tests among them, starts 9 HP (14 %) above the game and makes the class look sturdier than it is. A harness variant (`game_hp`, off in every other batch) starts the class with the game's number. On 499 paired development games of `rules_v2` (Necrobinder, A0) it lowers the share of runs that get past the Act-1 boss from 63.5 % to 51.5 % (86 pairs one way, 26 the other, exact McNemar p = 1.1e-8) and the mean floors reached from 19.7 to 18.1 (difference -1.63, 95 % bootstrap -2.10 to -1.16); no game is won either way. So the level of every simulated Necrobinder number is too high, by an amount measured for this one pilot; whether the order of choices (cards, relics) holds at 66 HP has not been measured (ADR-049). Found on 2026-10-26 by comparing the simulator's starting state with the repository's class facts (the other four classes' starting HP and every class's starter deck match the game). |
| G14 | results | 0 | A run in the pinned simulator keeps the relics it holds when its first fight starts (the starting relic and the opening Ancient's pick) and loses every relic it gains afterwards: relics from chests, shops, elites, events and bosses are dropped when the next fight starts. The cause is in the simulator: `RunState.relics` is an alias of the player's relic list, the setup of the first fight gives the player a new list, the alias goes stale, and every later fight rebuilds the player's relics from it. So 97.05 % of the 19,717 Act-1 boss decks of the exploration batches hold exactly two relics, 2.95 % three, none more, and every simulated result here, the card values and the held-out tests among them, comes from a game whose runs never keep a boss, elite, chest or shop relic. A harness variant (`keep_relics`, off in every other batch) points the alias back at the player's list after every action. On 2,444 paired development games of `rules_v2` (500 seeds per class, A0) it lifts the share of runs that get past the Act-1 boss from 52.5 % to 63.1 % (325 pairs one way, 67 the other, exact McNemar p = 9.6e-42; every class, from Ironclad 63.2 to 77.1 % to Necrobinder 62.8 to 69.3 %), past the Act-2 boss from 2.1 % to 9.1 %, the mean floors reached by 3.04 (95 % bootstrap 2.81 to 3.28; Ironclad 5.40), and wins from 2 to 34 (Ironclad 0 to 25 of 481, Defect 2 to 9; every win re-derived). The simulator as it is is therefore much harsher than the game on this one point, by more than any pilot difference measured in this project; whether the order of choices (cards, pilots, opening relics) holds with relics kept has not been measured (ADR-052). |
<!-- table:gaps:end -->

* **G14 changes every level (ADR-052).** The simulator drops every relic a run gains after its first fight, so every batch above except the ten `g14-*` development batches was played in a game whose runs hold two relics (the starting relic and the opening Ancient's pick). The ten `g14-<class>-{base,keeprelics}-dev-n500` batches are `rules_v2` on development seeds 0 to 499 of each class with and without the harness variant that keeps them (`keep_relics` in the manifest's config, absent otherwise): past the Act-1 boss 52.5 % to 63.1 % over 2,444 pairs, mean floors +3.04, wins 2 to 34. They are sensitivity evidence, never a headline report; the registered results compared two arms inside the simulator as it is and are not evidence that their orderings hold with relics kept.

* **Rights:** the games are produced by running a third-party simulator locally; only our own records of them (outcomes, floors, decks as card ids, counts, hashes) are committed. No simulator code, no decompiled text and no card text is committed (`scripts/guard-third-party.sh` runs before every commit and in CI).

## D6. Card-value sets

* **What:** for each class, a value per card (the change in the log-odds of getting past the Act-1 boss from one more copy in the deck, with a seed-bootstrap interval), measured on runs whose card picks were randomised so that chance, not taste, decided the deck. `experiments/cardvalue/<class>-a0-v<n>.json`, chosen for the site by `experiments/cardvalue/site-sets.json`, exported to `apps/web/src/content/cardvalues.generated.json`.
* **Data:** exploration batches of 5,000 simulated runs per class (`experiments/cardvalue/explore-*`; Ironclad's second set from `explore3-ironclad-a0-dev-o5000-n5000`, played by the tuned pilot `rules_v3`, ADR-046), Ascension 0, profile `veteran`. A run enters the fit if it reached the Act-1 boss; the outcome is whether it got past it.

<!-- table:cardvalues:begin -->
| File | Class | Runs that reached the Act-1 boss | Passed it | Cards valued | Cross-validated AUC · log-loss (covariate-only log-loss) | Spearman with the hand-written rating | Held-out test: past the Act-1 boss, pilot with these values · comparator (exact McNemar p) |
|---|---|---|---|---|---|---|---|
| `ironclad-a0-v2.json` | Ironclad | 4269 | 54.9 % | 95 | 0.869 · 0.447 (0.545) | 0.44 | 79.4 % · 74.8 % against first values (2.6e-05) |
| `silent-a0-v1.json` | Silent | 2332 | 10.7 % | 75 | 0.878 · 0.241 (0.263) | 0.43 | 18.5 % · 11.5 % against rules_v1 (8.5e-13) |
| `regent-a0-v1.json` | Regent | 2703 | 22.4 % | 88 | 0.898 · 0.323 (0.398) | 0.07 | 49.7 % · 14.0 % against rules_v1 (3.9e-154) |
| `necrobinder-a0-v1.json` | Necrobinder | 3389 | 44.0 % | 91 | 0.915 · 0.367 (0.406) | 0.43 | 62.1 % · 47.8 % against rules_v1 (5.9e-30) |
| `defect-a0-v1.json` | Defect | 3212 | 40.3 % | 92 | 0.903 · 0.385 (0.492) | 0.27 | 76.2 % · 34.5 % against rules_v1 (7.2e-167) |
<!-- table:cardvalues:end -->

* **How to read the table:** the held-out column is the registered test of the *values*: a pilot that follows them against the same pilot without them (`rules_v1` for the first sets; for Ironclad's second set, against the pilot following the first set), on the 2,000 `val` seeds. The cross-validated AUC and log-loss are held out by seed within the fit; the covariate-only log-loss is the same model without any card (HP fraction, maximum HP, potions, upgrades, the boss and the common relics). The Spearman column is the correlation with the hand-written rating the advisor used before: **0.07 for Regent says the hand-written ratings had almost no relation to what the simulator measured for that class**.
* **Fairness and information:** the fit uses what a player could see at the boss (the deck, HP, potions, relics) and the outcome; no seed, no RNG state, no draw order.
* **Limits (they travel with the numbers on the site):** simulated by one rules pilot, in an unverified simulator, at Ascension 0, in Overgrowth only (G12), with no Ancient in acts two and three (G11) and **no relic kept after a run's first fight (G14: the values were measured where a run holds two relics, and whether they keep their order with relics kept is unmeasured)**; the model is additive, so synergies are invisible; a card the pilot plays badly is undervalued; **Silent's pilot wins none of its held-out games, so its values are conditional on weak play**; a Necrobinder starts with 75 HP in the simulator and 66 in the game (G13: 12 points fewer past the Act-1 boss at 66 HP on development seeds), so Necrobinder levels are too high and the site says so beside every Necrobinder number.

## D7. Opening-relic values

* **What:** a value per opening relic, relative to the average relic taken, for all five classes pooled with a class term. `experiments/neow/neow-values-v2.json`, SHA-256 `b1afa02c47c5bc74df31ed2d8d40ae53dc5b514c34a07e4e5399ed474845877c`, frozen and pushed to the remote at 18:02:30 UTC before the first held-out game (18:02:39 UTC) of the registered study (ADR-049).
* **Data:** 15,000 exploration games on `train` seeds (3,000 per class, exact class ids, each game's start checked against its class), the relic taken at random among the three offered; 14,933 analysed, 67 not counted (32 simulator errors, 35 timeouts: never losses). The unit of resampling and of cross-validation is the seed, because the five classes' games of one seed share the offer.
* **Model:** ridge logistic regression, penalty 10 chosen by 5-fold seed-grouped cross-validation, 200 bootstrap draws; cross-validated AUC 0.724 and log-loss 0.600 against 0.611 for the class-only model, so the relic terms add a modest but real predictive signal beyond the class: a predictor that knows only the class scores an AUC of about 0.71 on the same games (computed from the per-class pass rates of the file), so the relics add about 0.02 of AUC and 0.011 of log-loss.
* **Held-out test** (ADR-049, one pooled exact McNemar test, level 0.05, per-class rule written in advance): the pilot taking the largest-valued relic got past the Act-1 boss in 61.05 % of 9,932 pairs completed by both against 54.30 % for the same pilot taking the first helpful relic (1,487 pairs only with the rule, 817 only with the baseline, p = 9.1e-45; +6.75 points, 95 % +5.75 to +7.77 resampling whole seeds). The secondary mean-floor difference, +1.27 (+1.13 to +1.41), resamples pairs and not seeds, so its interval is narrower than a seed-clustered one would be; wins were 29 against 14 (24 pairs only with the rule, 9 only with the baseline, p = 0.014). Every class was ahead on its own (the per-class rows of the comparison table in M5), so the site shows the rule's choice for all five classes, labelled as a simulated, unverified second opinion.

<!-- table:relics:begin -->
| Relic | Kind | Value β (log-odds, 95 % bootstrap by seed) | Offered | Taken | Past the Act-1 boss when taken · when offered and not taken | Flag |
|---|---|---|---|---|---|---|
| Silver Crucible | cursed | +0.90 (+0.66 to +1.16) | 1824 | 533 | 73.6 % · 54.5 % |  |
| Large Capsule | cursed | +0.50 (+0.32 to +0.67) | 1935 | 723 | 65.3 % · 53.0 % | more simulator errors and timeouts than chance explains |
| Silken Tress | cursed | +0.49 (+0.34 to +0.69) | 1917 | 605 | 65.5 % · 53.1 % |  |
| Nutritious Oyster | positive | +0.47 (+0.27 to +0.72) | 962 | 318 | 65.7 % · 54.4 % |  |
| Neows Talisman | positive | +0.35 (+0.14 to +0.61) | 923 | 348 | 62.9 % · 55.6 % |  |
| Fishing Rod | positive | +0.31 (+0.12 to +0.49) | 1849 | 603 | 61.5 % · 53.9 % |  |
| Pomander | positive | +0.18 (-0.07 to +0.47) | 870 | 295 | 59.0 % · 57.2 % |  |
| Small Capsule | positive | +0.17 (-0.06 to +0.45) | 738 | 210 | 59.1 % · 55.9 % |  |
| Lost Coffer | positive | +0.16 (-0.02 to +0.30) | 1980 | 647 | 58.3 % · 55.4 % |  |
| Stone Humidifier | positive | +0.12 (-0.13 to +0.45) | 1103 | 319 | 57.7 % · 53.2 % |  |
| Lead Paperweight | positive | +0.10 (-0.06 to +0.29) | 1888 | 695 | 57.1 % · 55.6 % |  |
| Scroll Boxes | positive | +0.07 (-0.08 to +0.23) | 1923 | 668 | 56.3 % · 54.4 % |  |
| Winged Boots | positive | +0.05 (-0.12 to +0.22) | 1988 | 647 | 55.8 % · 52.6 % |  |
| Neows Torment | positive | -0.02 (-0.25 to +0.15) | 1914 | 644 | 54.2 % · 56.3 % |  |
| Phial Holster | positive | -0.03 (-0.21 to +0.11) | 2120 | 729 | 54.0 % · 54.4 % |  |
| Golden Pearl | positive | -0.23 (-0.42 to -0.01) | 1628 | 529 | 49.5 % · 55.9 % |  |
| Cursed Pearl | cursed | -0.25 (-0.43 to -0.09) | 1793 | 639 | 49.1 % · 50.9 % |  |
| Booming Conch | positive | -0.26 (-0.45 to -0.09) | 1995 | 629 | 49.0 % · 55.0 % |  |
| Hefty Tablet | cursed | -0.27 (-0.44 to -0.11) | 1870 | 587 | 48.7 % · 55.0 % |  |
| Kaleidoscope | positive | -0.28 (-0.45 to -0.10) | 1763 | 635 | 48.4 % · 52.0 % |  |
| Neows Bones | cursed | -0.29 (-0.45 to -0.12) | 1968 | 644 | 48.1 % · 53.4 % |  |
| Precarious Shears | cursed | -0.31 (-0.47 to -0.16) | 1834 | 594 | 47.6 % · 55.1 % |  |
| Arcane Scroll | positive | -0.34 (-0.51 to -0.16) | 1744 | 628 | 47.1 % · 56.2 % |  |
| Lava Rock | positive | -0.34 (-0.59 to -0.06) | 900 | 295 | 46.4 % · 47.6 % |  |
| Leafy Poultice | cursed | -0.35 (-0.50 to -0.17) | 1792 | 595 | 46.9 % · 53.2 % |  |
| New Leaf | positive | -0.40 (-0.62 to -0.22) | 1852 | 584 | 45.6 % · 56.8 % |  |
| Precise Scissors | positive | -0.51 (-0.68 to -0.36) | 1726 | 590 | 43.0 % · 52.5 % |  |
<!-- table:relics:end -->

* **Reading the table:** the values are estimates from 3,000 draws of a relic per class and 27 relics, with shrinkage toward the average (relics taken in fewer than 30 games count as 0). The last two columns are raw pass rates and are confounded by the class mix of the offers; the value column is the adjusted one. Large Capsule is flagged: 12 of its 735 games ended in a simulator error or a timeout, more often than chance explains, so its value is the least certain.
* **Limits:** one rules pilot that ignores effects it cannot use (such as free travel), Overgrowth only, Ascension 0, an unverified simulator, no Ancient in acts two and three, the Necrobinder start-HP gap (G13: the rule's effect at 66 HP is unmeasured) and the dropped relics (G14: the Ancient's relic was measured where it is the only extra relic a run ever holds).

## D8. Combat libraries and demonstrations

* **What:** states captured at the start of real simulated combats (1,558 `train` and 398 `val` snapshots by room type, `experiments/rl/results/combat-ppo-v1-run1.json`) and 159,893 decisions from 7,953 won `train` combats played by `rules_v1` (`combat-bc-v1.json`), used to train and judge the networks of M6. They are not committed (only the result files are); the checkpoints are git-ignored and their SHA-256 are recorded in the result files.
* **Limits:** simulator states, one class (Ironclad), Ascension 0.

## D9. Withdrawn data

* `experiments/void/` holds the first opening-relic study (25,000 games, a fit, a pushed hash, a pooled test that said "passed"): it was played with lower-case class ids, the pinned simulator plays any class id it does not match exactly as Ironclad, so four of the five classes were Ironclad with another class's cards. It is **not evidence**, shows nowhere on the site, and is kept with the reason so the failure can be inspected. Every audit passed because an audit re-runs a game from its manifest and reproduces the same wrong class; the harness now refuses an inexact class id and checks every game's starting HP and deck against its class (ADR-049, RT-6-02).

## D10. Synergy tags

* **What:** `packages/game-data/data/synergy.sts2-main-0.107.1.json`: for every tagged card, what it **supplies** to a deck (`g`, per mechanic, 1 minor or conditional, 2 standard, 3 major or repeatable; negative when it takes the mechanic away) and what its worth **needs** (`w`, 1 a bonus, 2 significant, 3 the card's point), over a vocabulary of 27 mechanics (Strength, Dexterity, Block, Exhaust, card draw, energy, Vulnerable, Weak, Poison, Shivs, discarding, orbs, Focus, Stars, Forge, card creation, Osty, Souls, Doom, Ethereal cards, losing HP, Attacks, Skills, Powers, cheap and free cards, Strikes), each with a saturation scale and an engine value; plus what each class's starting relic supplies in every combat (`innate`). The code adds what the catalog says by itself (types, costs, Strike names, the Exhaust and Ethereal keywords, the block role, Sly), so the file lists only what the catalog cannot say.
* **Provenance:** SLAY2's own judgement, written from reading each card's effect in the local reference (ADR-011). It stores ids, mechanic names and small whole numbers, never card text, art or effect numbers. The hash (`bd0b8a9f…`) covers the mechanics, the cards and the innate supplies. **Three revisions on 2026-10-26** (the third, below, after an independent second reading) (recorded in the file and in ADR-050), both after reading the tags against the simulated runs (M8): the table gained the starting-relic supplies, which the first version lacked, and then the Necrobinder's Osty became always on, Kingly Kick, Kingly Punch and six Defect Status payoffs stopped needing their mechanic, and the Status mechanic left the vocabulary, because in the runs the decks that got further had more of those needs unmet and the game's own card texts say why. **The third revision** followed an independent re-tagging of every card by six readers (blind, from the game's own card data; ADR-050 addenda A and B): 62 pairs of card, side and mechanic on 51 cards were corrected (a card's second effect written, a need the card meets by itself or its class cannot meet lowered or dropped, signed losses written, and the Defect's Status payoffs made needs of card creation again because the card texts and the patch notes say they trigger on Statuses the player creates, which the second revision had got wrong); the table is frozen until the held-out test is over.
* **Coverage:**

<!-- table:synergy_coverage:begin -->
| Class | Reward cards | With written tags | Starting relic's supply (the table's `innate`) |
|---|---|---|---|
| Ironclad | 82 | 70 (85 %) | none (the starting relic heals after combat) |
| Silent | 82 | 68 (83 %) | Ring of the Snake: draw 1 |
| Regent | 82 | 68 (83 %) | Divine Right: star 2 |
| Necrobinder | 82 | 68 (83 %) | Bound Phylactery: osty 9 |
| Defect | 82 | 71 (87 %) | Cracked Core: orb 1 |
| All tagged cards in the table | | 385 (hash `bd0b8a9fd4f9`) | 27 mechanics |
<!-- table:synergy_coverage:end -->

* **Intended use:** the advisor's synergy term and the sentences that name the cards behind a number. **Not for:** saying how strong a card is, or what wins: the weights are hand-set judgements (partly calibrated against simulated runs, M8), not measurements.
* **Limits:** a weight of 1 to 3 is coarse; the vocabulary is SLAY2's reading, not the game's; cards without an entry are read from the catalog alone (a plain attack or block needs nothing); the Silent's Sly cards want a way to discard (counted from the keyword); only four classes have an innate supply; the table is for build `sts2-main-0.107.1` and is not carried to another.
* **Kept true by:** a strict schema (an unknown mechanic or a zero weight fails the build), the hash test, a test that every mechanic has a source and a payoff, spot facts per class (`packages/game-data/test/synergy.test.ts`), scenario tests an experienced player can judge (`packages/decision/test/synergy-scenarios.test.ts`), and the golden file that ties the Python port to the TypeScript.

## D11. Relic catalog

* **What:** the 296 relics of v0.107.1: id, display name, rarity tier and the relic pools that list the relic. **No relic text, art or effect numbers**; the archive's one-line description is read by nothing in the derivation.
* **Where:** `packages/game-data/data/relics.sts2-main-0.107.1.json`, SHA-256 `4febf1f299f6a2dbb69a1491094d09513a20af8a561fae413784c638b15f9803` (the content hash of the file's body; `sim/tests/test_catalog.py` recomputes it, and the Codex shows its first twelve characters).
* **Composition:** by tier 100 ancient, 50 rare, 40 uncommon, 35 event, 30 common, 30 shop, 10 starter and one placeholder (the fallback pool's Circlet); by pool 8 relics for each class, 118 shared, 140 event (three relics are in both) and the fallback. The archive has no boss tier in this build.
* **Provenance:** derived by `sim/slay2_sim/catalog.py` on 2026-10-27 from the same two local, pinned, git-ignored, unlicensed references as D2: `nkhoit/spire-archive` @ `4e6b0e0` (ids, names, tiers) and `zhiyue/sts2-rl-agent` @ `5d874e8` (the pools of `Models.RelicPools`, and that each of the 296 ids has a model class in `Models.Relics`). The derivation refuses a relic that has no class or no pool.
* **Cross-check:** all 296 relic ids have a model class in the decompiled build (two classes more are not relics: the removed-relic placeholder and a card-selector helper); each class's starting relic is a starter in its own pool and matches `characters.sts2-main-0.107.1.json`. Two extractions of the same build agreeing is a consistency check on the extraction, **not** independent proof about the live game.
* **Rights:** ids, names and tiers are factual identifiers, kept minimal with attribution (`docs/IP-COMPLIANCE.md`); what a relic does is the game's text and is not stored. A takedown request would mean removing the E1-derived parts.
* **Limits:** one build; the catalog says where the game can offer a relic, not how likely it is; the advisor does not read it yet (the relics of a run are not an input of the draft index, and the index says so).

## D12. Relic synergy tags

* **What:** `packages/game-data/data/relic-synergy.sts2-main-0.107.1.json`, SHA-256 `836676b1dafed94ce20891e39832cb35c87d362b52eb77e51bfc28fd83ebe6c1`: for the relics that provide something to a deck, what they provide (`g`, per mechanic of the card table, 1 minor or conditional, 2 standard, 3 major or every turn, negative when the relic takes the mechanic away). Ids, mechanic names and small whole numbers; no relic text, art or numbers. A separate file from D10, so the card table keeps the hash the registered held-out result (M8) names.
* **Provenance:** SLAY2's own judgement, made by two blind readings of every relic from the local reference (ADR-011) and a written reconciliation rule (ADR-051): `experiments/synergy/relics/reading-a.json`, `reading-b.json` (tags only), `reconciliation.json` (the rule and one decision with a reason for each mechanic only one reader wrote), built by `sim/slay2_sim/relicreading.py`, which a test runs again. What a relic's value depends on was read too and is kept in the readings, not in the table (the index counts no engines).

<!-- table:relic_reading:begin -->
| Reading | Count |
|---|---|
| Relics in the catalog | 296 |
| Tagged by reader A / by reader B | 140 / 143 |
| Tagged by both / by A only / by B only / by neither | 138 / 2 / 5 / 151 |
| Of those tagged by both: identical in what they provide and depend on | 104 of 138 |
| Of those tagged by both: the same mechanics provided | 130 of 138 |
| Marked unsure by A / by B | 27 / 24 |
| Mechanics both readers wrote, same magnitude / one step apart (the lower is kept) | 95 / 13 |
| Mechanics only one reader wrote, kept / left out (each with its reason) | 1 / 13 |
| Starting relics and their upgrades (counted by the card table's innate supply) | 10 |
| **Relics with an entry in the table** | **101** |
<!-- table:relic_reading:end -->

* **Intended use:** the advisor counts a relic the player lists as a supplier of the mechanics it provides, like a card that provides them, and names it in the reasons. **Not for:** saying a relic is strong or weak, or anything about what a relic does beyond supplying a mechanic.
* **Limits:** **not tested in simulation** (the page says so beside the panel): the claim is of the kind the card table's was before its held-out test. It could not have been tested in the simulator as it is: its runs keep two relics (G14, ADR-052), so a relic's supply changes the index in about 1 % of boss decks; with the harness variant that keeps relics a test is possible, and a development pair showed it would see nothing: counting the relics changes the pilot's deck in 2.7 % of games (ADR-051 addendum A), so no held-out test was registered. A relic that only multiplies a mechanic it cannot make (Strength, Poison) and one that acts only at a rest site or shop are read as nothing; drawbacks (a cap on cards played, a Status shuffled into the draw pile, a cost in gold) are not modelled; the starting relics' upgrades are not an input; a class's starting relic is counted by the card table's `innate`, not here.
* **Kept true by:** `packages/game-data/test/relic-synergy.test.ts` (the hash, only catalog relics and card-table mechanics, no starting relic, spot facts, what is left out), `sim/tests/test_relicreading.py` (the committed table is what the readings make, the lower magnitude, a decision for every one-reader mechanic), the golden cases of the index with relics (`packages/decision/test/golden/advisor-index.json`, reproduced by the Python port) and the end-to-end tests of the relics panel.

---

# Model cards

## M1. Exact calculators

* **What:** `packages/odds`: card-reward rarity with the hidden pity counter (a posterior over counter states from a partial history, and pack forecasts), upgrade chances, potion drops, "?" rooms, draws without replacement (opening hand, joint draws, one reshuffle), shop prices and card removal, gold, and **Route Lab** (up to three typed routes compared exactly). Exact rational arithmetic (`BigInt`); an integer fast path for untrusted requests, proven identical to the rational reference.
* **Intended use:** answering "what are the chances?" for a state the player typed in, with the assumptions named on every result. **Not for:** claiming which route is safer, predicting a fight, anything outside main v0.107.1 (the beta is refused).
* **Evaluation:** see D1 (739 golden cases, published tables, brute force, properties) and `docs/TEST-REPORT.md`. There is no sampling error: the answers are exact for the rules as recorded.
* **Information:** inputs are what the player has seen or can reconstruct. A hidden counter is a belief: an omitted history is refused rather than assumed to be the start of the run (RT-3-01).
* **Limits:** the unmodelled parts are listed in each result (first-run scripting, relic hooks that change packs, retain and ethereal cards in draws).

## M2. Draft advisor v1 (the deck index)

* **What:** `packages/decision`: ranks the offered cards and skip by a unit-less **deck index**: the mean static rating of the cards, act-dependent role coverage with diminishing returns, an energy-curve penalty, a deck-size penalty and a **synergy term** (M8: what unmet needs take from a card's rating, what Strength, Dexterity and Focus add to the cards they help; the engines a deck builds are found and named, and the index counts none of their value, ADR-050 addendum D). It explains every number with the cards behind it, shows the engines the deck has built and the cards waiting for support, and tests the stability of its top choice under random changes to its own weights; it tilts the ranking by the Act 1 version and boss (at most 30 %, a judgement, labelled).
* **Intended use:** a reasoned starting point for a draft decision. **Not for:** a win probability. The index is **not calibrated**, and the API says so in every answer; the only outcomes compared with it are the simulated runs of M8 and the second opinion below (which found the hand-written ratings a poor guide: Spearman 0.07 to 0.44 with the measured values).
* **Information:** the player's own deck and class, the offer, the act, the ascension and the Act 1 version; nothing hidden.
* **Limits:** the card rating (`prior`) is rarity plus a bounded stat adjustment and is the weakest part: the index rates a deck by the mean of it, so a card rated above the deck's mean always raises the index and skipping almost never ranks first (a simulated pilot following it took 1,977 of 1,986 offered cards in a smoke run); the synergy term is a judgement of mechanics (D10); sequencing, how many triggers a turn really gives and class resources a tag cannot express are not simulated (the response lists them per class); it advises the draft only, not how to play cards against enemies, which the user's feedback of 2026-10-26 named and which stays out of scope.

## M3. Card-value second opinion

* **What:** the additive ridge logistic regression of D6 and the rule built on it: take the offered card with the largest value if it exceeds 0 (the average card), otherwise skip. The site shows what that rule would take, each offered card's value with its interval and a plain statement when it differs from the heuristic. The rule is ported to TypeScript and checked against the Python policy on 80 golden cases (`apps/web/test/simulation-pick.test.ts`).
* **Intended use:** a labelled second opinion beside the heuristic. **Not for:** "this card wins runs": the values are simulated, one-pilot, additive.
* **Evaluation:** the registered held-out tests in the D6 and M5 tables. A pilot following the values got past the Act-1 boss more often than the same pilot without them in all five classes (each test significant at its registered level). It also won 6 games against none for Ironclad (p = 0.031) and 7 against none for Defect (p = 0.016); the Regent difference is one game against none, and Silent and Necrobinder won none either way.
* **Fairness:** the same code serves all five classes; each class is shown only the values measured for it; classes with weaker pilots show weaker evidence and say so.
* **Limits:** see D6; the values are additive, so a card that is good only with others is undervalued and a good-in-isolation card is not penalised for a deck that cannot use it.

## M4. Opening-relic second opinion

* **What:** the model of D7 and its rule: among the three relics offered, the one with the largest value (a relic not in the file counts as 0). The site compares the three offered relics with each one's estimated chance for the player's class (95 % interval, games behind it) and names the rule's choice, labelled simulated and unverified.
* **Intended use:** a comparison to think with. **Not for:** deciding a run: a player's plan matters more than one number, and the values come from a pilot that cannot use every effect.
* **Evaluation:** the pooled held-out test of D7. The rule takes a costly relic in 41 % of games, which it is allowed to.
* **Limits:** see D7.

## M5. Simulated pilots and searchers

Policies in `sim/slay2_sim/policies/`. Each sees only the **fair observation** (what a human sees) and the list of legal actions, never the manager, the seed or any RNG; search policies get a forward model that hands out only fairly determinized clones (hidden draw order and every RNG stream replaced by a sample that depends on the visible state alone).

| Policy | What it is |
|---|---|
| `random_legal` | uniformly random legal action: the floor |
| `rules_v1` | hand-written rules for every phase of a run; no forward model; the baseline every other method is compared with |
| `rules_v2` | `rules_v1` taking cards by the measured values of M3 (threshold 0) |
| `rules_v3` | `rules_v2` with three elite-fight thresholds tuned on development seeds (Ironclad, ADR-036 and ADR-045) |
| `rules_v2_neow_values` | `rules_v2` taking the opening relic with the largest value of M4 |
| `rules_explore`, `rules_explore_v2`, `rules_explore_v3`, `rules_v2_neow` | randomised card picks (the later ones around the pilots above) / randomised opening relic, for *measuring* values, not for playing well |
| `ppo_combat_v1` | `rules_v1` with a trained combat network (M6) |
| `search_v1`, `search_v2`, `search_v3` | determinized turn search on clones; `search_v3` does not punish a kill for the creatures it spawns (ADR-033); `search_v3` over every fight is about 105 times slower than the rules |

**Held-out results per pilot and class** (`val`, 2,000 games per batch except `search_v3`, 300; mean floor over the batch's completed games; paired comparisons use only the pairs both games completed, which moves a mean by a few hundredths):

<!-- table:policies:begin -->
| Pilot | Class | Games | Completed | Wins | Wilson 95 % for the win rate | Mean floor | Simulator errors · timeouts |
|---|---|---|---|---|---|---|---|
| random_legal | Ironclad | 2000 | 2000 | 0 | 0.00 to 0.19 % | 4.48 | 0 · 0 |
| rules_v1 | Defect | 2000 | 1999 | 0 | 0.00 to 0.19 % | 15.93 | 1 · 0 |
| rules_v1 | Ironclad | 2000 | 1997 | 0 | 0.00 to 0.19 % | 18.08 | 3 · 0 |
| rules_v1 | Necrobinder | 2000 | 1997 | 0 | 0.00 to 0.19 % | 17.63 | 3 · 0 |
| rules_v1 | Regent | 2000 | 1987 | 0 | 0.00 to 0.19 % | 13.54 | 0 · 13 |
| rules_v1 | Silent | 2000 | 1999 | 0 | 0.00 to 0.19 % | 13.36 | 1 · 0 |
| rules_v2 | Defect | 2000 | 1996 | 7 | 0.17 to 0.72 % | 21.30 | 4 · 0 |
| rules_v2 | Ironclad | 2000 | 1994 | 6 | 0.14 to 0.65 % | 21.07 | 6 · 0 |
| rules_v2 | Necrobinder | 2000 | 1999 | 0 | 0.00 to 0.19 % | 19.63 | 1 · 0 |
| rules_v2 | Regent | 2000 | 1987 | 1 | 0.01 to 0.28 % | 17.84 | 2 · 11 |
| rules_v2 | Silent | 2000 | 2000 | 0 | 0.00 to 0.19 % | 14.34 | 0 · 0 |
| rules_v3 | Defect | 2000 | 1998 | 10 | 0.27 to 0.92 % | 21.86 | 2 · 0 |
| rules_v3 | Ironclad | 2000 | 1996 | 6 | 0.14 to 0.65 % | 22.46 | 4 · 0 |
| rules_v3 + Ironclad values v2 | Ironclad | 2000 | 1992 | 2 | 0.03 to 0.37 % | 23.19 | 8 · 0 |
| rules_v3 | Necrobinder | 2000 | 1997 | 0 | 0.00 to 0.19 % | 20.28 | 3 · 0 |
| rules_v3 | Regent | 2000 | 1990 | 0 | 0.00 to 0.19 % | 18.44 | 0 · 10 |
| rules_v3 | Silent | 2000 | 2000 | 0 | 0.00 to 0.19 % | 15.01 | 0 · 0 |
| rules_v2_neow_values | Defect | 2000 | 1990 | 16 | 0.50 to 1.30 % | 22.39 | 10 · 0 |
| rules_v2_neow_values | Ironclad | 2000 | 1984 | 12 | 0.35 to 1.05 % | 22.69 | 16 · 0 |
| rules_v2_neow_values | Necrobinder | 2000 | 1992 | 0 | 0.00 to 0.19 % | 20.62 | 8 · 0 |
| rules_v2_neow_values | Regent | 2000 | 1976 | 1 | 0.01 to 0.29 % | 19.29 | 6 · 18 |
| rules_v2_neow_values | Silent | 2000 | 2000 | 0 | 0.00 to 0.19 % | 15.53 | 0 · 0 |
| search_v3 (every fight) | Ironclad | 300 | 300 | 2 | 0.18 to 2.40 % | 24.45 | 0 · 0 |
| advisor_v1 | Defect | 2000 | 2000 | 0 | 0.00 to 0.19 % | 16.18 | 0 · 0 |
| advisor_v1 | Defect | 2000 | 1998 | 0 | 0.00 to 0.19 % | 15.23 | 2 · 0 |
| advisor_v1 | Ironclad | 2000 | 1997 | 2 | 0.03 to 0.36 % | 18.66 | 3 · 0 |
| advisor_v1 | Ironclad | 2000 | 1998 | 0 | 0.00 to 0.19 % | 17.18 | 2 · 0 |
| advisor_v1 | Necrobinder | 2000 | 1997 | 0 | 0.00 to 0.19 % | 16.44 | 3 · 0 |
| advisor_v1 | Necrobinder | 2000 | 1998 | 0 | 0.00 to 0.19 % | 15.88 | 2 · 0 |
| advisor_v1 | Regent | 2000 | 1990 | 0 | 0.00 to 0.19 % | 14.31 | 1 · 9 |
| advisor_v1 | Regent | 2000 | 1988 | 0 | 0.00 to 0.19 % | 13.04 | 1 · 11 |
| advisor_v1 | Silent | 2000 | 2000 | 0 | 0.00 to 0.19 % | 12.61 | 0 · 0 |
| advisor_v1 | Silent | 2000 | 2000 | 0 | 0.00 to 0.19 % | 12.31 | 0 · 0 |
<!-- table:policies:end -->

**Every comparison that was made** (the held-out ones registered as shown, the development ones labelled; exact McNemar on the shared seeds, mean-floor differences with a seed bootstrap):

<!-- table:comparisons:begin -->
| Comparison file | Status | Class · seeds | A | B | Pairs completed by both | Past the Act-1 boss A · B | Pairs only A · only B | Exact McNemar p | Mean floors A − B (95 % bootstrap) | Wins A · B |
|---|---|---|---|---|---|---|---|---|---|---|
| `pooled-neow-values-v2-vs-rules_v2-val` | ADR-049, **the registered test** | all five classes · val | rules_v2_neow_values | rules_v2 | 9932 | 61.05 % · 54.30 % | 1487 · 817 | 9.1e-45 | +1.27 (+1.13 to +1.41, resampling pairs) | 29 · 14 |
| `defect-neow-values-v2-vs-rules_v2-val` | ADR-049 (descriptive; the registered test is pooled) | Defect · val | rules_v2_neow_values | rules_v2 | 1989 | 80.0 % · 76.2 % | 232 · 156 | 1.3e-04 | +1.08 (+0.74 to +1.42) | 16 · 7 |
| `ironclad-neow-values-v2-vs-rules_v2-val` | ADR-049 (descriptive; the registered test is pooled) | Ironclad · val | rules_v2_neow_values | rules_v2 | 1982 | 71.2 % · 65.1 % | 301 · 181 | 5.1e-08 | +1.63 (+1.26 to +2.01) | 12 · 6 |
| `necrobinder-neow-values-v2-vs-rules_v2-val` | ADR-049 (descriptive; the registered test is pooled) | Necrobinder · val | rules_v2_neow_values | rules_v2 | 1992 | 67.5 % · 62.1 % | 301 · 195 | 2.2e-06 | +0.99 (+0.68 to +1.30) | 0 · 0 |
| `regent-neow-values-v2-vs-rules_v2-val` | ADR-049 (descriptive; the registered test is pooled) | Regent · val | rules_v2_neow_values | rules_v2 | 1969 | 58.6 % · 49.7 % | 346 · 172 | 1.7e-14 | +1.43 (+1.15 to +1.72) | 1 · 1 |
| `rules_v1-vs-random_legal-ironclad-a0-veteran-val` | baseline, not a registered test | Ironclad · val | rules_v1 | random_legal | 1997 | 43.3 % · 0.0 % | 865 · 0 | 8.1e-261 | +13.60 (+13.31 to +13.90) | 0 · 0 |
| `rules_v2-vs-rules_v1-defect-a0-veteran-val` | ADR-034 | Defect · val | rules_v2 | rules_v1 | 1996 | 76.2 % · 34.5 % | 937 · 106 | 7.2e-167 | +5.37 (+5.00 to +5.75) | 7 · 0 |
| `rules_v2-vs-rules_v1-ironclad-a0-veteran-val` | ADR-031 | Ironclad · val | rules_v2 | rules_v1 | 1991 | 65.1 % · 43.3 % | 608 · 175 | 8.8e-57 | +2.96 (+2.61 to +3.32) | 6 · 0 |
| `rules_v2-vs-rules_v1-necrobinder-a0-veteran-val` | ADR-034 | Necrobinder · val | rules_v2 | rules_v1 | 1997 | 62.1 % · 47.8 % | 468 · 182 | 5.9e-30 | +1.99 (+1.69 to +2.30) | 0 · 0 |
| `rules_v2-vs-rules_v1-regent-a0-veteran-val` | ADR-034 | Regent · val | rules_v2 | rules_v1 | 1978 | 49.7 % · 14.0 % | 771 · 65 | 3.9e-154 | +4.32 (+4.00 to +4.63) | 1 · 0 |
| `rules_v2-vs-rules_v1-silent-a0-veteran-val` | ADR-034 | Silent · val | rules_v2 | rules_v1 | 1999 | 18.5 % · 11.5 % | 263 · 123 | 8.5e-13 | +0.97 (+0.74 to +1.20) | 0 · 0 |
| `rules_v3-values2-vs-rules_v3-ironclad-a0-veteran-val` | ADR-046 | Ironclad · val | rules_v3 + Ironclad values v2 | rules_v3 | 1990 | 79.4 % · 74.8 % | 276 · 185 | 2.6e-05 | +0.72 (+0.40 to +1.04) | 2 · 6 |
| `rules_v3-vs-rules_v2-ironclad-a0-veteran-val` | ADR-045 | Ironclad · val | rules_v3 | rules_v2 | 1991 | 74.8 % · 65.1 % | 292 · 99 | 3.3e-23 | +1.39 (+1.10 to +1.68) | 6 · 5 |
| `search_v3-all-vs-rules_v2-ironclad-a0-veteran-val` | ADR-040 | Ironclad · val | search_v3 (every fight) | rules_v2 | 300 | 74.3 % · 64.7 % | 59 · 30 | 0.0028 | +3.93 (+2.90 to +5.01) | 2 · 1 |
| `silent-neow-values-v2-vs-rules_v2-val` | ADR-049 (descriptive; the registered test is pooled) | Silent · val | rules_v2_neow_values | rules_v2 | 2000 | 28.2 % · 18.5 % | 307 · 113 | 8.4e-22 | +1.19 (+0.98 to +1.40) | 0 · 0 |
| `g13-gamehp-vs-base-necrobinder-a0-veteran-dev` | development, not held-out | Necrobinder · dev | rules_v2 [the game's start HP] | rules_v2 | 499 | 51.5 % · 63.5 % | 26 · 86 | 1.1e-08 | -1.63 (-2.10 to -1.16) | 0 · 0 |
| `g14-keeprelics-vs-base-defect-a0-veteran-dev` | development, not held-out | Defect · dev | rules_v2 | rules_v2 | 488 | 81.8 % · 76.8 % | 40 · 16 | 0.0018 | +3.17 (+2.61 to +3.76) | 9 · 2 |
| `g14-keeprelics-vs-base-ironclad-a0-veteran-dev` | development, not held-out | Ironclad · dev | rules_v2 | rules_v2 | 481 | 77.1 % · 63.2 % | 77 · 10 | 5.9e-14 | +5.40 (+4.72 to +6.09) | 25 · 0 |
| `g14-keeprelics-vs-base-necrobinder-a0-veteran-dev` | development, not held-out | Necrobinder · dev | rules_v2 | rules_v2 | 492 | 69.3 % · 62.8 % | 47 · 15 | 5.8e-05 | +2.88 (+2.40 to +3.38) | 0 · 0 |
| `g14-keeprelics-vs-base-regent-a0-veteran-dev` | development, not held-out | Regent · dev | rules_v2 | rules_v2 | 484 | 57.4 % · 42.8 % | 83 · 12 | 3.2e-14 | +2.36 (+1.93 to +2.81) | 0 · 0 |
| `g14-keeprelics-vs-base-silent-a0-veteran-dev` | development, not held-out | Silent · dev | rules_v2 | rules_v2 | 499 | 30.5 % · 17.6 % | 78 · 14 | 6.2e-12 | +1.46 (+1.14 to +1.79) | 0 · 0 |
| `rules_v1-vs-search_v1-ironclad-a0-veteran-train` | development, not held-out | Ironclad · train | rules_v1 | search_v1 | 200 | 44.5 % · 28.0 % | 54 · 21 | 1.8e-04 | +2.38 (+1.24 to +3.54) | 0 · 0 |
| `rules_v2-ancientheal-vs-rules_v2-ironclad-a0-veteran-dev` | development, not held-out | Ironclad · dev | rules_v2 [acts 2 and 3 start healed] | rules_v2 | 498 | 64.1 % · 64.1 % | 0 · 0 | 1 | +0.96 (+0.53 to +1.39) | 2 · 0 |
| `search_v3-all-vs-rules_v2-ironclad-a0-veteran-dev` | development, not held-out | Ironclad · dev | search_v3 (every fight) | rules_v2 | 189 | 72.0 % · 61.4 % | 39 · 19 | 0.012 | +3.08 (+1.72 to +4.44) | 1 · 0 |
| `search_v3-boss-vs-rules_v2-ironclad-a0-veteran-dev` | development, not held-out | Ironclad · dev | search_v3 (bosses only) | rules_v2 | 499 | 71.9 % · 64.1 % | 55 · 16 | 3.8e-06 | +0.78 (+0.29 to +1.27) | 0 · 0 |
<!-- table:comparisons:end -->

* **Reading these:** wins are rare. The best arm of any class wins 16 of 1,990 Defect games (0.8 %, with the best opening relic) and 12 of 1,984 Ironclad games (0.6 %); the same pilots without it won 7 and 6; Regent won 1 game in each of its two arms; **Silent and Necrobinder won none in any held-out batch**. **These pilots are far from competitive play.** What improves, and what the registered tests rest on, is how often the simulated pilot gets past the first boss; winning is too rare to compare policies on, and the wins columns above are counts, not evidence of a difference unless a p-value says so. The tuned thresholds and the searcher show that more is possible, and do not show a policy that wins reliably.
* **Information:** the counterfactual test (`sim/tests/test_policy_fairness.py`) takes states from random play, makes a twin that differs only in hidden state (every RNG stream re-seeded, the draw pile shuffled) and requires identical observations and identical actions; it covers `random_legal`, `rules_v1`, `rules_explore`, `rules_v2_neow`, `rules_v2`, `rules_v3`, `rules_v2_neow_values` and the searchers, and a leaky forward model is detected as a power check.
* **Not shipped:** nothing runs a simulator on the website, and no policy of M5 is reachable from it.

## M6. Combat networks

* **What:** an entity-token transformer (`sim/slay2_sim/rl/net.py`; dimension 48, 2 layers, 4 heads, 350,392 parameters, a masked 134-action space) for single-combat play inside `rules_v1`'s run policy: trained by behaviour cloning of `rules_v1` and by PPO. Checkpoints are never committed; their SHA-256 are recorded.
* **Intended use:** research. **No network is shipped, and none is used by the site.**
* **Evaluation** (paired, once, on the same 796 held-out `val` combats, Ironclad, Ascension 0):

<!-- table:networks:begin -->
| Network | Checkpoint SHA-256 | Win on the held-out combats | `rules_v1` on the same combats | Pairs only `rules_v1` won · only the network won | Exact McNemar p | HP lost, `rules_v1` − network (95 % interval) |
|---|---|---|---|---|---|---|
| Behaviour cloning of `rules_v1` (`combat-bc-v1`) | `5fd23a10814c368a…` | 85.7 % (796) | 86.6 % | 21 · 14 | 0.31 | -0.007 (-0.014 to -0.001) |
| PPO from scratch, best checkpoint (`combat-ppo-v1-run1`, selected on the monitor set) | `efeaeab964f0c4a4…` | 85.7 % (796) | 86.6 % | 33 · 26 | 0.43 | +0.004 (-0.009 to +0.017) |
| PPO from scratch, last checkpoint (iteration 180) | `6ae07ad97aae3988…` | 84.0 % (796) | 86.6 % | 43 · 23 | 0.019 | -0.005 (-0.017 to +0.008) |
| PPO fine-tune of the cloned network (`combat-ppo-v2`), paused at iteration 50 of 150; its win rate on the monitor set, which is also the selection set, was 85.3 % at iteration 10, 86.6 % at iteration 20, 86.9 % at iteration 30, 87.4 % at iteration 40, 86.9 % at iteration 50 | not recorded | none: not evaluated on held-out combats | 86.6 % | none | none | none |
<!-- table:networks:end -->

* **Reading these:** a network that ties the baseline at best, and one that is worse (the last PPO checkpoint, p = 0.019). A sign convention: a negative HP-lost difference means `rules_v1` lost less HP than the network. The paused fine-tune's monitor-set numbers cannot support a claim, because the monitor set is also where its checkpoint is chosen. The bar written before the experiment (ADR-026) was a paired improvement with an interval that excludes zero; it was not met, so no run-level batch was run with a network, and none exists.
* **Information:** the encoder is a pure function of the fair observation (layout and encoding tests in `sim/tests`); the campaign-4 counterfactual test on a trained network has **not** been run because no network earned a place in a policy.
* **Limits:** one class, Ascension 0, combats only, simulator states.

## M7. What does not exist

Co-op (declared `unsupported` by the capability endpoint, and no team or ally model exists), advisors for the map, combat, shop, rest sites and events (the capability endpoint lists them as `planned`), Ancient boons beyond the opening choice, a local companion or bridge to the running game, any live-game parity check, and a model for Ascension above 0 (the calculators accept A0 to A10; the simulated evidence is A0 only). Nothing here should be read as implying that these are optimised.

## M8. The synergy term and its evidence

* **What:** the part of the deck index that reads how cards work together (D10): per card in the deck, a rating `prior` is held back by the share of what it needs that the deck does not supply (up to 70 %, less in early acts because the picks to come may bring it), lifted by Strength, Dexterity or Focus when it is an attack, a card that gives Block or an orb card (up to 25 %), and a deck would gain an engine value when a mechanic has both sources and payoffs. The class's starting relic counts as a supply. Every strength was first set by hand; a development stage on separate simulated seeds then chose how much of each part the index keeps (addendum D): unmet needs in full, the lifts from Strength, Dexterity and Focus at 0.7 of the first judgement, **no engine credit** (engines are still found and named, and the explanations say that the index does not count them). The index is ported to Python (`sim/slay2_sim/advisor.py`) and tested number for number against a golden file of 160 decks that the TypeScript code writes; `advisor_v1` is a simulated pilot that picks card rewards by it.
* **Stage B1 (exploratory, `experiments/synergy/b1-calibration.json`, ADR-050):** the index parts read against simulated runs that brought a randomly drafted deck to the Act-1 boss, with class-specific controls and cross-validation grouped by seed:

<!-- table:synergy_b1:begin -->
| What was asked | Answer (95 % interval, resampling whole seeds) |
|---|---|
| Held-out log loss of the advisor's index without the synergy term, then with it (19,717 runs that brought a random deck to the Act-1 boss) | 0.4430, then 0.4352: change **−0.0078** (−0.0094 to −0.0056); AUC 0.8633 to 0.8692 |
| The same for a model that already knows every card (ridge logistic regression on card counts, one model per class) | 0.3801, then 0.3787: change **−0.0014** (−0.0024 to −0.0002) |
| Worth of a point of unmet needs, relative to a point of average card rating | **1.11** (0.93 to 1.32) |
| Worth of a point of Strength, Dexterity and Focus lifting the cards they help, relative to a point of average card rating | **0.68** (0.55 to 0.88) |
| Worth of a point of engines (sources and payoffs together), relative to a point of average card rating | **0.07** (−0.08 to 0.27) |
| Worth of a point of role coverage, as the index weights it, relative to a point of average card rating | **−0.12** (−0.27 to 0.04) |
<!-- table:synergy_b1:end -->

<!-- table:synergy_cohorts:begin -->
| Cohort | Runs at the Act-1 boss | Passed it | Held-out log-loss change when the synergy term is added to the index | When added to a model that knows every card |
|---|---|---|---|---|
| ironclad-train (train seeds) | 3,812 | 40.9 % | −0.0044 (−0.0078 to −0.0008) | −0.0029 (−0.0060 to 0.0000) |
| silent-train (train seeds) | 2,332 | 10.7 % | −0.0005 (−0.0032 to 0.0025) | −0.0014 (−0.0050 to 0.0035) |
| regent-train (train seeds) | 2,703 | 22.4 % | −0.0097 (−0.0152 to −0.0048) | +0.0003 (−0.0018 to 0.0021) |
| necrobinder-train (train seeds) | 3,389 | 44.0 % | −0.0004 (−0.0022 to 0.0014) | −0.0001 (−0.0016 to 0.0015) |
| defect-train (train seeds) | 3,212 | 40.3 % | −0.0202 (−0.0271 to −0.0140) | −0.0013 (−0.0042 to 0.0011) |
| ironclad-dev (dev seeds) | 4,269 | 54.9 % | −0.0163 (−0.0214 to −0.0106) | −0.0023 (−0.0046 to 0.0004) |
<!-- table:synergy_cohorts:end -->

* **Reading:** the simulated runs support the needs part at the weight the first judgement gave it (the estimate is a little above it, which is not applied) and the scalers part at about 0.7 of it, and give **weak support at most to an engine credit** (the interval includes no effect; random decks rarely hold a whole engine, and the pilot does not build around one, so this says little about people who do). Ironclad, Regent and Defect show a clear gain; for Silent and Necrobinder the intervals include no change. The parts add to a model that already knows every card, a little: most of what they predict the cards themselves also predict.
* **Which needs the runs support, one mechanic at a time (descriptive, `experiments/synergy/b1-mechanics.json`, `slay2_sim.synergymechanics`):** the same runs and model as stage B1, with the unmet-need part split into one column per mechanic instead of their sum (the columns add up to the part B1 reads, and a test holds them to it). Each row is the worth of a point of that mechanic's unmet need relative to a point of average card rating, 95 % interval from 200 resamples of whole seeds. It is read as a description, not a result: the intervals are read together and not corrected for it, the tags were not changed because of it, and the runs are the ones the tags were audited against. A mechanic few decks left unmet has an interval too wide to read.

<!-- table:synergy_mechanics:begin -->
| Mechanic whose unmet need is read | Decks that need it | Mean index points held back | Worth of a point of it, relative to a point of average card rating (95 % interval) |
|---|---|---|---|
| All needs together, one slope (stage B1) | all 19,717 runs | | **1.11** (0.92 to 1.35) |
| Exhaust | 3,356 | −0.242 | **1.06** (0.74 to 1.48) |
| Stars | 2,789 | −0.178 | **2.37** (1.71 to 3.06) |
| Losing HP | 2,521 | −0.168 | **0.51** (0.13 to 0.89) |
| Strength | 6,838 | −0.263 | **0.69** (0.24 to 1.16) |
| Orbs | 3,169 | −0.123 | **2.25** (1.59 to 3.01) |
| Vulnerable | 4,594 | −0.166 | **1.58** (0.99 to 2.44) |
| Doom | 1,073 | −0.066 | **1.59** (0.90 to 2.29) |
| Card creation | 1,265 | −0.072 | **−0.14** (−0.76 to 0.55) |
| Discarding | 1,431 | −0.075 | **0.36** (−0.71 to 1.45) |
| Ethereal cards | 823 | −0.059 | **0.07** (−0.59 to 0.81) |
| Card draw | 592 | −0.048 | **0.82** (0.01 to 1.56) |
| Energy | 1,282 | −0.065 | **1.70** (0.85 to 2.62) |
| Block | 954 | −0.054 | **1.81** (0.98 to 2.68) |
| Powers | 548 | −0.039 | **1.37** (0.53 to 2.17) |
| Free cards | 686 | −0.037 | **1.54** (0.65 to 2.46) |
| Attacks | 2,980 | −0.070 | **3.88** (2.79 to 5.24) |
| Poison | 204 | −0.017 | **1.90** (0.26 to 4.01) |
| Weak | 612 | −0.030 | **−0.95** (−2.54 to 0.53) |
| Souls | 188 | −0.015 | **1.87** (0.38 to 3.52) |
| Skills | 1,294 | −0.034 | **0.51** (−1.33 to 2.06) |
| Shivs | 191 | −0.013 | **0.70** (−1.12 to 2.92) |
| Forge | 229 | −0.013 | **1.35** (−0.26 to 3.03) |
| Strikes | 736 | −0.025 | **1.75** (0.42 to 3.13) |
| Osty | 3,442 | −0.021 | **−1.34** (−3.90 to 0.89) |
| Cheap cards | 733 | −0.007 | **3.60** (−2.52 to 10.76) |
<!-- table:synergy_mechanics:end -->

* **Reading (per mechanic):** uneven, as 25 intervals read together will be. Per index point, the needs for Stars (2.37), Orbs (2.25) and attacks (3.88) are worth about twice what the pooled slope (1.11) says, and those for Strength (0.69, 95 % 0.24 to 1.16) and HP loss (0.51, 0.13 to 0.89) about half; for Create, Ethereal, Discard, Skill, Shiv and Forge the runs cannot tell the need from nothing at all, and Weak and Osty (whose need is nearly always met, because Bound Phylactery supplies it) point the other way with intervals that include nothing. These are the tags' strengths as seen by random drafts and one rules pilot; they say nothing about players who build around a mechanic on purpose. The table is **not** changed by this: it is frozen until the held-out test is over (ADR-050 addendum B), and a list of 25 intervals is a place to look for the next table, not a result.
* **The audit that changed the table (twice):** the first reading (commit `c62eac6`: needs 0.66, scalers 0.77, engines -0.01) came with three needs whose slope was *negative* (the Necrobinder's Osty, the Regent's Draw, the Defect's Status) and a card-by-card check that agreed; the cause of the clearest, Osty, was found in the game's own files (the starting relic summons Osty every combat), the table was corrected and the study read again, found the same three still negative, and was corrected a second time. The tags were therefore read against the runs the study measures, twice, and its numbers are optimistic for the tags. ADR-050 records both rounds.
* **Stage B2-dev (development seeds `dev[4000:5000)`, tuning; ADR-050 item 2 and addendum D):** how much of each hand-set part the index keeps was chosen by a rule fixed before the first game and applied by a program (`slay2_sim.synergydev`). 35 batches of 1,000 paired games per class and arm (`experiments/batches/advisor_v1-*-dev-o4000-n1000`; the two selection files and one comparison per arm and class are in `experiments/synergy/dev/`): the pilot `advisor_v1` (`rules_v3` whose card rewards follow the page's deck index) with the synergy term off (`d0`) and on at four settings, then two skip margins on the setting phase 1 chose. These are **tuning numbers on the seeds that chose the arm, not evidence**; they are published whatever they show.

<!-- table:synergy_dev:begin -->
| Phase | Arm | What it keeps | Past the Act-1 boss, against → arm | Difference in points (95 %, whole seeds resampled) | Exact McNemar | Pairs |
|---|---|---|---|---|---|---|
| 1 | `d1` (chosen) | needs 1, scalers 0.7, no engine credit | `d0`, no synergy term: 25.4 % → 32.6 % | +7.2 (+6.0 to +8.4) | p = 2.3e-32 | 4,992 |
| 1 | `d2` | needs 1, scalers 0.7, engines 0.25 | `d0`, no synergy term: 25.4 % → 31.3 % | +5.9 (+4.8 to +7.0) | p = 6.5e-24 | 4,995 |
| 1 | `d3` | needs 1, scalers 0.7, engines 0.5 | `d0`, no synergy term: 25.4 % → 29.9 % | +4.5 (+3.3 to +5.7) | p = 5.4e-14 | 4,994 |
| 1 | `d4` | every part at its first judgement (1, 1, 1) | `d0`, no synergy term: 25.4 % → 27.2 % | +1.8 (+0.7 to +3.0) | p = 0.0026 | 4,996 |
| 2 | `m1` | the chosen configuration, a card has to add 1.5 index points | `d1` at margin 0: 32.6 % → 29.4 % | −3.1 (−4.2 to −2.1) | p = 6.0e-09 | 4,993 |
| 2 | `m2` | the chosen configuration, a card has to add 3 index points | `d1` at margin 0: 32.6 % → 17.0 % | −15.6 (−16.8 to −14.3) | p = 4.1e-124 | 4,991 |
| 2 | margin 0 (chosen) | no skip margin: a card is skipped only when no card raises the index | | | | |
<!-- table:synergy_dev:end -->

* **Reading (development):** with the synergy term on and no engine credit the simulated pilot got past the Act-1 boss in 32.6 % of games against 25.4 % without the term (the same 5,000 seeds); each class went the same way (Ironclad 39.0 to 50.3 %, Silent 6.3 to 8.2 %, Regent 11.3 to 19.3 %, Necrobinder 35.3 to 40.0 %, Defect 35.0 to 45.0 %; descriptive, nothing corrected for five readings). Crediting engines lowered that step by step and a skip margin made it worse. So the advisor page keeps unmet needs in full, the lift from Strength, Dexterity and Focus at 0.7 of the first judgement, **no engine credit** and **no skip margin** (`A*`, addendum D); it still names the engines a deck is building and says that the index does not count them. What this does not say: that the term helps on held-out seeds (that is stage B2-val), anything about the live game, or that engines do not matter to a player who builds one on purpose (the pilot does not). Choosing `A*` flipped four of the ordering tests a player could check by hand (a payoff led a deck that fed it by a wide margin only through the engine credit); addendum D lists them.
* **Stage B2-val (the one registered held-out test, run on 2026-10-27; ADR-050 Result):** the pilot with `A*` (needs 1, scalers 0.7, engines 0, margin 0) against the same pilot without the synergy term (`d0*`), on the 2,000 held-out `val` seeds of each class, from a clean worktree of `452c5e2` (the commit that carries addendum D), five classes pooled into one exact McNemar test at level 0.05, paired by seed. **`A*` got past the Act-1 boss in 33.0 % of games against 26.0 %** (p = 3.8e-60; every class ahead). By the registered reading rule: **adding the synergy term improves what the heuristic index picks, in simulated play, on held-out seeds.** Every win is re-derived (`audit wins`), each batch has its 40-game sample audit, and the ten `A*` and `d0*` batches were re-derived in full afterwards (`audit rederive`): 20,000 of 20,000 games reproduced their stored records exactly.

<!-- table:synergy_val:begin -->
| Comparison (paired by seed, held-out `val` seeds, A0, `veteran`) | Pairs with both games completed | Past the Act-1 boss, other → A* | Only A* / only the other | Exact McNemar | Past the Act-2 boss, other → A* | Wins, other → A* | Mean floors, A* minus other (95 %) |
|---|---|---|---|---|---|---|---|
| **`A*` against `d0*`, the index without the term, five classes pooled (the registered test)** | 9,975 | 26.0 % → 33.0 % | 1,273 / 577 | p = 3.8e-60 | 0.4 % → 0.4 % (p = 0.6) | 0 → 2 | +0.91 (+0.81 to +1.00) |
| &nbsp;&nbsp;Ironclad | 1,996 | 38.4 % → 51.0 % | 408 / 158 | p = 1.8e-26 | | 0 → 2 | +1.47 |
| &nbsp;&nbsp;Silent | 2,000 | 8.6 % → 10.8 % | 121 / 76 | p = 0.0017 | | 0 → 0 | +0.30 |
| &nbsp;&nbsp;Regent | 1,984 | 14.1 % → 21.6 % | 225 / 76 | p = 2.9e-18 | | 0 → 0 | +1.27 |
| &nbsp;&nbsp;Necrobinder | 1,997 | 36.7 % → 40.8 % | 195 / 113 | p = 3.5e-06 | | 0 → 0 | +0.56 |
| &nbsp;&nbsp;Defect | 1,998 | 32.1 % → 40.6 % | 324 / 154 | p = 5.6e-15 | | 0 → 0 | +0.94 |
| `A*` against `R`, `rules_v3` with the class's measured card values, five classes pooled (secondary) | 9,967 | 61.8 % → 33.0 % | 424 / 3,294 | p < 1e-300 | 2.9 % → 0.4 % (p = 4.9e-56) | 12 → 2 | −4.12 (−4.26 to −3.98) |
<!-- table:synergy_val:end -->

* **What each arm's decks held at the Act-1 boss (a profile, descriptive; the parts are read at their first judgement for both arms, `slay2_sim.synergyreport`):**

<!-- table:synergy_val_profile:begin -->
| Measure (decks that reached the Act-1 boss) | `A*` | `d0*` | `A*` minus `d0*`, paired by class and seed (95 %) |
|---|---|---|---|
| Card rewards skipped | 158 of 89,938 (0.18 %) | 108 of 84,870 (0.13 %) | |
| Index points held back by unmet needs | −0.88 | −2.46 | +1.58 (+1.55 to +1.62) |
| Index points added by Strength, Dexterity and Focus | 2.16 | 1.62 | +0.52 (+0.50 to +0.55) |
| Index points the engines would add at their first judgement (`A*` does not count them) | 3.78 | 4.58 | −0.82 (−0.85 to −0.78) |
| Index points from the average card rating | 33.43 | 34.02 | −0.62 (−0.65 to −0.60) |
| Deck size (cards) | 19.53 | 19.49 | +0.01 (0.00 to +0.02) |
| Decks at the boss | 7,129 | 6,613 | 6,145 pairs |
<!-- table:synergy_val_profile:end -->

* **Reading (held-out):** the term moves the share of simulated runs that get past the first boss by about 7 points (the development seeds had read 7.2), in every class, and the decks it builds hold fewer unmet needs (1.58 index points fewer) and more of the lift from Strength, Dexterity and Focus, for a slightly lower average card rating, with the same deck size and almost no skipping. It does **not** show an effect on getting past the second boss (0.4 % against 0.4 %, 44 against 39 games, p = 0.60: too few games to say), and two wins in 10,000 games say nothing about winning. The pilot that follows the measured card values (`R`) is far ahead of both (61.8 % past the Act-1 boss, 12 wins against 2): the hand-set index, with or without the term, is far from what the simulator rewards, which is why the site keeps the measured values as a separate second opinion. The tags were corrected against training and development runs (addenda A and B), and the strengths were chosen on `dev[4000:5000)`; nothing of the study read these seeds before the one run.
* **Intended use:** to say how far the synergy term is supported by simulated play: it improves what a rules pilot picks at card rewards, as far as the first boss, in the simulator. **Not for:** claims about the live game, about winning, or about people who build engines on purpose.
* **Limits:** one pilot, an unverified simulator (G5), Ascension 0, the first boss only, random decks, runs that keep no relic gained after their first fight (G14: whether the term helps with relics kept is unmeasured); the tags were audited against the same runs; the engine credit is untestable with them.

---

# Across the cards

## Information fairness

The rule (`docs/INFORMATION-FAIRNESS.md`, ADR-004): advice, training features and the page may use only what a human player could see or has already learned. The seed, RNG state, draw order, unrevealed map and the second Ascension-10 boss never reach a policy, a feature, a cache key, a log or the page. Enforced by allow-list adapters (unknown fields are dropped), counterfactual invariance tests on the policies (M5), a leak canary that proves the test would notice a leak, and the allow-listed digest of the web API. The one trained-network case is untested, as M6 says.

## Differences between classes

The five classes are not equally well covered, and the cards say where. The pilot's strength differs widely by class (past the Act-1 boss with `rules_v2` on the held-out seeds, from the comparison table: Defect 76.2 %, Necrobinder 62.1 %, Regent 49.7 %, Ironclad 65.1 %, Silent 18.5 %), so the values for the weak classes rest on fewer informative games and are conditional on weak play. The effect of following measured values also differs a lot by class and the reasons are not explained (ADR-034). A single advisor serves all five, and each class is only ever shown its own numbers.

## Versions and patches

Every file names the build it describes. Nothing is migrated across builds: a new main build needs its rules re-verified, its catalog re-derived and its simulations re-run, and the beta is refused by the calculators and the advisor (`docs/PATCH-COMPATIBILITY.md`).

## Privacy

The site collects nothing about visitors: a saved run lives in the browser's local storage, exports are files the visitor saves, there are no cookies, no analytics and no request that carries a run (a test pins it: ADR-044). SLAY2's own code writes no log of a request; its only `console` call is the browser's error boundary. The host keeps its own request records under its terms.

## Rights and licences

SLAY2 is independent, unofficial and noncommercial pending a rights review (`docs/IP-COMPLIANCE.md`). The two reference repositories are read locally and never committed; the simulator is unlicensed and run locally only. **SLAY2's own code has no licence file yet** (an owner decision), which means it is visible but not licensed for reuse. Dependencies are checked by `pnpm licenses:check` (MIT, Apache-2.0, ISC, BSD, 0BSD, OFL-1.1, CC-BY-4.0 and two LGPL libraries that are optional build-time image libraries; MPL-2.0 for the test tools, explained exceptions).

## Keeping this file true

Add a card when something new reaches visitors or becomes a headline. Regenerate the tables with `python3 scripts/docs-tables.py --write` after any change to `experiments/`, the gaps registry or the site data; `--check` (run by `sim/tests/test_docs_tables.py` and therefore in CI) fails when they differ. Nothing in this file may be typed from memory: a number that is not in a generated table must name the file it came from.
