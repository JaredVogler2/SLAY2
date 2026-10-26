import { cn } from "@/lib/cn";

/** Original mark: a three-tier spire inside a thin orbit ring. Pure SVG, no game art. */
export function SpireMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <circle
        cx="16"
        cy="16"
        r="14.2"
        fill="none"
        stroke="var(--color-copper)"
        strokeWidth="1"
        opacity="0.55"
        strokeDasharray="1.2 2.4"
      />
      <path
        d="M16 3.5 L19.2 12 L17.6 12 L21 20.5 L18.4 20.5 L22.4 28.5 L9.6 28.5 L13.6 20.5 L11 20.5 L14.4 12 L12.8 12 Z"
        fill="var(--color-copper)"
      />
      <path
        d="M16 3.5 L19.2 12 L17.6 12 L21 20.5 L18.4 20.5 L22.4 28.5 L16 28.5 Z"
        fill="var(--color-gold)"
        opacity="0.55"
      />
      <circle cx="16" cy="2.4" r="1.3" fill="var(--color-teal)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <SpireMark />
      <span className="font-display text-xl tracking-[0.14em] text-parchment">
        SLAY<span className="text-copper">2</span>
      </span>
    </span>
  );
}
