import evidence from "@/content/evidence.generated.json";
import { jsonOk } from "@/lib/api";

/**
 * GET /api/v1/experiments: ONLY real, checksummed simulator reports from this repository (experiments/batches).
 * An empty list means nothing has been measured, never a placeholder leaderboard.
 */
export function GET(): Response {
  return jsonOk(
    {
      schema: 1,
      note: "Simulator output with live-game parity UNVERIFIED; development partitions are not held-out results.",
      simulatorGaps: evidence.simulatorGaps,
      reports: evidence.reports,
    },
    { cache: "public, max-age=300, stale-while-revalidate=86400" },
  );
}
