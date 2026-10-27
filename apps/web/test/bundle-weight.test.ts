import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const src = join(__dirname, "..", "src");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

// The evidence and rules files are about 150 KB of JSON that only the methods page, the experiments route and the page metadata
// use. A client component that imports them, even for one number, sends all of it to every visitor of the page that holds it (the
// start-HP note once did: the advisor's script carried 120 KB of evidence data). Pages that need a few numbers get them from a
// small file the exporter writes for that page (neow.generated.json, startHpGaps).
const HEAVY =
  /@\/lib\/methods-data|@\/lib\/site-meta|@\/content\/(evidence|rules)\.generated\.json/;
const MAY_IMPORT = [
  /^app\//,
  /^components\/methods\//,
  /^lib\/methods-data\.ts$/,
  /^lib\/site-meta\.ts$/,
];

describe("what the browser is sent", () => {
  it("only the methods page, the experiments route and the page metadata import the evidence and rules files", () => {
    const offenders = sources(src)
      .map((path) => relative(src, path).replaceAll("\\", "/"))
      .filter((rel) => HEAVY.test(readFileSync(join(src, rel), "utf8")))
      .filter((rel) => !MAY_IMPORT.some((ok) => ok.test(rel)));
    expect(
      offenders,
      "a module outside the methods page imports the evidence or rules data",
    ).toEqual([]);
  });

  it("the guard sees the importers it is written for", () => {
    const importers = sources(src)
      .map((path) => relative(src, path).replaceAll("\\", "/"))
      .filter((rel) => HEAVY.test(readFileSync(join(src, rel), "utf8")));
    expect(importers).toContain("app/methods/page.tsx");
    expect(importers).toContain("lib/methods-data.ts");
  });
});

/*
 * What the shared shell sends. The header and the error boundary are on every page, so whatever a client module in them imports
 * is sent to every visitor of every page. The header's "Resume" chip once read the run through the run store, which imports the
 * card catalog, the synergy table and the schema library: every page, the About page among them, carried about 120 KB of
 * gzipped script it never used. This walks the imports the way the bundler does: a server module can import anything, a client
 * module ("use client") and all it imports go to the browser, and a dynamic import() is a separate chunk fetched on demand.
 */
const USE_CLIENT = /^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)\s*)*["']use client["']/;
const IMPORT_FROM =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']/g;

function resolveModule(importer: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? join(src, spec.slice(2))
    : spec.startsWith(".")
      ? resolve(dirname(importer), spec)
      : null;
  if (base === null) {
    return null;
  }
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null; // a style sheet, an image or a data file: nothing to follow
}

/** The modules and packages the browser receives for the page that starts at `entry`. */
function sentToBrowser(entry: string): Set<string> {
  const sent = new Set<string>();
  const imports = (file: string): { path: string | null; spec: string }[] => {
    const text = readFileSync(file, "utf8");
    return [...text.matchAll(IMPORT_FROM)]
      .filter((m) => m[1] === undefined) // `import type` leaves no trace
      .map((m) => ({ spec: m[2] ?? "", path: resolveModule(file, m[2] ?? "") }));
  };
  const walkClient = (file: string): void => {
    const rel = relative(src, file).replaceAll("\\", "/");
    if (sent.has(rel)) {
      return;
    }
    sent.add(rel);
    for (const { path, spec } of imports(file)) {
      if (path) {
        walkClient(path);
      } else if (!spec.startsWith(".") && !spec.startsWith("@/")) {
        sent.add(spec);
      }
    }
  };
  const seen = new Set<string>();
  const walkServer = (file: string): void => {
    if (seen.has(file)) {
      return;
    }
    seen.add(file);
    if (USE_CLIENT.test(readFileSync(file, "utf8"))) {
      walkClient(file);
      return;
    }
    for (const { path } of imports(file)) {
      if (path) {
        walkServer(path);
      }
    }
  };
  walkServer(join(src, entry));
  return sent;
}

describe("what every page is sent by the shared shell", () => {
  // the card catalog and the synergy table (@slay2/game-data), the schema library, and the run's own schema and store
  const FORBIDDEN = [
    "@slay2/game-data",
    "@slay2/game-schema",
    "zod",
    "lib/run-state.ts",
    "lib/run-store.ts",
  ];

  for (const entry of [
    "app/layout.tsx",
    "app/error.tsx",
    "app/global-error.tsx",
    "app/not-found.tsx",
    "app/page.tsx",
    "app/about/page.tsx",
    "app/methods/page.tsx",
  ]) {
    it(`${entry} sends no card catalog, run schema or run store`, () => {
      const sent = sentToBrowser(entry);
      expect(
        FORBIDDEN.filter((f) => sent.has(f)),
        `a client module reachable from ${entry} imports them`,
      ).toEqual([]);
    });
  }

  it("the walk sees what it is written to see", () => {
    // the advisor's page does send the store and the catalog, and the header's chip is a client module of the layout
    const advisor = sentToBrowser("app/advisor/page.tsx");
    expect(advisor.has("lib/run-store.ts")).toBe(true);
    expect(advisor.has("@slay2/game-data")).toBe(true);
    expect(sentToBrowser("app/layout.tsx").has("components/shell/ResumeChip.tsx")).toBe(true);
  });
});
