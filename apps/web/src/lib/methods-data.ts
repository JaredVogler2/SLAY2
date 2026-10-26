import evidence from "@/content/evidence.generated.json";
import rules from "@/content/rules.generated.json";

export type RuleRow = (typeof rules.rules)[number];
export type EvidenceReport = (typeof evidence.reports)[number];
export type SimulatorGap = (typeof evidence.simulatorGaps)[number];
export type Comparison = (typeof evidence.comparisons)[number];

export const verification = rules.verification;

export type StatusGroup = "verified" | "corroborated" | "secondary" | "recorded";

/** Groups the free-text status of a register row for the summary counts. */
export function statusGroup(row: RuleRow): StatusGroup {
  const s = row.status ?? "";
  if (s.startsWith("VERIFIED")) return "verified";
  if (s.startsWith("CORROBORATED")) return "corroborated";
  if (s.startsWith("SECONDARY") || s.startsWith("UNVERIFIED")) return "secondary";
  return "recorded";
}

export const GROUP_LABEL: Record<StatusGroup, string> = {
  verified: "Verified against the game's own logic or official statements",
  corroborated: "Corroborated by independent secondary sources",
  secondary: "Single secondary source or unverified",
  recorded: "Recorded fact (build, implementation note)",
};

export function ruleSummary(): Record<StatusGroup, number> {
  const out: Record<StatusGroup, number> = {
    verified: 0,
    corroborated: 0,
    secondary: 0,
    recorded: 0,
  };
  for (const r of rules.rules) {
    out[statusGroup(r)] += 1;
  }
  return out;
}

export function rulesBySection(): { section: string; rows: RuleRow[] }[] {
  const order: string[] = [];
  const map = new Map<string, RuleRow[]>();
  for (const r of rules.rules) {
    if (!map.has(r.section)) {
      map.set(r.section, []);
      order.push(r.section);
    }
    map.get(r.section)?.push(r);
  }
  return order.map((section) => ({ section, rows: map.get(section) ?? [] }));
}

export function pct(x: number, digits = 2): string {
  return `${(x * 100).toFixed(digits)}%`;
}

/** The largest veteran-profile batch of a policy: the best estimate we have for it. */
/** The headline report of a policy: the largest *held-out* batch if one exists (a development batch never outranks it). */
export function largestReport(policy: string): EvidenceReport | undefined {
  const mine = evidence.reports.filter((r) => r.policy === policy && r.profile === "veteran");
  const heldOut = mine.filter((r) => r.role === "held-out");
  return [...(heldOut.length > 0 ? heldOut : mine)].sort((x, y) => y.completed - x.completed)[0];
}

export type ComparisonVerdict = "a-higher" | "b-higher" | "undetermined";

/** Which side reached more floors, judged only by whether the 95% bootstrap interval of mean(A - B) excludes zero. */
export function comparisonVerdict(c: Comparison): ComparisonVerdict {
  const [lo, hi] = c.floorDifference.ci95;
  if (lo !== undefined && lo > 0) return "a-higher";
  if (hi !== undefined && hi < 0) return "b-higher";
  return "undetermined";
}

export function signed(x: number, digits = 2): string {
  return `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(digits)}`;
}

/** "p = 0.0018", or exponent form when tiny (exact paired tests reach hundreds of orders of magnitude below 1e-4). */
export function formatP(p: number): string {
  if (p === 0) return "p < 1e-300";
  return `p = ${p < 1e-4 ? p.toExponential(1) : p.toPrecision(2)}`;
}

/** The intermediate endpoint: share of paired games that got past the Act-1 boss, with the exact McNemar test on the pairs. */
export function actTwoSentence(c: Comparison): string {
  const r = c.reachedAct2;
  const t = r.pairedTable;
  return (
    `Past the Act-1 boss: ${pct(r.a.rate, 1)} for ${c.a.policy} and ${pct(r.b.rate, 1)} for ${c.b.policy} ` +
    `(${String(t.a_only)} games only ${c.a.policy}, ${String(t.b_only)} only ${c.b.policy}; exact McNemar ${formatP(t.mcnemar_p)})`
  );
}

/** One honest sentence per comparison, generated from the committed artifact so it cannot drift from the data. */
export function comparisonSentence(c: Comparison): string {
  const [lo = 0, hi = 0] = c.floorDifference.ci95;
  const gap = `${signed(c.floorDifference.meanAMinusB)} floors for ${c.a.policy} relative to ${c.b.policy} (95% bootstrap interval ${signed(lo)} to ${signed(hi)}, ${String(c.bothCompleted)} paired games)`;
  const verdict = comparisonVerdict(c);
  const lead =
    verdict === "a-higher"
      ? `${c.a.policy} reached more floors than ${c.b.policy}`
      : verdict === "b-higher"
        ? `${c.b.policy} reached more floors than ${c.a.policy}`
        : `No difference in floors reached between ${c.a.policy} and ${c.b.policy} could be established`;
  const cost = c.wallTimeRatioBOverA
    ? `; ${c.b.policy} took ${c.wallTimeRatioBOverA.toFixed(1)}× as long per game`
    : "";
  return `${lead}: ${gap}${cost}. ${actTwoSentence(c)}.`;
}

/** Wins and completed games summed over every listed batch (used for the headline sentence). */
export function totals(): { wins: number; completed: number } {
  return evidence.reports.reduce(
    (acc, r) => ({ wins: acc.wins + r.counts.win, completed: acc.completed + r.completed }),
    { wins: 0, completed: 0 },
  );
}
