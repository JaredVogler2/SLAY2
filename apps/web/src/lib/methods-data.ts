import evidence from "@/content/evidence.generated.json";
import rules from "@/content/rules.generated.json";
import { setFor } from "@/lib/cardvalues";

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

/** What `slay2_sim audit rederive` found: every game of the batch re-run and compared with the stored record. */
export interface RederivationAuditSummary {
  readonly games: number;
  readonly exact: number;
  /** seeds whose re-run is not identical to the stored record */
  readonly differing: readonly number[];
  readonly criteria: string;
}

// The generated file has `null` for an audit that has not been run, which JSON inference would freeze as `null`
export type EvidenceReport = Omit<
  (typeof evidence.reports)[number],
  "sampleAudit" | "rederivationAudit"
> & {
  readonly sampleAudit: SampleAuditSummary | null;
  readonly rederivationAudit: RederivationAuditSummary | null;
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
    (r) =>
      r.policy === policy &&
      r.profile === "veteran" &&
      r.character === character &&
      !r.ancientHeal && // a variant of the game (gaps G11, G13) is evidence about the variant, never the headline
      !r.gameHp,
  );
  const heldOut = mine.filter((r) => r.role === "held-out");
  return [...(heldOut.length > 0 ? heldOut : mine)].sort((x, y) => y.completed - x.completed)[0];
}

/**
 * Gap G13: what the game's own starting HP costs a class that the simulator starts with more. It is read from the committed
 * development comparison of the `game_hp` variant with the simulator's start (the same pilot on the same seeds): the share of
 * paired runs that got past the Act-1 boss with each. Undefined for a class nobody measured, which is every class but one.
 */
export function startHpGap(
  character: string,
): { simulator: number; game: number; pairs: number } | undefined {
  const byId = new Map(ALL_REPORTS.map((r) => [r.id, r]));
  const c = evidence.comparisons.find(
    (x) =>
      x.cohort.character.toLowerCase() === character.toLowerCase() &&
      byId.get(x.a.batchId)?.gameHp === true &&
      byId.get(x.b.batchId)?.gameHp === false,
  );
  return c
    ? { game: c.reachedAct2.a.rate, simulator: c.reachedAct2.b.rate, pairs: c.bothCompleted }
    : undefined;
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
    .map(([k, v]) => {
      // a values file is named by its file, not by its path
      if (k === "values" && typeof v === "string") {
        return `values=${v.replace(/^.*\//, "").replace(/\.json$/, "")}`;
      }
      return `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`;
    });
  return shown.length > 0 ? `${side.policy} (${shown.join(", ")})` : side.policy;
}

/**
 * A side of a comparison: the policy with its parameters, and the variant of the game it was played in, if it was one (gap G11:
 * acts two and three start healed; gap G13: the class starts with the game's own maximum HP). Both sides are the same policy
 * in a comparison of a variant with the game as the simulator plays it, so the variant is what tells them apart.
 */
export function sideLabel(side: {
  policy: string;
  params?: Record<string, unknown>;
  batchId: string;
}): string {
  const report = ALL_REPORTS.find((r) => r.id === side.batchId);
  const variant = report?.ancientHeal
    ? "acts 2 and 3 start healed"
    : report?.gameHp
      ? "the game's start HP"
      : "";
  return variant ? `${policyLabel(side)} [${variant}]` : policyLabel(side);
}

/**
 * The intermediate endpoint of a test in which both arms are the same policy and only the values it follows differ (ADR-046):
 * the arms are named by their values, because the policy's name is the same on both sides.
 */
export function newValuesSentence(c: Comparison): string {
  const r = c.reachedAct2;
  const t = r.pairedTable;
  return (
    `Past the Act-1 boss: ${pct(r.a.rate, 1)} with the new values and ${pct(r.b.rate, 1)} with the earlier ones ` +
    `(${String(t.a_only)} games only with the new values, ${String(t.b_only)} only with the earlier ones; exact McNemar ${formatP(t.mcnemar_p)})`
  );
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
    `Past the Act-1 boss: ${pct(r.a.rate, 1)} for ${sideLabel(c.a)} and ${pct(r.b.rate, 1)} for ${sideLabel(c.b)} ` +
    `(${String(t.a_only)} games only ${sideLabel(c.a)}, ${String(t.b_only)} only ${sideLabel(c.b)}; exact McNemar ${formatP(t.mcnemar_p)})`
  );
}

/** One honest sentence per comparison, generated from the committed artifact so it cannot drift from the data. */
export function comparisonSentence(c: Comparison): string {
  const [lo = 0, hi = 0] = c.floorDifference.ci95;
  const gap = `${signed(c.floorDifference.meanAMinusB)} floors for ${sideLabel(c.a)} relative to ${sideLabel(c.b)} (95% bootstrap interval ${signed(lo)} to ${signed(hi)}, ${String(c.bothCompleted)} paired games)`;
  const verdict = comparisonVerdict(c);
  const lead =
    verdict === "a-higher"
      ? `${sideLabel(c.a)} reached more floors than ${sideLabel(c.b)}`
      : verdict === "b-higher"
        ? `${sideLabel(c.b)} reached more floors than ${sideLabel(c.a)}`
        : `No difference in floors reached between ${sideLabel(c.a)} and ${sideLabel(c.b)} could be established`;
  const ratio = c.wallTimeRatioBOverA;
  const cost = ratio
    ? ratio >= 1
      ? `; ${sideLabel(c.b)} took ${ratio.toFixed(1)}× as long per game`
      : `; ${sideLabel(c.a)} took ${(1 / ratio).toFixed(1)}× as long per game`
    : "";
  return `${lead}: ${gap}${cost}. ${actTwoSentence(c)}.${winsClause(c)}`;
}

/** Wins are what the game is about and are far rarer than getting past a boss, so a comparison that has any says how they split. */
export function winsClause(c: Comparison): string {
  if (c.a.wins + c.b.wins === 0) return "";
  const t = c.pairedWinTable;
  return ` Wins: ${String(c.a.wins)} for ${sideLabel(c.a)} and ${String(c.b.wins)} for ${sideLabel(c.b)} (exact McNemar ${formatP(t.mcnemar_p)}).`;
}

/**
 * The pre-registered held-out test of the card values the site shows for one class (ADR-031, ADR-034, ADR-046): the
 * comparison its set names, which is the pilot that follows the values against the one that follows the hand-written
 * ratings, or for a set that replaces an earlier one against the pilot that follows the earlier one.
 */
export function valuesValidation(character: string): Comparison | undefined {
  const id = setFor(character)?.validation?.comparison;
  return id ? evidence.comparisons.find((c) => c.id === id) : undefined;
}

/** The test of a class's first measurement: the pilot that follows the values against the one that follows the hand-written ratings. */
export function ratingsValidation(character: string): Comparison | undefined {
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
