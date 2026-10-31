import { Disclosure } from "@/components/ui/Disclosure";
import { count, ordinal } from "@/lib/insights";
import { allSurprises, type Surprise } from "@/lib/insights-server";

function oddsText(beta: number): string {
  return `odds ×${Math.exp(beta).toFixed(2)}`;
}

function List({ title, rows, empty }: { title: string; rows: readonly Surprise[]; empty: string }) {
  return (
    <div className="min-w-0">
      <h4 className="text-sm font-medium text-parchment">{title}</h4>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-dim">{empty}</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-line bg-charcoal/40 px-3 py-2">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm text-parchment">{r.name}</span>
                <span className="num text-sm text-muted">
                  {r.beta >= 0 ? "+" : "−"}
                  {Math.abs(r.beta).toFixed(2)}{" "}
                  <span className="text-xs text-dim">({oddsText(r.beta)})</span>
                </span>
              </p>
              <p className="num text-xs text-dim">
                95 % {r.ci95[0]?.toFixed(2)} to {r.ci95[1]?.toFixed(2)} · rated{" "}
                {ordinal(r.ratedRank)} by hand, {ordinal(r.measuredRank)} measured · in{" "}
                {count(r.games)} runs
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Where the measured value of a card and the hand-written rating disagree most, class by class. */
export function CardSurprises() {
  const classes = allSurprises();
  return (
    <div className="space-y-2">
      {classes.map((c, i) => (
        <Disclosure
          key={c.character}
          open={i === 0}
          summary={
            <span className="flex flex-wrap items-baseline gap-x-3">
              <span>{c.label}</span>
              <span className="num text-xs font-normal text-dim">
                {count(c.set.bossFights)} runs · {c.set.cards} cards · rank correlation with the
                hand ratings {c.set.spearman === null ? "n/a" : c.set.spearman.toFixed(2)}
              </span>
            </span>
          }
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <List
              title="Worth more than their rating"
              rows={c.better}
              empty="None that stand out."
            />
            <List
              title="Worth less than their rating"
              rows={c.worse}
              empty="None that stand out."
            />
          </div>
          <p className="mt-3 text-xs text-dim">
            The value is the change in the log-odds of getting past the Act-1 boss from one more
            copy in the deck, fitted to runs whose card picks were partly random
            {c.set.relicsKept
              ? ", with the relics kept"
              : ", in the simulator that dropped the relics a run gains"}
            . A card is listed only if even the end of its interval that is least favourable to the
            surprise puts it at least 15 % of the class&rsquo;s cards away from where its rating
            puts it. A card a better pilot would play well is undervalued, and a card that needs
            others is judged one at a time.
          </p>
        </Disclosure>
      ))}
    </div>
  );
}
