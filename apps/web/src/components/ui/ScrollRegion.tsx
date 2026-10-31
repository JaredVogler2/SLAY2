import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Horizontally scrollable wrapper that keyboard users can focus and scroll (WCAG 2.1.1; axe: scrollable-region-focusable). It is
 * positioned so that it is the containing block of what a table puts in absolute positions (a visually hidden label in a far cell would
 * otherwise stretch the whole page sideways).
 */
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
      className={cn("relative overflow-x-auto rounded-lg", className)}
    >
      {children}
    </div>
  );
}
