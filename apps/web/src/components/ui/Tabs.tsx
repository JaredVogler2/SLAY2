"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface TabDef<T extends string> {
  id: T;
  label: ReactNode;
}

/** WAI-ARIA tabs with roving tabindex and arrow/Home/End keys. Panels are rendered by the caller via `renderPanel`. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  renderPanel,
  label,
}: {
  tabs: readonly TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  renderPanel: (id: T) => ReactNode;
  label: string;
}) {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (e: KeyboardEvent, index: number): void => {
    const last = tabs.length - 1;
    const targetIndex =
      e.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : e.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (targetIndex === null) {
      return;
    }
    e.preventDefault();
    const target = tabs[targetIndex];
    if (target) {
      onChange(target.id);
      refs.current[target.id]?.focus();
    }
  };
  return (
    <div>
      <div role="tablist" aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                onChange(t.id);
              }}
              onKeyDown={(e) => {
                move(e, i);
              }}
              className={cn(
                "min-h-11 shrink-0 rounded-lg border px-4 text-sm font-medium transition-colors",
                selected
                  ? "border-copper bg-copper/15 text-gold"
                  : "border-line bg-ink text-muted hover:border-line-strong hover:text-parchment",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel-${active}`}
        aria-labelledby={`${base}-tab-${active}`}
        tabIndex={0}
        className="mt-5 outline-offset-4"
      >
        {renderPanel(active)}
      </div>
    </div>
  );
}
