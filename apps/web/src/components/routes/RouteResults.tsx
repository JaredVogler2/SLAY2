"use client";

import type { ReactNode } from "react";

import { provenanceFor, Rational, type RouteReport, type UnknownOutcome } from "@slay2/odds";

import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { MethodNote } from "@/components/ui/MethodNote";
import { Panel } from "@/components/ui/Panel";
import { pctSmart, shortFraction } from "@/lib/format";

export interface EvaluatedRoute {
  readonly name: string;
  readonly report: RouteReport | null;
  /** why a typed route could not be evaluated (shown instead of numbers) */
  readonly error?: string;
}

const dash = <span className="text-dim">—</span>;

function Cell({ main, note }: { main: ReactNode; note?: ReactNode }) {
  return (
    <>
      <span className="num text-parchment">{main}</span>
      {note ? <span className="block text-xs text-muted">{note}</span> : null}
    </>
  );
}

interface Row {
  readonly key: string;
  readonly label: string;
  readonly hint?: string;
  readonly cell: (r: RouteReport) => ReactNode;
}

const two = (r: Rational): string => r.toFixed(2);
/** P(at least one of the route's “?” rooms turns into `outcome`) = 1 - P(none does). */
const atLeastOnce = (r: RouteReport, outcome: UnknownOutcome): Rational =>
  Rational.ONE.sub(r.unknown.pmf[outcome][0] ?? Rational.ONE);

/** "from “?” rooms" or "1 certain, the rest from “?” rooms": where a count that is not a whole number comes from. */
const fromQuestionRooms = (certain: number): string =>
  certain === 0 ? "from “?” rooms" : `${String(certain)} certain + “?” rooms`;

const GROUPS: readonly { id: string; title: string; rows: readonly Row[] }[] = [
  {
    id: "rooms",
    title: "The rooms",
    rows: [
      { key: "elite", label: "Elite fights", cell: (r) => <Cell main={r.counts.elite} /> },
      {
        key: "rest",
        label: "Rest sites",
        hint: "each heals 30% of max HP, rounded down",
        cell: (r) => <Cell main={r.rests} />,
      },
      {
        key: "fights",
        label: "Fights",
        cell: (r) => (
          <Cell
            main={r.unknown.rooms === 0 ? r.fights.certain : two(r.fights.expected)}
            note={
              r.unknown.rooms === 0
                ? undefined
                : `${String(r.fights.min)} to ${String(r.fights.max)}`
            }
          />
        ),
      },
      {
        key: "shops",
        label: "Shops",
        cell: (r) => (
          <Cell
            main={r.unknown.rooms === 0 ? r.shops.certain : two(r.shops.expected)}
            note={r.unknown.rooms === 0 ? undefined : fromQuestionRooms(r.shops.certain)}
          />
        ),
      },
      {
        key: "treasure",
        label: "Treasure rooms",
        cell: (r) => (
          <Cell
            main={r.unknown.rooms === 0 ? r.counts.treasure : two(r.relics.expectedTreasure)}
            note={r.unknown.rooms === 0 ? undefined : fromQuestionRooms(r.counts.treasure)}
          />
        ),
      },
    ],
  },
  {
    id: "pays",
    title: "What the fights and rooms pay",
    rows: [
      {
        key: "rare",
        label: "A rare card is offered at least once",
        cell: (r) => <Cell main={pctSmart(r.cardPacks.atLeastOneRare, 2)} />,
      },
      {
        key: "rares",
        label: "Rare cards offered, expected",
        cell: (r) => <Cell main={two(r.cardPacks.expectedRares)} />,
      },
      {
        key: "potion",
        label: "A potion drops at least once",
        cell: (r) => <Cell main={pctSmart(r.potions.atLeastOne, 2)} />,
      },
      {
        key: "potions",
        label: "Potions, expected",
        cell: (r) => <Cell main={two(r.potions.expectedDrops)} />,
      },
      {
        key: "gold",
        label: "Gold from fights and treasure, expected",
        hint: "not shops, events or gold relics",
        cell: (r) => (
          <Cell
            main={r.gold.expected.toFixed(0)}
            note={`${String(r.gold.min)} to ${String(r.gold.max)}`}
          />
        ),
      },
      {
        key: "relics",
        label: "Relics, expected",
        hint: "elites and treasure rooms",
        cell: (r) => <Cell main={two(r.relics.expectedTreasure.add(r.relics.elites))} />,
      },
    ],
  },
  {
    id: "unknown",
    title: "What the “?” rooms turn into",
    rows: [
      {
        key: "q-shop",
        label: "At least one “?” becomes a shop",
        cell: (r) =>
          r.unknown.rooms === 0 ? dash : <Cell main={pctSmart(atLeastOnce(r, "shop"), 2)} />,
      },
      {
        key: "q-treasure",
        label: "At least one “?” becomes a treasure room",
        cell: (r) =>
          r.unknown.rooms === 0 ? dash : <Cell main={pctSmart(atLeastOnce(r, "treasure"), 2)} />,
      },
      {
        key: "q-fight",
        label: "At least one “?” becomes a fight",
        cell: (r) =>
          r.unknown.rooms === 0 ? dash : <Cell main={pctSmart(atLeastOnce(r, "fight"), 2)} />,
      },
    ],
  },
];

function exactFractions(r: RouteReport): readonly (readonly [string, Rational])[] {
  return [
    ["Expected fights", r.fights.expected],
    ["A rare card offered at least once", r.cardPacks.atLeastOneRare],
    ["Rare cards offered, expected", r.cardPacks.expectedRares],
    ["A potion drops at least once", r.potions.atLeastOne],
    ["Potions, expected", r.potions.expectedDrops],
    ["Gold, expected", r.gold.expected],
    ["Shops, expected", r.shops.expected],
    ["Treasure rooms, expected", r.relics.expectedTreasure],
  ];
}

/** The routes side by side. Nothing here ranks them: more elites is neither good nor bad until you know your hit points. */
export function RouteResults({
  routes,
  ascension,
}: {
  routes: readonly EvaluatedRoute[];
  ascension: number;
}) {
  const shown = routes.filter((r) => r.report !== null || r.error !== undefined);
  if (shown.length > 0 && shown.every((r) => r.report === null)) {
    return (
      <Panel eyebrow="Results" title="These routes cannot be evaluated yet">
        <ul className="space-y-1 text-rose" role="alert">
          {shown.map((r) => (
            <li key={r.name}>
              Route {r.name}: {r.error}
            </li>
          ))}
        </ul>
      </Panel>
    );
  }
  if (shown.length === 0) {
    return (
      <Panel
        eyebrow="Results"
        title="Add a route to see what it pays"
        aside={<Badge tone="exact">Exact</Badge>}
      >
        <p className="text-muted">
          Build a route above, or press “Try an example” to compare two ways through the same
          stretch of an act.
        </p>
      </Panel>
    );
  }
  return (
    <Panel
      eyebrow="Results"
      title="What each route pays"
      aside={
        <>
          <Badge tone="exact">Exact</Badge>
          <Badge tone="neutral">Not a win chance</Badge>
        </>
      }
    >
      {/*
        One table that becomes a stack on a phone: each measure is a block with the routes side by side under it, so all
        routes stay in view without scrolling sideways. The roles keep the table semantics when the display changes.
      */}
      <table role="table" className="block w-full text-left text-sm md:table">
        <caption className="sr-only">
          Rooms and expected rewards of each route, one column per route
        </caption>
        <thead role="rowgroup" className="hidden md:table-header-group">
          <tr role="row" className="border-b border-line text-muted">
            <th role="columnheader" scope="col" className="w-[40%] py-2 pr-3 font-medium">
              <span className="sr-only">Measure</span>
            </th>
            {shown.map((r) => (
              <th
                key={r.name}
                role="columnheader"
                scope="col"
                className="py-2 pr-3 font-medium text-parchment"
              >
                Route {r.name}
              </th>
            ))}
          </tr>
        </thead>
        {GROUPS.map((group) =>
          group.id === "unknown" &&
          shown.every((r) => (r.report?.unknown.rooms ?? 0) === 0) ? null : (
            <tbody
              key={group.id}
              role="rowgroup"
              className="block divide-y divide-line border-b border-line md:table-row-group"
            >
              <tr role="row" className="block md:table-row">
                <th
                  role="columnheader"
                  scope="colgroup"
                  colSpan={shown.length + 1}
                  className="block pb-1 pt-4 text-left font-mono text-[0.7rem] font-normal uppercase tracking-[0.14em] text-muted md:table-cell"
                >
                  {group.title}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr
                  key={row.key}
                  role="row"
                  className="flex flex-wrap gap-x-3 gap-y-1 py-2 md:table-row md:py-0"
                >
                  <th
                    role="rowheader"
                    scope="row"
                    className="w-full pr-3 text-left font-normal text-muted md:table-cell md:w-auto md:py-2 md:align-top"
                  >
                    {row.label}
                    {row.hint ? <span className="block text-xs text-dim">{row.hint}</span> : null}
                  </th>
                  {shown.map((r) => (
                    <td
                      key={r.name}
                      role="cell"
                      className="min-w-0 flex-1 md:table-cell md:py-2 md:pr-3 md:align-top"
                    >
                      <span className="block font-mono text-[0.65rem] uppercase tracking-wider text-dim md:hidden">
                        Route {r.name}
                      </span>
                      {r.report ? row.cell(r.report) : dash}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ),
        )}
      </table>
      {shown.some((r) => r.error !== undefined) ? (
        <ul className="mt-3 space-y-1 text-sm text-rose" role="alert">
          {shown
            .filter((r) => r.error !== undefined)
            .map((r) => (
              <li key={r.name}>
                Route {r.name}: {r.error}
              </li>
            ))}
        </ul>
      ) : null}
      <div className="mt-5 space-y-3">
        <Disclosure summary="The exact fractions behind these numbers">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {shown
              .flatMap((r) => (r.report === null ? [] : [{ name: r.name, report: r.report }]))
              .map((r) => (
                <div key={r.name} className="min-w-0">
                  <p className="mb-1 font-medium text-parchment">Route {r.name}</p>
                  <dl className="space-y-1 text-sm">
                    {exactFractions(r.report).map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-muted">{label}</dt>
                        <dd>
                          <code
                            title={value.toString()}
                            className="num break-all font-mono text-xs text-teal"
                          >
                            {shortFraction(value, 56)}
                          </code>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
          </div>
        </Disclosure>
        <MethodNote provenance={provenanceFor("route", { ascension })} />
      </div>
    </Panel>
  );
}
