import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { INSIGHTS, share } from "@/lib/insights";
import { ASCENSION_LEVELS, ascensionStatus } from "@/lib/insights-content";

function Pair({
  who,
  a0,
  a9,
}: {
  who: string;
  a0: { rate: number; games: number } | undefined;
  a9: { rate: number; games: number } | undefined;
}) {
  if (!a0 || !a9) return null;
  return (
    <div className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[9rem_1fr]">
      <p className="text-sm text-muted">{who}</p>
      <div
        className="space-y-1"
        role="img"
        aria-label={`${who}: ${share(a0.rate)} past the Act-1 boss at Ascension 0, ${share(a9.rate)} at Ascension 9`}
      >
        {[
          ["A0", a0.rate],
          ["A9", a9.rate],
        ].map(([level, rate]) => (
          <div key={String(level)} className="flex items-center gap-2">
            <span className="w-7 shrink-0 font-mono text-[0.68rem] uppercase text-dim">
              {level}
            </span>
            <div className="h-3 flex-1 rounded-full bg-charcoal">
              <div
                className="h-3 rounded-full"
                style={{
                  width: `${String(Number(rate) * 100)}%`,
                  background: level === "A0" ? "var(--color-copper)" : "var(--color-teal)",
                }}
              />
            </div>
            <span className="num w-14 shrink-0 text-right text-sm text-parchment">
              {share(Number(rate))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** What each Ascension changes, with the rule that says so, and how much harder level 9 is for one pilot, class by class. */
export function AscensionLadder() {
  const t = INSIGHTS.ascension;
  return (
    <div className="space-y-6">
      <ScrollRegion label="What each Ascension level changes">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">
            Ascension levels 1 to 10, what each changes, the rule that says so, and whether the
            simulation tested it
          </caption>
          <thead className="text-xs text-dim">
            <tr>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Level
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                What changes
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Rule
              </th>
              <th scope="col" className="py-1.5 font-medium">
                In the simulation
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line align-top">
            {ASCENSION_LEVELS.map((l) => {
              const status = ascensionStatus(l.level);
              return (
                <tr key={l.level}>
                  <th scope="row" className="num py-2 pr-3 font-medium text-parchment">
                    {l.level}
                    <span className="block text-xs font-normal text-dim">{l.name}</span>
                  </th>
                  <td className="py-2 pr-3 text-muted">{l.change}</td>
                  <td className="num py-2 pr-3 text-xs">
                    {l.rules.map((r, i) => (
                      <span key={r}>
                        {i > 0 ? ", " : ""}
                        <Link
                          href={`/methods#${r}`}
                          className="text-teal underline decoration-dotted underline-offset-4"
                        >
                          {r}
                        </Link>
                      </span>
                    ))}
                  </td>
                  <td className="py-2">
                    <Badge tone={status.tone}>{status.text}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollRegion>

      <div>
        <h3 className="text-lg text-parchment">How much harder level 9 is, for one pilot</h3>
        <p className="mb-3 mt-0.5 text-sm text-muted">
          The pilot that {t.pilots.first} got past the Act-1 boss in {share(t.pooled.a0.first)} of
          its games at Ascension 0 and {share(t.pooled.a9.first)} at Ascension 9; {t.pilots.second},
          in {share(t.pooled.a0.second)} and {share(t.pooled.a9.second)}. The same 2,000 seeds of
          each class, the relics kept.
        </p>
        <div className="space-y-3">
          <Pair
            who="All five classes"
            a0={{ rate: t.pooled.a0.first, games: t.pooled.a0.pairs }}
            a9={{ rate: t.pooled.a9.first, games: t.pooled.a9.pairs }}
          />
          {t.perClass.map((c) => (
            <Pair
              key={c.character}
              who={c.character.charAt(0).toUpperCase() + c.character.slice(1)}
              a0={{ rate: c.a0.first, games: c.a0.pairs }}
              a9={{ rate: c.a9.first, games: c.a9.pairs }}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-dim">
          Levels are cumulative: a run at level 9 has every change from 1 to 9, so the level 9 tests
          include them all. Only levels 0 and 9 were played in held-out tests. Nothing here says
          what each of levels 1 to 8 does to these figures on its own, and level 10&rsquo;s second
          boss is never entered by the simulator (a recorded gap), so its figures would not be
          Double Boss figures.
        </p>
      </div>
    </div>
  );
}
