// What the browser is sent as script, page by page, read from a production build (no server, no browser, no third-party package):
// the script files named in each prerendered page, their size and their size gzipped at level 6. Run after a build:
//   pnpm --filter @slay2/web build && pnpm --filter @slay2/web bytes          (print the table)
//   pnpm --filter @slay2/web build && pnpm --filter @slay2/web bytes:check    (exit 1 when a page is over its budget; CI runs this)
// It is a count of bytes, not a timing; it does not include the router's prefetch of other pages, the fonts or the styles.
//
// The budgets are a tripwire, not a target: each is the size the page had when ADR-056 recorded it plus about 8 % for ordinary growth.
// They exist because a single import in the shared shell (the header's "Resume" chip once imported the run store, which imports the card
// catalog, the synergy table and the schema library) put 117 KB of gzipped script on every page, `/about` included, and no source scan
// can see through the workspace packages. Raise a budget in the commit that adds the feature that needs it, and say why.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_KB_GZIPPED = {
  index: 200,
  advisor: 345,
  odds: 285,
  routes: 278,
  codex: 285,
  methods: 192,
  about: 192,
};

const check = process.argv.includes("--check");
const next = join(import.meta.dirname, "..", ".next");
const pages = (process.env.PAGES ?? "index,advisor,odds,routes,codex,methods,about").split(",");

const rows = [];
for (const page of pages) {
  const file = join(next, "server", "app", `${page}.html`);
  if (!existsSync(file)) {
    console.error(`no ${file}: run the build first`);
    process.exit(1);
  }
  const html = readFileSync(file, "utf8");
  const scripts = [...new Set([...html.matchAll(/src="\/_next\/(static\/[^"]+\.js)"/g)].map((m) => m[1]))];
  let raw = 0;
  let gz = 0;
  for (const script of scripts) {
    const bytes = readFileSync(join(next, script));
    raw += bytes.length;
    gz += gzipSync(bytes, { level: 6 }).length;
  }
  rows.push({
    key: page,
    page: page === "index" ? "/" : `/${page}`,
    scripts: scripts.length,
    kb: raw / 1024,
    gzKb: gz / 1024,
    budget: BUDGET_KB_GZIPPED[page],
  });
}

console.log("page        scripts      KB   KB gzipped   budget");
for (const r of rows) {
  console.log(
    `${r.page.padEnd(10)}  ${String(r.scripts).padStart(6)}  ${r.kb.toFixed(1).padStart(6)}  ${r.gzKb.toFixed(1).padStart(11)}  ${r.budget === undefined ? "".padStart(6) : String(r.budget).padStart(6)}`,
  );
}

if (check) {
  const over = rows.filter((r) => r.budget !== undefined && r.gzKb > r.budget);
  if (over.length > 0) {
    for (const r of over) {
      console.error(
        `${r.page} sends ${r.gzKb.toFixed(1)} KB of gzipped script, over its budget of ${r.budget} KB: something heavy is reachable from it (see ADR-056)`,
      );
    }
    process.exit(1);
  }
  console.log("every page is within its script budget");
}
