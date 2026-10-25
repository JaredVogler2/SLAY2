import { CATALOG, getCard, rewardPool, ALL_UNLOCKED, type CardEntry } from "@slay2/game-data";
import { requireSupportedBuild } from "@slay2/game-schema";

import { mulberry32, stateDigest } from "./digest";
import { GROUPS, profileDeck, type DeckEntry, type DeckProfile, type Group } from "./profile";
import { baseWeights, scoreTerms, total, type Terms, type Weights } from "./quality";
import {
  DraftRequestSchema,
  type DraftAction,
  type DraftRequest,
  type DraftResponse,
  type RankedOption,
  type Reason,
} from "./types";

export class InvalidDraftRequestError extends Error {
  readonly code = "invalid_request" as const;
  constructor(
    message: string,
    readonly details: readonly { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "InvalidDraftRequestError";
  }
}

const GROUP_LABELS: Readonly<Record<Group, string>> = {
  damage: "damage",
  aoe: "area damage",
  block: "block",
  scaling: "scaling / engine",
  draw: "card draw",
  energy: "energy",
  debuff: "debuffs",
};

const SKIP_LABEL = "Skip (take nothing)";
const CLOSE_CALL_MARGIN = 0.5;
const PERTURBATIONS = 64;

function fmt(x: number): string {
  return (Math.abs(x) < 0.005 ? 0 : x).toFixed(2);
}

function resolveDeck(request: DraftRequest): DeckEntry[] {
  const entries: DeckEntry[] = [];
  const unknown: string[] = [];
  for (const e of request.deck) {
    const card = getCard(e.id);
    if (!card) {
      unknown.push(e.id);
    } else {
      entries.push({ card, count: e.count });
    }
  }
  if (unknown.length > 0) {
    throw new InvalidDraftRequestError(
      `unknown card id(s) in deck: ${unknown.join(", ")}`,
      unknown.map((id) => ({ path: "deck", message: `unknown card id ${id}` })),
    );
  }
  return entries;
}

function resolveOffered(request: DraftRequest): CardEntry[] {
  const seen = new Set<string>();
  const cards: CardEntry[] = [];
  for (const id of request.offered) {
    if (seen.has(id)) {
      throw new InvalidDraftRequestError(
        `offered card ${id} is listed twice (a pack never repeats a card)`,
        [{ path: "offered", message: `duplicate ${id}` }],
      );
    }
    seen.add(id);
    const card = getCard(id);
    if (!card) {
      throw new InvalidDraftRequestError(`unknown offered card id ${id}`, [
        { path: "offered", message: `unknown card id ${id}` },
      ]);
    }
    cards.push(card);
  }
  return cards;
}

function withCard(entries: readonly DeckEntry[], card: CardEntry): DeckEntry[] {
  const out = entries.map((e) =>
    e.card.id === card.id ? { card: e.card, count: e.count + 1 } : e,
  );
  return out.some((e) => e.card.id === card.id) ? out : [...out, { card, count: 1 }];
}

function describeDelta(
  before: Terms,
  after: Terms,
  bp: DeckProfile,
  ap: DeckProfile,
  card: CardEntry,
): Reason[] {
  const reasons: Reason[] = [];
  const dq = after.quality - before.quality;
  reasons.push({
    kind: "quality",
    delta: dq,
    text:
      dq >= 0
        ? `Raises average card quality from ${bp.meanPrior.toFixed(1)} to ${ap.meanPrior.toFixed(1)} (its static prior is ${String(card.prior)}).`
        : `Dilutes average card quality from ${bp.meanPrior.toFixed(1)} to ${ap.meanPrior.toFixed(1)} (its static prior is ${String(card.prior)}).`,
  });
  for (const g of GROUPS) {
    const d = after.coverage[g] - before.coverage[g];
    if (Math.abs(d) >= 0.05) {
      const had = bp.groups[g];
      reasons.push({
        kind: "coverage",
        delta: d,
        text:
          had === 0
            ? `Adds your first ${GROUP_LABELS[g]} source (you have none yet).`
            : `Adds ${GROUP_LABELS[g]} coverage (${String(had)} -> ${String(ap.groups[g])} cards), with diminishing returns.`,
      });
    }
  }
  const dc = after.curve - before.curve;
  if (Math.abs(dc) >= 0.05) {
    reasons.push({
      kind: "curve",
      delta: dc,
      text:
        dc < 0
          ? `Pushes the average energy cost to ${ap.averageEnergyCost.toFixed(2)} (3 energy per turn).`
          : `Lowers the average energy cost to ${ap.averageEnergyCost.toFixed(2)}.`,
    });
  }
  const ds = after.size - before.size;
  if (Math.abs(ds) >= 0.05) {
    reasons.push({
      kind: "size",
      delta: ds,
      text: `Deck grows to ${String(ap.size)} cards; past about 30 each extra card slows the draw cycle.`,
    });
  }
  const dy = after.synergy - before.synergy;
  if (Math.abs(dy) >= 0.05) {
    reasons.push({
      kind: "synergy",
      delta: dy,
      text: "Strength scaling pairs with your multi-hit attacks.",
    });
  }
  return reasons.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function labelFor(action: DraftAction): string {
  return action.kind === "skip" ? SKIP_LABEL : (getCard(action.cardId)?.name ?? action.cardId);
}

function rankWith(
  weights: Weights,
  base: DeckProfile,
  entries: readonly DeckEntry[],
  offered: readonly CardEntry[],
): { action: DraftAction; delta: number }[] {
  const baseTotal = total(scoreTerms(base, weights));
  const scored = offered.map((card) => ({
    action: { kind: "pick", cardId: card.id } as DraftAction,
    delta: total(scoreTerms(profileDeck(withCard(entries, card)), weights)) - baseTotal,
  }));
  scored.push({ action: { kind: "skip" }, delta: 0 });
  // skip wins ties: it is listed last but sorted stably after the strict comparison below
  return scored.sort(
    (a, b) =>
      b.delta - a.delta || (a.action.kind === "skip" ? -1 : b.action.kind === "skip" ? 1 : 0),
  );
}

function actionKey(a: DraftAction): string {
  return a.kind === "skip" ? "skip" : a.cardId;
}

/** Merge duplicate deck rows and sort them, so equal decks produce equal digests whatever the input order. */
function normalize(request: DraftRequest): DraftRequest {
  const merged = new Map<string, number>();
  for (const e of request.deck) {
    merged.set(e.id, (merged.get(e.id) ?? 0) + e.count);
  }
  const deck = [...merged.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, count]) => ({ id, count }));
  return { ...request, deck };
}

export function evaluateDraft(input: unknown): DraftResponse {
  const parsed = DraftRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidDraftRequestError(
      "invalid draft request",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  const request = normalize(parsed.data);
  const build = requireSupportedBuild(request.build);
  const entries = resolveDeck(request);
  const offered = resolveOffered(request);

  const warnings: string[] = [];
  const pool = new Set(rewardPool(request.character, ALL_UNLOCKED).map((c) => c.id));
  const colorless = new Set(rewardPool("colorless", ALL_UNLOCKED).map((c) => c.id));
  for (const c of offered) {
    if (!pool.has(c.id) && !colorless.has(c.id)) {
      warnings.push(
        `${c.name} is not in the ${request.character} reward pool (a relic or event can still offer it).`,
      );
    }
    if (c.roles.includes("unplayable") || c.rarity === "curse" || c.rarity === "status") {
      warnings.push(`${c.name} is not a normal card reward (curse / status / unplayable).`);
    }
  }

  const base = profileDeck(entries);
  const weights = baseWeights(request.actIndex, request.riskPreference);
  const baseTerms = scoreTerms(base, weights);
  const ranked = rankWith(weights, base, entries, offered);

  const options: RankedOption[] = ranked.map((r, i) => {
    let reasons: Reason[];
    if (r.action.kind === "skip") {
      reasons = [
        {
          kind: "quality",
          delta: 0,
          text: `Keeps the deck at ${String(base.size)} cards with average quality ${base.meanPrior.toFixed(1)} and average energy cost ${base.averageEnergyCost.toFixed(2)}.`,
        },
      ];
    } else {
      const card = getCard(r.action.cardId) as CardEntry;
      const after = profileDeck(withCard(entries, card));
      reasons = describeDelta(baseTerms, scoreTerms(after, weights), base, after, card);
    }
    return {
      action: r.action,
      label: labelFor(r.action),
      rank: i + 1,
      indexDelta: r.delta,
      reasons,
    };
  });

  // Stability of the top choice under random changes to the heuristic's own weights (model uncertainty, not outcome uncertainty).
  const digest = stateDigest(request);
  const rnd = mulberry32(Number.parseInt(digest.slice(-8), 16));
  const top = actionKey((options[0] as RankedOption).action);
  const others: Record<string, number> = {};
  let kept = 0;
  for (let i = 0; i < PERTURBATIONS; i += 1) {
    const jitter = (): number => 0.6 + 0.8 * rnd();
    const perturbed: Weights = {
      quality: weights.quality * jitter(),
      coverage: Object.fromEntries(
        GROUPS.map((g) => [g, weights.coverage[g] * jitter()]),
      ) as Record<Group, number>,
      curve: weights.curve * jitter(),
      size: weights.size * jitter(),
      synergy: weights.synergy * jitter(),
    };
    const winner = actionKey(
      (rankWith(perturbed, base, entries, offered)[0] as { action: DraftAction }).action,
    );
    if (winner === top) {
      kept += 1;
    } else {
      others[winner] = (others[winner] ?? 0) + 1;
    }
  }

  const first = options[0] as RankedOption;
  const second = options[1];
  const margin = second ? first.indexDelta - second.indexDelta : first.indexDelta;
  const tradeoffs: string[] = [];
  if (first.action.kind === "skip") {
    tradeoffs.push(
      "Every offered card lowers the heuristic deck index; skipping keeps the deck thin.",
    );
  } else if (second) {
    const sec = second.action.kind === "skip" ? "skipping" : second.label;
    tradeoffs.push(`${first.label} edges ${sec} by ${fmt(margin)} index points.`);
  }
  const worse = options.find((o) => o.action.kind === "pick" && o.indexDelta < 0);
  if (worse) {
    tradeoffs.push(`${worse.label} scores below skipping (${fmt(worse.indexDelta)}).`);
  }

  const missingInputs: string[] = [];
  if (!request.hp) {
    missingInputs.push("Current and max HP (survivability is not weighed in v0).");
  }
  missingInputs.push(
    "Relics, potions, gold and the upcoming map (not used by the v0 draft heuristic).",
  );

  const legal: DraftAction[] = [
    ...offered.map((c) => ({ kind: "pick", cardId: c.id }) as DraftAction),
    { kind: "skip" },
  ];
  return {
    schema: 1,
    gameId: "STS2",
    build: build.id,
    policyVersion: "draft-heuristic-v0",
    method: "heuristic",
    calibrated: false,
    legalActions: legal,
    recommendation: first,
    ranking: options,
    confidence: {
      margin,
      closeCall: margin < CLOSE_CALL_MARGIN,
      stability: { perturbations: PERTURBATIONS, topChoiceKept: kept, otherTopChoices: others },
    },
    tradeoffs,
    warnings,
    assumptions: [
      "Card quality is a static prior from rarity plus a bounded stat adjustment; it is not a win-rate estimate.",
      "Coverage needs (damage, block, area damage, scaling, draw, energy, debuffs) use hand-set, act-dependent weights.",
      "Card upgrades and enchantments in the deck are ignored; every copy counts as the base card.",
      `Catalog ${CATALOG.sha256.slice(0, 12)} for ${CATALOG.build}; the advisor index is unit-less and only differences matter.`,
    ],
    notModelled: [
      "Relics, potions, gold, shops, rest sites and the map ahead.",
      "Specific enemy matchups, bosses and elites you will face.",
      "Card text beyond SLAY2's role tags: conditional or engine cards without tags are treated neutrally.",
      "Future card packs and the value of keeping a slot open.",
    ],
    missingInputs,
    deck: {
      size: base.size,
      meanPrior: base.meanPrior,
      averageEnergyCost: base.averageEnergyCost,
      roleCounts: { ...base.groups },
      starterShare: base.starterShare,
    },
    stateDigest: digest,
  };
}
