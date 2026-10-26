import type { NextConfig } from "next";

const dev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy (interim, see docs/DECISIONS.md ADR-019).
 *
 * Pages are statically generated, so a per-request nonce is not available; the hydration payload Next inlines needs
 * `'unsafe-inline'` for scripts. Everything else is closed: same-origin only, no plugins, no framing, no form posts
 * elsewhere. SLAY2 renders no user-supplied HTML (there is no innerHTML sink; imports are parsed by a strict schema),
 * which is what makes the interim policy acceptable. React's dev tooling needs eval and websockets, so they are
 * allowed in `next dev` only.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  // Browsers ignore HSTS over plain http, so local development is unaffected. No includeSubDomains / preload: that
  // is a commitment the domain owner should make deliberately.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@slay2/odds", "@slay2/game-schema", "@slay2/game-data", "@slay2/decision"],
  typedRoutes: true,
  headers() {
    return Promise.resolve([{ source: "/:path*", headers: securityHeaders }]);
  },
};

export default config;
