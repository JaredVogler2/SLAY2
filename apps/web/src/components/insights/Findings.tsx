import { findings } from "@/lib/insights";

import { EvidenceBadge } from "./EvidenceBadge";

/** The six things the figures say, each with its number, what kind of evidence it is, and where to read the rest. */
export function Findings() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {findings().map((f) => (
        <li
          key={f.id}
          id={`finding-${f.id}`}
          className="flex flex-col rounded-xl border border-line bg-ink-2 p-4"
        >
          <p className="num font-display text-3xl leading-none text-parchment">{f.figure}</p>
          <p className="mt-1 text-xs text-dim">{f.caption}</p>
          <h3 className="mt-3 text-base leading-snug text-parchment">{f.headline}</h3>
          <p className="mt-1.5 flex-1 text-sm text-muted">{f.body}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <EvidenceBadge kind={f.evidence} />
            <a
              href={f.href}
              aria-label={`The figures behind: ${f.headline}`}
              className="text-sm text-teal underline decoration-dotted underline-offset-4"
            >
              The figures
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}
