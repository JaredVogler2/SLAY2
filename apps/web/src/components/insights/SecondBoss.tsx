import { Disclosure } from "@/components/ui/Disclosure";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import {
  GROUPS,
  INSIGHTS,
  MATTERS_TEXT,
  count,
  oddsChange,
  share,
  type LateFeature,
} from "@/lib/insights";

const W = 320;
const PAD = 10;

function domain(): readonly [number, number] {
  let lo = 1;
  let hi = 1;
  for (const f of INSIGHTS.lateDrivers.features)
    for (const side of [f.act1, f.act2]) {
      lo = Math.min(lo, side.ci95[0] ?? 1);
      hi = Math.max(hi, side.ci95[1] ?? 1);
    }
  return [Math.floor(lo * 10 - 0.5) / 10, Math.ceil(hi * 10 + 0.5) / 10];
}

const x = (or: number, [lo, hi]: readonly [number, number]): number =>
  PAD + ((Math.log(or) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (W - 2 * PAD);

function Axis({ d }: { d: readonly [number, number] }) {
  const ticks = [0.6, 0.8, 1, 1.5, 2].filter((t) => t >= d[0] && t <= d[1]);
  return (
    <svg
      viewBox={`0 0 ${String(W)} 18`}
      role="img"
      aria-label={`Axis: odds ratio, from ×${String(d[0])} to ×${String(d[1])}, on a log scale; ×1 means no change`}
      className="h-auto w-full"
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t, d)} x2={x(t, d)} y1="0" y2="5" stroke="var(--color-line-strong)" />
          <text
            x={x(t, d)}
            y="16"
            textAnchor="middle"
            fontSize="9.5"
            fill="var(--color-muted)"
            className="num"
          >
            ×{String(t)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Plot({ f, d }: { f: LateFeature; d: readonly [number, number] }) {
  const name = `${f.label}, ${f.unit}: odds of getting past the Act-1 boss ×${f.act1.oddsRatio.toFixed(2)} (${f.act1.ci95[0]?.toFixed(2)} to ${f.act1.ci95[1]?.toFixed(2)}), the Act-2 boss ×${f.act2.oddsRatio.toFixed(2)} (${f.act2.ci95[0]?.toFixed(2)} to ${f.act2.ci95[1]?.toFixed(2)})`;
  const y1 = 11;
  const y2 = 27;
  return (
    <svg viewBox={`0 0 ${String(W)} 38`} role="img" aria-label={name} className="h-auto w-full">
      <line
        x1={x(1, d)}
        x2={x(1, d)}
        y1="0"
        y2="38"
        stroke="var(--color-line-strong)"
        strokeDasharray="2 3"
      />
      <line
        x1={x(f.act1.ci95[0] ?? 1, d)}
        x2={x(f.act1.ci95[1] ?? 1, d)}
        y1={y1}
        y2={y1}
        stroke="var(--color-copper)"
        strokeWidth="2"
      />
      <circle cx={x(f.act1.oddsRatio, d)} cy={y1} r="4.5" fill="var(--color-copper)" />
      <line
        x1={x(f.act2.ci95[0] ?? 1, d)}
        x2={x(f.act2.ci95[1] ?? 1, d)}
        y1={y2}
        y2={y2}
        stroke="var(--color-teal)"
        strokeWidth="2"
      />
      <rect
        x={x(f.act2.oddsRatio, d) - 4}
        y={y2 - 4}
        width="8"
        height="8"
        fill="var(--color-teal)"
        transform={`rotate(45 ${String(x(f.act2.oddsRatio, d))} ${String(y2)})`}
      />
    </svg>
  );
}

/** What the runs that reached each boss looked like, and which of those things moved the odds of getting past it. */
export function SecondBoss() {
  const t = INSIGHTS.lateDrivers;
  const d = domain();
  const byId = new Map(t.features.map((f) => [f.id, f]));
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        <span className="num text-parchment">{count(t.endpoints.act1.runs)}</span> of the simulated
        runs reached the Act-1 boss and{" "}
        <span className="num text-parchment">{share(t.endpoints.act1.rate)}</span> got past it;{" "}
        <span className="num text-parchment">{count(t.endpoints.act2.runs)}</span> reached the Act-2
        boss and <span className="num text-parchment">{share(t.endpoints.act2.rate)}</span> got past
        that. For each boss, a regression on what the run held when the fight began says how much
        each thing moved the odds of getting past it, with the class allowed for.
      </p>
      <ul
        className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted"
        aria-label="Key to the plots"
      >
        <li className="flex items-center gap-1.5">
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" fill="var(--color-copper)" />
          </svg>
          The Act-1 boss
        </li>
        <li className="flex items-center gap-1.5">
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
            <rect
              x="2"
              y="2"
              width="8"
              height="8"
              fill="var(--color-teal)"
              transform="rotate(45 6 6)"
            />
          </svg>
          The Act-2 boss
        </li>
        <li>Lines are 95 % intervals; ×1 means no effect.</li>
      </ul>
      {GROUPS.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h3 className="text-base text-parchment">{g.title}</h3>
          <div className="mt-2 grid gap-x-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="hidden sm:block" />
            <Axis d={d} />
          </div>
          <ul className="divide-y divide-line">
            {g.ids
              .flatMap((id) => {
                const f = byId.get(id);
                return f ? [f] : [];
              })
              .map((f) => (
                <li
                  key={f.id}
                  className="grid gap-x-4 gap-y-1 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-parchment">{f.label}</p>
                    <p className="num text-xs text-dim">
                      {f.unit}: ×{f.act1.oddsRatio.toFixed(2)} ({oddsChange(f.act1.oddsRatio)}) at
                      the first boss, ×{f.act2.oddsRatio.toFixed(2)} ({oddsChange(f.act2.oddsRatio)}
                      ) at the second
                      {" · "}
                      <span className="text-muted">{MATTERS_TEXT[f.matters]}</span>
                    </p>
                  </div>
                  <Plot f={f} d={d} />
                </li>
              ))}
          </ul>
        </section>
      ))}
      <div className="rounded-xl border border-line bg-ink-2 p-4 text-sm text-muted">
        <p className="eyebrow mb-1">How far to trust it</p>
        <p>
          This is an exploratory reading of {count(t.batches.reduce((n, b) => n + b.completed, 0))}{" "}
          simulated games in which 60 % of the card picks were random, so the cards in a deck were
          largely chance; the smith, shop and removal choices were the pilot&rsquo;s rules, not
          chance, so these are associations. Only runs that reached a boss are in it, which is also
          who the question is about; but a run that reached the second boss has already got through
          two acts and differs less from the others, so a weaker association there does not by
          itself mean that a card matters less. In the three classes with enough second-boss fights
          to fit alone, most of the differences point the same way (the table says how many for each
          feature). Nothing was registered or tested.
        </p>
      </div>
      <Disclosure summary="The figures as a table">
        <ScrollRegion label="Odds ratios at the first and second boss">
          <table className="num w-full min-w-[40rem] text-left text-xs">
            <caption className="sr-only">
              Odds ratios for getting past the Act-1 and the Act-2 boss, with 95 % intervals
            </caption>
            <thead className="text-dim">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Feature (per unit)
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Act-1 boss
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Act-2 boss
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Difference in log-odds
                </th>
                <th scope="col" className="py-1 font-medium">
                  Classes that agree
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {t.features.map((f) => (
                <tr key={f.id}>
                  <th scope="row" className="py-1 pr-3 font-medium text-parchment">
                    {f.label} ({f.unit})
                  </th>
                  <td className="py-1 pr-3">
                    ×{f.act1.oddsRatio.toFixed(2)} ({f.act1.ci95[0]?.toFixed(2)}–
                    {f.act1.ci95[1]?.toFixed(2)})
                  </td>
                  <td className="py-1 pr-3">
                    ×{f.act2.oddsRatio.toFixed(2)} ({f.act2.ci95[0]?.toFixed(2)}–
                    {f.act2.ci95[1]?.toFixed(2)})
                  </td>
                  <td className="py-1 pr-3">
                    {f.difference.beta.toFixed(2)} ({f.difference.ci95[0]?.toFixed(2)} to{" "}
                    {f.difference.ci95[1]?.toFixed(2)})
                  </td>
                  <td className="py-1">
                    {String(f.classesAgreeing)} of {String(f.classesAlone)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </Disclosure>
    </div>
  );
}
