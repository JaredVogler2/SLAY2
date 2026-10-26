"use client";

import { useId } from "react";

import { cn } from "@/lib/cn";

/** Integer input with large +/- touch targets; clamps to [min, max] and never emits NaN. */
export function NumberStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  hint,
  className,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  className?: string;
  suffix?: string;
}) {
  const id = useId();
  const clamp = (n: number): number =>
    Math.min(max, Math.max(min, Number.isFinite(n) ? Math.round(n) : min));
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-parchment">
        {label}
      </label>
      <div className="flex items-stretch">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => {
            onChange(clamp(value - step));
          }}
          disabled={value <= min}
          className="min-h-11 min-w-11 rounded-l-lg border border-r-0 border-line-strong bg-ink-2 text-lg text-parchment hover:border-copper disabled:opacity-40"
        >
          −
        </button>
        <input
          id={id}
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9-]/g, "");
            onChange(clamp(raw === "" || raw === "-" ? min : Number(raw)));
          }}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="num min-h-11 w-full min-w-0 border border-line-strong bg-charcoal px-2 text-center text-parchment hover:border-copper focus-visible:border-teal"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => {
            onChange(clamp(value + step));
          }}
          disabled={value >= max}
          className="min-h-11 min-w-11 rounded-r-lg border border-l-0 border-line-strong bg-ink-2 text-lg text-parchment hover:border-copper disabled:opacity-40"
        >
          +
        </button>
      </div>
      {suffix ? <p className="text-xs text-muted">{suffix}</p> : null}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
