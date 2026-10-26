import type evidence from "@/content/evidence.generated.json";
import rules from "@/content/rules.generated.json";

export type RuleRow = (typeof rules.rules)[number];
export type EvidenceReport = (typeof evidence.reports)[number];
export type SimulatorGap = (typeof evidence.simulatorGaps)[number];

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
