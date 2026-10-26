import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Native <details>: keyboard and screen-reader support for free. */
export function Disclosure({
  summary,
  children,
  className,
  open,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  open?: boolean;
}) {
  return (
    <details
      open={open}
      className={cn("group rounded-lg border border-line bg-charcoal/40", className)}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-parchment marker:hidden hover:text-gold [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{summary}</span>
        <span aria-hidden="true" className="text-copper transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="border-t border-line px-4 py-3 text-sm text-muted">{children}</div>
    </details>
  );
}
