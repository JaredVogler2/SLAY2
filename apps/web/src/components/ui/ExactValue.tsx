"use client";

import { useState } from "react";
import type { Rational } from "@slay2/odds";

import { pctSmart, shortFraction } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * A probability shown as a percentage, with the exact rational one click away. Exactness is the product: the
 * percentage is rounded for reading, the fraction is the value.
 */
export function ExactValue({
  value,
  digits = 2,
  className,
  label = "exact",
  format = "percent",
}: {
  value: Rational;
  digits?: number;
  className?: string;
  label?: string;
  /** "percent" for probabilities, "number" for expectations and counts */
  format?: "percent" | "number";
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const full = value.toString();
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      <span className="num">
        {format === "percent" ? pctSmart(value, digits) : value.toFixed(digits)}
      </span>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="rounded border border-line px-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted hover:border-teal hover:text-teal"
      >
        {label}
      </button>
      {open ? (
        <span className="basis-full">
          <code
            className="num block max-w-full break-all rounded bg-charcoal px-2 py-1 font-mono text-xs text-teal"
            title={full}
          >
            {shortFraction(value, 80)}
          </code>
          <button
            type="button"
            className="mt-1 text-xs text-muted underline decoration-dotted hover:text-parchment"
            onClick={() => {
              void navigator.clipboard
                .writeText(full)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => {
                    setCopied(false);
                  }, 1500);
                })
                .catch(() => {
                  setCopied(false);
                });
            }}
          >
            {copied ? "Copied" : "Copy exact fraction"}
          </button>
        </span>
      ) : null}
    </span>
  );
}
