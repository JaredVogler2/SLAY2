# Simulator and bridge candidate matrix

Audited **2026-10-25**. SHAs and licenses are pinned in [`../external/pins.json`](../external/pins.json). Rights analysis: [`IP-COMPLIANCE.md`](IP-COMPLIANCE.md). Evidence classes: [`game/MECHANICS-COVERAGE.md`](game/MECHANICS-COVERAGE.md).

## 1. Matrix

| Candidate | License (verified) | Game build | What it is | Full-run sim? | Needs live game? | Decision |
|---|---|---|---|---|---|---|
| **zhiyue/sts2-rl-agent** `5d874e8` | **None.** Commits 3,426 decompiled Mega Crit `.cs` files. README: "research and educational purposes". | **v0.107.1** (build 23811903; per `GAME_VERSIONS.md`) | Python re-implementation of combat + run (577 cards, 260 powers, 121 monsters, 290 relics, 63 potions, 88 encounters, 68 events), Gymnasium envs, MaskablePPO scripts, C# bridge mod sources | **Yes** (`STS2RunEnv`, 3 acts; `RunManager`) | No (bridge optional) | **Use locally, read-only, never vendored** (ADR-011). Sim output is labelled *parity UNVERIFIED*. |
| **nkhoit/spire-archive** `4e6b0e0` | **None.** Data "extracted from PCK + decompiled C#". | 0.107.1 (+ history 0.103.2, 0.99.1) | JSON database + Astro site | n/a | n/a | **Use locally, read-only**: id/rarity/cost/type cross-checks, patch diffs. Hand-written `mechanics.json` is stale. |
| yizhang-dream/sts2-simulator `83fcca6` | None; "No permission to redistribute game content is granted" | May-2026 snapshot (+ v0.111.0 overlay kept private) | Python sim + TCP parity bridge | Yes (claims "Act 1-4") | optional | **Not used.** |
| STS2FableBot `9588820` | **MIT** | 0.107.1 | Search-based Ironclad bot driving the *real game* via STS2MCP; self-reported A0 20.7 % (343 runs), A1 19.4 % (175) | No (plays the game) | **Yes** | Reference baseline only; its numbers are *unreplicated* and not ours. |
| STS2MCP `55e0648` | **MIT** | 0.103.2-era | C# Godot mod: local REST/MCP, includes write actions | No | **Yes** | Phase 08 reference. Public companion must be read-only. |
| sts2-ai-mcp `5d1d36b` | **AGPL-3.0** | - | Typed decision-window MCP bridge | No | **Yes** | Do not incorporate (copyleft). |
| Spire Codex `2af6543` | source PolyForm-NC; API terms | per-build | Data API + site | No | No | Not mirrored. |

## 2. What running zhiyue/sts2-rl-agent actually showed (measured, this container)

Environment: Python 3.13.17, gymnasium 1.4.0, numpy 2.5.4, 4 vCPU Xeon 2.1 GHz, no GPU.

| # | Check | Command | Result |
|---|---|---|---|
| M1 | Its own test suite | `python -m pytest -p no:cacheprovider -n 4 -q tests` (cwd = repo root) | **4,862 passed, 0 failed** in 278 s. (README says 408 tests; the suite has grown.) This shows internal consistency with its authors' reading of the C#, **not** live-game parity. |
| M2 | Reward-odds differential vs SLAY2 exact model | `audit_sim_rewards` (200,000 rewards/setting; A0/A7 x regular/elite) | **28/28 PASS** at 99.9 % Wilson intervals: stationary P(>=1 rare) 19.75 % (exact 19.72), 30.83 % (30.91), A7 11.80 % (11.80), 16.19 % (16.28); first-card rare rate at offsets n = 0,5,10,20,45; uncommon share at the -5 start 35.0 % (exact 35.0). |
| M3 | Full-run smoke, random legal policy | `STS2RunEnv`, Ironclad A0, seeds 0-9 | 10/10 episodes terminated as **deaths** in Act 1 (floors 3-7), ~1.8 episodes/s, ~130 steps/s. Consistent with the repo's own note that random play averages 3.9 floors. |
| M4 | Terminal semantics | source read | Win is declared in `RunState.enter_next_act()` when the final act finishes; matches E1 (`TheArchitect` event has no player-damaging logic). 3 acts; no Act 4. |
| M5 | A8 HP scaling vs an independent source | `audit_sim_monster_hp` (all `create_*` monster factories sampled over 60 seeds at A0 and A8 vs the 100 enemy rows of the sts.wiki Ascension table, v0.107.1) | **97 / 100 rows match exactly** (base HP range and A8 HP range). **3 gaps**: *Living Shield* (wiki 55 -> 65, sim 55 -> 55), *Scroll of Biting* (wiki 30-37 -> 33-39, sim 31-38 at both A0 and A8), *The Merchant???* (wiki 165 -> 175, sim 165 at both). All three are special/event monsters; a stale comment in `run_state.py` ("no runtime ascension checks yet") is wrong for the other 97. A9 damage values were not audited (not parsed from the table yet). |
| M6 | Observation fairness (combat) | read `gym_env/observation.py` | Contains hand, pile **sizes**, current intents, HP/block/powers; **no draw order, seed or RNG**. Fair by construction. |

### Hazards discovered (these change how SLAY2 must call the simulator)

1. **Exceptions are converted into losses.** `STS2RunEnv.step()` catches any exception from the simulation, logs it, and calls `lose_run()`. A naive harness would count simulator bugs as *deaths* and report "100 % completed games, 0 % wins". SLAY2's harness drives `RunManager` directly and classifies `simulator_error` separately; the gym wrapper is never used for evidence.
2. **Timeouts are also recorded as losses** (`truncated=True` plus `lose_run()`). SLAY2 classifies them as `timeout`.
3. **Hidden cwd dependency.** The card factory reads `docs/CARDS_REFERENCE.md` via a *relative* path. Run from any other directory, every first combat raised `FileNotFoundError`, which hazard 1 turned into 10/10 "deaths" on my first smoke test. The harness must `chdir` into the checkout.
4. **The opening Ancient (Neow) is skipped by default** (`RunManager(start_with_neow=False)`, which the gym env uses). The real game always starts with the Ancient event. With `start_with_neow=True` and no unlock progress, the simulated Neow offers only "Leave". SLAY2 sets `start_with_neow=True`.
5. **Per-card RNG order differs from the game.** The port rolls all three rarities, then picks cards/upgrades; the game interleaves roll -> pick -> upgrade per card. Distributions are identical (M2), but **seeds do not reproduce live-game packs**; seed-level replay of real runs is impossible with this simulator.
6. **No unlock/epoch model.** The simulated profile has no progression, so unlock-gated pools, Underdocks and Neow boons differ from a real profile. First-run scripted rewards (`UnknownMapPointOdds` first-run branch) are implemented but their coverage is unaudited.
7. **Self-reported results.** 92 % "combat win rate" is Act-1 Ironclad *combat* with a trained PPO; the repo's own `KNOWN_ISSUES.md` records **0 % full-run win rate after 1M PPO steps**.
8. **Docs drift.** README says 217-dim observation, `ascension_level` 0-20 and "Acts: 4"; the code is 237-dim, A0-A10 and 3 acts.

### Verdict

* Usable as a **research-grade, fast, unlicensed, locally-run** environment with *unverified* live-game parity.
* **Not** shippable, not vendorable, not evidence of real win rates.
* Reaching a live-game parity claim needs a legitimately owned STS2 copy plus the MIT bridge (STS2MCP) - an owner-machine task (see `docs/RESEARCH-OPEN-QUESTIONS.md`).
