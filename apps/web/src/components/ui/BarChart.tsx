import { cn } from "@/lib/cn";

export interface Bar {
  label: string;
  value: number;
  highlight?: boolean;
}

/** Vertical bar chart for discrete distributions. The accessible name lists every bar. */
export function BarChart({
  bars,
  title,
  yFormat = (v) => `${(v * 100).toFixed(1)}%`,
  className,
  xLabel,
}: {
  bars: readonly Bar[];
  title: string;
  yFormat?: (v: number) => string;
  className?: string;
  xLabel?: string;
}) {
  const W = 640;
  const H = 220;
  const pad = { l: 8, r: 8, t: 22, b: 36 };
  const max = Math.max(...bars.map((b) => b.value), 1e-9);
  const bw = (W - pad.l - pad.r) / Math.max(1, bars.length);
  const summary = `${title}: ${bars.map((b) => `${b.label} ${yFormat(b.value)}`).join(", ")}`;
  return (
    <figure className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W.toString()} ${H.toString()}`}
        role="img"
        aria-label={summary}
        className="h-auto w-full"
      >
        {bars.map((b, i) => {
          const h = (b.value / max) * (H - pad.t - pad.b);
          const x = pad.l + i * bw + bw * 0.12;
          const y = H - pad.b - h;
          return (
            <g key={b.label}>
              <rect
                x={x}
                y={y}
                width={bw * 0.76}
                height={Math.max(h, b.value > 0 ? 1 : 0)}
                rx="3"
                fill={b.highlight ? "var(--color-teal)" : "var(--color-copper)"}
                opacity={b.highlight ? 1 : 0.85}
              />
              {b.value > 0 ? (
                <text
                  x={x + bw * 0.38}
                  y={y - 5}
                  fontSize="10.5"
                  textAnchor="middle"
                  fill="var(--color-parchment)"
                  className="num"
                >
                  {yFormat(b.value)}
                </text>
              ) : null}
              <text
                x={x + bw * 0.38}
                y={H - pad.b + 16}
                fontSize="11"
                textAnchor="middle"
                fill="var(--color-muted)"
                className="num"
              >
                {b.label}
              </text>
            </g>
          );
        })}
        {xLabel ? (
          <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="12" fill="var(--color-muted)">
            {xLabel}
          </text>
        ) : null}
      </svg>
    </figure>
  );
}
