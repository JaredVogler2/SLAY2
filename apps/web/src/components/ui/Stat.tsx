import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Stat({
  label,
  value,
  note,
  tone = "default",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: "default" | "exact" | "risk";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p
        className={cn(
          "num font-display text-4xl leading-none sm:text-5xl",
          tone === "exact" && "text-teal",
          tone === "risk" && "text-rose",
          tone === "default" && "text-parchment",
        )}
      >
        {value}
      </p>
      {note ? <p className="mt-2 text-sm text-muted">{note}</p> : null}
    </div>
  );
}
