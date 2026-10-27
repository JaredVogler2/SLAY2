// What the browser is sent as script, page by page, read from a production build (no server, no browser, no third-party package):
// the script files named in each prerendered page, their size and their size gzipped at level 6. Run after a build:
//   pnpm --filter @slay2/web build && pnpm --filter @slay2/web bytes
// It is a count of bytes, not a timing; it does not include the router's prefetch of other pages, the fonts or the styles.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

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
  rows.push({ page: page === "index" ? "/" : `/${page}`, scripts: scripts.length, kb: raw / 1024, gzKb: gz / 1024 });
}

console.log("page        scripts      KB   KB gzipped");
for (const r of rows) {
  console.log(`${r.page.padEnd(10)}  ${String(r.scripts).padStart(6)}  ${r.kb.toFixed(1).padStart(6)}  ${r.gzKb.toFixed(1).padStart(11)}`);
}
