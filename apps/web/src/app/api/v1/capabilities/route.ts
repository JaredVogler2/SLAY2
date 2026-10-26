import { jsonOk } from "@/lib/api";
import { capabilities } from "@/lib/site-meta";

/** GET /api/v1/capabilities: exact coverage with statuses, never a blanket "all supported". */
export function GET(): Response {
  return jsonOk(capabilities(), { cache: "public, max-age=300, stale-while-revalidate=86400" });
}
