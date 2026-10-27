import {
  CATALOG,
  CHARACTER_FACTS,
  PLAYABLE_CLASSES,
  RELIC_CATALOG,
  SYNERGY,
  hasWrittenTags,
  rewardPool,
  type PlayableClass,
} from "@slay2/game-data";
import { BUILDS, MAX_ASCENSION, SUPPORTED_BUILD_ID } from "@slay2/game-schema";

import evidence from "@/content/evidence.generated.json";
import rules from "@/content/rules.generated.json";

export const API_SCHEMA = 1 as const;

/** Share of a class's reward cards that carry at least one SLAY2 role tag: a measure of how much the v0 advisor can "see". */
export function tagCoverage(cls: PlayableClass): { cards: number; tagged: number; share: number } {
  const pool = rewardPool(cls);
  const tagged = pool.filter((c) =>
    c.roles.some(
      (r) =>
        !["exhaust", "ethereal", "retain", "innate", "sly", "unplayable", "eternal"].includes(r),
    ),
  ).length;
  return {
    cards: pool.length,
    tagged,
    share: Math.round((tagged / Math.max(1, pool.length)) * 1000) / 1000,
  };
}

/** Share of a class's reward cards that have a written entry in the synergy table (what they supply to the deck and what they need). */
export function synergyCoverage(cls: PlayableClass): {
  cards: number;
  tagged: number;
  share: number;
} {
  const pool = rewardPool(cls);
  const tagged = pool.filter((c) => hasWrittenTags(c.id)).length;
  return {
    cards: pool.length,
    tagged,
    share: Math.round((tagged / Math.max(1, pool.length)) * 1000) / 1000,
  };
}

export function capabilities() {
  return {
    schema: API_SCHEMA,
    gameId: "STS2",
    builds: Object.values(BUILDS).map((b) => ({
      id: b.id,
      channel: b.channel,
      version: b.version,
      steamBuildId: b.steamBuildId,
      support: b.support,
      ...(b.reason ? { reason: b.reason } : {}),
    })),
    supportedBuild: SUPPORTED_BUILD_ID,
    ascension: {
      min: 0,
      max: MAX_ASCENSION,
      note: "STS2 has no A11-A20; Ascension 10 adds a second final-act boss.",
    },
    acts: 3,
    modes: { solo: "supported", coop: "unsupported" },
    characters: PLAYABLE_CLASSES.map((id) => ({
      id,
      startingHp: CHARACTER_FACTS.find((c) => c.id === id)?.startingHp,
      odds: "supported",
      cardAdvisor: {
        status: "heuristic-v1",
        calibrated: false,
        roleTagCoverage: tagCoverage(id),
        synergyTagCoverage: synergyCoverage(id),
      },
    })),
    features: [
      {
        id: "odds.rarity",
        status: "supported",
        method: "exact",
        endpoint: "POST /api/v1/odds {calculator:'rarity'}",
      },
      {
        id: "odds.potion",
        status: "supported",
        method: "exact",
        endpoint: "POST /api/v1/odds {calculator:'potion'}",
      },
      {
        id: "odds.unknown_room",
        status: "supported",
        method: "exact",
        endpoint: "POST /api/v1/odds {calculator:'unknown_room'}",
      },
      {
        id: "odds.draw",
        status: "supported",
        method: "exact",
        endpoint: "POST /api/v1/odds {calculator:'draw'}",
      },
      {
        id: "odds.shop_gold",
        status: "supported",
        method: "exact",
        endpoint: "POST /api/v1/odds {calculator:'price'|'removal'|'gold'}",
      },
      {
        id: "odds.route",
        status: "supported",
        method: "exact",
        endpoint: "POST /api/v1/odds {calculator:'route'}",
      },
      {
        id: "advisor.card_draft",
        status: "heuristic-v1",
        method: "heuristic",
        calibrated: false,
        endpoint: "POST /api/v1/recommend",
      },
      { id: "advisor.ancient", status: "planned" },
      { id: "advisor.map", status: "planned" },
      { id: "advisor.combat", status: "planned" },
      { id: "advisor.shop", status: "planned" },
      { id: "advisor.rest", status: "planned" },
      { id: "advisor.events", status: "planned" },
      { id: "coop", status: "unsupported" },
    ],
  };
}

export function manifest() {
  return {
    schema: API_SCHEMA,
    gameId: "STS2",
    build: BUILDS[SUPPORTED_BUILD_ID],
    data: {
      cardCatalog: {
        sha256: CATALOG.sha256,
        cards: CATALOG.cards.length,
        kind: CATALOG.provenance.kind,
        derivedBy: CATALOG.provenance.derivedBy,
        sources: CATALOG.provenance.sources,
      },
      relicCatalog: {
        sha256: RELIC_CATALOG.sha256,
        relics: RELIC_CATALOG.relics.length,
        kind: RELIC_CATALOG.provenance.kind,
        derivedBy: RELIC_CATALOG.provenance.derivedBy,
        sources: RELIC_CATALOG.provenance.sources,
      },
      ruleRegister: { rules: rules.rules.length, source: rules.generatedFrom },
      synergyTable: {
        sha256: SYNERGY.sha256,
        cards: Object.keys(SYNERGY.cards).length,
        kind: "SLAY2's judgement of how cards work together; not a measurement",
      },
      evidenceReports: evidence.reports.length,
    },
    updateFlags: {
      betaBuild: { id: "sts2-beta-0.111.0", support: "unsupported" },
      note: "Odds and advisor are pinned to main v0.107.1. A newer main build is not supported until its rules are re-verified.",
    },
  };
}
