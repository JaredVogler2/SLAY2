# STS2 mechanics coverage - verified rule register

**Target build:** STS2 **main v0.107.1**, Steam build **23811903** (released 2026-06-18). Retrieved/verified **2026-10-25**.
**Beta v0.111.0** is *not* covered by any rule below unless explicitly stated; the engine refuses beta (see ADR-002).

## Evidence classes

| Class | Meaning | Rights |
|---|---|---|
| **E1** | Decompiled game source v0.107.1, read via the third-party `zhiyue/sts2-rl-agent` checkout (pinned SHA in `external/pins.json`). Highest fidelity for *logic*. File paths are cited as `Namespace/File.cs`. | **Rights-restricted.** Facts/constants only; no code or text is copied into this repo (ADR-011). |
| **E2** | Official Mega Crit / Steam statements and patch notes. | Official. |
| **E3** | sts.wiki - states its numbers are read from the game's data files for v0.107.1. | Fan reference; facts only. |
| **E4** | Almanauts - pinned to build 23811903; self-reports 72,424 (card odds) / 5,000 (run odds) validation cases. | Text CC BY-SA; game data not covered. |
| **E5** | slaythespire.wiki.gg (community wiki; Ascension page edited 2026-10-17). | CC BY-SA 4.0. |
| **E6** | Independent SLAY2 computation/tests (exact rational arithmetic). | Ours. |

Status values: **VERIFIED-E1** (matches source), **CORROBORATED** (>=2 independent secondary sources agree, no E1 yet), **SECONDARY** (single secondary source), **UNVERIFIED**.
The *Implemented* column says where the rule lives in SLAY2 (`packages/odds`) once built; "planned" until the tests in the *Test* column exist.

## 1. Run structure

| ID | Rule (main v0.107.1) | Evidence | Status | Implemented / Test |
|---|---|---|---|---|
| RUN-1 | A run has exactly **3 acts**. Act index 0 = Overgrowth *or* Underdocks, 1 = Hive, 2 = Glory. `DeprecatedAct` has index -1 and is never used. "Act 1-4" in third-party simulators counts four act *models*, not four acts. | E1 `Models.Acts/{Overgrowth,Underdocks,Hive,Glory,DeprecatedAct}.cs` (`Index`), `Models/ActModel.cs GetRandomList`, `Models/ModelDb.cs ActsByIndex`; E3 | VERIFIED-E1 | docs; schema `ActIndex = 0\|1\|2` |
| RUN-2 | After the last act's boss, the game enters the scripted **TheArchitect** event room; when it completes (`IsVictoryRoom`) `WinRun()` ends the run as a **victory**. The event contains no player-damaging logic, so *win = clear the final act (both bosses at A10)*. There is no Heart, no keys, no Act 4. | E1 `Runs/RunManager.cs EnterNextAct/WinRun`, `Models.Events/TheArchitect.cs` | VERIFIED-E1 | terminal taxonomy in `sim/` |
| RUN-3 | Underdocks (alternate Act 1) must be unlocked; in single player an undiscovered non-default act takes priority, then the game rolls between available acts. | E1 `ActModel.GetRandomList`; E3 `/acts` | VERIFIED-E1 (priority rule), unlock source E3 | docs |
| RUN-4 | **Double Boss (A10):** the last act additionally gets a second, different boss chosen at run start from that act's other boss encounters (up-front RNG - hidden until shown). | E1 `RunManager.cs` (act setup loop); E5 | VERIFIED-E1 | fairness rule: not observable until revealed |
| RUN-5 | Act map: 7 columns; 17/17/16/15 floors (Overgrowth/Underdocks/Hive/Glory) in solo, one fewer room in co-op; 3 merchants; 5 elites (**8 with A1**); first room is a fight; elites/rests never in first five rooms; a rest site always precedes the boss. Read from the source and recorded in detail as MAP-1..MAP-6 (section 11). | E1 `Map/StandardActMap.cs` and the act models (see section 11); E3 `/acts` | VERIFIED-E1 | the simulator's port of the generator agrees (`sim/tests/test_map_rules.py`) |

## 2. Ascension (cumulative: level N includes 1..N)

| ID | Rule | Evidence | Status |
|---|---|---|---|
| ASC-1 | Enum: 0 None, 1 SwarmingElites, 2 WearyTraveler, 3 Poverty, 4 TightBelt, 5 AscendersBane, 6 **Inflation**, 7 Scarcity, 8 ToughEnemies, 9 DeadlyEnemies, 10 DoubleBoss. **Max = 10** (`maxAscensionAllowed`). `HasLevel(x) = level >= x`. There is no A11-A20. | E1 `Entities.Ascension/AscensionLevel.cs`, `AscensionManager.cs`; E5; E3 | VERIFIED-E1 |
| ASC-2 | A3 Poverty: encounter gold `min/max = (int)(base * 0.75)` (truncating): monster 7-15, elite 26-33, boss 75 (base 10-20 / 35-45 / 100). | E1 `Models/EncounterModel.cs`, `Helpers/AscensionHelper.cs` | VERIFIED-E1 |
| ASC-3 | A4 Tight Belt: -1 potion slot. A5: Ascender's Bane added to the starting deck (floor 1). | E1 `AscensionManager.ApplyEffectsTo` | VERIFIED-E1 |
| ASC-4 | A6 Inflation: card removal costs `100 + 50*n` instead of `75 + 25*n` (`n` = removals used). (Older "Gloom: fewer rest sites" text is **stale**.) | E1 `Entities.Merchant/MerchantCardRemovalEntry.cs`; E5 (changed v0.103.2) | VERIFIED-E1 |
| ASC-5 | A7 Scarcity: see CARD-3..CARD-6 and UPG-1. | E1 `Odds/CardRarityOdds.cs`, `Factories/CardFactory.cs` | VERIFIED-E1 |
| ASC-6 | A2 Weary Traveler: the Ancient event heals 80 % of the missing HP instead of all of it (ANC-1). A1 Swarming Elites: 8 elites per act map instead of 5, round(5 x 1.6) (MAP-4). | E1 `Models/AncientEventModel.cs BeforeEventStarted`, `Map/MapPointTypeCounts.cs`; E5 | VERIFIED-E1 |
| ASC-7 | A8 Tough Enemies and A9 Deadly Enemies: enemy HP and damage. | E5, E3 | CORROBORATED (per-enemy tables are E3) |

## 3. Card reward rarity (the "rare offset")

State per player: `offset` (float), start **-0.05**, cap **+0.40**. Growth per non-rare card: **+0.01** (A7: **+0.005**).

| ID | Rule | Evidence | Status | Implemented / Test |
|---|---|---|---|---|
| CARD-1 | Rarity roll with offset `o`: draw `r ~ U[0,1)`; `T_rare = baseRare + o` (**not clamped**); rare if `r < T_rare`; uncommon if `r < baseUncommon + T_rare`; else common. Hence `P(rare)=clamp(baseRare+o,0,1)` and the uncommon/common boundary **shifts with the offset** (regular fight at the -5 start: 0 / 35 / 65 %, not 0 / 37 / 63 %). | E1 `Odds/CardRarityOdds.cs RollWithoutChangingFutureOdds`; E3 wording | VERIFIED-E1 | `packages/odds/src/rarity.ts`; `test/{golden,published,properties,bruteforce}.test.ts` |
| CARD-2 | Base odds (rare / uncommon): **regular 3% / 37%**, **elite 10% / 40%**, **shop 9% / 37%**, **boss 100% rare** (offset ignored in the roll). | E1 `CardRarityOdds.GetBaseOdds`; E3; E4 | VERIFIED-E1 | `packages/odds/src/rarity.ts`; `test/{golden,published,properties,bruteforce}.test.ts` |
| CARD-3 | A7 base rare: **regular 1.49%** (not 1.5), **elite 5%**, **shop 4.5%**; uncommon unchanged. | E1 `CardRarityOdds.RegularRareOdds/EliteRareOdds/ShopRareOdds`; E3 (E4 prose omits it) | VERIFIED-E1 | `packages/odds/src/rarity.ts`; `test/{golden,published,properties,bruteforce}.test.ts` |
| CARD-4 | After each card of an **Encounter**-sourced reward whose odds type is Regular/Elite/Boss: rare -> `offset = -0.05`; non-rare -> `offset = min(offset + growth, 0.40)`. Cards in a pack are rolled **sequentially**, so later cards see earlier results; cards after a rare in the *same* pack restart from -0.05. | E1 `CardRarityOdds.Roll`, `Factories/CardFactory.cs RollForRarity` | VERIFIED-E1 | `packages/odds/src/rarity.ts`; `test/{golden,published,properties,bruteforce}.test.ts` |
| CARD-5 | **Boss rewards also reset the counter** (`Roll(BossEncounter)` returns Rare -> `offset = -0.05`) even though the roll ignores the offset. (sts.wiki only says "offset ignored".) | E1 `CardRarityOdds.Roll` | VERIFIED-E1 | `packages/odds/src/rarity.ts`; `test/{golden,published,properties,bruteforce}.test.ts` |
| CARD-6 | Shop cards read the offset **without advancing it** (`RollWithoutChangingFutureOdds(Shop)`); non-encounter sources (events, relic packs such as Orrery) use `RollWithBaseOdds`: rare if `r < baseRare`, uncommon if `r < baseUncommon` (**not cumulative**) -> 3 / 34 / 63 % at A0 regular odds. Neither advances the counter. | E1 `CardRarityOdds`, `CardFactory.cs`; E3 ("3% / 34% / 63%") | VERIFIED-E1 | `packages/odds/src/rarity.ts`; `test/{golden,published,properties,bruteforce}.test.ts` |
| CARD-7 | If no eligible card exists at the rolled rarity, the roll steps to the next-higher rarity **with wrapping** (`GetNextAllowedRarity`). A card is then drawn uniformly from the eligible cards of that rarity not already in the pack. | E1 `CardFactory.cs` | VERIFIED-E1 | not modelled (needs pool) |
| CARD-8 | Derived published checks that my model reproduces exactly: offset table (28 cells incl. A7), "1+ rare right after a rare": regular 0 %, elite 16.95 %; stationary run averages regular 19.72 % / elite 30.91 %. | E6 vs E3, E4 | CORROBORATED | `packages/odds/src/rarity.ts`; `test/{golden,published,properties,bruteforce}.test.ts`: asserted exactly (0 %, 16.95 %) and 19.7 / 30.9 % by power iteration |
| CARD-9 | Per-player odds sets (co-op: each seat has its own counters). | E1 `Odds/PlayerOddsSet.cs` | VERIFIED-E1 | solo only (engine takes one player's counters) |

## 4. Upgrades on reward cards

| ID | Rule | Evidence | Status |
|---|---|---|---|
| UPG-1 | After each pack card: `r ~ U[0,1)`; if the card is upgradable: `odds = actIndex * scaling` for **non-rare** cards (`scaling = 0.25`, A7 `0.125`), `0` for rares; upgrade if `r <= odds`. => Act 1: 0 %, Act 2: 25 % (12.5 % A7), Act 3: 50 % (25 % A7). Shop cards never upgrade (base `-999999999`). Relics/events may modify via hooks (not modelled). | E1 `Factories/CardFactory.cs RollForUpgrade`, `UpgradedCardOddScaling`; E3 | VERIFIED-E1 |

## 5. Potions

| ID | Rule | Evidence | Status |
|---|---|---|---|
| POT-1 | Stored chance `c` starts **0.40**. After each eligible fight: threshold `= c + (Elite ? 0.25*0.5 = 0.125 : 0)`; `r ~ U[0,1)`; if `forced || r < threshold` then `c -= 0.10`, potion drops; else `c += 0.10`. **No clamping** of `c` (can go below 0 or above 1). Elite bonus affects only the roll, never the stored value. | E1 `Odds/PotionRewardOdds.cs`; E3, E4 | VERIFIED-E1 |
| POT-2 | Forced drops (`Hook.ShouldForcePotionReward`, e.g. White Beast Statue) **also decrement** `c` in v0.107.1. **Beta v0.108.0 changed this** ("no longer decreases your normal potion odds"). Pin per build. | E1; E2 beta v0.108.0 notes | VERIFIED-E1 (main) / differs on beta |
| POT-3 | Dropped potion rarity: `r<=0.10` rare, `r<=0.35` uncommon, else common => **10 / 25 / 65 %**. | E1 `Factories/PotionFactory.cs`; E3, E4 | VERIFIED-E1 |
| POT-4 | v0.107.1 fixed a bug where the follow-up potion odds could rise instead of fall after an elite potion reward. Data from builds before 0.107.1 is not comparable. | E2 (v0.107.1 notes) | VERIFIED (official) |

## 6. Unknown "?" rooms

| ID | Rule | Evidence | Status |
|---|---|---|---|
| UNK-1 | Counters start at base: fight **0.10**, elite **-1** (disabled), treasure **0.02**, shop **0.03**. One roll `r ~ U[0,1]`; scan fight -> (elite) -> treasure -> shop accumulating only positive counters; the first with `r <= cumulative` wins; otherwise **event** (`1 - sum of positive counters`). | E1 `Odds/UnknownMapPointOdds.cs Roll`; E4 | VERIFIED-E1 |
| UNK-2 | After each roll the **rolled** type resets to its base; every **other** enabled type gains `+base` (hook-modifiable). Counters **reset to base between acts** (`ResetToBase`). The marginal event/fight/shop/treasure mix for the n-th "?" of an act: 85/10/3/2, 71.13/19/5.91/3.96, 60.34/25.30/8.56/5.80, 53.47/28.27/10.80/7.46, 49.94/28.62/12.56/8.88, 48.35/27.83/13.80/10.03 %. | E1; E6 vs E4 table | VERIFIED-E1 |
| UNK-3 | A profile's **very first run** is scripted: first two "?" rooms are events, the third is a monster fight. | E1 (`UnlockState.NumberOfRuns == 0`) | VERIFIED-E1 |
| UNK-4 | Not modelled: the room-type *blacklist* supplied by callers and relic hooks (`ModifyUnknownMapPointRoomTypes`, `ModifyOddsIncreaseForUnrolledRoomType`). | E1 | open question |

## 7. Merchant

| ID | Rule | Evidence | Status |
|---|---|---|---|
| SHOP-1 | Stock: **5 character cards** of types [Attack, Attack, Skill, Skill, Power] (rarity rolled per slot via shop odds, fallback by card type), one uniformly random character slot **on sale**; **2 colorless** cards (one Uncommon, one Rare); **3 relics** (two rarity-rolled 50/33/17 % common/uncommon/rare, one "Shop"-rarity); **3 potions**; **one card-removal service**. | E1 `Entities.Merchant/MerchantInventory.cs`, `RelicFactory.RollRarity`; E3 | VERIFIED-E1 |
| SHOP-2 | Card price = `round(base * U[0.95,1.05])`; base common 50 / uncommon 75 / rare 150; **colorless base x1.15 rounded** (86 / 173); on sale: integer `/2`. | E1 `MerchantCardEntry.cs` | VERIFIED-E1 |
| SHOP-3 | Relic price = `round(MerchantCost * U[0.85,1.15])`; `MerchantCost`: common 175, uncommon 225, rare 275, shop 200. Potion price = `round(base * U[0.95,1.05])`, base common 50 / uncommon 75 / rare 100. | E1 `Models/RelicModel.cs`, `MerchantRelicEntry.cs`, `MerchantPotionEntry.cs` | VERIFIED-E1 |
| SHOP-4 | Card removal cost = `Base + Increase * removalsUsed`; A0: 75 + 25n; **A6+: 100 + 50n**. | E1 `MerchantCardRemovalEntry.cs` | VERIFIED-E1 |
| SHOP-5 | Final price may be modified by relic hooks (`ModifyMerchantPrice`); not modelled. | E1 `MerchantEntry.Cost` | open question |

## 8. Gold

| ID | Rule | Evidence | Status |
|---|---|---|---|
| GOLD-1 | Combat gold = uniform integer in `[min, max]`: monster 10-20, elite 35-45, boss 100 (Poverty: see ASC-2); scaled by the room's `GoldProportion` in special encounters (e.g. escaped Gremlins). | E1 `Rewards/GoldReward.cs`, `EncounterModel.cs`, `RewardsSet.cs` | VERIFIED-E1 |

## 9. Draw mathematics (no game source needed)

| ID | Rule | Evidence | Status |
|---|---|---|---|
| DRAW-1 | Drawing `n` cards without replacement from `N` with `K` targets: `P(>=1)=1-C(N-K,n)/C(N,n)`; full PMF is hypergeometric. Valid only for a uniformly shuffled draw pile with no reshuffle during the draw; retain/ethereal/exhaust/innate/discard/orbs/shuffle-triggers invalidate it (the UI must say so). | E6 (pure math) | n/a |

## 10. Build/patch facts

| ID | Fact | Evidence |
|---|---|---|
| BLD-1 | Main **v0.107.1** (2026-06-18 "Major Update #2"), Steam build **23811903**. Beta **v0.111.0** (2026-08-13), build id 24724944 (2026-08-14 update). Newest announcement at retrieval: Neowsletter 2026-09-25 ("can't give a specific timeline ... for the next patch"). | E2, E4, E1 `GAME_VERSIONS.md` |
| BLD-2 | v0.107.1 **replaced the PRNG** (xoshiro256**): seeds from earlier builds do not reproduce; seeds must never be compared across builds. | E2 |
| BLD-3 | Beta v0.108-v0.111 changed several card rarities (e.g. Echoing Slash, Bloodletting, Cruelty, Dominate, Accelerant, Flanking, Ignition) and White Beast Statue's potion interaction. Pools and odds are therefore **build-specific**. | E2 |
| BLD-4 | Act-3 boss Doormaker was removed and replaced by **Aeonglass** (main v0.107.1). | E2 |

## 11. Act map, rest sites, the Ancient heal and treasure (read from the game source, 2026-10-26)

Facts only (numbers and rules; no code or text, ADR-011). *Row* is the map row: row 0 is the act's Ancient node, rows 1 to R are rooms, the boss is row R+1.

| ID | Rule (main v0.107.1) | Evidence | Status | Implemented / Test |
|---|---|---|---|---|
| MAP-1 | Every act map is a grid of 7 columns. Row 0 is the act's Ancient node and the boss is one node on row R+1, both in the middle column (A10's second boss sits one row above the first). R is 15 (Overgrowth), 15 (Underdocks), 14 (Hive) and 13 (Glory) in solo play and one fewer in co-op, so an act has R+2 floors counting the Ancient and the boss: 17 / 17 / 16 / 15. Every row-1 node is a child of the Ancient node; every row-R node is a parent of the boss. | E1 `Map/StandardActMap.cs`, `Models/ActModel.cs GetNumberOfRooms/GetNumberOfFloors`, `Models.Acts/{Overgrowth,Underdocks,Hive,Glory}.cs BaseNumberOfRooms` | VERIFIED-E1 | the simulator's port is checked against these rules: `sim/tests/test_map_rules.py` |
| MAP-2 | Edges. Seven paths are walked from row 1 to row R. A path starts in a uniformly random column of row 1 (the second path is redrawn until its start differs from the first path's), and every step goes to the same column or one column to either side (columns 0 to 6, order shuffled), skipping a step that would cross an existing opposite diagonal edge. So an edge joins adjacent rows, its columns differ by at most one, and paths may merge. Duplicate path segments are then pruned (nodes can disappear) and the grid is re-centred and spread sideways inside the same one-column limit. | E1 `Map/StandardActMap.cs GenerateMap/PathGenerate/GenerateNextCoord/HasInvalidCrossover`, `Map/MapPathPruning.cs`, `Map/MapPostProcessing.cs` | VERIFIED-E1 | same test (edge shape) |
| MAP-3 | Fixed rows. Every row-1 node is a monster fight. Every row-R node is a rest site: a rest site always comes right before the boss. Every node on row R-6 is a treasure room (row 9 in Overgrowth and Underdocks, 8 in Hive, 7 in Glory). The main game never turns the treasure row into elites (only the optional Big Game Hunter modifier does). | E1 `StandardActMap.AssignPointTypes`, `Runs/RunManager.cs`, `Models.Modifiers/BigGameHunter.cs` | VERIFIED-E1 | same test |
| MAP-4 | Targets for the other rooms, placed on random free nodes: 3 shops; 5 elites, 8 with A1 (round(5 x 1.6)); "?" rooms: an integer drawn from a normal distribution with mean 12 and standard deviation 1, redrawn until it lies in 10 to 14 (Overgrowth, Underdocks), the same minus one (9 to 13) in Hive and Glory; rest sites besides row R: 6 or 7 in Overgrowth and Underdocks (about 39 % / 61 %), 6 or 7 in Hive (about 61 % / 39 %), 5 or 6 in Glory (50 % / 50 %). Every node left over is a monster fight. After pruning the generator tops the counts up by turning fight nodes into the missing types where the placement rules (MAP-5) allow, so a count can end below its target (seen: 3 elites on an Act 3 map of the simulator's port). One path crosses many nodes, so the number of rooms *on a route* is far smaller than these counts. | E1 `Map/MapPointTypeCounts.cs`, `Models.Acts/*.cs GetMapPointTypes`, `Random/Rng.cs NextGaussianInt/NextInt`, `Map/MapPathPruning.cs RepairPointType` | VERIFIED-E1 | same test (counts never exceed the targets; shops 3 on every sampled map) |
| MAP-5 | Placement rules for the random rooms. No rest site or elite on rows 1 to 5, so none among the first five rooms. No rest site on rows R-2 and R-1. An elite, rest site, treasure room or shop never has a parent or a child of its own type. Two nodes with a common parent never share a type among rest site, monster, "?", elite and shop when the type is assigned (fight nodes that fill what is left over are exempt). A "?" may follow a "?". | E1 `Map/StandardActMap.cs IsValidPointType/IsValidForLower/IsValidForUpper/IsValidWithParents/IsValidWithChildren/IsValidWithSiblings` | VERIFIED-E1 | same test (0 violations in 360 maps sampled for the check) |
| MAP-6 | Travel. From a node the player may go only to its children; the Winged Boots relic (and the Flight modifier) allows any node of the next row. From the Ancient node the player may go to any row-1 node. | E1 `Map/MapTravel.cs`, `Hooks/Hook.cs ShouldAllowFreeTravel`, `Models.Relics/WingedBoots.cs` | VERIFIED-E1 | not modelled (a route is typed in) |
| REST-1 | A rest site offers Rest and Smith, plus Mend when more than one player is in the run, plus options relics or cards add: Dig (Shovel), Lift (Girya), Kindle (Pumpkin Candle), Cook (Meat Cleaver), Clone (Pael's Growth), Hatch (Byrdonis Egg). Rest heals 30 % of maximum HP: the game adds 0.3 x max HP (a decimal) to the current HP and truncates, so the whole-number heal is floor(0.3 x max HP), capped at max HP; relic hooks can change the amount (Regal Pillow and others). Smith upgrades one card and is disabled when no card can be upgraded. The Ascension 2 reduction (ANC-1) applies to Ancient events only, not to rest sites. | E1 `Entities.RestSite/{RestSiteOption,HealRestSiteOption,SmithRestSiteOption}.cs`, `Entities.Creatures/Creature.cs HealInternal`, `Models.Relics/*.cs` | VERIFIED-E1 | `packages/odds/src/route.ts` (rests are counted; the heal is stated, not simulated) |
| ANC-1 | Every act starts at an Ancient event (Neow in act one). Before it offers anything, it heals the player by the missing HP times 1.0 (A0 and A1) or 0.8 (A2 Weary Traveler and above), truncated as in REST-1; Neow sets the HP to 0 first, so a run starts at full HP (A0, A1) or at floor(0.8 x max HP) (A2 and above). **The pinned simulator has no Ancient node in acts two and three: its runs reach those acts with whatever HP the boss fight left (gap G11).** | E1 `Models/AncientEventModel.cs BeforeEventStarted`, `Map/StandardActMap.cs` (the start node's type); simulator `run/run_manager.py _transition_next_act`, `map/acts.py` (comment) | VERIFIED-E1 | harness variant `ancient_heal` (`sim/slay2_sim/runner.py`, off by default); `sim/tests/test_ancient_heal.py` |
| TRS-1 | A treasure room gives gold, a whole number drawn uniformly from 42 to 52 (A3 Poverty: each value x 0.75, truncated: 31 to 39, mean 34.9 instead of 47), and a relic chosen from a roll with the same rarity split as the merchant's (SHOP-1: 50 / 33 / 17 %), plus whatever relics add. | E1 `Multiplayer.Game/OneOffSynchronizer.cs DoTreasureRoomRewards`, `TreasureRoomRelicSynchronizer.cs`, `Factories/RelicFactory.cs RollRarity`, `Helpers/AscensionHelper.cs` | VERIFIED-E1 | `packages/odds/src/route.ts` |

## 12. Implementation status (engines, tests) - updated 2026-10-25

Engines live in `packages/odds/src` (BigInt rationals, ADR-013). Verification layers: **G** = 720 exact golden cases from the independent Python oracle (`sim/slay2_sim/oracle_odds.py`, regenerate with `python -m slay2_sim oracle`), **P** = published third-party tables (`packages/odds/test/fixtures/published.json`), **B** = brute-force enumeration of every world, **Q** = fast-check properties, **S** = Monte Carlo against the third-party simulator (separate audit, 200,000 samples per setting). Mutation check: deliberately changing the A7 base rate or the boss-reset rule makes the golden suite fail.

| Rules | Module | Layers | Notes |
|---|---|---|---|
| CARD-1..6, CARD-8 | `rarity.ts` | G P B Q S | Posterior over the pity counter from partial histories (`inferCounter`), pack forecasts with credible band. Impossible histories are flagged, not repaired. |
| UPG-1 | `upgrade.ts` | G P | Float32 caveat: Act 1 is 2^-24 in the game, 0 here. |
| POT-1..3 | `potion.ts` | G B Q | Boss rooms also roll (E1 `Rewards/RewardsSet.cs`; E3: final boss gives no rewards). Stored chance is never clamped: only forced drops reach negative values, and ordinary play tops out at 100 % (a drop is then certain). Long-run drop rate of ordinary fights converges to the 50 % `targetOdds` documented in E1. |
| UNK-1, UNK-2 | `unknown-room.ts` | G P B Q | First-ever-run scripting (UNK-3) and caller blacklists/relic hooks (UNK-4) are not modelled and are stated on every result. |
| SHOP-2..4 | `shop.ts` | G P | Published ranges round the interval endpoints half-up; the endpoint has probability zero, so the attainable maximum is one lower when the endpoint is a half-integer (e.g. 52.5 -> 53 published, 52 attainable). Colorless common base is 57 (published range 54-60). |
| GOLD-1, ASC-2 | `gold.ts` | G P | Poverty truncates 75 % of each end separately. |
| DRAW-1 | `draw.ts`, `combinatorics.ts` | G B Q | Plus joint draws of several card groups and the one-reshuffle case. Retain/innate/ethereal/exhaust/orbs are not modelled. |

### Newly recorded facts (this session)

| ID | Fact | Evidence |
|---|---|---|
| POT-5 | Potion rolls happen after **normal fights, elites and bosses**; elites add +12.5 points to the roll only. The **final boss** gives no gold, cards, potion or relic. | E1 `Rewards/RewardsSet.cs`; E3 sts.wiki card-rewards page |
| CARD-10 | Relics that change card packs (Prayer Wheel: second regular pack after fights; White Star: all-rare pack after elites; Lasting Candy; Driftwood: reroll; Pael's Wing: sacrifice; Orrery: five packs from base odds; Dingy Rug/Prismatic Gem: pool changes; Molten Egg/Silver Crucible/Lava Lamp: upgrades) are **not modelled**; the advisor must say "relic X changes this" instead of silently using base rules. | E3 sts.wiki |
| SHOP-6 | Merchant relics from treasure rolls are common 50 % / uncommon 33 % / rare 17 %; elite relics use the same split. | E3, E4 |

## Not yet covered (explicit gaps)

Per-card/relic/potion/enemy semantics (only the third-party simulator encodes them; parity vs the live game is **UNVERIFIED**), events, enchantments, Ancient offers (the boons; the heal is ANC-1), maps changed by cards or relics (Spoils Map and others), co-op, all beta-only behaviour, relic modifier hooks on odds, and unlock-state dependence of pools.
