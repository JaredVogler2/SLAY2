"use client";

import { useCallback } from "react";

import { CATALOG, searchCards, type CardClass, type CardEntry } from "@slay2/game-data";

import { Combobox } from "@/components/ui/Combobox";
import { CLASS_STYLE, RARITY_STYLE, costLabel } from "@/lib/card-style";
import { cn } from "@/lib/cn";

/**
 * Accessible card search (WAI-ARIA 1.2 combobox with list popup). Arrow keys move, Enter picks, Escape closes.
 * Results come from the canonical catalog, so only real card ids can be entered.
 */
export function CardCombobox({
  label,
  onSelect,
  classes,
  rewardEligibleOnly = false,
  exclude,
  filter,
  placeholder = "Search cards by name…",
  hint,
  className,
}: {
  label: string;
  onSelect: (card: CardEntry) => void;
  classes?: readonly CardClass[];
  rewardEligibleOnly?: boolean;
  exclude?: ReadonlySet<string>;
  /** A further condition on the results (for example "only Rare cards"), applied after the search. */
  filter?: (card: CardEntry) => boolean;
  placeholder?: string;
  hint?: string;
  className?: string;
}) {
  const search = useCallback(
    (query: string): CardEntry[] =>
      searchCards(query, {
        ...(classes ? { classes } : {}),
        rewardEligibleOnly,
        // a further filter is applied after the search, so the search must not cut the pool short first
        limit: filter ? CATALOG.cards.length : 30,
      }).filter((c) => !exclude?.has(c.id) && (filter ? filter(c) : true)),
    [classes, rewardEligibleOnly, exclude, filter],
  );
  return (
    <Combobox<CardEntry>
      label={label}
      onSelect={onSelect}
      search={search}
      getKey={(c) => c.id}
      renderOption={(c) => {
        const cls = CLASS_STYLE[c.class];
        const rar = RARITY_STYLE[c.rarity];
        return (
          <>
            <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line-strong bg-charcoal text-sm text-gold">
              {costLabel(c.cost)}
            </span>
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            <span className="shrink-0 text-xs text-muted" style={{ color: cls.hue }}>
              {cls.label}
            </span>
            <span className={cn("shrink-0 text-xs", rar.className)}>
              <span aria-hidden="true">{rar.glyph}</span> {rar.label}
            </span>
          </>
        );
      }}
      placeholder={placeholder}
      {...(hint ? { hint } : {})}
      {...(className ? { className } : {})}
    />
  );
}
