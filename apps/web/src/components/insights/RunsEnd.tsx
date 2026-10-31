import { Disclosure } from "@/components/ui/Disclosure";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import {
  INSIGHTS,
  bossDeaths,
  count,
  enemyName,
  segments,
  share,
  type RunsEnd as Variant,
} from "@/lib/insights";

const COLOR: Record<string, string> = {
  act1: "var(--color-rose)",
  act2: "var(--color-copper)",
  act3: "var(--color-gold)",
  won: "var(--color-teal)",
};
const TEXT_ON: Record<string, string> = {
  act1: "#1a0f12",
  act2: "#1a1209",
  act3: "#1a1409",
  won: "#06201c",
};
const LEGEND = [
  ["act1", "Died in act 1"],
  ["act2", "Died in act 2"],
  ["act3", "Died in act 3"],
  ["won", "Won"],
] as const;

function Stack({
  who,
  level,
  v,
}: {
  who: string;
  level: string;
  v: Parameters<typeof segments>[0];
}) {
  const segs = segments(v);
  const name = `${who}, ${level}: ${segs.map((s) => `${share(s.share)} ${s.label}`).join(", ")}`;
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 shrink-0 font-mono text-[0.68rem] uppercase text-dim">
        {level === "Ascension 0" ? "A0" : "A9"}
      </span>
      <div
        role="img"
        aria-label={name}
        className="flex h-6 w-full overflow-hidden rounded-md bg-charcoal"
      >
        {segs.map((s) => (
          <div
            key={s.id}
            className="@container/seg num flex items-center justify-center overflow-hidden text-[0.68rem] font-medium"
            style={{
              width: `${String(s.share * 100)}%`,
              background: COLOR[s.id],
              color: TEXT_ON[s.id],
            }}
          >
            {/* the number is shown only where the segment is wide enough to hold it: the width is asked in rem, so it follows the
                reader's text size, and a segment too narrow for its number shows none (the share is in the name of the bar and in the table) */}
            <span className="hidden @min-[1.5rem]/seg:inline">
              {String(Math.round(s.share * 100))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Killers({ v }: { v: Variant }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {v.killersByAct.map((a, i) => (
        <div key={i} className="min-w-0">
          <h4 className="text-sm font-medium text-parchment">Act {String(i + 1)}</h4>
          <p className="num text-xs text-dim">{count(a.deaths)} deaths</p>
          <ol className="mt-2 space-y-1.5">
            {a.top.slice(0, 5).map((k) => (
              <li key={k.enemy} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-muted" title={enemyName(k.enemy)}>
                    {enemyName(k.enemy)}
                  </span>
                  <span className="num shrink-0 text-parchment">
                    {k.atBoss === k.deaths ? (
                      <span className="mr-1.5 rounded border border-line-strong px-1 text-[0.65rem] font-normal uppercase tracking-wide text-dim">
                        boss
                      </span>
                    ) : null}
                    {String(Math.round(k.share * 100))} %
                  </span>
                </div>
                <div aria-hidden="true" className="mt-0.5 h-1 rounded-full bg-charcoal">
                  <div
                    className="h-1 rounded-full"
                    style={{
                      width: `${String(Math.min(100, k.share * 100 * 2.5))}%`,
                      background: "var(--color-copper)",
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
          {a.unrecorded > 0 ? (
            <p className="mt-1.5 text-xs text-dim">
              {count(a.unrecorded)} with no killer recorded.
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const ACT_WORD = ["act 1", "act 2", "act 3"] as const;

/** How much of the dying happened in a boss fight, from the floors the games themselves record. */
function bossSentence(a0: Variant, a9: Variant): string {
  const one = (v: Variant): string => {
    const b = bossDeaths(v);
    const acts = b.byAct
      .map((x, i) => (x === null ? null : `${ACT_WORD[i] ?? ""}: ${share(x)}`))
      .filter((x) => x !== null)
      .join(", ");
    return `${share(b.all)} of the runs that died at Ascension ${String(v.ascension)} (${acts})`;
  };
  return `A boss fight ended ${one(a0)} and ${one(a9)}; the rest ended in elite and ordinary fights and elsewhere on the map.`;
}

/** How the best simulated pilot's games ended, class by class at Ascension 0 and 9, and which enemies ended them. */
export function RunsEnd() {
  const a0 = INSIGHTS.runsEnd.find((v) => v.id === "a0");
  const a9 = INSIGHTS.runsEnd.find((v) => v.id === "a9");
  if (!a0 || !a9) return null;
  return (
    <div className="space-y-6">
      <div>
        <ul
          className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"
          aria-label="Key to the bars"
        >
          {LEGEND.map(([id, text]) => (
            <li key={id} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm"
                style={{ background: COLOR[id] }}
              />
              {text}
            </li>
          ))}
        </ul>
        <div className="space-y-3">
          {[
            { label: "All five classes", a0, a9, pooled: true },
            ...a0.perClass.map((c, i) => ({
              label: c.character.charAt(0).toUpperCase() + c.character.slice(1),
              a0: c,
              a9: a9.perClass[i],
              pooled: false,
            })),
          ].map((row) => (
            <div
              key={row.label}
              className={
                row.pooled
                  ? "grid items-center gap-1 border-b border-line pb-3 sm:grid-cols-[9rem_1fr] sm:gap-3"
                  : "grid items-center gap-1 sm:grid-cols-[9rem_1fr] sm:gap-3"
              }
            >
              <p
                className={row.pooled ? "text-sm font-medium text-parchment" : "text-sm text-muted"}
              >
                {row.label}
              </p>
              <div className="space-y-1.5">
                <Stack who={row.label} level="Ascension 0" v={row.a0} />
                {row.a9 ? <Stack who={row.label} level="Ascension 9" v={row.a9} /> : null}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-dim">
          Share of completed games, in percent, for the pilot that follows the card values shown on
          the site, relics kept: {count(a0.completed)} games at Ascension 0 and{" "}
          {count(a9.completed)} at Ascension 9, the same 2,000 seeds of each class. The best pilot
          the project has, and it wins almost nothing: the second half of a run is barely observed.
        </p>
        <div className="mt-3">
          <Disclosure summary="The figures as a table">
            <ScrollRegion label="How the simulated games ended">
              <table className="num w-full min-w-[38rem] text-left text-xs">
                <caption className="sr-only">
                  How the pilot&rsquo;s completed games ended, by class and Ascension
                </caption>
                <thead className="text-dim">
                  <tr>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      Class, level
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      Games
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      Died act 1
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      Died act 2
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      Died act 3
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      Of those, in a boss fight
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      Won
                    </th>
                    <th scope="col" className="py-1 font-medium">
                      Median gold left
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[a0, a9].flatMap((v) =>
                    v.perClass.map((c) => (
                      <tr key={`${v.id}-${c.character}`}>
                        <th scope="row" className="py-1 pr-3 font-medium text-parchment">
                          {c.character} · A{String(v.ascension)}
                        </th>
                        <td className="py-1 pr-3">{count(c.completed)}</td>
                        <td className="py-1 pr-3">{count(c.diedAct1)}</td>
                        <td className="py-1 pr-3">{count(c.diedAct2)}</td>
                        <td className="py-1 pr-3">{count(c.diedAct3)}</td>
                        <td className="py-1 pr-3">{count(c.bossAct1 + c.bossAct2 + c.bossAct3)}</td>
                        <td className="py-1 pr-3">{count(c.won)}</td>
                        <td className="py-1">{count(c.goldMedian)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </ScrollRegion>
          </Disclosure>
        </div>
      </div>

      <div>
        <h3 className="text-lg text-parchment">What ended the runs, at Ascension 0</h3>
        <p className="mb-3 mt-0.5 text-sm text-muted">
          The enemies that were in the fight a run died in, act by act, all five classes together; a
          boss fight is tagged. {bossSentence(a0, a9)}
        </p>
        <Killers v={a0} />
        <div className="mt-4">
          <Disclosure summary="At Ascension 9">
            <Killers v={a9} />
          </Disclosure>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-ink-2 p-4">
        <p className="eyebrow mb-1">Gold left at death</p>
        <p className="text-sm text-muted">
          A run that died at Ascension 0 held a median of about{" "}
          <span className="num text-parchment">{count(a0.goldMedian)}</span> gold, and{" "}
          <span className="num text-parchment">{String(Math.round(a0.goldShare150 * 100))} %</span>{" "}
          of them held 150 or more: a card removal costs 75 and a common card about 50. Shop prices
          are exact on the Odds page; nothing yet says what the gold should buy.
        </p>
      </div>
    </div>
  );
}
