import { openQuestions } from "@/lib/insights-content";

/** What the figures above do not reach, in the order this project means to close it. */
export function OpenQuestions() {
  return (
    <ol className="space-y-3">
      {openQuestions().map((q, i) => (
        <li
          key={q.id}
          id={`open-${q.id}`}
          className="rounded-xl border border-line bg-charcoal/40 p-4 sm:p-5"
        >
          <div className="flex gap-3">
            <span aria-hidden="true" className="num font-display text-2xl leading-none text-copper">
              {String(i + 1)}
            </span>
            <div className="min-w-0">
              <h3 className="text-base leading-snug text-parchment">{q.question}</h3>
              <p className="mt-1 text-sm text-muted">{q.why}</p>
              <p className="mt-2 text-sm text-dim">
                <span className="text-muted">First step:</span> {q.first}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
