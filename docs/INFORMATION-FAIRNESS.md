# Information fairness: what a policy or the website may know

Rule (README rule 2, ADR-004): **advice and training features may use only what a human player could see or has already learned.** Hidden state - RNG streams, seeds, future draw order, unseen rewards, unrevealed intents/map/bosses - must never reach a policy, a feature, a cache key, a log, or the web page.

## 1. Definitions

| Observable (allowed) | Internal / hidden (forbidden) |
|---|---|
| Current hand; **multiset** of the draw pile (the game lets the player inspect it, order is hidden); discard/exhaust piles | Draw-pile **order**, shuffle outcome |
| Enemy HP/block/powers and the **currently displayed** intents | Enemy move-selection RNG, future intents not yet displayed |
| Deck, relics, potions, gold, HP, Stars/Osty/Doom/orbs, upgrades, enchantments | Seed (the 12-character run seed), any RNG stream state |
| Map nodes/edges already revealed; offered rewards, shop stock, event options once shown | Unrevealed map content; **the second A10 boss** (chosen at run start with the up-front RNG) until shown; future rewards |
| Counters the player can legitimately track (rare offset, potion chance - *as a belief distribution*, see below) | The true counter value unless derivable from observed history |
| Public game knowledge (card/monster rules, move *patterns* of deterministic monsters, odds tables) | Anything read from process memory, save files or mod debug payloads not shown on screen |

## 2. Odds counters are beliefs, not facts

The rare offset and potion chance are deterministic functions of the **observed reward history** (E1: `CardRarityOdds`, `PotionRewardOdds`). A player who logged every reward knows them exactly; one who forgot does not. The website therefore accepts either an exact history or a partial one and returns a **posterior over counter states** (never an exact value inferred from the floor number). Likewise the "?"-room counters are functions of the sequence of "?" outcomes in the act.

## 3. Audit of the third-party simulator (zhiyue/sts2-rl-agent @ 5d874e8)

| Surface | Finding |
|---|---|
| Combat observation (`gym_env/observation.py`, 217-d) | **Fair**: hand cards, pile sizes, current intents, HP/block/powers. No order, seed or RNG. |
| Run observation (`run_env.py`, 237-d) | Adds act/floor, HP ratio, gold, deck/relic counts, potions, phase, elite/boss flags. **Fair.** |
| `RunManager` public state | Contains RNG, full `RunState`, un-shown map content and the pre-chosen second boss. **Not fair to expose directly.** SLAY2 builds policy observations through an allow-listed adapter and never passes the manager. |
| `gym.reset(seed=...)` | Seeds derive the run; the policy must not receive the seed (the harness keeps it in the manifest only). |
| Combat search | Cloning `CombatState` also clones the RNG: a naive search "sees" the true future draws. Search must **re-seed RNG streams and re-shuffle the draw pile** before simulating (determinization), see `sim/` policies. |

## 4. Enforcement (planned and partially implemented)

1. **Allow-list adapters** (`packages/game-schema`, `sim/slay2_sim/observation.py`): explicit field lists; unknown fields are dropped, never passed through.
2. **Counterfactual invariance tests**: same observation, different hidden state (reseed engine RNG after the observation is fixed) must produce **identical** deterministic policy output; stochastic policies must match in distribution. Failing this is a P0 defect.
3. **No seed in features or cache keys**; the digest of an advisor request includes build, model, and visible state only.
4. **Logs**: public traces store observation hashes and visible fields; any privileged debug data is kept in a separate file that is never used for training.
5. **Web page**: manual entry only; the future local bridge (Phase 08) strips RNG/seed/draw order/unseen map before data leaves the machine.
