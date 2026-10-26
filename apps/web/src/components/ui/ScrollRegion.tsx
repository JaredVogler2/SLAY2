import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Horizontally scrollable wrapper that keyboard users can focus and scroll (WCAG 2.1.1; axe: scrollable-region-focusable). */
export function ScrollRegion({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn("overflow-x-auto rounded-lg", className)}
    >
      {children}
    </div>
  );
}
