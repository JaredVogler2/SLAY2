import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { coverageRows, type CoverageCell, type CoverageStatus } from "@/lib/insights-server";

const GLYPH: Record<
  CoverageStatus,
  { readonly mark: string; readonly word: string; readonly cls: string }
> = {
  full: { mark: "◆", word: "Covered", cls: "text-teal" },
  partial: { mark: "◐", word: "Partly covered", cls: "text-copper" },
  none: { mark: "✕", word: "Not covered", cls: "text-rose" },
  na: { mark: "–", word: "Not applicable", cls: "text-dim" },
};

function Cell({ c }: { c: CoverageCell }) {
  const g = GLYPH[c.status];
  return (
    <td className="py-2 pr-3 align-top">
      <span className="flex gap-1.5">
        <span aria-hidden="true" className={`shrink-0 ${g.cls}`}>
          {g.mark}
        </span>
        <span className="text-xs text-muted">
          <span className="sr-only">{g.word}. </span>
          {c.text}
        </span>
      </span>
    </td>
  );
}

/** For each part of the game: how much exists in it, and what the site holds of it: facts, exact odds, measurements, tests, advice. */
export function CoverageMatrix() {
  return (
    <div>
      <ul
        className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted"
        aria-label="Key to the table"
      >
        {(["full", "partial", "none"] as const).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={GLYPH[s].cls}>
              {GLYPH[s].mark}
            </span>
            {GLYPH[s].word}
          </li>
        ))}
      </ul>
      <ScrollRegion label="What the site holds of each part of the game">
        <table className="w-full min-w-[60rem] text-left">
          <caption className="sr-only">
            For each part of the game: how many there are, and what SLAY2 holds of it
          </caption>
          <thead className="text-xs text-dim">
            <tr>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Part of the game
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                In the game
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Facts
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Exact odds
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Measured in simulation
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Tested
              </th>
              <th scope="col" className="py-1.5 font-medium">
                In the advisor
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {coverageRows().map((r) => (
              <tr key={r.id} id={`coverage-${r.id}`}>
                <th scope="row" className="py-2 pr-3 align-top text-sm font-medium text-parchment">
                  {r.label}
                </th>
                <td className="num py-2 pr-3 align-top text-sm text-parchment">{r.inGame}</td>
                <Cell c={r.facts} />
                <Cell c={r.odds} />
                <Cell c={r.measured} />
                <Cell c={r.tested} />
                <Cell c={r.advice} />
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
      <p className="mt-3 text-xs text-dim">
        Counts of what the game holds are from the extracted data of the supported build, counted
        once and stored as numbers only (no name or text of the game is kept here); the catalogs are
        SLAY2&rsquo;s own facts-only tables. &ldquo;Tested&rdquo; means a comparison on held-out
        seeds that was registered before its first game.
      </p>
    </div>
  );
}
