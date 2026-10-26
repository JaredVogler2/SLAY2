import {
  ACT1_BRIEFS,
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
 * game's monsters); each ask maps to the coverage groups the heuristic already scores; the tilt is the weighted mean over
 * the version's fights, so a boss the player has seen on the map counts three times as much as an unknown one (the three
 * elites count once each; an unknown boss is the mean of the version's three).
 *
 * This is judgement, not measurement: the card values the site measures were played in Overgrowth only, and no fight-level
 * effect has been fitted. The tilt is therefore small (at most 30 %), always shown as its own line, and can be switched off.
 */
export const MAX_TILT = 0.3;

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
  /** Names of the fights that drive it, most influential first. */
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

function scopeOf(ctx: ActContext): Weighted[] {
  const brief = ACT1_BRIEFS[ctx.variant];
  const boss = ctx.boss ? getAct1Boss(ctx.variant, ctx.boss) : undefined;
  return [
    ...brief.elites.map((fight) => ({ fight, weight: 1 })),
    ...(boss ? [{ fight: boss, weight: 3 }] : brief.bosses.map((fight) => ({ fight, weight: 1 }))),
  ];
}

export function actContextTilt(ctx: ActContext): ContextTilt {
  const scope = scopeOf(ctx);
  const total = scope.reduce((a, s) => a + s.weight, 0);
  const brief = ACT1_BRIEFS[ctx.variant];
  const boss = ctx.boss ? (getAct1Boss(ctx.variant, ctx.boss) ?? null) : null;
  const multipliers = Object.fromEntries(GROUPS.map((g) => [g, 1])) as Record<Group, number>;
  const adjustments: ContextAdjustment[] = [];
  for (const group of GROUPS) {
    const contributions = scope.map(({ fight, weight }) => ({
      fight,
      value: (weight * fight.asks.reduce((a, ask) => a + (ASK_GROUPS[ask][group] ?? 0), 0)) / total,
    }));
    const raw = contributions.reduce((a, c) => a + c.value, 0);
    const tilt = MAX_TILT * Math.max(-1, Math.min(1, raw));
    if (Math.abs(tilt) < 0.01) {
      continue;
    }
    multipliers[group] = 1 + tilt;
    adjustments.push({
      group,
      multiplier: 1 + tilt,
      because: contributions
        .filter((c) => Math.sign(c.value) === Math.sign(raw) && c.value !== 0)
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 3)
        .map((c) => c.fight.name),
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
