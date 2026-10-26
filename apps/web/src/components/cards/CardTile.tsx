import type { CardEntry } from "@slay2/game-data";

import { CLASS_STYLE, RARITY_STYLE, costLabel } from "@/lib/card-style";
import { cn } from "@/lib/cn";

/**
 * Informational card tile. Deliberately NOT a reproduction of the game's card frame: it shows only facts (name, cost,
 * type, rarity, class) plus SLAY2's own role tags, in an original layout.
 */
export function CardTile({
  card,
  count,
  compact = false,
  selected = false,
  className,
  children,
}: {
  card: CardEntry;
  count?: number;
  compact?: boolean;
  selected?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const cls = CLASS_STYLE[card.class];
  const rar = RARITY_STYLE[card.rarity];
  const roles = card.roles.filter(
    (r) => !["exhaust", "ethereal", "retain", "innate", "sly", "unplayable", "eternal"].includes(r),
  );
  return (
    <div
      className={cn(
        "relative flex min-w-0 overflow-hidden rounded-xl border bg-ink-2",
        selected ? "border-teal shadow-[0_0_0_1px_var(--color-teal)]" : "border-line-strong",
        className,
      )}
    >
      <span aria-hidden="true" className="w-1.5 shrink-0" style={{ background: cls.hue }} />
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1.5", compact ? "p-2.5" : "p-3.5")}>
        <div className="flex items-start gap-2.5">
          <span
            className="num grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line-strong bg-charcoal font-display text-base text-gold"
            title={
              card.cost === "X"
                ? "Costs X energy"
                : card.cost === null
                  ? "Unplayable"
                  : `Costs ${String(card.cost)} energy`
            }
          >
            {costLabel(card.cost)}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate font-display leading-tight text-parchment",
                compact ? "text-sm" : "text-base",
              )}
              title={card.name}
            >
              {card.name}
              {count && count > 1 ? <span className="num ml-1.5 text-muted">×{count}</span> : null}
            </p>
            <p className="truncate text-xs text-muted">
              <span style={{ color: cls.hue }} aria-hidden="true">
                {cls.glyph}
              </span>{" "}
              {cls.label} · {card.type}
              {card.starCost ? ` · ${String(card.starCost)}★` : ""}
            </p>
          </div>
          <span className={cn("shrink-0 text-xs", rar.className)} title={rar.label}>
            <span aria-hidden="true">{rar.glyph}</span>{" "}
            <span className="sr-only sm:not-sr-only">{rar.label}</span>
          </span>
        </div>
        {!compact && roles.length > 0 ? (
          <ul className="flex flex-wrap gap-1" aria-label="Roles">
            {roles.slice(0, 6).map((r) => (
              <li
                key={r}
                className="rounded border border-line bg-charcoal px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wide text-muted"
              >
                {r}
              </li>
            ))}
          </ul>
        ) : null}
        {children}
      </div>
    </div>
  );
}
