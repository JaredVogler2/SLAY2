import {
  ACT1_BRIEFS,
  ACT1_VARIANTS,
  getAct1Boss,
  type Act1Variant,
  type Ask,
  type FightBrief,
} from "@slay2/game-data";

import { GROUPS, type Group } from "./profile";
import type { Weights } from "./quality";

/**
 * Act 1 context (ADR-048): the elites and bosses of the player's version of Act 1 tilt the coverage weights of the draft
 * heuristic. Each fight is tagged with what it rewards in a deck (`@slay2/game-data` `asks`, SLAY2's own reading of the
 * game's monsters); each ask maps to the coverage groups the heuristic already scores; a group's *need* is the weighted mean
 * over the fights in scope (the version's three elites, and its boss: one boss the player has seen counts three times as
 * much as an unknown one, which is the mean of the version's three).
 *
 * The tilt is the need **minus the need of the average Act 1** (the two versions' fights together, boss unknown). That is
 * what the player's version changes: a thing every fight asks for (almost every elite and boss hits hard enough to want
 * block) is already in the heuristic's weights and must not move them, and the review of the first version of this file
 * showed that it did, by the full 30 % whatever the version.
 *
 * This is judgement, not measurement: the card values the site measures were played in Overgrowth only, and no fight-level
 * effect has been fitted. The tilt is therefore small (a few percent for most groups; the 30 % cap needs half of the fights
 * in scope to ask for something the average Act 1 does not ask for at all: see FULL_TILT_AT), always shown as its own
 * line, and can be switched off.
 */
export const MAX_TILT = 0.3;
/**
 * The gap between the need of the player's fights and the average Act 1's at which the tilt reaches MAX_TILT: half of the
 * fights asking for something the average Act 1 does not. A smaller gap tilts in proportion. A judgement.
 */
export const FULL_TILT_AT = 0.5;

/** How much each ask asks of each coverage group; positive raises the group's weight, negative lowers it. */
export const ASK_GROUPS: Readonly<Record<Ask, Readonly<Partial<Record<Group, number>>>>> = {
  aoe: { aoe: 1 },
  "single-target": { aoe: -0.5, damage: 0.3 },
  "multi-hit": { damage: 0.5 },
  burst: { damage: 0.7 },
  sustained: { scaling: 0.8 },
  block: { block: 1 },
  setup: { scaling: 0.5, draw: 0.5 },
  draw: { draw: 1 },
};

export interface ActContext {
  readonly variant: Act1Variant;
  /** The id of the Act 1 boss on the player's map, if the player knows it. */
  readonly boss: string | null;
}

export interface ContextAdjustment {
  readonly group: Group;
  /** Multiplier applied to the group's coverage weight (1.2 = 20 % more). */
  readonly multiplier: number;
  /**
   * Names of the fights that drive a rise, most influential first. Empty for a fall: nothing in the player's fights asks
   * for less, the average Act 1 simply asks for more of it.
   */
  readonly because: readonly string[];
}

export interface ContextTilt {
  readonly variant: Act1Variant;
  readonly variantName: string;
  readonly boss: FightBrief | null;
  readonly adjustments: readonly ContextAdjustment[];
  readonly multipliers: Readonly<Record<Group, number>>;
}

interface Weighted {
  readonly fight: FightBrief;
  readonly weight: number;
}

type Need = Readonly<Record<Group, number>>;

function scopeOf(ctx: ActContext): Weighted[] {
  const brief = ACT1_BRIEFS[ctx.variant];
  const boss = ctx.boss ? getAct1Boss(ctx.variant, ctx.boss) : undefined;
  return [
    ...brief.elites.map((fight) => ({ fight, weight: 1 })),
    ...(boss ? [{ fight: boss, weight: 3 }] : brief.bosses.map((fight) => ({ fight, weight: 1 }))),
  ];
}

/** What one fight asks of a group, summed over its asks. */
function asked(fight: FightBrief, group: Group): number {
  return fight.asks.reduce((a, ask) => a + (ASK_GROUPS[ask][group] ?? 0), 0);
}

/** The weighted mean of what the fights in scope ask of each group. */
function needOf(scope: readonly Weighted[]): Need {
  const total = scope.reduce((a, s) => a + s.weight, 0);
  return Object.fromEntries(
    GROUPS.map((g) => [g, scope.reduce((a, s) => a + s.weight * asked(s.fight, g), 0) / total]),
  ) as Record<Group, number>;
}

/** The average Act 1: the need of each version with its boss unknown, averaged over the versions. */
function averageNeed(): Need {
  const needs = ACT1_VARIANTS.map((variant) => needOf(scopeOf({ variant, boss: null })));
  return Object.fromEntries(
    GROUPS.map((g) => [g, needs.reduce((a, n) => a + n[g], 0) / needs.length]),
  ) as Record<Group, number>;
}

export function actContextTilt(ctx: ActContext): ContextTilt {
  const scope = scopeOf(ctx);
  const here = needOf(scope);
  const typical = averageNeed();
  const brief = ACT1_BRIEFS[ctx.variant];
  const boss = ctx.boss ? (getAct1Boss(ctx.variant, ctx.boss) ?? null) : null;
  const total = scope.reduce((a, s) => a + s.weight, 0);
  const multipliers = Object.fromEntries(GROUPS.map((g) => [g, 1])) as Record<Group, number>;
  const adjustments: ContextAdjustment[] = [];
  for (const group of GROUPS) {
    const gap = here[group] - typical[group];
    const tilt = MAX_TILT * Math.max(-1, Math.min(1, gap / FULL_TILT_AT));
    if (Math.abs(tilt) < 0.01) {
      continue;
    }
    multipliers[group] = 1 + tilt;
    adjustments.push({
      group,
      multiplier: 1 + tilt,
      because:
        gap > 0
          ? scope
              .map(({ fight, weight }) => ({
                fight,
                value: (weight * asked(fight, group)) / total,
              }))
              .filter((c) => c.value > 0)
              .sort((a, b) => b.value - a.value)
              .slice(0, 3)
              .map((c) => c.fight.name)
          : [],
    });
  }
  adjustments.sort((a, b) => Math.abs(b.multiplier - 1) - Math.abs(a.multiplier - 1));
  return { variant: ctx.variant, variantName: brief.name, boss, adjustments, multipliers };
}

/** The weights with each coverage group scaled by the context's multiplier. */
export function tiltWeights(weights: Weights, tilt: ContextTilt): Weights {
  return {
    ...weights,
    coverage: Object.fromEntries(
      GROUPS.map((g) => [g, weights.coverage[g] * tilt.multipliers[g]]),
    ) as Record<Group, number>,
  };
}
