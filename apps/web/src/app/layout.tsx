import "./globals.css";

import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { siteUrl } from "@/lib/site-config";

const base = siteUrl();

/*
 * The three families are served from this site (the files ship in the @fontsource packages; CSP font-src stays 'self').
 * next/font preloads them and draws the fallback with the real font's metrics (size-adjust and the ascent / descent
 * overrides). `optional` means a font that is not there within the first ~100 ms is not swapped in half way through the
 * page: a swap re-wraps the headings, and on a slow connection the landing page then shifted by 0.12 (0.31 on the advisor
 * with its old loading skeleton). The font is cached for the next page load, so it only costs the very first view.
 */
const cinzel = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/cinzel/files/cinzel-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/cinzel/files/cinzel-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-cinzel",
  display: "optional",
  adjustFontFallback: "Times New Roman",
  fallback: ["Trajan Pro", "Palatino Linotype", "Georgia", "serif"],
});

const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "optional",
  adjustFontFallback: "Arial",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

const jetbrainsMono = localFont({
  src: "../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  variable: "--font-jetbrains",
  display: "optional",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SF Mono", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  ...(base ? { metadataBase: new URL(base) } : {}),
  title: { default: "SLAY2 — The Spire Intelligence Observatory", template: "%s · SLAY2" },
  description:
    "Independent, unofficial strategy companion for Slay the Spire 2: exact card-reward, potion, ? room and draw odds, plus an explainable card advisor. Runs in your browser.",
  applicationName: "SLAY2",
  robots: { index: true, follow: true },
  openGraph: {
    title: "SLAY2 — The Spire Intelligence Observatory",
    type: "website",
    siteName: "SLAY2",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f15",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${cinzel.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased">
        <SiteHeader />
        <main id="main" tabIndex={-1} className="outline-none">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
