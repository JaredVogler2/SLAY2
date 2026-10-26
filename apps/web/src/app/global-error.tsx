"use client";

import "./globals.css";

/** Last-resort boundary: it replaces the root layout, so it carries its own document and no shared components. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <main className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6">
          <p className="eyebrow mb-3">Something broke</p>
          <h1 className="text-3xl leading-tight text-parchment">SLAY2 could not load this page</h1>
          <p className="mt-4 text-lg text-muted">
            It is a bug in SLAY2, not something you did. Your saved run is kept in this browser and
            has not been touched.
          </p>
          <button
            type="button"
            onClick={() => {
              retry();
            }}
            className="mt-8 min-h-11 rounded-lg border border-teal-deep bg-teal/10 px-5 text-teal hover:bg-teal/20"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
