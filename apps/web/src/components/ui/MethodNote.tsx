import Link from "next/link";
import type { Provenance } from "@slay2/odds";

import { Badge } from "./Badge";
import { Disclosure } from "./Disclosure";

/** "How this is calculated": rule ids link to the rule register on /methods; assumptions and gaps are never hidden. */
export function MethodNote({
  provenance,
  method = "exact",
}: {
  provenance: Provenance;
  method?: "exact" | "heuristic";
}) {
  return (
    <Disclosure
      summary={
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={method === "exact" ? "exact" : "heuristic"}>
            {method === "exact" ? "Exact" : "Heuristic"}
          </Badge>
          <Badge tone="build">{provenance.build}</Badge>
          <span className="text-muted">How this is calculated</span>
        </span>
      }
    >
      <div className="space-y-4">
        <p>
          Rules:{" "}
          {provenance.ruleIds.map((id, i) => (
            <span key={id}>
              {i > 0 ? ", " : ""}
              <Link
                href={{ pathname: "/methods", hash: id }}
                className="font-mono text-teal underline decoration-dotted underline-offset-4"
              >
                {id}
              </Link>
            </span>
          ))}{" "}
          · evidence classes {provenance.evidence.join(", ")}
        </p>
        <div>
          <p className="mb-1 font-medium text-parchment">Assumptions</p>
          <ul className="list-disc space-y-1 pl-5">
            {provenance.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 font-medium text-rose">Not modelled</p>
          <ul className="list-disc space-y-1 pl-5">
            {provenance.notModelled.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      </div>
    </Disclosure>
  );
}
