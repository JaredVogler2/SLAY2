# SLAY2 verified source registry

All entries were **fetched and read by the SLAY2 build agent on 2026-10-25** (UTC). This supersedes the "leads only" list in [`../SOURCE-REGISTRY.md`](../SOURCE-REGISTRY.md), which remains for history. Evidence classes E1-E6 are defined in [`../game/MECHANICS-COVERAGE.md`](../game/MECHANICS-COVERAGE.md).

> Rule of thumb used throughout: a number is shown to users only if it has an entry in the rule register with a status of **VERIFIED-E1** or **CORROBORATED**, a build pin, and a test.

## 1. Build state (verified)

| Item | Value | Source |
|---|---|---|
| Main (default Steam branch) | **v0.107.1**, 2026-06-18, "Major Update #2", Steam build **23811903** | Steam announcements; Almanauts pin; `GAME_VERSIONS.md` in the pinned checkout |
| Beta | **v0.111.0**, 2026-08-13 (Steam build 24724944, updated 2026-08-14) | Steam announcements; `GAME_VERSIONS.md` |
| Newer than the above? | **No.** Newest Steam announcement at retrieval is the 2026-09-25 Neowsletter ("we still can't give a specific timeline or details for the next patch"). | Steam announcements |
| Release | Early Access **2026-03-05**, Godot engine, Steam friends-only co-op | megacrit.com FAQ |

Re-verify at every session start (`docs/STATUS.md` records the date of the last check).

## 2. Sources

| # | Source | URL | Retrieved | Build | Terms / rights | Used for | Reliability |
|---|---|---|---|---|---|---|---|
| S1 | Steam community announcements (patch notes, Neowsletters) | https://steamcommunity.com/app/2868840/announcements/ | 2026-10-25 | all | Official; read for facts | build state; PRNG rework; potion/beta changes; Aeonglass | E2 - authoritative |
| S2 | Mega Crit FAQ | https://www.megacrit.com/faq/ | 2026-10-25 | n/a | Official | release date, platforms, engine, co-op | E2 |
| S3 | Mega Crit Content Policy (site built 2026-09-28) | https://www.megacrit.com/content-policy/ | 2026-10-25 | n/a | Official; covers video, original-art merch, mods (donations only). **Silent on third-party strategy tools. Footer: "All Rights Reserved".** | IP stance | E2 |
| S4 | Mega Crit press kit | https://www.megacrit.com/press-kits/slay-the-spire-2/ | 2026-10-25 | n/a | Official | factsheet | E2 |
| S5 | sts.wiki - Card reward odds | https://sts.wiki/guides/card-rewards | 2026-10-25 | v0.107.1 | Fan reference; "numbers are read from the game's own data files" | offset table; A7 values; upgrade table; potion roll; Orrery 3/34/63 quirk | E3 - matched E1 on every value checked |
| S6 | sts.wiki - Acts, Ascension, Multiplayer | https://sts.wiki/acts , /ascension , /multiplayer | 2026-10-25 | v0.107.1 | same | act layout; ascension ladder; per-enemy A8/A9 table (kept for parity checks) | E3 |
| S7 | Almanauts - Card reward odds | https://almanauts.com/slaythespire2/card-odds/ | 2026-10-25 | v0.107.1 build 23811903 (page updated 2026-10-20) | Text CC BY-SA 4.0; **game data not covered**. Self-reports 72,424 validation cases. | after-rare 0 % / 17 %; run averages 19.7 % / 30.9 %; reward pool 20/35/25 per class | E4 |
| S8 | Almanauts - Potions, ? rooms & shop | https://almanauts.com/slaythespire2/run-odds/ | 2026-10-25 | same (5,000 cases) | same | "?" room table; price ranges; removal costs; gold | E4 |
| S9 | wiki.gg - Slay the Spire 2: Ascension (edited 2026-10-17) | https://slaythespire.wiki.gg/wiki/Slay_the_Spire_2:Ascension | 2026-10-25 | main | CC BY-SA 4.0 | ladder, update history (A6 changed in v0.103.2) | E5 |
| S10 | zhiyue/sts2-rl-agent @ `5d874e8` | https://github.com/zhiyue/sts2-rl-agent | 2026-10-25 | **decompiled v0.107.1** | **No license. Contains 3,426 decompiled Mega Crit C# files.** Local, read-only (ADR-011). | verification of every VERIFIED-E1 rule; Python simulator | E1 (logic) - rights-restricted |
| S11 | nkhoit/spire-archive @ `4e6b0e0` | https://github.com/nkhoit/spire-archive | 2026-10-25 | 0.107.1 (+0.103.2, 0.99.1 history) | **No license**; data "extracted from PCK + decompiled C#". Local, read-only (ADR-011). | cross-check ids/rarity/cost/type; patch history | extracted fields reliable; hand-written `mechanics.json` is **stale** |
| S12 | STS2FableBot @ `9588820` | https://github.com/cicero225/STS2FableBot | 2026-10-25 | 0.107.1 | **MIT** (c) 2026 Hieronym | reference baseline; self-reported A0 20.7 % (343 runs) - *not replicated* | claims unverified |
| S13 | STS2MCP @ `55e0648` | https://github.com/Gennadiyev/STS2MCP | 2026-10-25 | 0.103.2-era | **MIT** (c) 2026 Yikun Ji | Phase 08 bridge reference | - |
| S14 | sts2-ai-mcp @ `5d1d36b` | https://github.com/BMingSY/sts2-ai-mcp | 2026-10-25 | - | **AGPL-3.0** (copyleft) | do not incorporate | - |
| S15 | yizhang-dream/sts2-simulator @ `83fcca6` | https://github.com/yizhang-dream/sts2-simulator | 2026-10-25 | May-2026 snapshot | **No license**; "No permission to redistribute game content is granted"; structure "ported from reference game sources" | **not used** | - |
| S16 | Spire Codex @ `2af6543` + API terms | https://github.com/ptrlrd/spire-codex | 2026-10-25 | per-build | Source **PolyForm Noncommercial 1.0.0**; `API_TERMS.md`: 300 req/min/IP, data export 10/h, "game data belongs to Mega Crit" | not mirrored; point lookups only if ever needed | - |
| S17 | npm registry (dependency audit) | https://registry.npmjs.org/ | 2026-10-25 | n/a | per package | stack selection (see ADR-012) | - |

## 3. Contradictions found and how they were resolved

| # | Contradiction | Resolution |
|---|---|---|
| C1 | **A7 base rare chance.** sts.wiki: 1.49 % / 5 % / 4.5 %. Almanauts prose only mentions the halved *growth*. | **E1 settles it:** `RegularRareOdds` A7 = 0.0149, elite 0.05, shop 0.045; growth 0.005. sts.wiki was right; Almanauts' prose was incomplete (its calculator still offers A7). |
| C2 | **A6 name/effect.** spire-archive `mechanics.json`: "Gloom - Less Rest Sites"; wiki.gg/sts.wiki/E1: **Inflation** (card removal 100 + 50n). | E1 `AscensionLevel.Inflation` + `MerchantCardRemovalEntry`. spire-archive's hand-written text is stale (it is not an extracted field). |
| C3 | **"Act 1-4"** in simulators' READMEs vs a 3-act game. | E1: four `ActModel` classes (Overgrowth/Underdocks share index 0); a run has `ActsByIndex.Count = 3` acts; the Architect is a scripted event room, not an act. |
| C4 | **White Beast Statue** and the potion counter: sts.wiki (main) says it still lowers the counter; beta v0.108.0 notes say it no longer does. | Both true for their builds. Rule POT-2 is pinned to main; beta unverified. |
| C5 | **Reward-pool sizes.** Almanauts: 20 / 35 / 25 per class. spire-archive data: 20 / 36 / 26 plus Basic and Ancient. | Likely one unreachable/unregistered card per rarity (zhiyue notes cite an unregistered card). **Open** (needs the card-pool files; see RESEARCH-OPEN-QUESTIONS). The odds engine does not depend on pool size. |
| C6 | **Totals differ** (sts.wiki 596 cards vs Almanauts/spire-archive 577; relics 298 / 296 / 289-297). | Different inclusion of tokens/statuses/unregistered content. Never hardcode a count (project rule). |
| C7 | **Shop price range endpoints** (e.g. rare card 143-158 vs formula 142.5-157.5). | Rounding at the extreme tails of a continuous multiplier; immaterial. We state formulas, not ranges, and test with tolerance +/-1. |
| C8 | zhiyue README says `ascension_level` 0-20 and a 217-dim observation; code is A0-A10 and 237-dim (run). | Documentation is stale; code and E1 govern. SLAY2 clamps ascension to 0-10. |

## 4. Reuse decisions (summary)

| Allowed | Conditional | Not allowed |
|---|---|---|
| Read public pages; cite; implement *independent* math; link and attribute; MIT code with attribution (not yet used). | Execute the third-party simulator **locally** for research (ADR-011); derive facts-only catalogs with provenance; consented local bridge in Phase 08. | Commit any third-party/decompiled file, text, image or data dump; mirror Codex data; incorporate AGPL code; ship simulator output as "real game" results. Enforced by `scripts/guard-third-party.sh`. |
