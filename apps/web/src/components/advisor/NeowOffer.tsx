"use client";

import Link from "next/link";
import { useState } from "react";

import { OPENING_OPTIONS } from "@slay2/game-data";

import { Whisker } from "@/components/codex/MeasuredValue";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { Select } from "@/components/ui/Field";
import { StartHpNote } from "@/components/ui/StartHpNote";
import { CLASS_STYLE } from "@/lib/card-style";
import { formatBeta, oddsMultiplier, valueSign } from "@/lib/cardvalues";
import {
  NEOW,
  assessOffer,
  averageChance,
  chanceWith,
  neowStudy,
  offerVerdict,
  type NeowData,
  type OfferLine,
  type OfferVerdict,
} from "@/lib/neow";
import type { RunState } from "@/lib/run-state";

const HELPFUL = OPENING_OPTIONS.filter((o) => o.kind === "positive");
const COSTLY = OPENING_OPTIONS.filter((o) => o.kind === "cursed");

const percent = (x: number): string => `${String(Math.round(x * 100))}%`;
const games = (n: number): string => n.toLocaleString("en-US");
const pText = (p: number): string =>
  p === 0 ? "p < 1e-300" : `p = ${p < 1e-4 ? p.toExponential(1) : p.toPrecision(2)}`;

function VerdictText({
  verdict,
  label,
  data,
}: {
  verdict: OfferVerdict;
  label: string;
  data: NeowData;
}) {
  switch (verdict.kind) {
    case "empty":
    case "single":
      return null;
    case "untested":
      return (
        <p className="text-sm text-muted">
          These measurements have not been tested against play yet, so SLAY2 does not say which
          relic to take.
        </p>
      );
    case "not-improved": {
      const t = verdict.test;
      const p = t.reachedAct2.pairedTable.mcnemar_p;
      // the first study (simulated runs that dropped the relics they gained) found the rule helpful; this one, which kept them, did not
      const earlier = neowStudy(data) === "repeated" ? data.first?.test : null;
      return (
        <p className="rounded-lg border border-copper-deep/70 bg-copper/10 p-3 text-sm text-copper">
          SLAY2 does not say which relic to take. In the held-out test a simulated pilot that took
          the best-measured relic got past the Act-1 boss in {percent(t.reachedAct2.a.rate)} of{" "}
          {games(t.bothCompleted)} games against {percent(t.reachedAct2.b.rate)} for one that took
          the first helpful relic ({pText(p)}), so the test does not show that it improves play.
          {earlier?.passed
            ? ` An earlier study, in simulated runs that dropped every relic they gained after the first fight, found the rule helpful (${percent(earlier.reachedAct2.a.rate)} against ${percent(earlier.reachedAct2.b.rate)}, ${pText(earlier.reachedAct2.pairedTable.mcnemar_p)}); this one keeps the relics, as the game does, and did not confirm it, so it is the one SLAY2 follows.`
            : ""}{" "}
          The numbers below are measurements, not advice.
        </p>
      );
    }
    case "not-for-class": {
      const t = verdict.test;
      const m = verdict.result?.member;
      return (
        <p className="rounded-lg border border-copper-deep/70 bg-copper/10 p-3 text-sm text-copper">
          SLAY2 does not say which relic to take for {label}.{" "}
          {m
            ? `The held-out test favoured the rule over all ${String(t.members.length)} classes together, but in the ${games(m.bothCompleted)} ${label} games alone a pilot that took the best-measured relic got past the Act-1 boss in ${percent(m.reachedAct2.a)} against ${percent(m.reachedAct2.b)} for one that took the first helpful relic (${pText(m.reachedAct2.pairedTable.mcnemar_p)}), which is not clearly better.`
            : `${label} was not part of the held-out test.`}{" "}
          The numbers below are measurements, not advice.
        </p>
      );
    }
    case "unmeasured":
      return (
        <p className="text-sm text-muted">
          SLAY2 does not say which relic to take: {verdict.best.name} was never taken in the
          simulated runs, so there is nothing to compare it with.
        </p>
      );
    case "take": {
      const t = verdict.test;
      const m = verdict.result.member;
      return (
        <div className="space-y-2">
          <p className="text-parchment">
            The rule that was tested (take the offered relic with the largest measured value) would
            take <strong className="font-medium text-gold">{verdict.best.name}</strong>.
          </p>
          <p className="text-sm text-muted">
            {verdict.separation === "clear"
              ? `Its 95% interval sits clear of ${verdict.runnerUp.name}'s, ${verdict.offered === 2 ? "the other relic you entered" : "the next best of the three"}.`
              : `The simulated runs do not clearly separate it from ${verdict.runnerUp.name}, ${verdict.offered === 2 ? "the other relic you entered" : "the next best of the three"}: their 95% intervals overlap. Use what you know.`}
          </p>
          <p className="text-xs text-dim">
            In held-out simulated games that rule got past the Act-1 boss in{" "}
            {percent(t.reachedAct2.a.rate)} of {games(t.bothCompleted)} against{" "}
            {percent(t.reachedAct2.b.rate)} for taking the first helpful relic (
            {pText(t.reachedAct2.pairedTable.mcnemar_p)}, the same seeds for both); in the{" "}
            {games(m.bothCompleted)} {label} games alone, {percent(m.reachedAct2.a)} against{" "}
            {percent(m.reachedAct2.b)}. Neither has been checked against the live game.
          </p>
        </div>
      );
    }
  }
}

function RelicTile({
  line,
  character,
  data,
  isPick,
  isRecorded,
  disabled,
  onRecord,
}: {
  line: OfferLine;
  character: string;
  data: NeowData;
  /** the relic a simulated pilot would take: only ever set after the registered test improved play */
  isPick: boolean;
  isRecorded: boolean;
  disabled: boolean;
  onRecord: (id: string) => void;
}) {
  const v = line.value;
  const chance = v ? chanceWith(character, v, data) : undefined;
  const average = averageChance(character, data);
  const sign = v ? valueSign(v) : "unclear";
  return (
    <li className="min-w-0 rounded-lg border border-line bg-charcoal/40 p-3">
      <p className="flex flex-wrap items-center gap-2">
        <strong className="font-display text-parchment wrap-anywhere">{line.name}</strong>
        <Badge tone={line.kind === "positive" ? "exact" : "unverified"}>
          {line.kind === "positive" ? "helpful" : "costly"}
        </Badge>
        {isPick ? <Badge tone="build">Simulated pilot&rsquo;s pick</Badge> : null}
      </p>
      {v && chance && average !== undefined ? (
        <div className="mt-2 rounded-lg border border-line bg-charcoal/60 px-3 py-2.5">
          <p className="num flex flex-wrap items-baseline gap-x-2 text-base font-medium text-parchment">
            {percent(chance.mid)}
            <span className="text-xs font-normal text-muted">
              estimated chance of getting past the Act-1 boss (95%: {percent(chance.lo)} to{" "}
              {percent(chance.hi)})
            </span>
          </p>
          <div className="mt-1.5">
            <Whisker m={v} sign={sign} />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            The average relic: {percent(average)}. Value {formatBeta(v.beta)} (odds{" "}
            {oddsMultiplier(v.beta)}), taken in {games(v.taken)} simulated runs.
          </p>
          {v.exclusionFlag ? (
            <p className="mt-1 text-xs text-rose">
              {v.excluded} of its {games(v.taken + v.excluded)} games ended in a simulator error or
              a timeout, more often than chance explains: this value rests on the games that
              finished.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 rounded-lg border border-line bg-charcoal/60 p-3 text-sm text-muted">
          Not measured: the simulated runs never took this relic, so it counts as the average.
        </p>
      )}
      <div className="mt-3">
        <Button
          size="sm"
          disabled={disabled || isRecorded}
          onClick={() => {
            onRecord(line.id);
          }}
        >
          {isRecorded ? "Recorded" : `Record ${line.name}`}
        </Button>
      </div>
    </li>
  );
}

/**
 * "What did Neow offer?": the three relics on the table, each with what simulated runs say taking it did, and (only after the
 * registered test showed such a pilot played better) the one a simulated pilot would take. A labelled second opinion; it never
 * enters the advisor's own index. Nothing here is saved: it is a look-up before the choice, and the choice is recorded below.
 */
export function NeowOffer({
  run,
  disabled,
  recorded,
  onRecord,
  data = NEOW,
}: {
  run: RunState;
  disabled: boolean;
  /** option ids already recorded for this run */
  recorded: readonly string[];
  onRecord: (optionId: string) => void;
  data?: NeowData;
}) {
  const [slots, setSlots] = useState<readonly [string, string, string]>(["", "", ""]);
  const character = run.character;
  if (!character || !data.values) {
    return null;
  }
  const label = CLASS_STYLE[character].label;
  const chosen = slots.filter(Boolean);
  const assessment = assessOffer(chosen, data);
  const verdict = offerVerdict(assessment, character, data);
  const set = (i: 0 | 1 | 2, id: string): void => {
    setSlots((prev) => {
      const next: [string, string, string] = [prev[0], prev[1], prev[2]];
      next[i] = id;
      return next;
    });
  };
  const slot = (i: 0 | 1 | 2, text: string, pool: typeof HELPFUL, taken: string) => (
    <div className="min-w-0">
      <label
        htmlFor={`adv-offer-${String(i)}`}
        className="mb-1.5 block text-sm font-medium text-parchment"
      >
        {text}
      </label>
      <Select
        id={`adv-offer-${String(i)}`}
        value={slots[i]}
        disabled={disabled}
        onChange={(e) => {
          set(i, e.target.value);
        }}
      >
        <option value="">Not chosen</option>
        {pool
          .filter((o) => o.id !== taken)
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
      </Select>
    </div>
  );

  return (
    <Disclosure
      summary={
        <span className="flex flex-wrap items-center gap-2">
          What did Neow offer? Compare the three in simulated runs
          <Badge tone="unverified">Simulated · unverified</Badge>
        </span>
      }
    >
      <div className="space-y-4">
        <p>
          Say which three relics Neow showed you: two helpful and one costly. Each is shown with
          what simulated runs suggest it does for {label}: an estimate from the simulated runs of
          all five classes, assuming a relic does the same for each.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {slot(0, "First helpful option", HELPFUL, slots[1])}
          {slot(1, "Second helpful option", HELPFUL, slots[0])}
          {slot(2, "Costly option", COSTLY, "")}
        </div>
        {run.ascensionConfirmed && run.ascension > 0 ? (
          <p className="text-xs text-rose">
            Every simulated run was played at Ascension 0; you are at Ascension {run.ascension}.
          </p>
        ) : null}
        <StartHpNote character={character} subject="chances" data={data} />
        {run.act1 === "underdocks" ? (
          <p className="text-xs text-rose">
            You said you are in Underdocks; every simulated run was played in Overgrowth.
          </p>
        ) : null}
        <div aria-live="polite" className="space-y-3">
          <VerdictText verdict={verdict} label={label} data={data} />
        </div>
        {assessment.lines.length > 0 ? (
          <ul
            className="grid gap-3 md:grid-cols-3"
            aria-label="Measured values of the relics offered"
          >
            {assessment.lines.map((line) => (
              <RelicTile
                key={line.id}
                line={line}
                character={character}
                data={data}
                isPick={
                  verdict.kind === "take" &&
                  verdict.separation === "clear" &&
                  verdict.best.id === line.id
                }
                isRecorded={recorded.includes(line.id)}
                disabled={disabled}
                onRecord={onRecord}
              />
            ))}
          </ul>
        ) : null}
        <ul className="list-disc space-y-1.5 pl-5 text-xs text-muted">
          <li>
            Measured in {games(data.values.games)} simulated Overgrowth runs ({label} among them) at
            Ascension 0 in which the relic was taken at random among the three offered; a value is
            the change in the log-odds of getting past the Act-1 boss from taking the relic instead
            of the average one, with a 95% interval from resampling whole seeds. The percentages
            move {label}&rsquo;s own starting point ({percent(averageChance(character, data) ?? 0)})
            by that value, so they are estimates, not counts of {label} runs.
          </li>
          <li>
            One rules pilot played them, the simulator has not been compared with the live game, the
            Ancients of acts two and three are not simulated, and{" "}
            {data.values.relicsKept
              ? "the simulated runs kept the relics they gained, as the game does (the pinned simulator drops them; a harness variant repairs that, gap G14), so the relic offered here was measured among the relics a run goes on to gain."
              : "a simulated run keeps no relic it gains after its first fight (gap G14), so the relic offered here was measured as the only extra one a run holds."}{" "}
            Your deck, your plans and what you know of the run matter more than a single number.
          </li>
          <li>
            The method, every value and the one held-out test are on{" "}
            <Link
              className="text-teal underline decoration-dotted underline-offset-4"
              href="/methods#opening-ancient"
            >
              Evidence &amp; methods
            </Link>
            .
          </li>
        </ul>
      </div>
    </Disclosure>
  );
}
