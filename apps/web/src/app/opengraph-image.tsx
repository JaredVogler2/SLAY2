import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

/**
 * The picture a link to SLAY2 gets when it is pasted into Discord, Reddit or a chat: drawn here from the site's own mark
 * and colours at build time (no game art, no screenshot). The title face is the Cinzel file the site already ships.
 */
export const alt =
  "SLAY2 — The Spire Intelligence Observatory: exact odds and explainable advice for Slay the Spire 2";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

const COLORS = {
  charcoal: "#0b0f15",
  ink: "#111924",
  line: "#2b3b52",
  parchment: "#e9e0d0",
  muted: "#a9b3c2",
  copper: "#d49a62",
  gold: "#e6c07b",
  teal: "#72d7c8",
};

export default async function OpenGraphImage() {
  const title = await readFile(
    join(
      process.cwd(),
      "node_modules",
      "@fontsource",
      "cinzel",
      "files",
      "cinzel-latin-700-normal.woff",
    ),
  );
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        background: `radial-gradient(900px 520px at 82% 40%, rgba(212,154,98,0.22), rgba(11,15,21,0) 70%), ${COLORS.charcoal}`,
        color: COLORS.parchment,
        padding: "0 72px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: 700 }}>
        <div
          style={{
            display: "flex",
            fontSize: 22,
            letterSpacing: 6,
            color: COLORS.copper,
            textTransform: "uppercase",
          }}
        >
          The Spire Intelligence Observatory
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 28,
            fontFamily: "Cinzel",
            fontSize: 76,
            lineHeight: 1.08,
            fontWeight: 700,
          }}
        >
          <span>Make every draft decision</span>
          <span style={{ color: COLORS.gold }}>on evidence.</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 30,
            fontSize: 29,
            lineHeight: 1.4,
            color: COLORS.muted,
          }}
        >
          Exact odds, an explainable card advisor and route comparison for Slay the Spire 2. It runs
          in your browser.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 38,
            fontSize: 21,
            color: COLORS.teal,
            letterSpacing: 2,
          }}
        >
          INDEPENDENT · UNOFFICIAL · MAIN V0.107.1 VERIFIED
        </div>
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
        <svg width="330" height="330" viewBox="0 0 32 32">
          <circle
            cx="16"
            cy="16"
            r="14.2"
            fill="none"
            stroke={COLORS.copper}
            strokeWidth="0.35"
            opacity="0.6"
            strokeDasharray="1.2 2.4"
          />
          <path
            d="M16 3.5 L19.2 12 L17.6 12 L21 20.5 L18.4 20.5 L22.4 28.5 L9.6 28.5 L13.6 20.5 L11 20.5 L14.4 12 L12.8 12 Z"
            fill={COLORS.copper}
          />
          <path
            d="M16 3.5 L19.2 12 L17.6 12 L21 20.5 L18.4 20.5 L22.4 28.5 L16 28.5 Z"
            fill={COLORS.gold}
            opacity="0.55"
          />
          <circle cx="16" cy="2.4" r="1.1" fill={COLORS.teal} />
        </svg>
      </div>
    </div>,
    {
      ...size,
      fonts: [{ name: "Cinzel", data: title, weight: 700, style: "normal" }],
    },
  );
}
