import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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
