"use client";

import { useDeferredValue, useMemo, useState } from "react";

import { ASCENSION_EFFECTS } from "@slay2/game-schema";
import {
  Rational,
  evaluateRoute,
  inferCounter,
  inferPotionCounter,
  inferUnknownState,
  MAX_UNKNOWN_ROOMS_PER_ACT,
  pointMass,
  rarityRulesForAscension,
  type CounterDist,
  type PotionCounterDist,
  type UnknownObservation,
  type UnknownOutcome,
} from "@slay2/odds";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { Panel } from "@/components/ui/Panel";
import { parseIntInRange, useUrlState } from "@/hooks/useUrlState";
import { packObservations, potionObservations, unknownObservations } from "@/lib/run-state";
import { useRunState } from "@/lib/run-store";
import {
  EXAMPLE_ROUTES,
  formatUnknownHistory,
  parseRoute,
  parseRouteParam,
  parseUnknownHistory,
  parseUnknownParam,
} from "@/lib/route-lab";

import { RouteBuilder } from "./RouteBuilder";
import { RouteResults, type EvaluatedRoute } from "./RouteResults";

const NAMES = ["A", "B", "C"] as const;

const OUTCOME_LABEL: Record<UnknownOutcome, string> = {
  event: "Event",
  fight: "Fight",
  shop: "Shop",
  treasure: "Treasure",
};

type Context =
  | {
      ok: true;
      unknownHistory: UnknownObservation[];
      rareCounter: CounterDist;
      potionCounter: PotionCounterDist;
    }
  | { ok: false; error: string };

export function RouteLab() {
  const run = useRunState();
  const [ascParam, setAscParam] = useUrlState<number>("asc", -1, (raw) =>
    raw === "" ? undefined : parseIntInRange(0, 10)(raw),
  );
  const [a, setA] = useUrlState<string>("a", "", parseRouteParam);
  const [b, setB] = useUrlState<string>("b", "", parseRouteParam);
  const [c, setC] = useUrlState<string>("c", "", parseRouteParam);
  const [counter, setCounter] = useUrlState<number>("k", 0, parseIntInRange(0, 90));
  const [tenths, setTenths] = useUrlState<number>("p", 4, parseIntInRange(0, 10));
  const [questions, setQuestions] = useUrlState<string>("u", "", parseUnknownParam);
  const [fromRun, setFromRun] = useState(false);

  const confirmedRun = run?.ascensionConfirmed ? run : null;
  const ascension = ascParam >= 0 ? ascParam : (confirmedRun?.ascension ?? 0);
  const confirmed = ascParam >= 0 || confirmedRun !== null;
  const runHasLogs =
    run !== null && run.packs.length + run.potions.length + run.unknownRooms.length > 0;
  const usingRun = fromRun && run !== null;

  const history = useMemo(() => parseUnknownHistory(questions) ?? [], [questions]);

  const context = useMemo<Context>(() => {
    const rules = rarityRulesForAscension(ascension);
    if (usingRun) {
      const unknownHistory = unknownObservations(run);
      const rare = inferCounter(packObservations(run), rules);
      const potion = inferPotionCounter(potionObservations(run));
      if (rare.impossible || potion.impossible || inferUnknownState(unknownHistory).impossible) {
        return {
          ok: false,
          error:
            "The logs in your saved run cannot happen under the verified rules (a relic or event may have changed the odds). Switch to the values below.",
        };
      }
      return {
        ok: true,
        unknownHistory,
        rareCounter: rare.posterior,
        potionCounter: potion.posterior,
      };
    }
    if (inferUnknownState(history).impossible) {
      return {
        ok: false,
        error:
          "That sequence of “?” rooms cannot happen under the verified rules (the counters would already have forced a different outcome). Undo the last entry.",
      };
    }
    return {
      ok: true,
      unknownHistory: history,
      rareCounter: pointMass(counter, rules),
      potionCounter: new Map([[tenths, Rational.ONE]]),
    };
  }, [usingRun, run, ascension, history, counter, tenths]);

  const input = useMemo(
    () => ({ context, ascension, routes: [a, b, c] as const }),
    [context, ascension, a, b, c],
  );
  const settled = useDeferredValue(input);
  const pending = settled !== input;

  const evaluated: EvaluatedRoute[] = useMemo(
    () =>
      settled.routes.map((compact, i) => {
        const name = NAMES[i] ?? String(i + 1);
        const parsed = parseRoute(compact);
        if (!parsed.ok || parsed.rooms.length === 0) {
          return { name, report: null };
        }
        if (!settled.context.ok) {
          return { name, report: null, error: settled.context.error };
        }
        try {
          return {
            name,
            report: evaluateRoute({
              rooms: parsed.rooms,
              ascension: settled.ascension,
              unknownHistory: settled.context.unknownHistory,
              rareCounter: settled.context.rareCounter,
              potionCounter: settled.context.potionCounter,
            }),
          };
        } catch (e) {
          return {
            name,
            report: null,
            error: e instanceof Error ? e.message : "could not be evaluated",
          };
        }
      }),
    [settled],
  );

  const addQuestion = (outcome: UnknownOutcome | null): void => {
    if (history.length >= MAX_UNKNOWN_ROOMS_PER_ACT) {
      return;
    }
    setQuestions(formatUnknownHistory([...history, outcome === null ? {} : { outcome }]));
  };

  const compared = evaluated.filter((r) => r.report !== null).length;
  const startingSummary = usingRun
    ? "from your saved run"
    : `rare counter ${String(counter)} · potion chance ${String(tenths * 10)}% · ${
        history.length === 0
          ? "no “?” rooms met this act"
          : `${String(history.length)} “?” ${history.length === 1 ? "room" : "rooms"} met this act`
      }`;

  return (
    <div className="space-y-6">
      <div className="panel space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div className="min-w-[min(11rem,100%)]">
            <label htmlFor="route-asc" className="mb-1.5 block text-sm font-medium text-parchment">
              Ascension
            </label>
            <Select
              id="route-asc"
              value={confirmed ? String(ascension) : ""}
              onChange={(e) => {
                setAscParam(Number(e.target.value));
              }}
            >
              {!confirmed ? (
                <option value="" disabled>
                  Choose… (A0 assumed)
                </option>
              ) : null}
              {Array.from({ length: 11 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0
                    ? "Ascension 0"
                    : `Ascension ${String(i)} · ${ASCENSION_EFFECTS[i - 1]?.id ?? ""}`}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-1">
            {!confirmed ? <Badge tone="unverified">Ascension not set · A0 assumed</Badge> : null}
            {pending ? <Badge tone="neutral">Updating…</Badge> : null}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <a
              href="#route-results"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-teal underline decoration-dotted underline-offset-4 xl:hidden"
            >
              Jump to results
            </a>
            <Button
              variant="primary"
              onClick={() => {
                setA(EXAMPLE_ROUTES[0]);
                setB(EXAMPLE_ROUTES[1]);
                setC("");
              }}
            >
              Try an example
            </Button>
            <Button
              variant="ghost"
              disabled={a === "" && b === "" && c === ""}
              onClick={() => {
                setA("");
                setB("");
                setC("");
              }}
            >
              Clear all routes
            </Button>
          </div>
        </div>

        <details
          className="group rounded-xl border border-line bg-ink/60 p-4"
          {...(context.ok ? {} : { open: true })}
        >
          <summary className="cursor-pointer text-parchment">
            Starting values{" "}
            <span className="text-sm text-muted">
              — {startingSummary}{" "}
              <span className="text-teal underline decoration-dotted underline-offset-4">
                change
              </span>
            </span>
          </summary>
          <div className="mt-4 space-y-5">
            {run && runHasLogs ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-charcoal/50 p-3">
                <p className="text-sm text-muted">
                  Your saved run has {run.packs.length} logged card packs, {run.potions.length}{" "}
                  logged fights and {run.unknownRooms.length} “?” rooms.
                </p>
                <Button
                  size="sm"
                  variant={usingRun ? "secondary" : "primary"}
                  aria-pressed={usingRun}
                  onClick={() => {
                    setFromRun(!usingRun);
                  }}
                >
                  {usingRun ? "Use the values below instead" : "Start the routes from my saved run"}
                </Button>
              </div>
            ) : null}

            {usingRun ? (
              <p className="text-sm text-muted" role="status">
                The routes start from the counters your saved run implies. Nothing from your run
                leaves this browser, and none of it is put in the page address.
              </p>
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                <NumberStepper
                  label="Non-rare cards since your last rare card"
                  hint="0 at the start of a run or right after a rare. The Odds page works it out from your card packs."
                  value={counter}
                  min={0}
                  max={90}
                  onChange={setCounter}
                />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label htmlFor="route-potion" className="text-sm font-medium text-parchment">
                    Potion chance for the next fight
                  </label>
                  <Select
                    id="route-potion"
                    value={String(tenths)}
                    onChange={(e) => {
                      setTenths(Number(e.target.value));
                    }}
                  >
                    {Array.from({ length: 11 }, (_, t) => (
                      <option key={t} value={t}>
                        {t * 10}%{t === 4 ? " · the start of a run" : ""}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted">
                    Falls 10 points after a potion drops and rises 10 after a fight without one.
                  </p>
                </div>
                <div className="space-y-3 md:col-span-2">
                  <p className="text-sm font-medium text-parchment">
                    “?” rooms you have already entered in this act
                  </p>
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label="Add a “?” room that turned into"
                  >
                    {(["event", "fight", "shop", "treasure"] as const).map((o) => (
                      <Button
                        key={o}
                        size="sm"
                        disabled={history.length >= MAX_UNKNOWN_ROOMS_PER_ACT}
                        onClick={() => {
                          addQuestion(o);
                        }}
                      >
                        {OUTCOME_LABEL[o]}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      disabled={history.length >= MAX_UNKNOWN_ROOMS_PER_ACT}
                      onClick={() => {
                        addQuestion(null);
                      }}
                    >
                      Didn’t note
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={history.length === 0}
                      onClick={() => {
                        setQuestions(formatUnknownHistory(history.slice(0, -1)));
                      }}
                    >
                      Undo last
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={history.length === 0}
                      onClick={() => {
                        setQuestions("");
                      }}
                    >
                      New act
                    </Button>
                  </div>
                  {history.length > 0 ? (
                    <ol aria-label="“?” rooms entered this act" className="flex flex-wrap gap-1.5">
                      {history.map((o, i) => (
                        <li
                          key={`${String(i)}-${o.outcome ?? "x"}`}
                          className="rounded-md border border-line bg-ink px-2 py-1 text-xs text-muted"
                        >
                          <span className="num">{i + 1}</span>{" "}
                          {o.outcome === undefined ? "?" : OUTCOME_LABEL[o.outcome]}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-dim">
                      None yet: the “?” counters are at their starting values. If this is your
                      profile’s first-ever run, its first “?” rooms are scripted (event, event,
                      fight) and these numbers do not apply to them.
                    </p>
                  )}
                </div>
              </div>
            )}
            {!context.ok ? (
              <p
                role="alert"
                className="rounded-lg border border-rose-deep bg-rose/10 p-3 text-sm text-rose"
              >
                {context.error}
              </p>
            ) : null}
          </div>
        </details>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:items-start">
        <div className="grid gap-4">
          <RouteBuilder name="A" value={a} onChange={setA} />
          <RouteBuilder name="B" value={b} onChange={setB} />
          <RouteBuilder name="C" value={c} onChange={setC} />
        </div>
        <div
          id="route-results"
          role="region"
          aria-label="Results"
          tabIndex={0}
          className="scroll-mt-24 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto"
        >
          <p role="status" className="sr-only">
            {compared === 0
              ? "No route to compare yet."
              : `${String(compared)} ${compared === 1 ? "route" : "routes"} evaluated.`}
          </p>
          <RouteResults routes={evaluated} ascension={ascension} />
        </div>
      </div>

      <Panel eyebrow="What this is not" title="Rooms, not survival" headingLevel={3}>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>
            The table says what each route <em className="not-italic text-parchment">pays</em>: how
            many fights, shops and chests it holds, and how likely its fights are to offer a rare
            card or drop a potion. It does not know your hit points, deck or relics, so it never
            says which route is safer or likelier to win.
          </li>
          <li>
            More elites means more relics and better card odds, and more fights you may not survive.
            A rest site heals 30% of your maximum HP, rounded down. Weigh both against your own
            state.
          </li>
          <li>
            Relics that change card packs or “?” rooms, events, and the contents of shops are not
            included. Each number can be opened to its exact fraction; the method note lists every
            assumption.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
