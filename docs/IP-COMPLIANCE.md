# SLAY2 IP and rights compliance

Status: **living document**, last updated 2026-10-25. Not legal advice; counsel review is required before any monetization (see "Open decisions").

## 1. Stance

SLAY2 is an **independent, unofficial, free, noncommercial** strategy/analysis site for *Slay the Spire 2* (Mega Crit). It is not affiliated with or endorsed by Mega Crit. No ads, paywall, donations, or sponsorship until the owner and counsel decide otherwise.

Mega Crit's Content Policy (retrieved 2026-10-25, site built 2026-09-28) grants video-content, original-art merchandise (no assets taken from the game, **no generative-AI art**) and mod permissions (donations only, otherwise no monetization). It says **nothing** about third-party strategy tools or websites, and its footer reads "All Rights Reserved". We therefore treat everything not expressly granted as reserved.

## 2. What the public site and this repository may contain

| Allowed | Not allowed |
|---|---|
| Original code, math, tests, UI design | Game art, icons, audio, fonts, logos, card/relic frames |
| Factual identifiers: canonical ids, display names, class, rarity, cost, type (minimal, with provenance and attribution) | Card/relic/potion/event **text**, flavour text, descriptions copied from the game or any site |
| Our own short paraphrased role tags ("attack", "block", "draw", ...) | Bulk dumps of extracted data, JSON mirrors of third-party databases |
| Aggregated results from our own experiments | Decompiled code or text, `.pck`/`.dll` contents, extracted assets |
| Hand-authored SVG/CSS illustration | AI-generated imagery presented as art (conflicts with Mega Crit's art policy language) |

`scripts/guard-third-party.sh` (pre-commit hook + CI) rejects forbidden paths (`decompiled/`, `extracted_pck/`, `external/checkouts/`, `*.pck`, `*.dll`, ...), un-allow-listed C# files, env files, and files carrying decompiled-code headers. `scripts/test-guard.sh` covers the guard itself.

## 3. ADR-011: use of rights-restricted third-party references (decision of 2026-10-25)

**Context.** The project owner directed (via the session `/goal`) that SLAY2 *use* `zhiyue/sts2-rl-agent` and `nkhoit/spire-archive` and their decompiled content. Our own earlier rules (CLAUDE.md, README rule 4, source registry) said not to vendor extracted game code or unlicensed simulators.

**What those repositories are** (verified, see `external/pins.json`):

* `zhiyue/sts2-rl-agent` @ `5d874e8`: **no license**; commits **3,426 decompiled Mega Crit C# files** (`decompiled/`, from `sts2.dll`, game v0.107.1), a Python re-implementation, RL scripts and a C# bridge.
* `nkhoit/spire-archive` @ `4e6b0e0`: **no license**; data "extracted from PCK game files + decompiled C# source".

Absent a license, the default is "all rights reserved"; the decompiled files are Mega Crit's proprietary code.

**Decision.** Use them as **local, pinned, read-only, git-ignored external inputs**:

1. *Read* the decompiled sources to verify game rules; record **facts and constants** with a file-path citation (evidence class E1). No code or text is copied.
2. *Execute* the third-party simulator locally for research experiments; results are labelled **simulator output, parity with the live game UNVERIFIED**.
3. *Read* spire-archive data to cross-check ids/rarity/cost/type and compute patch diffs; at most a **minimal facts-only catalog** is derived for the site, with provenance flags.
4. **Never** commit, push, publish, or deploy any of their files, text, images or data. Enforced mechanically (section 2).
5. Keep E1-derived facts **separable**: every rule in `docs/game/MECHANICS-COVERAGE.md` carries its evidence class, so E1 can be removed and the rule re-supported by E3/E4 or live-game checks if a rights holder objects.

**Consequences / residual risk.**

* Reading decompiled code means a later "clean-room" claim is **no longer available** for logic that was verified against it. SLAY2's engine code is original, but it is *informed by* E1. The owner accepted this trade-off by issuing the directive; counsel should review before any commercial step.
* The two repositories could be removed or taken down at any time; pins keep the SHAs reproducible only while upstream exists. We do not mirror them.
* A takedown or objection from Mega Crit would require removing E1-derived citations and the derived catalog, and re-validating against E3/E4/live-game evidence.

**Transparency note (exposure log).** During the license audit, before the directive, the first 25 lines of `yizhang-dream/sts2-simulator/DECOMPILED_ARCHITECTURE.md` (a namespace map) were displayed in the agent session; nothing from it was used. After the directive, files under `zhiyue/sts2-rl-agent/decompiled/` read for rule verification were: `Odds/{AbstractOdds,CardRarityOdds,PotionRewardOdds,UnknownMapPointOdds,PlayerOddsSet}.cs`, `Factories/{CardFactory,RelicFactory,PotionFactory}.cs` (parts), `Entities.Ascension/*`, `Helpers/AscensionHelper.cs`, `Entities.Merchant/*`, `Models/{EncounterModel,RelicModel,ActModel,ModelDb}.cs` (parts), `Models.Acts/*` (index lines), `Models.Events/TheArchitect.cs`, `Runs/RunManager.cs` (parts), `Runs/CardRarityOddsType.cs`, `Runs/CardCreationSource.cs`.

## 4. Other third-party material

| Item | License | Decision |
|---|---|---|
| STS2FableBot | MIT | Reference only so far; reuse requires keeping the copyright notice. Its win rates are self-reported and **not** SLAY2 results. |
| STS2MCP | MIT | Phase 08 reference. Its write endpoints must not ship in a public companion. |
| sts2-ai-mcp | **AGPL-3.0** | Do not incorporate or link (copyleft network clause). |
| yizhang-dream/sts2-simulator | none | Not used. |
| Spire Codex | source PolyForm Noncommercial; API terms (300 req/min/IP, data export 10/h, "game data belongs to Mega Crit") | Not mirrored. Point lookups only if ever needed; no cached bulk copy. |
| npm dependencies | MIT / Apache-2.0 (axe-core: MPL-2.0, dev-only) | Audited 2026-10-25 (ADR-012); re-run `pnpm licenses list` in CI. |
| Almanauts / sts.wiki / wiki.gg | text CC BY-SA (game data excluded) | Facts cited with attribution; no text copied. |

## 5. Open decisions (owner)

1. **License for SLAY2's own code** - undecided; the repository is currently "all rights reserved" by default. Candidates: MIT (permissive) or PolyForm Noncommercial (matches the noncommercial stance).
2. Any monetization, donations, or a mod distribution: requires counsel and Mega Crit's confirmation.
3. Whether to publish simulator-derived statistics prominently or keep them under `/methods` with the UNVERIFIED label (default: `/methods` only).
