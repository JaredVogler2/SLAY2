import { guarded, jsonOk, readJsonBody } from "@/lib/api";
import { computeOdds } from "@/lib/odds-api";

export const dynamic = "force-dynamic";

/** POST /api/v1/odds: exact calculators (rarity, potion, unknown_room, draw, price, removal, gold). */
export const POST = guarded(async (request) => jsonOk(computeOdds(await readJsonBody(request))));
