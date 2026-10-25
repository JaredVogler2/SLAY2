# Open research questions

Updated 2026-10-25. Each item states what is unknown, why it matters, and the cheapest way to close it.

| # | Question | Why it matters | How to close it | Needs |
|---|---|---|---|---|
| Q1 | **Live-game parity** of the third-party simulator (state transitions, not just rules). | Without it, simulator win rates are *model output*, not STS2 win rates (Go/No-go rule). | Run the same fixed scenarios in a legitimately owned STS2 v0.107.1 via an MIT bridge (STS2MCP) and diff observable state. | Owner's machine with the game |
| Q2 | **Beta v0.111.0 rules.** Only a keyword scan of patch notes was done (potion/White Beast Statue, card rarities). | Beta is a separate cohort (ADR-002); the odds engine refuses it today. | Decompile/verify beta build, or obtain a snapshot; diff `Odds/*`, `Factories/*`, merchant and ascension classes. | Beta snapshot (owner or upstream) |
| Q3 | **Reward-pool sizes.** Almanauts: 20/35/25 per class; spire-archive data: 20/36/26. Which cards are unregistered/unreachable, and how do unlocks change pools? | Needed for "probability that a *specific* card appears" (not for rarity odds). | Read `Models.CardPools/*` and `GetUnlockedCards` in E1. | E1 read |
| Q4 | **Map generation** (RUN-5): exact room-type assignment, path pruning, elite count at A1. | Route planner and map-based EV. | Read `Map/StandardActMap` etc.; compare with the simulator's port (it claims a C#-faithful port). | E1 read |
| Q5 | "?"-room **blacklist** (which types callers exclude) and relic hooks (`ModifyUnknownMapPointRoomTypes`, `ModifyOddsIncreaseForUnrolledRoomType`). | Changes the room mix when relics are held. | Trace callers of `UnknownMapPointOdds.Roll` and enumerate relic overrides. | E1 read |
| Q6 | Relic/event **modifiers on card odds** (`ModifyCardRewardCreationOptions`, `ModifyCardRewardUpgradeOdds`, Molten Egg, ...). | Advisor must say "relic X changes this". | Enumerate hook implementers. | E1 read |
| Q7 | **Shop price rounding** at the tails (float32 `RoundToInt` vs decimal). | +/-1 gold at the extremes; immaterial but should be stated. | Property test with float32 emulation. | - |
| Q8 | Can the player die in **TheArchitect** event? | Defines the terminal state. E1 shows no damaging logic; confirm in the live game. | Observe the room. | Live game |
| Q9 | **First-run scripted packs** (sts.wiki lists fixed Ironclad rewards for the first 7 fights, 2 elites, 1 boss). Only the "?" part is verified in E1. | The advisor must treat "first-ever run" as an explicit unknown. | Read `ApplyDiscoveryOrderModifications`. | E1 read |
| Q10 | **Co-op** (2-4 players): per-seat odds are separate (`PlayerOddsSet`), but scaling, shared events and voting are unverified. | Co-op must stay "unsupported" until tested. | Dedicated phase. | - |
| Q11 | Simulator defects found so far: three **A8 HP gaps** (Living Shield, Scroll of Biting, The Merchant???) and a reproducible **crash** (`is_sovereign_blade(None)`, ~1 in 2,000 random games). | They bias A8+ runs / drop rare episodes. | Report upstream or add an explicit, labelled null-guard in the harness (not done: pristine pin kept). | - |
| Q12 | ~~Does the simulator's RNG reproduce the game's xoshiro256** and seed derivation?~~ **CLOSED 2026-10-25: No.** The simulator ports .NET `System.Random`; the game's `MegaRandom` is xoshiro256** + Splitmix64 (E1). No simulator seed reproduces a live run; packs also differ by per-card roll order. | Seed-level replay of real runs is impossible with this simulator. | Would need an original exact port of RNG streams *and* call order. | - |
| Q13 | Potion counter edge cases: clamping when forced, negative stored values. E1 shows **no clamp**; the effect on long runs is small but untested against the live game. | Exactness claim for the potion calculator. | Live-game logging of `PotionReward` state. | Live game |
| Q14 | **License of SLAY2's own code** and any monetization. | Legal. | Owner + counsel. | Owner |
