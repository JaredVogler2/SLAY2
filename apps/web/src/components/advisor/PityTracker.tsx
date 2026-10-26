"use client";

import { useMemo } from "react";

import { forecastPack, inferCounter, rarityRulesForAscension } from "@slay2/odds";

import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { ExactValue } from "@/components/ui/ExactValue";
import { Panel } from "@/components/ui/Panel";
import { packObservations, sourceToReward, type RunState } from "@/lib/run-state";
import { pctSmart } from "@/lib/format";

/** The hidden rare counter, tracked from every pack you record. Exact; uses the same engine as the Odds page. */
export function PityTracker({ run }: { run: RunState }) {
  const rules = useMemo(() => rarityRulesForAscension(run.ascension), [run.ascension]);
  const inference = useMemo(() => inferCounter(packObservations(run), rules), [run, rules]);
  const next = useMemo(
    () =>
      inference.impossible
        ? null
        : {
            regular: forecastPack(inference.posterior, sourceToReward("regular"), 3, rules),
            elite: forecastPack(inference.posterior, sourceToReward("elite"), 3, rules),
          },
    [inference, rules],
  );
  return (
    <Panel
      eyebrow="Rare pity tracker"
      title="Your next card reward"
      headingLevel={3}
      aside={
        <>
          <Badge tone="exact">Exact</Badge>
          <Badge tone="build">
            {run.ascensionConfirmed ? `A${String(run.ascension)}` : "A0 assumed"}
          </Badge>
        </>
      }
    >
      {next ? (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-charcoal/40 p-3">
              <dt className="text-xs text-muted">Normal fight: ≥1 rare</dt>
              <dd className="font-display text-2xl text-teal">
                <ExactValue value={next.regular.atLeastOneRare} digits={1} />
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-charcoal/40 p-3">
              <dt className="text-xs text-muted">Elite: ≥1 rare</dt>
              <dd className="font-display text-2xl text-teal">
                <ExactValue value={next.elite.atLeastOneRare} digits={1} />
              </dd>
            </div>
          </dl>
          <p className="text-sm text-muted">
            Based on {run.packs.length} recorded pack{run.packs.length === 1 ? "" : "s"}
            {run.packs.length === 0 ? " (the counter starts at its run-start value)" : ""}.{" "}
            {next.regular.atLeastOneRareBand.min.eq(next.regular.atLeastOneRareBand.max)
              ? "Your history pins the counter down exactly."
              : `Counter uncertain: ${pctSmart(next.regular.atLeastOneRareBand.min, 1)}–${pctSmart(next.regular.atLeastOneRareBand.max, 1)} for a normal fight.`}
          </p>
          <ButtonLink href="/odds?tab=rewards" variant="ghost" size="sm">
            Open the full calculator →
          </ButtonLink>
        </div>
      ) : (
        <p role="alert" className="text-sm text-rose">
          The recorded packs cannot happen under the verified rules (a relic or event may have
          changed the odds), so no exact forecast is shown.
        </p>
      )}
    </Panel>
  );
}
