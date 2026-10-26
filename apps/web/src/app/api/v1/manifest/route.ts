import { jsonOk } from "@/lib/api";
import { manifest } from "@/lib/site-meta";

/** GET /api/v1/manifest: build, data hashes and update flags. */
export function GET(): Response {
  return jsonOk(manifest(), { cache: "public, max-age=300, stale-while-revalidate=86400" });
}
