import { CATALOG, CARD_CLASSES, searchCards, type CardClass } from "@slay2/game-data";

import { guarded, jsonOk, HttpError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/v1/catalog/cards?q=&class=&rewardOnly=&limit=: typeahead over the facts-only catalog. */
export const GET = guarded((request) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 60);
  const cls = url.searchParams.get("class");
  if (cls !== null && !(CARD_CLASSES as readonly string[]).includes(cls)) {
    throw new HttpError(400, "invalid_request", `unknown class ${cls}`, [
      { path: "class", message: "unknown class" },
    ]);
  }
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw === null ? 12 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new HttpError(400, "invalid_request", "limit must be an integer from 1 to 50", [
      { path: "limit", message: "1-50" },
    ]);
  }
  const cards = searchCards(q, {
    limit,
    rewardEligibleOnly: url.searchParams.get("rewardOnly") === "1",
    ...(cls ? { classes: [cls as CardClass] } : {}),
  });
  return jsonOk(
    { build: CATALOG.build, catalogSha256: CATALOG.sha256, count: cards.length, cards },
    { cache: "public, max-age=300, stale-while-revalidate=86400" },
  );
});
