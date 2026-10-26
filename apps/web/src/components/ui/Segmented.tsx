"use client";

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: string;
  disabled?: boolean;
}

/** Radio-group presented as a segmented control (native radios: keyboard, screen readers and forms just work). */
export function Segmented<T extends string>({
  legend,
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  legend: string;
  value: T;
  onChange: (next: T) => void;
  options: readonly SegmentedOption<T>[];
  className?: string;
  size?: "sm" | "md";
}) {
  const name = useId();
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="mb-1.5 text-sm font-medium text-parchment">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const id = `${name}-${o.value}`;
          const checked = o.value === value;
          return (
            <div key={o.value} className="relative">
              <input
                type="radio"
                id={id}
                name={name}
                value={o.value}
                checked={checked}
                disabled={o.disabled}
                onChange={() => {
                  onChange(o.value);
                }}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                title={o.description}
                className={cn(
                  "inline-flex cursor-pointer items-center justify-center rounded-lg border px-3 text-sm transition-colors",
                  size === "md" ? "min-h-11" : "min-h-9",
                  checked
                    ? "border-copper bg-copper/15 text-gold"
                    : "border-line-strong bg-ink-2 text-muted hover:border-copper hover:text-parchment",
                  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal",
                  o.disabled && "cursor-not-allowed opacity-40",
                )}
              >
                {o.label}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
