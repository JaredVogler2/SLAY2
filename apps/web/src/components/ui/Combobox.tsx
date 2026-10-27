"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Accessible search box (WAI-ARIA 1.2 combobox with a list popup). Arrow keys move, Enter picks, Escape closes. What can be
 * chosen is whatever `search` returns for the typed text, so a page that searches a catalog only ever takes real ids.
 */
export function Combobox<T>({
  label,
  onSelect,
  search,
  getKey,
  renderOption,
  placeholder,
  hint,
  emptyText,
  className,
}: {
  label: string;
  onSelect: (item: T) => void;
  /** The (at most eight shown) matches for the typed text; keep it stable between renders (`useCallback`). */
  search: (query: string) => readonly T[];
  getKey: (item: T) => string;
  /** The inside of one option: it sits in a flex row, so a truncating name wants `min-w-0 flex-1`. */
  renderOption: (item: T) => ReactNode;
  placeholder: string;
  hint?: string;
  /** What to say when the typed text matches nothing (the typed text is passed in); a generic line when not given. */
  emptyText?: (query: string) => string;
  className?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => search(query).slice(0, 8), [query, search]);

  const choose = (item: T | undefined): void => {
    if (item === undefined) {
      return;
    }
    onSelect(item);
    setQuery("");
    setOpen(false);
    setActive(0);
    inputRef.current?.focus();
  };

  const listId = `${id}-list`;
  const expanded = open && results.length > 0;
  const typed = query.trim();
  const nothing = open && typed !== "" && results.length === 0;
  const nothingText = nothing ? (emptyText ? emptyText(typed) : `No match for “${typed}”.`) : "";
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
          // the key that confirms an IME composition is not a choice (Chrome and Firefox report it as composing or as "Process")
          if (e.nativeEvent.isComposing || e.key === "Process") {
            return;
          }
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
      <p aria-live="polite" className="sr-only">
        {nothingText}
      </p>
      {nothing ? (
        <div
          aria-hidden="true"
          className="absolute z-30 mt-1 w-full rounded-xl border border-line-strong bg-ink-2 px-3 py-2.5 text-sm text-muted shadow-2xl"
        >
          {nothingText}
        </div>
      ) : null}
      <ul
        id={listId}
        role="listbox"
        aria-label={`${label} suggestions`}
        hidden={!expanded}
        className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line-strong bg-ink-2 p-1 shadow-2xl"
      >
        {results.map((item, i) => (
          <li
            key={getKey(item)}
            id={`${id}-opt-${String(i)}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => {
              e.preventDefault();
              choose(item);
            }}
            onMouseEnter={() => {
              setActive(i);
            }}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5",
              i === active ? "bg-ink-3 text-white" : "text-parchment",
            )}
          >
            {renderOption(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}
