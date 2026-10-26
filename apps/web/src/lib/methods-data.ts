import evidence from "@/content/evidence.generated.json";
import rules from "@/content/rules.generated.json";

export type RuleRow = (typeof rules.rules)[number];
/** What `slay2_sim audit sample` found for one batch: the ledger and a replay-verified random sample of its completed games. */
export interface SampleAuditSummary {
  readonly drawn: number;
  readonly verified: number;
  readonly completedInBatch: number;
  readonly rngSeed: number;
  readonly ledgerOk: boolean;
  readonly criteria: string;
}

// The generated file has `sampleAudit: null` for every batch until one is audited, which JSON inference would freeze as `null`
export type EvidenceReport = Omit<(typeof evidence.reports)[number], "sampleAudit"> & {
  readonly sampleAudit: SampleAuditSummary | null;
};
export type SimulatorGap = (typeof evidence.simulatorGaps)[number];
export type Comparison = (typeof evidence.comparisons)[number];

export const verification = rules.verification;

/** Every simulator batch of the ledger, typed (see `EvidenceReport`). */
export const ALL_REPORTS: readonly EvidenceReport[] = evidence.reports;

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

/**
 * The headline report of a policy for one class: the largest *held-out* veteran-profile batch if one exists (a development
 * batch never outranks it). Classes are never mixed: what a policy does as Silent says nothing about it as Ironclad.
 */
export function largestReport(policy: string, character = "Ironclad"): EvidenceReport | undefined {
  const mine = ALL_REPORTS.filter(
    (r) => r.policy === policy && r.profile === "veteran" && r.character === character,
  );
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

/** A policy with the parameters that tell its variants apart ("search_v3 (scope=boss)"); a default threshold of 0 is not news. */
export function policyLabel(side: { policy: string; params?: Record<string, unknown> }): string {
  const shown = Object.entries(side.params ?? {})
    .filter(([k, v]) => !(k === "threshold" && v === 0))
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
  return shown.length > 0 ? `${side.policy} (${shown.join(", ")})` : side.policy;
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
    `Past the Act-1 boss: ${pct(r.a.rate, 1)} for ${policyLabel(c.a)} and ${pct(r.b.rate, 1)} for ${policyLabel(c.b)} ` +
    `(${String(t.a_only)} games only ${policyLabel(c.a)}, ${String(t.b_only)} only ${policyLabel(c.b)}; exact McNemar ${formatP(t.mcnemar_p)})`
  );
}

/** One honest sentence per comparison, generated from the committed artifact so it cannot drift from the data. */
export function comparisonSentence(c: Comparison): string {
  const [lo = 0, hi = 0] = c.floorDifference.ci95;
  const gap = `${signed(c.floorDifference.meanAMinusB)} floors for ${policyLabel(c.a)} relative to ${policyLabel(c.b)} (95% bootstrap interval ${signed(lo)} to ${signed(hi)}, ${String(c.bothCompleted)} paired games)`;
  const verdict = comparisonVerdict(c);
  const lead =
    verdict === "a-higher"
      ? `${policyLabel(c.a)} reached more floors than ${policyLabel(c.b)}`
      : verdict === "b-higher"
        ? `${policyLabel(c.b)} reached more floors than ${policyLabel(c.a)}`
        : `No difference in floors reached between ${policyLabel(c.a)} and ${policyLabel(c.b)} could be established`;
  const ratio = c.wallTimeRatioBOverA;
  const cost = ratio
    ? ratio >= 1
      ? `; ${policyLabel(c.b)} took ${ratio.toFixed(1)}× as long per game`
      : `; ${policyLabel(c.a)} took ${(1 / ratio).toFixed(1)}× as long per game`
    : "";
  return `${lead}: ${gap}${cost}. ${actTwoSentence(c)}.`;
}

/** The pre-registered test of one class's measured card values (ADR-031, ADR-034): the policy that follows them against the one that does not. */
export function valuesValidation(character: string): Comparison | undefined {
  return evidence.comparisons.find(
    (c) =>
      c.a.policy === "rules_v2" &&
      c.b.policy === "rules_v1" &&
      c.role === "held-out" &&
      c.cohort.character.toLowerCase() === character,
  );
}

/** Per batch with at least one win: how many of the wins were re-derived by the harness (re-run, replay, terminal state). */
export function winRows(): {
  policy: string;
  batch: string;
  held: boolean;
  wins: number;
  completed: number;
  audited: number;
  verified: number;
}[] {
  return evidence.reports
    .filter((r) => r.counts.win > 0)
    .map((r) => ({
      policy: r.policy,
      batch: r.id,
      held: r.role === "held-out",
      wins: r.counts.win,
      completed: r.completed,
      audited: r.winsAudit?.audited ?? 0,
      verified: r.winsAudit?.verified ?? 0,
    }));
}

/** The sentence about wins, written from the data: who won, on which kind of seeds, and how many wins were re-derived. */
export function winSentence(): string {
  const rows = winRows();
  const wins = rows.reduce((a, r) => a + r.wins, 0);
  const parts = rows.map(
    (r) =>
      `${r.policy} ${String(r.wins)} of ${r.completed.toLocaleString("en-US")} completed games (${r.held ? "held-out seeds" : "development seeds"}; ${String(r.verified)} of ${String(r.wins)} wins re-run and replayed hash for hash)`,
  );
  return `${String(wins)} simulated ${wins === 1 ? "game has" : "games have"} been won so far: ${parts.join("; ")}`;
}

/** Wins and completed games summed over every listed batch (used for the headline sentence). */
export function totals(): { wins: number; completed: number } {
  return evidence.reports.reduce(
    (acc, r) => ({ wins: acc.wins + r.counts.win, completed: acc.completed + r.completed }),
    { wins: 0, completed: 0 },
  );
}
