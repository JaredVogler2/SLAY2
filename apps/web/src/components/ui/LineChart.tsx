import { cn } from "@/lib/cn";

export interface XY {
  x: number;
  y: number;
}

/**
 * Small dependency-free line chart. Every chart has a text alternative (<title>/<desc>) and an optional data table
 * toggle supplied by the caller, so the numbers are never only in the picture.
 */
export function LineChart({
  points,
  title,
  description,
  xLabel,
  yLabel,
  marker,
  yMax,
  yFormat = (y) => `${y.toFixed(0)}%`,
  className,
}: {
  points: readonly XY[];
  title: string;
  description: string;
  xLabel: string;
  yLabel: string;
  marker?: { x: number; label: string } | undefined;
  yMax?: number;
  yFormat?: (y: number) => string;
  className?: string;
}) {
  const W = 640;
  const H = 260;
  const pad = { l: 52, r: 16, t: 14, b: 44 };
  const xs = points.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const top = yMax ?? Math.max(...points.map((p) => p.y), 1);
  const sx = (x: number): number =>
    pad.l + ((x - xMin) / Math.max(1, xMax - xMin)) * (W - pad.l - pad.r);
  const sy = (y: number): number => H - pad.b - (y / top) * (H - pad.t - pad.b);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
    .join(" ");
  const area = `${path} L${sx(xMax).toFixed(1)},${sy(0).toFixed(1)} L${sx(xMin).toFixed(1)},${sy(0).toFixed(1)} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const xTickCount = Math.min(6, xMax - xMin);
  const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) =>
    Math.round(xMin + ((xMax - xMin) * i) / Math.max(1, xTickCount)),
  );
  const markerPoint = marker ? points.find((p) => p.x === marker.x) : undefined;
  return (
    <figure className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W.toString()} ${H.toString()}`}
        role="img"
        aria-labelledby="lc-title lc-desc"
        className="h-auto w-full"
      >
        <title id="lc-title">{title}</title>
        <desc id="lc-desc">{description}</desc>
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={sy(t)}
              y2={sy(t)}
              stroke="var(--color-line)"
              strokeWidth="1"
            />
            <text
              x={pad.l - 8}
              y={sy(t) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--color-muted)"
              className="num"
            >
              {yFormat(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={t}
            x={sx(t)}
            y={H - pad.b + 18}
            textAnchor="middle"
            fontSize="11"
            fill="var(--color-muted)"
            className="num"
          >
            {t}
          </text>
        ))}
        <path d={area} fill="var(--color-copper)" opacity="0.12" />
        <path
          d={path}
          fill="none"
          stroke="var(--color-copper)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {markerPoint ? (
          <g>
            <line
              x1={sx(markerPoint.x)}
              x2={sx(markerPoint.x)}
              y1={pad.t}
              y2={H - pad.b}
              stroke="var(--color-teal)"
              strokeDasharray="4 4"
            />
            <circle
              cx={sx(markerPoint.x)}
              cy={sy(markerPoint.y)}
              r="6"
              fill="var(--color-charcoal)"
              stroke="var(--color-teal)"
              strokeWidth="3"
            />
            <text
              x={Math.min(W - pad.r - 4, sx(markerPoint.x) + 10)}
              y={Math.max(pad.t + 12, sy(markerPoint.y) - 10)}
              fontSize="12"
              fill="var(--color-teal)"
              className="num"
              textAnchor={sx(markerPoint.x) > W - 120 ? "end" : "start"}
            >
              {marker?.label} · {yFormat(markerPoint.y)}
            </text>
          </g>
        ) : null}
        <text
          x={(pad.l + W - pad.r) / 2}
          y={H - 6}
          textAnchor="middle"
          fontSize="12"
          fill="var(--color-muted)"
        >
          {xLabel}
        </text>
        <text
          transform={`rotate(-90 14 ${String((pad.t + H - pad.b) / 2)})`}
          x="14"
          y={(pad.t + H - pad.b) / 2}
          textAnchor="middle"
          fontSize="12"
          fill="var(--color-muted)"
        >
          {yLabel}
        </text>
      </svg>
    </figure>
  );
}
