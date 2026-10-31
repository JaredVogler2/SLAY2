import { Badge } from "@/components/ui/Badge";
import { EVIDENCE, type EvidenceClass } from "@/lib/insights";

/** What kind of evidence a number is: the page's one vocabulary, with the meaning in the tooltip and in the legend above the figures. */
export function EvidenceBadge({ kind }: { kind: EvidenceClass }) {
  const e = EVIDENCE[kind];
  return (
    <Badge tone={e.tone} title={e.meaning}>
      {e.label}
    </Badge>
  );
}

const LEGEND: readonly EvidenceClass[] = [
  "registered",
  "descriptive",
  "development",
  "exploratory",
  "judgement",
];

export function EvidenceLegend() {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {LEGEND.map((k) => (
        <div key={k} className="min-w-0">
          <dt>
            <EvidenceBadge kind={k} />
          </dt>
          <dd className="mt-1 text-muted">{EVIDENCE[k].meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
