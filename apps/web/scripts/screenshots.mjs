// Original production screenshots of the running UI (docs/screenshots). Needs a running production server:
//   pnpm --filter @slay2/web build && pnpm --filter @slay2/web exec next start -p 3100 &
//   BASE_URL=http://localhost:3100 pnpm --filter @slay2/web screenshots
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "screenshots");
mkdirSync(out, { recursive: true });

const viewports = [
  // device scale 1 keeps the full-page images small enough to live in git (the methods page is very tall)
  { name: "mobile", options: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true } },
  { name: "desktop", options: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
];
const pages = [
  { name: "landing", path: "/" },
  { name: "odds", path: "/odds" },
  { name: "advisor", path: "/advisor", before: async (page) => {
    await page.getByRole("button", { name: "Try an example" }).click();
    await page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ }).waitFor();
  } },
  { name: "codex", path: "/codex" },
  { name: "methods", path: "/methods" },
  { name: "about", path: "/about" },
];

const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
for (const vp of viewports) {
  const context = await browser.newContext({ ...vp.options, reducedMotion: "reduce" });
  for (const p of pages) {
    const page = await context.newPage();
    await page.goto(base + p.path, { waitUntil: "networkidle" });
    if (p.before) {
      await page.waitForTimeout(500); // hydration
      await p.before(page);
    }
    await page.waitForTimeout(400);
    const file = join(out, `${p.name}-${vp.name}.jpg`);
    await page.screenshot({ path: file, fullPage: true, type: "jpeg", quality: 70 });
    console.log("wrote", file);
    await page.close();
  }
  await context.close();
}
await browser.close();
