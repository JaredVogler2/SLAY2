import { clientKey, guarded, HttpError, jsonOk, rateLimit, readJsonBody } from "@/lib/api";
import { computeOdds, routeCost } from "@/lib/odds-api";

export const dynamic = "force-dynamic";

/** A client may spend this many cost units a minute on route requests, on top of the ordinary request limit. */
const ROUTE_UNITS_PER_MINUTE = 60;

/** POST /api/v1/odds: exact calculators (rarity, potion, unknown_room, draw, price, removal, gold, route). */
export const POST = guarded(async (request) => {
  const body = await readJsonBody(request);
  // a route is the one calculator that can take seconds of CPU, so it is paid for by what it costs, before it runs
  const cost = routeCost(body);
  if (
    cost > 0 &&
    !rateLimit(`route:${clientKey(request)}`, ROUTE_UNITS_PER_MINUTE, Date.now(), cost)
  ) {
    throw new HttpError(
      429,
      "rate_limited",
      "Too many route evaluations; wait a moment or compute them in the page.",
    );
  }
  return jsonOk(computeOdds(body));
});
