"use client";

import { useMemo, useState } from "react";

import {
  drawAtLeast,
  drawDistribution,
  drawJointAtLeast,
  drawMean,
  hypergeometricDistribution,
  nextHandWithReshuffle,
  Rational,
  provenanceFor,
} from "@slay2/odds";

import { Badge } from "@/components/ui/Badge";
import { BarChart } from "@/components/ui/BarChart";
import { Button } from "@/components/ui/Button";
import { ExactValue } from "@/components/ui/ExactValue";
import { MethodNote } from "@/components/ui/MethodNote";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { Panel } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Stat";
import { useUrlState, parseIntInRange } from "@/hooks/useUrlState";

export function DrawCalculator() {
  const [pile, setPile] = useUrlState<number>("pile", 10, parseIntInRange(0, 120));
  const [copies, setCopies] = useUrlState<number>("copies", 1, parseIntInRange(0, 120));
  const [draws, setDraws] = useUrlState<number>("draws", 5, parseIntInRange(0, 120));
  const [need, setNeed] = useUrlState<number>("need", 1, parseIntInRange(0, 20));
  const [useDiscard, setUseDiscard] = useState(false);
  const [discard, setDiscard] = useState(12);
  const [copiesDiscard, setCopiesDiscard] = useState(0);
  const [second, setSecond] = useState(false);
  const [copies2, setCopies2] = useState(1);
  const [need2, setNeed2] = useState(1);

  const result = useMemo(() => {
    try {
      if (copies > pile) {
        return { error: "You cannot have more copies than cards in the draw pile." } as const;
      }
      if (useDiscard) {
        if (copiesDiscard > discard) {
          return {
            error: "You cannot have more copies in the discard pile than cards in it.",
          } as const;
        }
        if (second) {
          return {
            error: "Two groups plus a reshuffle is not supported yet. Turn one of them off.",
          } as const;
        }
        if (draws > pile + discard) {
          return {
            error: "You cannot draw more cards than the draw and discard piles hold together.",
          } as const;
        }
        const q = {
          drawPile: pile,
          targetsInDrawPile: copies,
          discardPile: discard,
          targetsInDiscard: copiesDiscard,
          draws,
        };
        const p = nextHandWithReshuffle(q, need);
        let bars: { label: string; value: number }[];
        if (draws <= pile) {
          bars = drawDistribution({ pile, targets: copies, draws }).map((m, i) => ({
            label: String(i),
            value: m.toNumber(),
          }));
        } else {
          const rest = hypergeometricDistribution(discard, copiesDiscard, draws - pile);
          bars = rest.map((m, i) => ({ label: String(copies + i), value: m.toNumber() }));
        }
        const mean =
          draws <= pile
            ? drawMean({ pile, targets: copies, draws })
            : Rational.of(copies).add(
                Rational.of(
                  BigInt(draws - pile) * BigInt(copiesDiscard),
                  discard === 0 ? 1 : discard,
                ),
              );
        return { p, bars, mean } as const;
      }
      if (draws > pile) {
        return {
          error:
            "You cannot draw more cards than the pile holds. Turn on “the draw pile may run out” to include the reshuffle.",
        } as const;
      }
      if (second) {
        if (copies + copies2 > pile) {
          return { error: "The two groups together cannot be bigger than the pile." } as const;
        }
        const p = drawJointAtLeast(pile, draws, [
          { count: copies, need },
          { count: copies2, need: need2 },
        ]);
        return { p, bars: null, mean: null } as const;
      }
      const p = drawAtLeast({ pile, targets: copies, draws }, need);
      const bars = drawDistribution({ pile, targets: copies, draws }).map((m, i) => ({
        label: String(i),
        value: m.toNumber(),
      }));
      return { p, bars, mean: drawMean({ pile, targets: copies, draws }) } as const;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Invalid input" } as const;
    }
  }, [pile, copies, draws, need, useDiscard, discard, copiesDiscard, second, copies2, need2]);

  return (
    <Panel eyebrow="Draws" title="Will I draw it?" aside={<Badge tone="exact">Exact</Badge>}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPile(10);
                setCopies(1);
                setDraws(5);
                setNeed(1);
                setUseDiscard(false);
              }}
            >
              Opening hand, 10-card deck
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPile(20);
                setCopies(2);
                setDraws(5);
                setNeed(1);
                setUseDiscard(false);
              }}
            >
              Mid-run draw
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberStepper
              label="Cards in the draw pile"
              value={pile}
              onChange={setPile}
              min={0}
              max={120}
            />
            <NumberStepper
              label="Copies you want in it"
              value={copies}
              onChange={setCopies}
              min={0}
              max={120}
              hint="Count only copies still in the draw pile."
            />
            <NumberStepper
              label="Cards you draw"
              value={draws}
              onChange={setDraws}
              min={0}
              max={120}
              hint="5 per turn plus draw effects."
            />
            <NumberStepper
              label="At least how many?"
              value={need}
              onChange={setNeed}
              min={0}
              max={20}
            />
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-muted">
            <input
              type="checkbox"
              checked={useDiscard}
              onChange={(e) => {
                setUseDiscard(e.target.checked);
              }}
              className="h-5 w-5 accent-copper"
            />
            The draw pile may run out (shuffle my discard pile in)
          </label>
          {useDiscard ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberStepper
                label="Cards in the discard pile"
                value={discard}
                onChange={setDiscard}
                min={0}
                max={120}
              />
              <NumberStepper
                label="Copies in the discard pile"
                value={copiesDiscard}
                onChange={setCopiesDiscard}
                min={0}
                max={120}
              />
            </div>
          ) : null}
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-muted">
            <input
              type="checkbox"
              checked={second}
              onChange={(e) => {
                setSecond(e.target.checked);
              }}
              className="h-5 w-5 accent-copper"
            />
            …and I also need a second, different card
          </label>
          {second ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberStepper
                label="Copies of the second card"
                value={copies2}
                onChange={setCopies2}
                min={0}
                max={120}
              />
              <NumberStepper
                label="At least how many of it?"
                value={need2}
                onChange={setNeed2}
                min={0}
                max={20}
              />
            </div>
          ) : null}
        </div>
        <div aria-live="polite" className="space-y-5">
          {"error" in result ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-deep bg-rose/10 p-4 text-sm text-rose"
            >
              {result.error}
            </div>
          ) : (
            <>
              <Stat
                label={
                  second ? "Chance of drawing both" : `Chance of drawing at least ${String(need)}`
                }
                value={<ExactValue value={result.p} digits={2} />}
                tone="exact"
              />
              {result.bars ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-parchment">
                    How many copies you draw
                  </p>
                  <BarChart
                    title="Copies drawn"
                    bars={result.bars.map((b, i) => ({
                      ...b,
                      highlight: Number(b.label) >= need && i >= 0,
                    }))}
                    xLabel="Copies drawn (highlighted: enough)"
                  />
                  <p className="mt-1 text-sm text-muted">
                    Expected copies:{" "}
                    <span className="num text-parchment">{result.mean.toFixed(3)}</span>
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
      <div className="mt-6">
        <MethodNote provenance={provenanceFor("draw")} />
      </div>
    </Panel>
  );
}
