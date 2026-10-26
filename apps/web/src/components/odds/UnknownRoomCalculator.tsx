"use client";

import { useMemo, useState } from "react";

import {
  forecastUnknownRoom,
  inferUnknownState,
  MAX_UNKNOWN_ROOMS_PER_ACT,
  marginalTable,
  type UnknownObservation,
  type UnknownOutcome,
  provenanceFor,
} from "@slay2/odds";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MethodNote } from "@/components/ui/MethodNote";
import { Panel } from "@/components/ui/Panel";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { pctSmart } from "@/lib/format";
import { unknownObservations, type RunState } from "@/lib/run-state";

const LABEL: Record<UnknownOutcome, string> = {
  event: "Event",
  fight: "Fight",
  shop: "Shop",
  treasure: "Treasure",
};

interface Row {
  id: number;
  outcome: UnknownOutcome | null;
}

export function UnknownRoomCalculator({ run }: { run: RunState | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [nextId, setNextId] = useState(1);
  const history: UnknownObservation[] = useMemo(
    () => rows.map((r) => (r.outcome === null ? {} : { outcome: r.outcome })),
    [rows],
  );
  const inference = useMemo(() => inferUnknownState(history), [history]);
  const next = useMemo(
    () => (inference.impossible ? null : forecastUnknownRoom(inference)),
    [inference],
  );
  const table = useMemo(() => marginalTable(6), []);

  const full = rows.length >= MAX_UNKNOWN_ROOMS_PER_ACT;
  const add = (outcome: UnknownOutcome | null): void => {
    if (full) {
      return;
    }
    setRows((p) => [...p, { id: nextId, outcome }]);
    setNextId((n) => n + 1);
  };

  return (
    <div className="space-y-6">
      <Panel
        eyebrow="“?” rooms"
        title="What will the next “?” turn into?"
        aside={<Badge tone="exact">Exact</Badge>}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <p className="text-muted">
              Log what each “?” room you entered{" "}
              <strong className="font-medium text-parchment">in this act</strong> turned into,
              oldest first. The longer you go without a shop, the likelier the next “?” is one.
            </p>
            <div className="flex flex-wrap gap-2">
              {(["event", "fight", "shop", "treasure"] as const).map((o) => (
                <Button
                  key={o}
                  variant="primary"
                  disabled={full}
                  onClick={() => {
                    add(o);
                  }}
                >
                  {LABEL[o]}
                </Button>
              ))}
              <Button
                disabled={full}
                onClick={() => {
                  add(null);
                }}
              >
                Didn’t note
              </Button>
            </div>
            {full ? (
              <p className="text-sm text-muted" role="status">
                An act has fewer than {MAX_UNKNOWN_ROOMS_PER_ACT} “?” rooms, so this list is full.
                Start a new act to reset the counters.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={rows.length === 0}
                onClick={() => {
                  setRows((p) => p.slice(0, -1));
                }}
              >
                Undo last
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={rows.length === 0}
                onClick={() => {
                  setRows([]);
                }}
              >
                New act
              </Button>
              {run && run.unknownRooms.length > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const obs = unknownObservations(run).slice(0, MAX_UNKNOWN_ROOMS_PER_ACT);
                    setRows(obs.map((o, i) => ({ id: i + 1, outcome: o.outcome ?? null })));
                    setNextId(obs.length + 1);
                  }}
                >
                  Use the “?” rooms logged in my run
                </Button>
              ) : null}
            </div>
            {rows.length > 0 ? (
              <ol className="flex flex-wrap gap-1.5" aria-label="Rooms logged">
                {rows.map((r, i) => (
                  <li
                    key={r.id}
                    className="rounded-md border border-line bg-ink px-2 py-1 text-xs text-muted"
                  >
                    <span className="num">{i + 1}</span>{" "}
                    {r.outcome === null ? "?" : LABEL[r.outcome]}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-dim">
                No “?” rooms logged this act: the counters are at their starting values.
              </p>
            )}
          </div>
          <div aria-live="polite">
            {next ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-parchment">The next “?” room</p>
                <ProbabilityBar
                  segments={[
                    { key: "event", label: "Event", value: next.event, tone: "event" },
                    { key: "fight", label: "Fight", value: next.fight, tone: "fight" },
                    { key: "shop", label: "Shop", value: next.shop, tone: "shop" },
                    { key: "treasure", label: "Treasure", value: next.treasure, tone: "treasure" },
                  ]}
                />
              </div>
            ) : (
              <div
                role="alert"
                className="rounded-xl border border-rose-deep bg-rose/10 p-4 text-sm text-rose"
              >
                That sequence cannot happen under the verified rules (the counters would already
                have forced a different outcome). Undo the last entry.
              </div>
            )}
          </div>
        </div>
        <div className="mt-6">
          <MethodNote provenance={provenanceFor("unknown_room")} />
        </div>
      </Panel>

      <Panel eyebrow="Reference" title="The n-th “?” of an act, nothing known" headingLevel={3}>
        <ScrollRegion label="Outcome mix by “?” room number">
          <table className="w-full min-w-[26rem] text-left text-sm">
            <caption className="sr-only">
              Outcome mix for the n-th question-mark room of an act
            </caption>
            <thead>
              <tr className="border-b border-line text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">
                  “?” room
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Event
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Fight
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Shop
                </th>
                <th scope="col" className="py-2 font-medium">
                  Treasure
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {table.map((row, i) => (
                <tr key={i}>
                  <th scope="row" className="py-2 pr-3 font-medium text-parchment">
                    #{i + 1}
                  </th>
                  <td className="num py-2 pr-3">{pctSmart(row.event, 2)}</td>
                  <td className="num py-2 pr-3 text-rose">{pctSmart(row.fight, 2)}</td>
                  <td className="num py-2 pr-3 text-teal">{pctSmart(row.shop, 2)}</td>
                  <td className="num py-2 text-gold">{pctSmart(row.treasure, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <p className="mt-3 text-sm text-muted">
          These rows match the published Almanauts table to its printed precision (verified in the
          test suite).
        </p>
      </Panel>
    </div>
  );
}
