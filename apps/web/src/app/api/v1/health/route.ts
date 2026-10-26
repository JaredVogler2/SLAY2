import { SUPPORTED_BUILD_ID } from "@slay2/game-schema";

import { jsonOk } from "@/lib/api";
import { API_SCHEMA } from "@/lib/site-meta";

export const dynamic = "force-dynamic";

/** GET /api/v1/health: liveness, schema version and supported methods. */
export function GET(): Response {
  return jsonOk({
    status: "ok",
    service: "slay2-web",
    schema: API_SCHEMA,
    supportedBuilds: [SUPPORTED_BUILD_ID],
    methods: ["exact", "heuristic"],
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
}
