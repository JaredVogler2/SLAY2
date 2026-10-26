// Web Vitals of a running site, measured with Chromium's own performance APIs (no third-party package is downloaded or run):
// first and largest contentful paint, cumulative layout shift, the long tasks after the first paint (a stand-in for Total
// Blocking Time) and what was transferred. Needs a running server:
//   pnpm --filter @slay2/web build && pnpm --filter @slay2/web exec next start -p 3100 &
//   BASE_URL=http://localhost:3100 pnpm --filter @slay2/web vitals
//   BASE_URL=https://slay-part2.vercel.app pnpm --filter @slay2/web vitals      (the hosted site, from wherever this runs)
//
// Profiles. "phone": 390 x 844, 4x CPU slowdown and the slow-4G network profile Lighthouse uses for phones (150 ms round
// trip, 1.6 Mbit/s down), empty cache. "desktop": 1440 x 900, no throttling, empty cache. Each page is loaded RUNS times
// (default 3) and the table shows the median. This is a lab measurement on whatever machine runs it (the load average is
// printed at the end: a busy machine makes every time worse), not field data and not a Lighthouse score; INP needs a
// person and is not measured.
import { loadavg } from "node:os";

import { chromium } from "@playwright/test";

const base = (process.env.BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const runs = Number(process.env.RUNS ?? 3);
const paths = (process.env.PATHS ?? "/,/advisor,/odds,/routes,/codex,/methods,/about").split(",");

const profiles = [
  {
    name: "phone",
    context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    cpuSlowdown: 4,
    network: { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  },
  { name: "desktop", context: { viewport: { width: 1440, height: 900 } }, cpuSlowdown: 1, network: null },
];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function measure(browser, profile, path) {
  const context = await browser.newContext(profile.context);
  const page = await context.newPage();
  await page.addInitScript(() => {
    const v = { fcp: 0, lcp: 0, cls: 0, longTasks: [] };
    window.__vitals = v;
    const watch = (type, onEntry) => {
      new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({ type, buffered: true });
    };
    watch("paint", (e) => {
      if (e.name === "first-contentful-paint") v.fcp = e.startTime;
    });
    watch("largest-contentful-paint", (e) => {
      v.lcp = e.startTime;
    });
    watch("layout-shift", (e) => {
      if (!e.hadRecentInput) v.cls += e.value;
    });
    watch("longtask", (e) => {
      v.longTasks.push([e.startTime, e.duration]);
    });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (profile.network) await cdp.send("Network.emulateNetworkConditions", profile.network);
  if (profile.cpuSlowdown > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuSlowdown });
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500); // late shifts, late long tasks, the final largest paint
  const r = await page.evaluate(() => {
    const v = window.__vitals;
    const resources = performance.getEntriesByType("resource");
    const nav = performance.getEntriesByType("navigation")[0];
    const kb = (pick) => resources.filter(pick).reduce((a, e) => a + e.transferSize, 0) / 1024;
    const name = (e) => e.name.split("?")[0];
    return {
      fcp: v.fcp,
      lcp: v.lcp,
      cls: v.cls,
      tbt: v.longTasks.filter(([start]) => start >= v.fcp).reduce((a, [, d]) => a + Math.max(0, d - 50), 0),
      jsKb: kb((e) => name(e).endsWith(".js")),
      cssKb: kb((e) => name(e).endsWith(".css")),
      fontKb: kb((e) => /\.woff2?$/.test(name(e))),
      totalKb: (nav.transferSize + resources.reduce((a, e) => a + e.transferSize, 0)) / 1024,
      requests: resources.length + 1,
    };
  });
  await context.close();
  return r;
}

const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
console.log(`Web Vitals of ${base}, ${String(runs)} cold loads per page, medians\n`);
for (const profile of profiles) {
  console.log(`profile: ${profile.name}`);
  console.log("page       FCP ms   LCP ms   CLS      TBT ms   JS KB   CSS KB  font KB  total KB  requests");
  for (const path of paths) {
    const samples = [];
    for (let i = 0; i < runs; i++) samples.push(await measure(browser, profile, path));
    const m = (key) => median(samples.map((s) => s[key]));
    console.log(
      [
        path.padEnd(9),
        m("fcp").toFixed(0).padStart(7),
        m("lcp").toFixed(0).padStart(8),
        m("cls").toFixed(4).padStart(8),
        m("tbt").toFixed(0).padStart(8),
        m("jsKb").toFixed(0).padStart(7),
        m("cssKb").toFixed(0).padStart(8),
        m("fontKb").toFixed(0).padStart(8),
        m("totalKb").toFixed(0).padStart(9),
        m("requests").toFixed(0).padStart(9),
      ].join(" "),
    );
  }
  console.log("");
}
await browser.close();
const [l1, l5, l15] = loadavg();
console.log(`load average while measuring (1, 5, 15 minutes): ${l1.toFixed(1)}, ${l5.toFixed(1)}, ${l15.toFixed(1)} on this machine`);
