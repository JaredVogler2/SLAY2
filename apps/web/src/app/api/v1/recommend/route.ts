import { evaluateDraft } from "@slay2/decision";

import { guarded, jsonOk, readJsonBody } from "@/lib/api";

export const dynamic = "force-dynamic";

/** POST /api/v1/recommend: explainable card-draft advice (heuristic v0; never a win probability). */
export const POST = guarded(async (request) => jsonOk(evaluateDraft(await readJsonBody(request))));
