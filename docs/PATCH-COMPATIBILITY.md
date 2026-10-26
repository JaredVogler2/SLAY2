# Patch compatibility (STS2)

Status: **living document**, generated figures last refreshed 2026-10-26. Machine-readable records: [`docs/patches/`](patches/).

## 1. Principles

* **Early Access moves.** Every number SLAY2 shows is tied to a build (`sts2-main-0.107.1`). A build that is not in `packages/game-schema` is refused (ADR-014); the beta build `v0.111.0` is listed as unsupported because its rules were never verified. There is no silent fall-back to the previous patch's numbers.
* **A diff tells us what to re-verify, not what the patch says.** `slay2_sim patchdiff` compares archived snapshots and records **ids, categorical facts (class, rarity, cost, type, target, tier) and the *names* of fields that changed**. It never copies names, descriptions or numeric values (docs/IP-COMPLIANCE.md section 2); a changed description is reported as `changed: ["text"]`, a changed number as `changed: ["vars"]`.
* **Extraction noise is separated from game changes.** A field that the archive populated in one snapshot and left empty in the other is listed under `extraction_only`; a field that exists in only one snapshot is a schema difference. Neither is counted as a game change.

## 2. Sources and limits

| Item | Value |
|---|---|
| Snapshot source | `nkhoit/spire-archive` @ `4e6b0e0` (local, read-only, git-ignored; ADR-011) |
| Versions available | 0.99.1 (2026-03-12), 0.103.2 (2026-04-20), 0.107.1 (2026-06-18) |
| Current main build | v0.107.1 (Steam build 23811903); this is the newest snapshot the archive holds |
| Beta build | v0.111.0 is **not** in the archive, so no diff or rule verification exists for it |
| What a snapshot cannot tell us | behaviour: whether a card still does the same thing is only visible through the game or the simulator |

## 3. Diffs

### 0.99.1 -> 0.103.2 (2026-03-12 -> 2026-04-20)

| Category | Before | After | Added | Removed | Changed | Newly extracted only |
|---|---:|---:|---:|---:|---:|---:|
| cards | 576 | 576 | 1 | 1 | 76 | 8 |
| enchantments | 22 | 22 | 1 | 1 | 1 | 0 |
| events | 66 | 66 | 0 | 0 | 9 | 0 |
| monsters | 111 | 111 | 1 | 1 | 21 | 1 |
| potions | 63 | 63 | 0 | 0 | 3 | 0 |
| powers | 241 | 243 | 5 | 3 | 5 | 0 |
| relics | 288 | 293 | 5 | 0 | 21 | 0 |

Cards added/removed: +`NOT_YET` / -`GRAPPLE`. Relics added: `HEFTY_TABLET`, `NEOWS_BONES`, `NEOWS_TALISMAN`, `PHIAL_HOLSTER`, `WINGED_BOOTS`. Card fact changes (rarity/cost/type/target): `ACROBATICS` (rarity: Common -> Uncommon); `BANSHEES_CRY` (cost: 6 -> 9); `BEGONE` (target: AnyEnemy -> Self, type: Attack -> Skill); `BORROWED_TIME` (cost: 0 -> 1); `BREAK` (cost: 2 -> 1); `BUNDLE_OF_JOY` (cost: 2 -> 1); `COLOSSUS` (rarity: Rare -> Uncommon); `FOLLOW_THROUGH` (rarity: Uncommon -> Common, target: AllEnemies -> AnyEnemy); `MINION_DIVE_BOMB` (cost: 1 -> 0); `RIP_AND_TEAR` (rarity: Uncommon -> Event); `SEANCE` (cost: 0 -> 1); `VOLTAIC` (cost: 2 -> 3).

### 0.103.2 -> 0.107.1 (2026-04-20 -> 2026-06-18)

| Category | Before | After | Added | Removed | Changed | Newly extracted only |
|---|---:|---:|---:|---:|---:|---:|
| cards | 576 | 577 | 2 | 1 | 36 | 2 |
| enchantments | 22 | 22 | 0 | 0 | 2 | 0 |
| events | 66 | 66 | 0 | 0 | 1 | 0 |
| monsters | 111 | 111 | 1 | 1 | 95 | 2 |
| potions | 63 | 63 | 0 | 0 | 0 | 0 |
| powers | 243 | 241 | 2 | 4 | 8 | 0 |
| relics | 293 | 296 | 3 | 0 | 6 | 0 |

* Cards added: `SCARE`, `WITHER`; removed: `FOLLOW_THROUGH`.
* Card fact changes: `DRUM_OF_BATTLE` (cost: 0 -> 1, type: Power -> Skill); `FUSION` (cost: 2 -> 1); `MONARCHS_GAZE` (cost: 3 -> 2); `PREDATOR` (rarity: Uncommon -> Common).
* Relics added: `FISHING_ROD`, `KALEIDOSCOPE`, `SILKEN_TRESS`; none removed.
* Monsters: added `AEONGLASS`, removed `DOORMAKER`. The large "changed" count is dominated by re-extracted move patterns and powers in the archive; only the six monsters whose HP fields changed and the six whose opening move changed are likely real balance changes. Re-check them with the simulator HP audit (`python -m slay2_sim audit monster-hp`) rather than trusting the archive alone.
* Potions: no id or categorical change. Potion count (63) is constant and no potion id or categorical fact changed, so nothing in the potion-drop rules (POT-1 .. POT-5) needs re-deriving from this diff.
* Enchantments, events, powers: see the JSON; powers renamed or removed matter only to the simulator vocabulary.

**The committed card catalog already reflects 0.107.1**: for all five card facts that changed in this patch (three costs, one rarity, one type) `packages/game-data/data/cards.sts2-main-0.107.1.json` carries the new value.

## 4. Simulator coverage of v0.107.1 ids

Computed by `python -m slay2_sim patchdiff 0.103.2 0.107.1 --coverage` against the pinned simulator (`docs/patches/simulator-coverage-0.107.1.json`):

| | Archive 0.107.1 | Matched in simulator | Missing from simulator | Simulator-only |
|---|---:|---:|---:|---|
| Cards | 577 | 577 (68 through the `_CARD` / `_STATUS` suffix the simulator adds when a card shares a name with a power) | 0 | `DEPRECATED_CARD`, `FOLLOW_THROUGH`, `GENERIC`, `GRAPPLE`, `PAIN`, `PARASITE` |
| Relics | 296 | 296 | 0 | `DEPRECATED_RELIC` |

* Every card and relic id of v0.107.1 exists in the simulator, and no card enum member lacks an implementation. **This is id coverage, not behavioural parity**: parity with the live game stays UNVERIFIED (docs/SIMULATOR-CANDIDATE-MATRIX.md).
* The simulator-only cards are enum members that no reward pool contains (checked against `ALL_CARD_POOL`, the class pools and the deprecated pool): `FOLLOW_THROUGH` was removed in 0.107.1 and `GRAPPLE` in 0.103.2, so they can never be offered in a simulated reward.

## 5. What each kind of change affects

| Change in a patch | SLAY2 artifacts to re-verify | Command |
|---|---|---|
| Card added/removed, rarity or class change | catalog, reward-pool sizes (CARD-* rules, 20/35/25 solo pools), odds fixtures that use pool sizes, advisor role tags | `python -m slay2_sim catalog` then `pnpm check` |
| Card cost/type change | advisor energy curve and the opening-hand report; simulator action costs | `pnpm --filter @slay2/decision test` |
| Relic added | nothing numeric; simulator vocabulary and relic effects that touch odds (potion/card modifiers, CARD-10) | review `docs/game/MECHANICS-COVERAGE.md` |
| Monster HP or move change | simulator HP audit (gap G2), any monster-specific advice | `python -m slay2_sim audit monster-hp` |
| Potion list change | potion odds rules and the potion calculator | `pnpm --filter @slay2/odds test` |
| Anything not in a snapshot (rules, odds, ascension) | the rule register: each row names its evidence; E1 rows need the decompiled source of the new build | `docs/game/MECHANICS-COVERAGE.md` |

## 6. When a new patch ships

1. Read the official announcement and record the build id and version (`docs/SOURCE-REGISTRY.md`).
2. Mark the new build **unsupported** in `packages/game-schema` until steps 3-6 pass (the hotfix invariant: never apply the previous patch's numbers to a new build).
3. Update the pinned archive (`external/pins.json`) and run `python -m slay2_sim patchdiff <old> <new> --coverage --out docs/patches/...`.
4. Re-derive the catalog and re-run the exact-odds fixtures; check every rule row whose evidence is a source file.
5. Re-run the simulator audits and a canary batch on the new build; keep champion policies tied to the build they were trained on (never blend patch-inconsistent cohorts).
6. Only then add the build to the supported list and refresh `/methods`.

## 7. Noticing that a patch shipped (patch-watch, ADR-047)

Step 1 above starts with someone reading the announcement. `scripts/patch-watch.mjs` is what makes sure that someone is told:
it reads the **official** announcements of Slay the Spire 2 from Steam's public news API (`ISteamNews/GetNewsForApp`, app 2868840,
the `steam_community_announcements` feed, so only posts Mega Crit wrote), takes the version from titles such as `Beta Patch Notes -
v0.111.0` or `Major Update #2 - v0.107.1`, and compares them with the builds in `packages/game-schema/src/builds.ts`.

| Result | Exit | Meaning |
|---|---:|---|
| current | 0 | no main-channel version newer than the supported build was announced |
| newer-beta | 0 | a beta newer than the newest known one exists: a warning; beta stays unsupported |
| **STALE** | 1 | a main-channel version newer than the supported build was announced: do section 6 |
| unchecked | 2 | the feed was unreachable or no official post named a version: never read as "current" |

`.github/workflows/patch-watch.yml` runs it on Mondays at 06:41 UTC, by hand (`workflow_dispatch`) and in a pull request that
changes the script, the workflow, its fixture or `builds.ts` (where "unchecked" is only a warning: a network blip must not block a
merge). A scheduled failure is the notification; the schedule runs from the default branch, so it starts when this is merged.
Eight tests run the script on a saved copy of the real feed (`scripts/fixtures/steam-news-2026-10-26.json`: titles, dates and links
of the 40 newest official posts) and on copies with one post added.

**What it cannot see.** A change that Mega Crit does not announce (a silent hotfix; Steam's build id moves with no post), and a post
whose title does not carry the version. The build id in `builds.ts` is recorded, not checked: the official ways to read it need a
Steam client. As of 2026-10-26 the newest main post is `Major Update #2 - v0.107.1` (2026-06-19) and the newest beta
`Beta Patch Notes - v0.111.0` (2026-08-14): the supported build is current.

