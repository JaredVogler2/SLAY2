import { useId } from "react";

/** Deterministic pseudo-random sequence so the illustration is identical on server and client. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function contour(cx: number, cy: number, r: number, squash: number, phase: number): string {
  const n = 96;
  let d = "";
  for (let i = 0; i <= n; i += 1) {
    const th = (i / n) * Math.PI * 2;
    const k =
      1 +
      0.045 * Math.sin(3 * th + phase) +
      0.028 * Math.sin(5 * th - 2 * phase) +
      0.015 * Math.sin(9 * th + phase * 3);
    const x = cx + Math.cos(th) * r * k;
    const y = cy + Math.sin(th) * r * k * squash;
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return `${d}Z`;
}

interface Node {
  x: number;
  y: number;
  kind: "fight" | "elite" | "rest" | "shop" | "event";
}

/**
 * Original hero illustration: a faceted spire rising out of topographic contours, a constellation of branching map
 * nodes and two slowly turning orbit rings. Entirely procedural SVG; honours prefers-reduced-motion via CSS.
 */
export function HeroSpire({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const rand = rng(20261025);
  const contours = Array.from({ length: 13 }, (_, i) => ({
    d: contour(300, 478, 50 + i * 18, 0.3, i * 0.7),
    o: 0.38 - i * 0.022,
    stroke: i % 4 === 0 ? "var(--color-copper)" : "var(--color-teal)",
  }));

  // branching map: 7 rows, each node connects to 1-2 nodes in the next row; kept off the spire's centre line
  const rows = 7;
  const grid: Node[][] = [];
  for (let r = 0; r < rows; r += 1) {
    const count = r === 0 ? 3 : 4 + Math.floor(rand() * 2);
    const row: Node[] = [];
    for (let c = 0; c < count; c += 1) {
      const spread = 250 - r * 14;
      const side = c % 2 === 0 ? -1 : 1;
      const dist = 70 + ((c + 1) >> 1) * (spread / 3.2) + rand() * 14;
      const kinds: Node["kind"][] = ["fight", "fight", "event", "shop", "rest", "elite"];
      row.push({
        x: 300 + side * dist,
        y: 430 - r * 52 + (rand() - 0.5) * 12,
        kind: kinds[Math.floor(rand() * kinds.length)] ?? "fight",
      });
    }
    grid.push(row);
  }
  const edges: [Node, Node][] = [];
  for (let r = 0; r < rows - 1; r += 1) {
    const here = grid[r] ?? [];
    const next = grid[r + 1] ?? [];
    here.forEach((a) => {
      const sorted = [...next].sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x));
      const first = sorted[0];
      const second = sorted[1];
      if (first) edges.push([a, first]);
      if (second && rand() > 0.55) edges.push([a, second]);
    });
  }
  const stars = Array.from({ length: 46 }, () => ({
    x: rand() * 600,
    y: rand() * 330,
    r: 0.5 + rand() * 1.3,
    o: 0.25 + rand() * 0.6,
  }));

  return (
    <svg
      viewBox="0 0 600 560"
      className={className}
      role="img"
      aria-label="Illustration: a spire rising from contour lines, with a constellation of map nodes and orbit rings."
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="62%" r="55%">
          <stop offset="0%" stopColor="#d49a62" stopOpacity="0.38" />
          <stop offset="55%" stopColor="#d49a62" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#d49a62" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-left`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6c4524" />
          <stop offset="1" stopColor="#b57f4b" />
        </linearGradient>
        <linearGradient id={`${uid}-right`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e6c07b" />
          <stop offset="1" stopColor="#d49a62" />
        </linearGradient>
        <linearGradient id={`${uid}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0f15" stopOpacity="0" />
          <stop offset="1" stopColor="#0b0f15" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="600" height="560" fill={`url(#${uid}-glow)`} />

      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#e9e0d0" opacity={s.o} />
      ))}

      <g className="orbit" opacity="0.55">
        <ellipse
          cx="300"
          cy="300"
          rx="262"
          ry="262"
          fill="none"
          stroke="var(--color-copper)"
          strokeWidth="0.8"
          strokeDasharray="2 7"
        />
        <circle cx="300" cy="38" r="4" fill="var(--color-teal)" />
        <circle cx="562" cy="300" r="2.6" fill="var(--color-copper)" />
        <circle cx="120" cy="486" r="2.2" fill="var(--color-gold)" />
      </g>
      <g className="orbit-reverse" opacity="0.4">
        <ellipse
          cx="300"
          cy="300"
          rx="214"
          ry="214"
          fill="none"
          stroke="var(--color-teal)"
          strokeWidth="0.8"
          strokeDasharray="1 5"
        />
        <circle cx="86" cy="300" r="3" fill="var(--color-teal)" />
        <circle cx="300" cy="514" r="2.2" fill="var(--color-copper)" />
      </g>

      {contours.map((c, i) => (
        <path
          key={i}
          d={c.d}
          fill="none"
          stroke={c.stroke}
          strokeWidth={i % 4 === 0 ? 1.2 : 0.8}
          opacity={Math.max(0.05, c.o)}
        />
      ))}

      <g opacity="0.7">
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="var(--color-copper)"
            strokeWidth="0.9"
            opacity="0.5"
          />
        ))}
        {grid
          .flat()
          .map((n, i) =>
            n.kind === "elite" ? (
              <path
                key={i}
                d={`M${n.x},${n.y - 6.5} L${n.x + 6.5},${n.y} L${n.x},${n.y + 6.5} L${n.x - 6.5},${n.y} Z`}
                fill="var(--color-charcoal)"
                stroke="var(--color-rose)"
                strokeWidth="1.5"
              />
            ) : n.kind === "shop" ? (
              <rect
                key={i}
                x={n.x - 5}
                y={n.y - 5}
                width="10"
                height="10"
                rx="2"
                fill="var(--color-charcoal)"
                stroke="var(--color-gold)"
                strokeWidth="1.4"
              />
            ) : n.kind === "rest" ? (
              <circle key={i} cx={n.x} cy={n.y} r="5.5" fill="var(--color-teal)" opacity="0.85" />
            ) : (
              <circle
                key={i}
                cx={n.x}
                cy={n.y}
                r="4.5"
                fill="var(--color-charcoal)"
                stroke={n.kind === "event" ? "var(--color-teal)" : "var(--color-copper)"}
                strokeWidth="1.5"
              />
            ),
          )}
      </g>

      <g className="drift">
        <path
          d="M300 54 L318 218 L309 218 L330 330 L315 330 L346 470 L254 470 L285 330 L270 330 L291 218 L282 218 Z"
          fill={`url(#${uid}-left)`}
        />
        <path
          d="M300 54 L318 218 L309 218 L330 330 L315 330 L346 470 L300 470 Z"
          fill={`url(#${uid}-right)`}
        />
        <path
          d="M300 54 L318 218 L309 218 L330 330 L315 330 L346 470 L254 470 L285 330 L270 330 L291 218 L282 218 Z"
          fill="none"
          stroke="#fff3d6"
          strokeOpacity="0.35"
          strokeWidth="1"
        />
        <rect x="296" y="352" width="8" height="22" rx="4" fill="#0b0f15" opacity="0.75" />
        <rect x="296" y="258" width="8" height="18" rx="4" fill="#0b0f15" opacity="0.7" />
        <rect x="297.5" y="168" width="5" height="14" rx="2.5" fill="#0b0f15" opacity="0.7" />
        <circle cx="300" cy="44" r="5" fill="var(--color-teal)" />
        <circle
          cx="300"
          cy="44"
          r="11"
          fill="none"
          stroke="var(--color-teal)"
          strokeOpacity="0.5"
        />
      </g>

      <rect y="430" width="600" height="130" fill={`url(#${uid}-fade)`} />
    </svg>
  );
}
