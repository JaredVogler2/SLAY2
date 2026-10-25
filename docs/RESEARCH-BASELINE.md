# SLAY2 comprehensive research baseline
**Checked 2026-10-25. Research leads, not proof that SLAY2 itself ran games, trained, or deployed.** Every number below MUST have build/branch, source, tests, and confidence. Verify changed official releases again at agent execution time.

## Official game identity and the changing target
Mega Crit released *Slay the Spire 2* into Steam Early Access on **March 5, 2026** for Windows/macOS/Linux. It uses Godot with C# logic and ships native mod support, in contrast to STS1's Java tools. Five current characters: Ironclad, Silent, Regent, Necrobinder, Defect (unlock order observed Ironclad → Silent → Regent → Necrobinder → Defect). Official solo and 2–4 player co-op game modes. Separate run statistics/policies per party size and character combination; a multiplayer run is one TEAM run and several SEAT observations.

As of source checks, default Steam Main **v0.107.1**, released June 18, 2026; latest documented optional beta **v0.111.0**, Aug 14, 2026. Confirm current channel at runtime from official Steam announcements before using these values. Public data tracker https://sts2db.com/patches/ and https://almanauts.com/slaythespire2/patches/ ; Steam official https://steamcommunity.com/app/2868840/announcements/ . A May 2026 simulator is not by default compatible with either current build.

Early Access presently has **three acts** with Act 1 **Overgrowth OR Underdocks**, Act 2 Hive, Act 3 Glory, and Ancients at start (Neow and other unlock-dependent boon pools). **A10** is the maximum; A10 requires two Act 3 boss fights. **No standard Heart kill, red/green/blue keys or Act4 in the currently released STS2**. A public simulator may say Act1–4: investigate its use of '4' before trusting it. STS1 Heart victory metric must not appear as an STS2 benchmark.

### Ascension modifiers STS2 (current references, reverify with game)
0 normal;
1 Swarming Elites (more elites);
2 Weary Traveler (Ancients heal 80% of missing HP rather than all);
3 Poverty (gold drops reduced ~25%);
4 Tight Belt (one fewer potion slot);
5 Ascender's Bane (permanent/unremovable curse);
6 Inflation (card removal pricing higher; first 100 gold; subsequent +50);
7 Scarcity (rare and upgraded card appearance roughly halved, with specific rarity counter interaction);
8 Tough Enemies (higher enemy HP);
9 Deadly Enemies (higher damage);
10 Double Boss (two Act 3 bosses).
Some published pages show outdated versions of A6 due to Early Access patch. Pin rules version. Source https://slaythespire.wiki.gg/wiki/Slay_the_Spire_2:Ascension .

### New STS2 mechanics registry: mandatory
- **Regent:** Stars as persistent secondary resource; Forge, Sovereign Blade, generated cards, conversions of Stars/Energy, creation-dependent relics and thresholds.
- **Necrobinder:** Osty summon/alley combat proxy, Souls, Doom kill thresholds, Graveyard, Ethereal manipulation, summons/healing targeting. Exact action sequencing matters.
- **Silent:** Sly triggers when card discarded; poisons/shivs/discard synergies differ from STS1.
- **Defect:** orb slots and new types including Glass and Plasma, focus/evoke rules, auto-generated status/fuel and interactions.
- **Ironclad:** strength, exhaust, self damage and new cards/relics.
- **All classes:** Ancients at transitions, Ancient relic choices, afflictions, enchantments/modified cards, alternate acts, rarities, merchant rules, class unlocks, Epoch Timeline unlocks, event availability and multiplayer co-op cards/ally targeting.
- **Solo vs multiplayer:** character pair synergies, shared or player-specific map/event decisions, co-op-target cards/potions, player death, coordination and enemy scaling. Validate all actual rules before optimization.

Sources: https://www.megacrit.com/faq/ , https://slaythespire.wiki.gg/wiki/Ancients , https://slaythespire.wiki.gg/wiki/Slay_the_Spire_2:Enchantments , https://slaythespire.wiki.gg/wiki/Slay_the_Spire_2:Acts and official release notes.

## Conditional probability findings to test, not paste uncritically

Reference https://sts.wiki/guides/card-rewards , https://almanauts.com/slaythespire2/card-odds/ , https://almanauts.com/slaythespire2/run-odds/ . These are published values for a pinned build (typically stable v0.107.1), NOT blanket rates valid for every patch/source/ascension.

- Normal card reward baseline C60/U37/R3; elite C50/U40/R10; merchant C54/U37/R9; boss all rare. **Rare offset** at run start -5 percentage points, rises +1 pp for each non-rare encounter reward card, caps +40, resets -5 at rare. Three cards in pack roll sequentially (not i.i.d.); rarity adjustment affects uncommon/common boundaries; first ordinary fight reward rare chance can be zero. Shop uses offset but does not advance it; special reward sources can use different distributions.
- A7 Scarcity halves rare-related chances and offset gain to 0.5pp per card (confirm exact percentages and clamping versus game build, e.g. 1.49% baseline rare mentioned by reference). A7 also reduces normal upgraded-card rolls; non-rare reward card upgrade chance Act1 0%, Act2 25%, Act3 50%, halved on A7 (as source describes).
- Ordinary postfight potion drop chance initial 40%, +10pp after missed drop, -10pp after drop; elite adds +12.5 percentage points to roll without changing stored counter. Potion rarity standard C65/U25/R10. Overrides like White Beast Statue and scripted first runs change the interpretation.
- Unknown '?' rooms: sequence of conditional fight/chest/shop checks with stored counters, initial probabilities ~10%, 2%, 3%, rest event; need reproduce update/order/caps and special events. **Sequential checks do not equal independent flat unconditional categories**, and rewards depend on eligibility and relics.
- Merchant cards/relic/potion count, discounts/removal inflation, sale mechanics, special merchant and inventory exclusions require source/version checks.
- Ancient offerings depend on unlocked pool, actual Ancient, act, player progression, forbidden combinations. Never assume independent uniform draw from all Ancients.
- First-ever Ironclad save may have scripted sequence of early rewards; treat tutorial/progression flag as explicit state or abstain. Includes fixed first normal fights/elites/boss rewards in references.
- Draw probability when N unknown uniformly ordered cards, K targets, draw n *without reshuffle*: `1 - choose(N-K,n)/choose(N,n)`. Known draw order, Retain, Sly/discard, graveyard, exhaust, orbs, draws across reshuffles invalidate naive formula.
- Turn state/target selection conditional on enemy AI states and visible intent; risk estimates should distinguish exact enumerated probability mass from MC approximations and model heuristics.
- Direct published item counts differ by source, channel, and unlock catalog. For pinned stable build: Almanauts lists ~577 cards, 296 relics, 63 potions, 110 monsters, 57 events, 22 enchantments, 8 Ancients. Spire Codex counts and beta may differ. Do not hardcode item count as invariant. Audit canonical IDs and patch diff.

## Statistical inspiration: Sim the Spire blog
https://simthespire.wordpress.com/ (STS2 research):
- Exact/combinatorial enumeration of tractable combat outcomes rather than only random Monte Carlo.
- HP-loss distributions, enemy HP threshold charts, preferred target surfaces, opening-hand cases, card add/remove/upgrade sensitivity, first-turn and future intent uncertainty.
- Important caveat: simplified combat models can omit mechanics (e.g. Slimed) because of state-space explosion; NEVER label incomplete enumeration as exact game truth.
Build SLAY2's original conditional targeting heatmap and fight-survival laboratory using STS2-specific validated scenarios. Optimize overall run win over average per-fight HP loss because potion/value opportunity costs matter.

## Simulator + real-game bridge source candidates

1. https://github.com/yizhang-dream/sts2-simulator — Python Gymnasium full-run environment/action masks, full game transition model, parity harness and C# TCP bridge; README says source numbers pinned to **May 2026** and v0.111.0 numeric alignment layer maintained externally **not in public repo**. It calls its loop Acts 1–4 although current official game has 3 acts. License not found at root when checked; inspect packaging and permissions. **Candidate, not verified exact or deployable.**
2. https://github.com/zhiyue/sts2-rl-agent — Python/C# headless combat/full-run simulator, MaskablePPO, model training, five-character claims, ~92% *Act1 Ironclad COMBAT* win (self-reported; **not full-run win**). GitHub checked: no root LICENSE. Possibly overlapping/related source lineage with (1), investigate before copying. Do not assume current build parity.
3. https://github.com/Gennadiyev/STS2MCP — C# Godot mod exposing localhost REST/MCP. MIT license confirmed in GitHub LICENSE. README tested against STS2 v0.103.2; compat and optional multiplayer beta. Public API allows write actions; SLAY2 production companion should be read-only and secure.
4. https://github.com/BMingSY/sts2-ai-mcp — experimental versioned v2 decision windows + action preview, trace, model data endpoints; tested Godot/MegaDot version needs verification. Audit license and path.
5. https://github.com/cicero225/STS2FableBot — MIT confirmed; Ironclad fair-state, search-based full-run bot. Self-reported A0 20.7% over 343 complete runs (CI approx 16–25%), A1 19.4% over 175 (CI approx 14–25%), ~4,200 total logged, as of README checked. Distinct from RL model. Its own readme explicitly focuses on STS2 v0.107.1 and patched bot. Replication required before comparison.
6. https://slaythespire.dev/ — ecosystem index of game interfaces, agents, simulators, run data, and research. Inspect other options and project lineage in phase 01.
7. https://github.com/ptrlrd/spire-codex — large community API with cards, relics, potions, enemies, events, run histories, per-build data and diffs, public data exports, beta channel and much broader statistical dashboards. **PolyForm Noncommercial 1.0.0 for SOURCE**; hosted API has separate API_TERMS.md (check before using); data is Mega Crit IP. Do not mirror source/dump/third-party images by assumption.
8. https://github.com/nkhoit/spire-archive — structured versioned STS2 reference. Check different extraction/version baselines, reuse rights and endpoint limits.
9. https://slaythespire.dev/datasets/ — STS2 run data and limited open research trajectories, including reported AgenticSTS ~298 agentic trajectories. No automatic right to train/distribute without dataset licenses.
10. Official game installed copy (if available through owner) is the parity oracle for **observed state transitions**; do not redistribute decompiled game binaries/assets.

## Research ethics and scientific warnings
- Existing runs (including public Spire Codex) are **observational** and subject to survival, skill, version, player/character, unlock, patch and offer-selection biases. Pick rate / winning-deck co-occurrence ≠ causal pick value.
- Every experiment must split by run, seed, build, source population and training lineage. Heldout data sealed. Do not train on game RNG, future rewards, exact shuffled draw order or participant hidden data.
- Tiny published bot test counts cannot guarantee a high-Ascension win rate, and a trained combat policy success number is not a complete run rate.
- For multi-player count TEAM wins per session and seat-specific contributions separately. Four players winning one run is **one team win**, not four independent wins.
- Sampled combat simulations represent estimated outcomes **conditional on assumptions**, not inherent probability of human player winning next act.
- License review mandatory: independent coaching website vs commercial game mod is not automatically authorized by Mega Crit content policy. Default no unlicensed sprites/audio/full text.

## Specific research deliverables for Claude Code
1. Version-checked source registry with exact URLs/build/date/license, contradictions and code/data usage decision.
2. Complete per-character card/relic/potion/monster/encounter/Ancient/event/enchantment/affliction rules, unlock and patch matrix.
3. Stable and beta canonical ID mapping with change detection and tests; implement only what is verified.
4. Exact odds library, conditional hidden counter belief-state model and golden results vs independent reference.
5. Parity-enabling controlled run and battle fixtures, seeded replays and false-cheating tests.
6. Separate solo and co-op scope/benchmark, explicit support flags, core UX journey and version compatibility warning.
