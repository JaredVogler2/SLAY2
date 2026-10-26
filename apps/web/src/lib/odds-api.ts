import { z } from "zod";

import { AscensionSchema, BuildIdSchema, requireSupportedBuild } from "@slay2/game-schema";
import {
  Rational,
  cardRemovalCost,
  combatGoldRange,
  drawAtLeast,
  drawDistribution,
  drawJointAtLeast,
  drawMean,
  evaluateRoute,
  forecastPack,
  forecastPotions,
  forecastUnknownRoom,
  inferCounter,
  inferPotionCounter,
  inferUnknownState,
  MAX_ROUTE_ROOMS,
  MAX_UNKNOWN_ROOMS_PER_ACT,
  nextHandWithReshuffle,
  hypergeometricDistribution,
  pointMass,
  positionMarginals,
  potionRollProbability,
  priceDistribution,
  provenanceFor,
  rarityRulesForAscension,
  ROUTE_ROOMS,
  type PackObservation,
  type PotionObservation,
  type RouteReport,
  type ShopItem,
  type UnknownObservation,
} from "@slay2/odds";

import { HttpError, rationalOut, type RationalOut } from "./api";
import { sourceToReward } from "./run-state";

const SourceSchema = z.enum(["regular", "elite", "boss", "shop", "event"]);
const Count = (max: number) => z.number().int().min(0).max(max);

const PackObservationSchema = z.strictObject({
  source: SourceSchema,
  cards: z.number().int().min(1).max(8).optional(),
  rares: Count(8).optional(),
  uncommons: Count(8).optional(),
});

const RarityRequest = z.strictObject({
  calculator: z.literal("rarity"),
  build: BuildIdSchema,
  ascension: AscensionSchema,
  source: SourceSchema,
  cards: z.number().int().min(1).max(8).optional(),
  /** Known number of non-rare cards since the last rare. Mutually exclusive with `history`. */
  counter: Count(200).optional(),
  history: z.array(PackObservationSchema).max(100).optional(),
});

const PotionRoom = z.enum(["monster", "elite", "boss"]);
const PotionRequest = z.strictObject({
  calculator: z.literal("potion"),
  build: BuildIdSchema,
  history: z
    .array(
      z.strictObject({
        room: PotionRoom,
        dropped: z.boolean().optional(),
        forced: z.boolean().optional(),
      }),
    )
    .max(200),
  upcoming: z.array(PotionRoom).min(1).max(30).optional(),
});

const UnknownRoomRequest = z.strictObject({
  calculator: z.literal("unknown_room"),
  build: BuildIdSchema,
  /** Every "?" room met in the CURRENT act, in order. `[]` means none yet this act; omitting it is an error. */
  history: z
    .array(z.strictObject({ outcome: z.enum(["fight", "treasure", "shop", "event"]).optional() }))
    .max(MAX_UNKNOWN_ROOMS_PER_ACT),
});

const DrawRequest = z.strictObject({
  calculator: z.literal("draw"),
  pile: Count(200),
  targets: Count(200),
  draws: Count(200),
  need: Count(50).default(1),
  discard: z.strictObject({ size: Count(200), targets: Count(200) }).optional(),
  second: z.strictObject({ targets: Count(200), need: Count(50).default(1) }).optional(),
});

const PriceRequest = z.strictObject({
  calculator: z.literal("price"),
  build: BuildIdSchema,
  item: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("card"),
      rarity: z.enum(["common", "uncommon", "rare"]),
      colorless: z.boolean().optional(),
    }),
    z.strictObject({
      kind: z.literal("relic"),
      rarity: z.enum(["common", "uncommon", "rare", "shop"]),
    }),
    z.strictObject({ kind: z.literal("potion"), rarity: z.enum(["common", "uncommon", "rare"]) }),
  ]),
  onSale: z.boolean().optional(),
});

const RemovalRequest = z.strictObject({
  calculator: z.literal("removal"),
  build: BuildIdSchema,
  ascension: AscensionSchema,
  removals: Count(100),
});
const GoldRequest = z.strictObject({
  calculator: z.literal("gold"),
  build: BuildIdSchema,
  ascension: AscensionSchema,
  room: z.enum(["monster", "elite", "boss"]),
});

/** Legal worst case of a route request: two routes of ten "?" rooms take about a second (RT-10-07 bounds a request at 1.5 s). */
export const MAX_REQUEST_UNKNOWNS = 20;

const RouteRequest = z.strictObject({
  calculator: z.literal("route"),
  build: BuildIdSchema,
  ascension: AscensionSchema,
  /** One to three routes to compare, each the rooms in the order they would be walked. */
  routes: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(24).optional(),
        rooms: z.array(z.enum(ROUTE_ROOMS)).max(MAX_ROUTE_ROOMS),
      }),
    )
    .min(1)
    .max(3),
  /** Every "?" room met in the CURRENT act, in order. `[]` means none yet this act; omitting it is an error. */
  unknownHistory: z
    .array(z.strictObject({ outcome: z.enum(["fight", "treasure", "shop", "event"]).optional() }))
    .max(MAX_UNKNOWN_ROOMS_PER_ACT),
  /** Known number of non-rare cards since the last rare. Exactly one of `counter` and `packHistory`. */
  counter: Count(200).optional(),
  packHistory: z.array(PackObservationSchema).max(100).optional(),
  /** Known stored potion chance in tenths (4 = 40 %, the start of a run). Exactly one of `potionTenths` and `potionHistory`. */
  potionTenths: z.number().int().min(-20).max(40).optional(),
  potionHistory: z
    .array(
      z.strictObject({
        room: PotionRoom,
        dropped: z.boolean().optional(),
        forced: z.boolean().optional(),
      }),
    )
    .max(200)
    .optional(),
});

export const OddsRequestSchema = z.discriminatedUnion("calculator", [
  RarityRequest,
  PotionRequest,
  UnknownRoomRequest,
  DrawRequest,
  PriceRequest,
  RemovalRequest,
  GoldRequest,
  RouteRequest,
]);
export type OddsRequest = z.infer<typeof OddsRequestSchema>;

function routeJson(r: RouteReport): Record<string, unknown> {
  const each = <T extends string>(o: Readonly<Record<T, Rational>>): Record<string, RationalOut> =>
    Object.fromEntries(Object.entries<Rational>(o).map(([k, v]) => [k, rationalOut(v)]));
  return {
    rooms: r.rooms,
    counts: r.counts,
    unknown: {
      rooms: r.unknown.rooms,
      expected: each(r.unknown.expected),
      pmf: Object.fromEntries(
        Object.entries<readonly Rational[]>(r.unknown.pmf).map(([k, v]) => [k, v.map(rationalOut)]),
      ),
    },
    fights: {
      certain: r.fights.certain,
      expected: rationalOut(r.fights.expected),
      min: r.fights.min,
      max: r.fights.max,
    },
    cardPacks: {
      expectedRares: rationalOut(r.cardPacks.expectedRares),
      atLeastOneRare: rationalOut(r.cardPacks.atLeastOneRare),
    },
    potions: {
      expectedDrops: rationalOut(r.potions.expectedDrops),
      atLeastOne: rationalOut(r.potions.atLeastOne),
    },
    gold: {
      fromFights: rationalOut(r.gold.fromFights),
      fromTreasure: rationalOut(r.gold.fromTreasure),
      expected: rationalOut(r.gold.expected),
      min: r.gold.min,
      max: r.gold.max,
    },
    relics: { elites: r.relics.elites, expectedTreasure: rationalOut(r.relics.expectedTreasure) },
    shops: { certain: r.shops.certain, expected: rationalOut(r.shops.expected) },
    rests: r.rests,
  };
}

const dist = (m: ReadonlyMap<number, Rational>): { value: number; probability: RationalOut }[] =>
  [...m.entries()]
    .sort(([a], [b]) => a - b)
    .map(([value, p]) => ({ value, probability: rationalOut(p) }));

/**
 * What a request will cost to evaluate, in units a limiter can charge before any work is done: 0 for every calculator but
 * "route", otherwise one per route plus one per "?" room in it (a route with twelve "?" rooms takes about a second).
 * Reads untrusted JSON defensively; whatever is malformed costs a minimum and is refused by the schema afterwards.
 */
export function routeCost(body: unknown): number {
  if (
    typeof body !== "object" ||
    body === null ||
    (body as { calculator?: unknown }).calculator !== "route"
  ) {
    return 0;
  }
  const routes = (body as { routes?: unknown }).routes;
  if (!Array.isArray(routes)) {
    return 1;
  }
  let cost = 0;
  for (const route of routes.slice(0, 3)) {
    const rooms =
      typeof route === "object" && route !== null
        ? (route as { rooms?: unknown }).rooms
        : undefined;
    const unknown = Array.isArray(rooms)
      ? rooms.slice(0, 64).filter((r) => r === "unknown").length
      : 0;
    cost += 1 + Math.min(unknown, MAX_ROUTE_ROOMS);
  }
  return Math.max(1, cost);
}

/** The pure core of POST /api/v1/odds (no HTTP), so it can be tested directly. */
export function computeOdds(input: unknown): Record<string, unknown> {
  const parsed = OddsRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(
      400,
      "invalid_request",
      "Invalid odds request",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  const req = parsed.data;
  if ("build" in req) {
    requireSupportedBuild(req.build);
  }
  switch (req.calculator) {
    case "rarity": {
      if (req.counter !== undefined && req.history !== undefined) {
        throw new HttpError(
          400,
          "invalid_request",
          "Give either `counter` or `history`, not both",
          [{ path: "counter", message: "mutually exclusive with history" }],
        );
      }
      if (req.counter === undefined && req.history === undefined) {
        throw new HttpError(
          400,
          "invalid_request",
          "Say what you know about the hidden counter: give `counter` (if you know it) or `history` (every card pack so far this run; `[]` only if no card reward has been offered yet)",
          [{ path: "history", message: "required unless counter is given" }],
        );
      }
      const rules = rarityRulesForAscension(req.ascension);
      const cards = req.cards ?? (req.source === "shop" ? 5 : 3);
      const history: PackObservation[] = (req.history ?? []).map((h) => ({
        source: sourceToReward(h.source),
        ...(h.cards === undefined ? {} : { cards: h.cards }),
        ...(h.rares === undefined ? {} : { rares: h.rares }),
        ...(h.uncommons === undefined ? {} : { uncommons: h.uncommons }),
      }));
      const inference = req.counter === undefined ? inferCounter(history, rules) : null;
      if (inference?.impossible) {
        throw new HttpError(
          422,
          "impossible_history",
          "That history cannot happen under the verified rules (a relic or event may have changed the odds).",
        );
      }
      const posterior =
        req.counter === undefined
          ? (inference?.posterior ?? pointMass(0, rules))
          : pointMass(req.counter, rules);
      const source = sourceToReward(req.source);
      const forecast = forecastPack(posterior, source, cards, rules);
      return {
        calculator: "rarity",
        method: "exact",
        build: req.build,
        ascension: req.ascension,
        source: req.source,
        cards,
        counterKnowledge: req.counter === undefined ? "history" : "known",
        evidence:
          req.counter === undefined
            ? { kind: "history", observations: history.length }
            : { kind: "counter", observations: 0 },
        evidenceOfHistory: inference ? rationalOut(inference.evidence) : null,
        posterior: dist(posterior),
        atLeastOneRare: rationalOut(forecast.atLeastOneRare),
        expectedRares: rationalOut(forecast.expectedRares),
        expectedByRarity: Object.fromEntries(
          Object.entries(forecast.expectedByRarity).map(([k, v]) => [k, rationalOut(v)]),
        ),
        rareCountPmf: forecast.rareCountPmf.map(rationalOut),
        firstCard: Object.fromEntries(
          Object.entries(forecast.firstCard).map(([k, v]) => [k, rationalOut(v)]),
        ),
        positions: positionMarginals(posterior, source, cards, rules).map((m) =>
          Object.fromEntries(Object.entries(m).map(([k, v]) => [k, rationalOut(v)])),
        ),
        atLeastOneRareBand: Object.fromEntries(
          Object.entries(forecast.atLeastOneRareBand).map(([k, v]) => [k, rationalOut(v)]),
        ),
        provenance: provenanceFor("rarity", { ascension: req.ascension }),
      };
    }
    case "potion": {
      const history: PotionObservation[] = req.history.map((h) => ({
        room: h.room,
        ...(h.dropped === undefined ? {} : { dropped: h.dropped }),
        ...(h.forced === undefined ? {} : { forced: h.forced }),
      }));
      const inference = inferPotionCounter(history);
      if (inference.impossible) {
        throw new HttpError(
          422,
          "impossible_history",
          "That potion history cannot happen under the verified rules.",
        );
      }
      const next = Object.fromEntries(
        (["monster", "elite", "boss"] as const).map((room) => {
          let p = Rational.ZERO;
          for (const [t, m] of inference.posterior) {
            p = p.add(m.mul(potionRollProbability(t, room)));
          }
          return [room, rationalOut(p)];
        }),
      );
      const upcoming = req.upcoming ?? ["monster"];
      const f = forecastPotions(inference.posterior, upcoming);
      return {
        calculator: "potion",
        method: "exact",
        build: req.build,
        evidence: { kind: "history", observations: history.length },
        storedChanceTenths: dist(inference.posterior),
        nextDrop: next,
        upcoming,
        dropCountPmf: f.dropCountPmf.map(rationalOut),
        expectedDrops: rationalOut(f.expectedDrops),
        provenance: provenanceFor("potion"),
      };
    }
    case "unknown_room": {
      const history: UnknownObservation[] = req.history.map((h) =>
        h.outcome === undefined ? {} : { outcome: h.outcome },
      );
      const inference = inferUnknownState(history);
      if (inference.impossible) {
        throw new HttpError(
          422,
          "impossible_history",
          "That '?' room history cannot happen under the verified rules.",
        );
      }
      const next = forecastUnknownRoom(inference);
      return {
        calculator: "unknown_room",
        method: "exact",
        build: req.build,
        evidence: { kind: "history", observations: history.length },
        next: Object.fromEntries(Object.entries(next).map(([k, v]) => [k, rationalOut(v)])),
        provenance: provenanceFor("unknown_room"),
      };
    }
    case "draw": {
      if (req.targets > req.pile) {
        throw new HttpError(400, "invalid_request", "targets cannot exceed the draw pile", [
          { path: "targets", message: "exceeds pile" },
        ]);
      }
      if (req.discard) {
        if (req.discard.targets > req.discard.size) {
          throw new HttpError(
            400,
            "invalid_request",
            "discard.targets cannot exceed discard.size",
            [{ path: "discard.targets", message: "exceeds discard.size" }],
          );
        }
        if (req.second) {
          throw new HttpError(
            400,
            "invalid_request",
            "`second` cannot be combined with `discard` yet",
            [{ path: "second", message: "unsupported with discard" }],
          );
        }
        if (req.draws > req.pile + req.discard.size) {
          throw new HttpError(400, "invalid_request", "draws exceed the cards in both piles", [
            { path: "draws", message: "too large" },
          ]);
        }
        const p = nextHandWithReshuffle(
          {
            drawPile: req.pile,
            targetsInDrawPile: req.targets,
            discardPile: req.discard.size,
            targetsInDiscard: req.discard.targets,
            draws: req.draws,
          },
          req.need,
        );
        const pmf =
          req.draws <= req.pile
            ? drawDistribution({ pile: req.pile, targets: req.targets, draws: req.draws })
            : hypergeometricDistribution(
                req.discard.size,
                req.discard.targets,
                req.draws - req.pile,
              );
        const offset = req.draws <= req.pile ? 0 : req.targets;
        return {
          calculator: "draw",
          method: "exact",
          atLeast: req.need,
          probability: rationalOut(p),
          pmf: pmf.map((x, i) => ({ copies: i + offset, probability: rationalOut(x) })),
          provenance: provenanceFor("draw"),
        };
      }
      if (req.draws > req.pile) {
        throw new HttpError(
          400,
          "invalid_request",
          "draws exceed the draw pile; supply `discard` to include the reshuffle",
          [{ path: "draws", message: "exceeds pile" }],
        );
      }
      if (req.second) {
        if (req.targets + req.second.targets > req.pile) {
          throw new HttpError(400, "invalid_request", "the two groups together exceed the pile", [
            { path: "second.targets", message: "too large" },
          ]);
        }
        const p = drawJointAtLeast(req.pile, req.draws, [
          { count: req.targets, need: req.need },
          { count: req.second.targets, need: req.second.need },
        ]);
        return {
          calculator: "draw",
          method: "exact",
          probability: rationalOut(p),
          provenance: provenanceFor("draw"),
        };
      }
      const q = { pile: req.pile, targets: req.targets, draws: req.draws };
      return {
        calculator: "draw",
        method: "exact",
        atLeast: req.need,
        probability: rationalOut(drawAtLeast(q, req.need)),
        expectedCopies: rationalOut(drawMean(q)),
        pmf: drawDistribution(q).map((x, i) => ({ copies: i, probability: rationalOut(x) })),
        provenance: provenanceFor("draw"),
      };
    }
    case "price": {
      const item: ShopItem =
        req.item.kind === "card"
          ? {
              kind: "card",
              rarity: req.item.rarity,
              ...(req.item.colorless === undefined ? {} : { colorless: req.item.colorless }),
            }
          : req.item;
      const d = priceDistribution(item, req.onSale === true && req.item.kind === "card");
      return {
        calculator: "price",
        method: "exact",
        build: req.build,
        min: d.min,
        max: d.max,
        mean: rationalOut(d.mean),
        pmf: [...d.pmf.entries()]
          .sort(([a], [b]) => a - b)
          .map(([price, p]) => ({ price, probability: rationalOut(p) })),
        provenance: provenanceFor("shop"),
      };
    }
    case "removal":
      return {
        calculator: "removal",
        method: "exact",
        build: req.build,
        cost: cardRemovalCost(req.removals, req.ascension),
        provenance: provenanceFor("shop"),
      };
    case "route": {
      const one = (given: unknown, other: unknown, a: string, b: string, what: string): void => {
        if (given !== undefined && other !== undefined) {
          throw new HttpError(
            400,
            "invalid_request",
            `Give either \`${a}\` or \`${b}\`, not both`,
            [{ path: a, message: `mutually exclusive with ${b}` }],
          );
        }
        if (given === undefined && other === undefined) {
          throw new HttpError(
            400,
            "invalid_request",
            `Say what you know about the ${what}: give \`${a}\` (if you know it) or \`${b}\` (\`[]\` only if none has happened yet)`,
            [{ path: b, message: `required unless ${a} is given` }],
          );
        }
      };
      const questionRooms = req.routes.reduce(
        (n, r) => n + r.rooms.filter((room) => room === "unknown").length,
        0,
      );
      if (questionRooms > MAX_REQUEST_UNKNOWNS) {
        // the time of a route grows quickly with its "?" rooms (about a second for twelve): bound a request the way
        // every other legal request is bounded (RT-10-07); the page computes any route locally
        throw new HttpError(
          400,
          "invalid_request",
          `At most ${String(MAX_REQUEST_UNKNOWNS)} “?” rooms across the routes of one request`,
          [{ path: "routes", message: `${String(questionRooms)} “?” rooms` }],
        );
      }
      one(req.counter, req.packHistory, "counter", "packHistory", "hidden rare-card counter");
      one(
        req.potionTenths,
        req.potionHistory,
        "potionTenths",
        "potionHistory",
        "stored potion chance",
      );
      const rules = rarityRulesForAscension(req.ascension);
      const unknownHistory: UnknownObservation[] = req.unknownHistory.map((h) =>
        h.outcome === undefined ? {} : { outcome: h.outcome },
      );
      if (inferUnknownState(unknownHistory).impossible) {
        throw new HttpError(
          422,
          "impossible_history",
          "That '?' room history cannot happen under the verified rules.",
        );
      }
      const packs: PackObservation[] = (req.packHistory ?? []).map((h) => ({
        source: sourceToReward(h.source),
        ...(h.cards === undefined ? {} : { cards: h.cards }),
        ...(h.rares === undefined ? {} : { rares: h.rares }),
        ...(h.uncommons === undefined ? {} : { uncommons: h.uncommons }),
      }));
      const rare = req.counter === undefined ? inferCounter(packs, rules) : null;
      if (rare?.impossible) {
        throw new HttpError(
          422,
          "impossible_history",
          "That card-pack history cannot happen under the verified rules (a relic or event may have changed the odds).",
        );
      }
      const potionHistory: PotionObservation[] = (req.potionHistory ?? []).map((h) => ({
        room: h.room,
        ...(h.dropped === undefined ? {} : { dropped: h.dropped }),
        ...(h.forced === undefined ? {} : { forced: h.forced }),
      }));
      const potion = req.potionTenths === undefined ? inferPotionCounter(potionHistory) : null;
      if (potion?.impossible) {
        throw new HttpError(
          422,
          "impossible_history",
          "That potion history cannot happen under the verified rules.",
        );
      }
      const rareCounter =
        req.counter === undefined
          ? (rare?.posterior ?? pointMass(0, rules))
          : pointMass(req.counter, rules);
      const potionCounter =
        req.potionTenths === undefined
          ? (potion?.posterior ?? new Map([[4, Rational.ONE]]))
          : new Map([[req.potionTenths, Rational.ONE]]);
      return {
        calculator: "route",
        method: "exact",
        build: req.build,
        ascension: req.ascension,
        routes: req.routes.map((route, i) => ({
          name: route.name ?? String.fromCharCode(65 + i),
          report: routeJson(
            evaluateRoute({
              rooms: route.rooms,
              ascension: req.ascension,
              unknownHistory,
              rareCounter,
              potionCounter,
            }),
          ),
        })),
        provenance: provenanceFor("route", { ascension: req.ascension }),
      };
    }
    case "gold": {
      const g = combatGoldRange(req.room, req.ascension);
      return {
        calculator: "gold",
        method: "exact",
        build: req.build,
        min: g.min,
        max: g.max,
        mean: rationalOut(g.mean),
        provenance: provenanceFor("shop"),
      };
    }
  }
}
