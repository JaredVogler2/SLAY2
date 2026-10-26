"use client";

import { useMemo, useState } from "react";

import {
  POTION_RARITY_PMF,
  Rational,
  forecastPotions,
  inferPotionCounter,
  potionRollProbability,
  type PotionObservation,
  type PotionRoom,
  provenanceFor,
} from "@slay2/odds";

import { Badge } from "@/components/ui/Badge";
import { BarChart } from "@/components/ui/BarChart";
import { Button } from "@/components/ui/Button";
import { ExactValue } from "@/components/ui/ExactValue";
import { MethodNote } from "@/components/ui/MethodNote";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { Panel } from "@/components/ui/Panel";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";
import { Stat } from "@/components/ui/Stat";
import { potionObservations, type RunState } from "@/lib/run-state";

const ROOM_LABEL: Record<PotionRoom, string> = {
  monster: "Normal fight",
  elite: "Elite",
  boss: "Boss",
};

interface Row {
  id: number;
  room: PotionRoom;
  dropped: boolean | null;
  forced: boolean;
}

export function PotionCalculator({ run }: { run: RunState | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [nextId, setNextId] = useState(1);
  const [forced, setForced] = useState(false);
  const [upcoming, setUpcoming] = useState(5);
  const [eliteFirst, setEliteFirst] = useState(false);

  const history: PotionObservation[] = useMemo(
    () =>
      rows.map((r) => ({
        room: r.room,
        ...(r.dropped === null ? {} : { dropped: r.dropped }),
        ...(r.forced ? { forced: true } : {}),
      })),
    [rows],
  );
  const inference = useMemo(() => inferPotionCounter(history), [history]);

  const plan: PotionRoom[] = useMemo(() => {
    const list: PotionRoom[] = Array.from({ length: upcoming }, () => "monster");
    if (eliteFirst && list.length > 0) {
      list[0] = "elite";
    }
    return list;
  }, [upcoming, eliteFirst]);
  const forecast = useMemo(
    () => (inference.impossible ? null : forecastPotions(inference.posterior, plan)),
    [inference, plan],
  );
  const next = useMemo(
    () =>
      inference.impossible
        ? null
        : (["monster", "elite", "boss"] as const).map((room) => {
            let p = Rational.ZERO;
            for (const [t, m] of inference.posterior) {
              p = p.add(m.mul(potionRollProbability(t, room)));
            }
            return { room, p };
          }),
    [inference],
  );

  const add = (room: PotionRoom, dropped: boolean | null): void => {
    setRows((prev) => [...prev, { id: nextId, room, dropped, forced: forced && dropped === true }]);
    setNextId((n) => n + 1);
  };

  const counterBars = [...inference.posterior.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, m]) => ({ label: `${String(t * 10)}%`, value: m.toNumber() }));

  return (
    <div className="space-y-6">
      <Panel
        eyebrow="Potions"
        title="Potion drop chance and its pity counter"
        aside={<Badge tone="exact">Exact</Badge>}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <p className="text-muted">
              Log each fight that could have dropped a potion, oldest first. The stored chance
              starts at 40% and moves ten points the opposite way after every roll, so a drought
              always ends.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["monster", "elite", "boss"] as const).map((room) => (
                <div
                  key={room}
                  className="space-y-2 rounded-xl border border-line bg-charcoal/40 p-3"
                >
                  <p className="text-sm font-medium text-parchment">{ROOM_LABEL[room]}</p>
                  <Button
                    size="sm"
                    variant="primary"
                    className="w-full"
                    onClick={() => {
                      add(room, true);
                    }}
                  >
                    Potion offered
                  </Button>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      add(room, false);
                    }}
                  >
                    No potion
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      add(room, null);
                    }}
                  >
                    Didn’t note
                  </Button>
                </div>
              ))}
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-muted">
              <input
                type="checkbox"
                checked={forced}
                onChange={(e) => {
                  setForced(e.target.checked);
                }}
                className="h-5 w-5 accent-copper"
              />
              Next “Potion offered” was forced by a relic (e.g. White Beast Statue)
            </label>
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
                New run
              </Button>
              {run && run.potions.length > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const obs = potionObservations(run);
                    setRows(
                      obs.map((o, i) => ({
                        id: i + 1,
                        room: o.room,
                        dropped: o.dropped ?? null,
                        forced: o.forced === true,
                      })),
                    );
                    setNextId(obs.length + 1);
                  }}
                >
                  Use potions logged in my run
                </Button>
              ) : null}
            </div>
            {rows.length > 0 ? (
              <ol className="flex flex-wrap gap-1.5" aria-label="Fights logged">
                {rows.map((r, i) => (
                  <li
                    key={r.id}
                    className="rounded-md border border-line bg-ink px-2 py-1 text-xs text-muted"
                  >
                    <span className="num">{i + 1}</span> {ROOM_LABEL[r.room]} ·{" "}
                    <span
                      className={
                        r.dropped === true
                          ? "text-teal"
                          : r.dropped === false
                            ? "text-parchment"
                            : "text-dim"
                      }
                    >
                      {r.dropped === null
                        ? "?"
                        : r.dropped
                          ? r.forced
                            ? "forced"
                            : "potion"
                          : "none"}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-dim">
                No fights logged: the stored chance is its starting 40%.
              </p>
            )}
          </div>

          <div aria-live="polite" className="space-y-5">
            {inference.impossible || !next || !forecast ? (
              <div
                role="alert"
                className="rounded-xl border border-rose-deep bg-rose/10 p-4 text-sm text-rose"
              >
                That sequence cannot happen under the verified rules (for example a potion at a
                stored chance of 0%, or six misses followed by another miss). Undo the last entry,
                or a relic may have forced or blocked a drop.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {next.map(({ room, p }) => (
                    <Stat
                      key={room}
                      label={`Next ${ROOM_LABEL[room].toLowerCase()}`}
                      value={<ExactValue value={p} digits={1} />}
                      tone="exact"
                      className="rounded-xl border border-line bg-charcoal/40 p-3 [&_p:nth-child(2)]:text-2xl sm:[&_p:nth-child(2)]:text-3xl"
                    />
                  ))}
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-parchment">
                    Stored chance after your log
                  </p>
                  <BarChart
                    title="Stored potion chance"
                    bars={counterBars}
                    yFormat={(v) => `${(v * 100).toFixed(0)}%`}
                  />
                  <p className="mt-1 text-sm text-muted">
                    One bar means the log pins the value down exactly; several bars come from fights
                    marked “didn’t note”.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mt-6">
          <MethodNote provenance={provenanceFor("potion")} />
        </div>
      </Panel>

      {forecast ? (
        <Panel eyebrow="Forecast" title="Potions over your next fights" headingLevel={3}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <NumberStepper
                label="Upcoming fights"
                value={upcoming}
                onChange={setUpcoming}
                min={1}
                max={12}
                hint="Counted as normal fights unless you tick the box below."
              />
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={eliteFirst}
                  onChange={(e) => {
                    setEliteFirst(e.target.checked);
                  }}
                  className="h-5 w-5 accent-copper"
                />
                The first of them is an elite
              </label>
              <p className="text-sm text-muted">
                Expected potions:{" "}
                <span className="text-xl text-teal">
                  <ExactValue value={forecast.expectedDrops} digits={2} format="number" />
                </span>
              </p>
              <div>
                <p className="mb-2 text-sm font-medium text-parchment">A dropped potion’s rarity</p>
                <ProbabilityBar
                  segments={[
                    { key: "c", label: "Common", value: POTION_RARITY_PMF.common, tone: "common" },
                    {
                      key: "u",
                      label: "Uncommon",
                      value: POTION_RARITY_PMF.uncommon,
                      tone: "uncommon",
                    },
                    { key: "r", label: "Rare", value: POTION_RARITY_PMF.rare, tone: "rare" },
                  ]}
                  digits={0}
                />
              </div>
            </div>
            <BarChart
              title="Number of potions over the upcoming fights"
              bars={forecast.dropCountPmf.map((p, i) => ({
                label: String(i),
                value: p.toNumber(),
              }))}
              xLabel="Potions offered"
            />
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
