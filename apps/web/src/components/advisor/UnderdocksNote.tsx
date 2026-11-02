import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The one callout that tells a visitor in Underdocks that the simulated runs behind a panel were played in Overgrowth (gap G12: the simulator never plays
 * Underdocks). Every advisor panel that shows simulated numbers uses it, so the caveat looks the same wherever it appears: a boxed note in the colour the site
 * keeps for risk, never a bare line that a visitor can read past.
 */
export function UnderdocksNote({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      role="note"
      data-underdocks-note=""
      className={cn(
        "rounded-lg border border-rose-deep/60 bg-rose/10 p-3 text-sm text-rose",
        className,
      )}
    >
      {children}
    </p>
  );
}
