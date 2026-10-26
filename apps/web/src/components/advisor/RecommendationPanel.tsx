"use client";

import { useState } from "react";

import { ACT1_BRIEFS, getAct1Boss, getCard, isAct1Variant } from "@slay2/game-data";
import type { DraftAction, DraftResponse, RankedOption } from "@slay2/decision";

import { CardTile } from "@/components/cards/CardTile";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/cn";

function key(a: DraftAction): string {
  return a.kind === "skip" ? "skip" : a.cardId;
}

function DeltaBar({ delta, max }: { delta: number; max: number }) {
  const pct = max === 0 ? 0 : Math.min(100, (Math.abs(delta) / max) * 100);
  return (
    <div className="relative h-2.5 w-full rounded-full bg-charcoal" aria-hidden="true">
      <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
      <span
        className={cn(
          "absolute inset-y-0 rounded-full",
          delta >= 0 ? "left-1/2 bg-teal" : "right-1/2 bg-rose",
        )}
        style={{ width: `${(pct / 2).toString()}%` }}
      />
    </div>
  );
}

/** The decision: what to do, why, how close the call is, and how to record what you actually did. */
export function RecommendationPanel({
  result,
  onRecord,
}: {
  result: DraftResponse;
  onRecord: (action: DraftAction) => void;
}) {
  const best = result.recommendation;
  const max = Math.max(...result.ranking.map((o) => Math.abs(o.indexDelta)), 0.01);
  const [chosen, setChosen] = useState<string | null>(null);
  const bestCard = best.action.kind === "pick" ? getCard(best.action.cardId) : undefined;
  const { stability, closeCall } = result.confidence;
  const kept = stability.topChoiceKept;
  const total = stability.perturbations;
  const picked = chosen ?? key(best.action);
  const pickedOption: RankedOption | undefined = result.ranking.find(
    (o) => key(o.action) === picked,
  );

  return (
    <Panel
      eyebrow="Step 4 · the call"
      title={best.action.kind === "skip" ? "Skip this one" : `Take ${best.label}`}
      aside={
        <>
          <Badge tone="heuristic">Heuristic v0</Badge>
          <Badge tone="neutral">Not calibrated</Badge>
        </>
      }
      headingLevel={2}
      aria-live="polite"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          {bestCard ? <CardTile card={bestCard} /> : null}
          <p className="text-parchment">
            {best.action.kind === "skip"
              ? "Every offered card lowers the deck index. Skipping keeps the deck thin."
              : `${best.label} improves the deck index by `}
            {best.action.kind === "pick" ? (
              <strong className="num text-teal">+{best.indexDelta.toFixed(2)}</strong>
            ) : null}
            {best.action.kind === "pick" ? " points over skipping." : null}
          </p>
          <ul className="space-y-1.5 text-sm text-muted">
            {best.reasons.slice(0, 3).map((r) => (
              <li key={r.text} className="flex gap-2">
                <span
                  className={cn(
                    "num w-12 shrink-0 text-right",
                    r.delta >= 0 ? "text-teal" : "text-rose",
                  )}
                >
                  {r.delta >= 0 ? "+" : ""}
                  {r.delta.toFixed(2)}
                </span>
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
          <div className="rounded-xl border border-line bg-charcoal/50 p-3 text-sm">
            <p className="font-medium text-parchment">
              {closeCall ? "Close call" : "Clear call"} ·{" "}
              <span className="num text-muted">
                margin {result.confidence.margin.toFixed(2)} points
              </span>
            </p>
            <p className="mt-1 text-muted">
              This choice stays on top in <span className="num text-parchment">{kept}</span> of{" "}
              <span className="num text-parchment">{total}</span> random re-weightings of the
              heuristic’s own weights
              {kept < total
                ? `; the usual alternative is ${Object.entries(stability.otherTopChoices)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k]) => getCard(k)?.name ?? k)
                    .slice(0, 2)
                    .join(" or ")}.`
                : "."}{" "}
              This measures how fragile the <em>heuristic</em> is, not how likely the pick is to win
              your run.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-parchment">All options, best first</p>
          <ol className="space-y-2" aria-label="Ranked options">
            {result.ranking.map((o) => (
              <li key={key(o.action)}>
                <Disclosure
                  open={o.rank === 1}
                  summary={
                    <span className="flex w-full min-w-0 items-center gap-3">
                      <span className="num w-5 shrink-0 text-muted">{o.rank}</span>
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      <span
                        className={cn(
                          "num shrink-0",
                          o.indexDelta > 0
                            ? "text-teal"
                            : o.indexDelta < 0
                              ? "text-rose"
                              : "text-muted",
                        )}
                      >
                        {o.indexDelta > 0 ? "+" : ""}
                        {o.indexDelta.toFixed(2)}
                      </span>
                    </span>
                  }
                >
                  <DeltaBar delta={o.indexDelta} max={max} />
                  <ul className="mt-3 space-y-1.5">
                    {o.reasons.map((r) => (
                      <li key={r.text} className="flex gap-2">
                        <span
                          className={cn(
                            "num w-12 shrink-0 text-right",
                            r.delta >= 0 ? "text-teal" : "text-rose",
                          )}
                        >
                          {r.delta >= 0 ? "+" : ""}
                          {r.delta.toFixed(2)}
                        </span>
                        <span className="min-w-0">{r.text}</span>
                      </li>
                    ))}
                  </ul>
                </Disclosure>
              </li>
            ))}
          </ol>
          {result.warnings.length > 0 ? (
            <ul
              className="space-y-1 rounded-lg border border-rose-deep bg-rose/10 p-3 text-sm text-rose"
              aria-label="Warnings"
            >
              {result.warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-line bg-charcoal/40 p-4">
        <p className="mb-2 text-sm font-medium text-parchment">
          Record what you did (keeps your rare-pity tracker exact)
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {result.ranking.map((o) => (
            <label
              key={key(o.action)}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm",
                picked === key(o.action)
                  ? "border-copper bg-copper/15 text-gold"
                  : "border-line-strong bg-ink-2 text-muted hover:border-copper",
              )}
            >
              <input
                type="radio"
                name="record"
                className="sr-only"
                checked={picked === key(o.action)}
                onChange={() => {
                  setChosen(key(o.action));
                }}
              />
              {o.action.kind === "skip" ? "I skipped" : `I took ${o.label}`}
            </label>
          ))}
          <Button
            variant="primary"
            onClick={() => {
              if (pickedOption) {
                onRecord(pickedOption.action);
                setChosen(null);
              }
            }}
          >
            Record &amp; clear offer
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <Disclosure summary="How this index is built, and what it ignores">
          <div className="space-y-4">
            {result.actContext ? (
              <div>
                <p className="mb-1 font-medium text-parchment">Act 1 context</p>
                {result.actContext.applied ? (
                  <>
                    <p>
                      {isAct1Variant(result.actContext.variant)
                        ? ACT1_BRIEFS[result.actContext.variant].name
                        : result.actContext.variant}
                      {result.actContext.boss && isAct1Variant(result.actContext.variant)
                        ? `, boss ${getAct1Boss(result.actContext.variant, result.actContext.boss)?.name ?? result.actContext.boss}`
                        : ", boss not known"}
                      . The coverage weights below were tilted before the options were ranked:
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {result.actContext.adjustments.map((a) => (
                        <li key={a.group}>
                          {a.label}: {a.percent > 0 ? "+" : "−"}
                          {Math.abs(a.percent)} % ({a.because.join(", ")})
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                <p className="mt-1">{result.actContext.note}</p>
              </div>
            ) : null}
            <div>
              <p className="mb-1 font-medium text-parchment">Assumptions</p>
              <ul className="list-disc space-y-1 pl-5">
                {result.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-medium text-rose">Not modelled</p>
              <ul className="list-disc space-y-1 pl-5">
                {result.notModelled.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-medium text-parchment">Missing inputs</p>
              <ul className="list-disc space-y-1 pl-5">
                {result.missingInputs.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
            <p className="font-mono text-xs text-dim">
              policy {result.policyVersion} · state {result.stateDigest} · {result.build}
            </p>
          </div>
        </Disclosure>
      </div>
    </Panel>
  );
}
