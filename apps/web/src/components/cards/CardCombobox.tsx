"use client";

import { useId, useMemo, useRef, useState } from "react";

import { searchCards, type CardClass, type CardEntry } from "@slay2/game-data";

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
  placeholder = "Search cards by name…",
  hint,
  className,
}: {
  label: string;
  onSelect: (card: CardEntry) => void;
  classes?: readonly CardClass[];
  rewardEligibleOnly?: boolean;
  exclude?: ReadonlySet<string>;
  placeholder?: string;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const found = searchCards(query, {
      ...(classes ? { classes } : {}),
      rewardEligibleOnly,
      limit: 30,
    }).filter((c) => !exclude?.has(c.id));
    return found.slice(0, 8);
  }, [query, classes, rewardEligibleOnly, exclude]);

  const choose = (card: CardEntry | undefined): void => {
    if (!card) {
      return;
    }
    onSelect(card);
    setQuery("");
    setOpen(false);
    setActive(0);
    inputRef.current?.focus();
  };

  const listId = `${id}-list`;
  const expanded = open && results.length > 0;
  return (
    <div className={cn("relative min-w-0", className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-parchment">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? `${id}-opt-${String(active)}` : undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          // delay so a click on an option registers first
          setTimeout(() => {
            setOpen(false);
          }, 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && expanded) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="min-h-11 w-full rounded-lg border border-line-strong bg-charcoal px-3 text-parchment placeholder:text-dim hover:border-copper focus-visible:border-teal"
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      <ul
        id={listId}
        role="listbox"
        aria-label={`${label} suggestions`}
        hidden={!expanded}
        className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line-strong bg-ink-2 p-1 shadow-2xl"
      >
        {results.map((c, i) => {
          const cls = CLASS_STYLE[c.class];
          const rar = RARITY_STYLE[c.rarity];
          return (
            <li
              key={c.id}
              id={`${id}-opt-${String(i)}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(c);
              }}
              onMouseEnter={() => {
                setActive(i);
              }}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5",
                i === active ? "bg-ink-3 text-white" : "text-parchment",
              )}
            >
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
