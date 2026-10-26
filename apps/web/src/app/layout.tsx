import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/cinzel/500.css";
import "@fontsource/cinzel/700.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";

export const metadata: Metadata = {
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
    <html lang="en">
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
