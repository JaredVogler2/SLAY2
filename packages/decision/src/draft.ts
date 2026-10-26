import {
  ACT1_BRIEFS,
  CATALOG,
  MECHANICS,
  SYNERGY,
  getAct1Boss,
  getCard,
  rewardPool,
  ALL_UNLOCKED,
  type CardEntry,
  type MechanicId,
  type PlayableClass,
} from "@slay2/game-data";
import { requireSupportedBuild } from "@slay2/game-schema";

import { mulberry32, stateDigest } from "./digest";
import { must } from "./util";
import { GROUPS, profileDeck, type DeckEntry, type DeckProfile, type Group } from "./profile";
import { actContextTilt, MAX_TILT, tiltWeights, type ContextTilt } from "./context";
import { baseWeights, scoreTerms, total, type Terms, type Weights } from "./quality";
import {
  FUTURE_SUPPORT,
  MAX_DEPENDENCE,
  deckSynergy,
  explainAddition,
  type Need,
  type Partner,
  type SynergyExplanation,
} from "./synergy";
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

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
}

function listWithMore(names: readonly string[], shown = 3): string {
  const unique = [...new Set(names)];
  if (unique.length <= shown) return joinNames(unique);
  return `${joinNames(unique.slice(0, shown))} and ${String(unique.length - shown)} more`;
}

function needsText(needs: readonly Need[]): string {
  return joinNames(
    needs.map(
      (n) =>
        `${n.label} (${n.suppliers.length > 0 ? `from ${joinNames(n.suppliers)}` : "nothing in your deck yet"})`,
    ),
  );
}

const SCALER_VERB: Readonly<Partial<Record<MechanicId, readonly [string, string]>>> = {
  strength: ["hits harder", "hit harder"],
  dexterity: ["blocks more", "block more"],
  focus: ["gets stronger", "get stronger"],
};

function partnerName(p: Partner): string {
  return p.count > 1 ? `${p.name} x${String(p.count)}` : p.name;
}

/** The lines about what a card needs from the deck, what it supplies to the others and the engines it builds. */
function synergyReasons(card: CardEntry, ex: SynergyExplanation, weight: number): Reason[] {
  const reasons: Reason[] = [];
  const own = ex.own.delta * weight;
  if (Math.abs(own) >= 0.05) {
    const parts: string[] = [];
    if (ex.own.heldBack >= 0.02 && ex.own.needs.length > 0) {
      parts.push(
        `${card.name} needs ${needsText(ex.own.needs)}: about ${String(Math.round(ex.own.heldBack * 100))} % of its rating is held back until the deck supports it.`,
      );
    }
    if (ex.own.scaler >= 0.02) {
      parts.push(
        `Your Strength, Dexterity or Focus lifts it by about ${String(Math.round(ex.own.scaler * 100))} %.`,
      );
    }
    reasons.push({
      kind: "synergy",
      delta: own,
      text:
        parts.length > 0
          ? parts.join(" ")
          : `Its fit with the cards in your deck changes its worth by ${fmt(own)}.`,
    });
  }
  const support = ex.support.delta * weight;
  if (Math.abs(support) >= 0.05) {
    const byMechanic = new Map<MechanicId, Partner[]>();
    for (const p of ex.support.partners) {
      byMechanic.set(p.mechanic, [...(byMechanic.get(p.mechanic) ?? []), p]);
    }
    const groups = [...byMechanic.entries()]
      .sort(
        (a, b) =>
          b[1].reduce((s, p) => s + Math.abs(p.gain * p.count), 0) -
          a[1].reduce((s, p) => s + Math.abs(p.gain * p.count), 0),
      )
      .slice(0, 2)
      .map(([m, ps]) => {
        const names = listWithMore(ps.map(partnerName));
        const verb = SCALER_VERB[m];
        const plural = ps.length > 1 || ps.some((p) => p.count > 1);
        return verb
          ? `${MECHANICS[m].label} makes ${names} ${verb[plural ? 1 : 0]}`
          : `${MECHANICS[m].label} for ${names}`;
      });
    reasons.push({
      kind: "synergy",
      delta: support,
      text:
        support > 0
          ? `Gives cards already in your deck what they need (${groups.join("; ")}).`
          : `Takes away what cards in your deck rely on (${groups.join("; ")}).`,
    });
  }
  for (const change of ex.engines.changes.slice(0, 2)) {
    const delta = change.delta * weight;
    if (Math.abs(delta) < 0.1) continue;
    const sources = change.sources.slice(0, 3);
    const payoffs = change.payoffs.slice(0, 3);
    const say = (names: string[], one: string, many: string): string =>
      names.length === 0 ? "" : `${joinNames(names)} ${names.length === 1 ? one : many}`;
    const detail = [say(sources, "supplies it", "supply it"), say(payoffs, "uses it", "use it")]
      .filter(Boolean)
      .join("; ");
    reasons.push({
      kind: "synergy",
      delta,
      text:
        delta > 0
          ? `Builds your ${change.label} engine${detail ? ` (${detail})` : ""}.`
          : `Weakens your ${change.label} engine${detail ? ` (${detail})` : ""}.`,
    });
  }
  return reasons;
}

function describeDelta(
  before: Terms,
  after: Terms,
  bp: DeckProfile,
  ap: DeckProfile,
  card: CardEntry,
  ex: SynergyExplanation,
  synergyWeight: number,
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
  reasons.push(...synergyReasons(card, ex, synergyWeight));
  return reasons.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function percent(multiplier: number): number {
  return Math.round((multiplier - 1) * 100);
}

/** One line for the part of a card's score that comes from the Act 1 context, naming the fights behind it. */
function contextReason(
  tilt: ContextTilt,
  shift: number,
  before: DeckProfile,
  after: DeckProfile,
): Reason {
  const touched = tilt.adjustments
    .filter((a) => after.groups[a.group] > before.groups[a.group])
    .slice(0, 2);
  const where = `${tilt.variantName}${tilt.boss ? `, boss ${tilt.boss.name}` : ""}`;
  const text =
    touched.length > 0
      ? `Act 1 context (${where}): ${touched
          .map(
            (a) =>
              `${GROUP_LABELS[a.group]} counts ${String(Math.abs(percent(a.multiplier)))} % ${a.multiplier > 1 ? "more" : "less"} (${a.because.length > 0 ? a.because.join(", ") : "fewer of its fights ask for it than in the average Act 1"})`,
          )
          .join("; ")}.`
      : `Act 1 context (${where}): a smaller effect through the deck's other needs.`;
  return { kind: "context", delta: shift, text };
}

function labelFor(action: DraftAction): string {
  return action.kind === "skip" ? SKIP_LABEL : (getCard(action.cardId)?.name ?? action.cardId);
}

function rankWith(
  weights: Weights,
  base: DeckProfile,
  entries: readonly DeckEntry[],
  offered: readonly CardEntry[],
  actIndex: 0 | 1 | 2,
): { action: DraftAction; delta: number }[] {
  const baseTotal = total(scoreTerms(base, weights));
  const scored: { action: DraftAction; delta: number }[] = offered.map((card) => ({
    action: pickAction(card.id),
    delta: total(scoreTerms(profileDeck(withCard(entries, card), actIndex), weights)) - baseTotal,
  }));
  scored.push({ action: SKIP, delta: 0 });
  // skip wins ties: it is listed last but sorted stably after the strict comparison below
  return scored.sort(
    (a, b) =>
      b.delta - a.delta || (a.action.kind === "skip" ? -1 : b.action.kind === "skip" ? 1 : 0),
  );
}

const SKIP: DraftAction = { kind: "skip" };

function pickAction(cardId: string): DraftAction {
  return { kind: "pick", cardId };
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

/**
 * Class-unique resources are visible to the advisor only through role tags; their engines are not simulated. Saying so
 * per class is part of not over-claiming (a card that is strong only inside an engine can look average here).
 */
const CLASS_NOT_MODELLED: Readonly<Record<PlayableClass, string>> = {
  ironclad:
    "Strength, exhaust, block and HP-loss synergies are read from tags of what cards supply and need; sequencing, how many exhaust triggers a turn really gives and Barricade-style block engines are not simulated.",
  silent:
    "Poison, shiv and discard synergies are read from tags of what cards supply and need; how many Shivs or Poison stacks you actually reach, and Sly timing, are not simulated.",
  regent:
    "Stars, Forge and card-creation synergies are read from tags of what cards supply and need; the Sovereign Blade's real damage and star budgets are not simulated.",
  necrobinder:
    "Osty, Souls, Doom and Ethereal synergies are read from tags of what cards supply and need; Osty's health, Doom thresholds and Ethereal timing are not simulated.",
  defect:
    "Orb, Focus and Status synergies are read from tags of what cards supply and need; orb order, slots and evoke timing are not simulated.",
};

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

  const base = profileDeck(entries, request.actIndex);
  const neutral = baseWeights(request.actIndex, request.riskPreference);
  let tilt: ContextTilt | null = null;
  if (request.actContext) {
    const { variant, boss } = request.actContext;
    if (boss && !getAct1Boss(variant, boss)) {
      throw new InvalidDraftRequestError(
        `boss ${boss} is not a boss of ${ACT1_BRIEFS[variant].name}`,
        [{ path: "actContext.boss", message: `unknown boss ${boss} for ${variant}` }],
      );
    }
    if (request.actIndex === 0) {
      tilt = actContextTilt({ variant, boss: boss ?? null });
    } else {
      warnings.push(
        "An Act 1 context was given for a later act and is ignored: only Act 1 has two versions with different elites and bosses.",
      );
    }
  }
  const weights = tilt ? tiltWeights(neutral, tilt) : neutral;
  // The reasons below explain the neutral heuristic; the context is its own line, so the lines add up to the index.
  const baseTerms = scoreTerms(base, neutral);
  const ranked = rankWith(weights, base, entries, offered, request.actIndex);
  const neutralDelta = new Map(
    rankWith(neutral, base, entries, offered, request.actIndex).map(
      (r) => [actionKey(r.action), r.delta] as const,
    ),
  );

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
      const card = must(getCard(r.action.cardId), "catalog card");
      const withIt = withCard(entries, card);
      const after = profileDeck(withIt, request.actIndex);
      const explained = explainAddition(entries, card, request.actIndex, withIt);
      reasons = describeDelta(
        baseTerms,
        scoreTerms(after, neutral),
        base,
        after,
        card,
        explained,
        neutral.synergy,
      );
      if (tilt) {
        const shift = r.delta - (neutralDelta.get(actionKey(r.action)) ?? r.delta);
        if (Math.abs(shift) >= 0.05) {
          reasons = [contextReason(tilt, shift, base, after), ...reasons];
        }
      }
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
  const top = actionKey(must(options[0], "top option").action);
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
      (rankWith(perturbed, base, entries, offered, request.actIndex)[0] as { action: DraftAction })
        .action,
    );
    if (winner === top) {
      kept += 1;
    } else {
      others[winner] = (others[winner] ?? 0) + 1;
    }
  }

  const first = must(options[0], "top option");
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
  if (request.actIndex === 0 && !request.actContext) {
    missingInputs.push(
      "Which Act 1 you are in (Overgrowth or Underdocks, with different elites and bosses) and the boss on your map: neither is weighed.",
    );
  }
  missingInputs.push(
    "Relics, potions, gold and the upcoming map (not used by the v0 draft heuristic).",
  );

  const legal: DraftAction[] = [...offered.map((c) => pickAction(c.id)), SKIP];
  return {
    schema: 1,
    gameId: "STS2",
    build: build.id,
    policyVersion: "draft-heuristic-v1",
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
      "Card quality is a static prior from rarity plus a bounded stat adjustment; it is not a win-rate estimate. It is read as a card's worth when what the card needs is there.",
      `Synergy is SLAY2's judgement of how cards work together (${String(Object.keys(SYNERGY.cards).length)} cards tagged by what they supply and what they need, table ${SYNERGY.sha256.slice(0, 12)}), not a measurement: a card whose needs the deck does not meet loses up to ${String(Math.round(MAX_DEPENDENCE * 100))} % of its rating, less in early acts because picks to come may bring support (${FUTURE_SUPPORT.map((f) => `${String(Math.round(f * 100))} %`).join(" / ")} of the gap in acts 1 / 2 / 3); a card that supplies what others need is credited for them.`,
      "Coverage needs (damage, block, area damage, scaling, draw, energy, debuffs) use hand-set, act-dependent weights.",
      ...(tilt
        ? [
            `Act 1 context (${tilt.variantName}${tilt.boss ? `, boss ${tilt.boss.name}` : ", boss not known"}): coverage weights are tilted, by at most ${String(Math.round(MAX_TILT * 100))} % and usually a few, by how what its elites and bosses ask of a deck differs from the average Act 1 (both versions together). That is SLAY2's judgement of the fights, not a measurement (ADR-048).`,
          ]
        : []),
      "Card upgrades and enchantments in the deck are ignored; every copy counts as the base card.",
      `Catalog ${CATALOG.sha256.slice(0, 12)} for ${CATALOG.build}; the advisor index is unit-less and only differences matter.`,
    ],
    notModelled: [
      "Relics, potions, gold, shops, rest sites and the map ahead.",
      tilt
        ? "Specific enemy matchups beyond the tagged asks of this Act 1's elites and bosses."
        : "Specific enemy matchups, bosses and elites you will face.",
      "Card text beyond SLAY2's role tags: conditional or engine cards without tags are treated neutrally.",
      "Future card packs and the value of keeping a slot open.",
      CLASS_NOT_MODELLED[request.character],
    ],
    missingInputs,
    deck: {
      size: base.size,
      meanPrior: base.meanPrior,
      averageEnergyCost: base.averageEnergyCost,
      roleCounts: { ...base.groups },
      starterShare: base.starterShare,
    },
    deckSynergy: deckSynergy(entries, request.actIndex),
    ...(request.actContext
      ? {
          actContext: {
            applied: tilt !== null,
            variant: request.actContext.variant,
            boss: request.actContext.boss ?? null,
            adjustments: (tilt?.adjustments ?? []).map((a) => ({
              group: a.group,
              label: GROUP_LABELS[a.group],
              percent: percent(a.multiplier),
              because: a.because,
            })),
            note:
              tilt === null
                ? "Ignored: only Act 1 has two versions."
                : "A judgement of what the fights ask of a deck, not a measurement; it can be switched off.",
          },
        }
      : {}),
    stateDigest: digest,
  };
}
