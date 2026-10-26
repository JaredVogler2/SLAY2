#!/usr/bin/env node
// Is the build SLAY2 supports still the newest one Mega Crit has announced? (prompt 10: Slay the Spire 2 is in Early
// Access, so a model or a calculator that was right last month can be wrong after a patch.)
//
// Reads the official announcements of Slay the Spire 2 from Steam's public news API (appid 2868840, the
// `steam_community_announcements` feed: only posts Mega Crit made itself), takes the version from titles such as
// "Beta Patch Notes - v0.111.0" or "Major Update #2 - v0.107.1", and compares them with the builds in
// packages/game-schema/src/builds.ts:
//
//   exit 0  current        no main-channel version newer than the supported build was announced
//           newer-beta     a beta newer than the newest known one exists (a warning: the beta stays unsupported)
//   exit 1  STALE          a main-channel version newer than the supported build was announced: the site's rules are
//                          for an older patch (ADR-014: never silently apply them to the new one); re-verify, then update
//   exit 2  could not check the feed was unreachable or had no official posts (never read as "current")
//
// A scheduled workflow runs this weekly (.github/workflows/patch-watch.yml) and the failure is the notification. It runs
// in CI, never in a request to the website.
//
//   node scripts/patch-watch.mjs                       check the live feed
//   node scripts/patch-watch.mjs --fixture file.json   check a saved response (tests)
//   node scripts/patch-watch.mjs --print-known         print the builds read from builds.ts, as JSON
//   node scripts/patch-watch.mjs --json                machine-readable result
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.SLAY2_ROOT
  ? resolve(process.env.SLAY2_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_ID = 2868840;
const FEED_URL =
  `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${String(APP_ID)}` +
  "&count=40&maxlength=1&feeds=steam_community_announcements&format=json";
const OFFICIAL_FEED = "steam_community_announcements";

/** "0.107.1" -> [0, 107, 1]; comparison is numeric, field by field. */
export function parseVersion(v) {
  return v.split(".").map((n) => Number.parseInt(n, 10));
}

export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** The builds the repository knows and the one it supports, read from the TypeScript source of truth. */
export function readKnownBuilds(buildsTs) {
  const idsLine = /export const BUILD_IDS\s*=\s*\[([^\]]*)\]/.exec(buildsTs);
  const supportedLine = /export const SUPPORTED_BUILD_ID[^=]*=\s*"([^"]+)"/.exec(buildsTs);
  if (!idsLine?.[1] || !supportedLine?.[1]) {
    throw new Error("packages/game-schema/src/builds.ts no longer has BUILD_IDS / SUPPORTED_BUILD_ID in the expected form");
  }
  const parse = (id) => {
    const m = /^sts2-(main|beta)-(\d+\.\d+\.\d+)$/.exec(id);
    if (!m) throw new Error(`unrecognised build id ${id}`);
    return { id, channel: m[1], version: m[2] };
  };
  const builds = [...idsLine[1].matchAll(/"([^"]+)"/g)].map((m) => parse(m[1]));
  return { builds, supported: parse(supportedLine[1]) };
}

/** An official post that announces a version: { version, channel, title, date, url }; anything else is null. */
export function classify(item) {
  if (item.feedname !== OFFICIAL_FEED) return null;
  const m = /\bv(\d+\.\d+\.\d+)\b/i.exec(item.title ?? "");
  if (!m?.[1]) return null;
  return {
    version: m[1],
    channel: /\bbeta\b/i.test(item.title) ? "beta" : "main",
    title: item.title,
    date: new Date(item.date * 1000).toISOString().slice(0, 10),
    url: item.url,
  };
}

export function assess(known, newsitems) {
  const official = newsitems.filter((i) => i.feedname === OFFICIAL_FEED);
  const announced = official.map(classify).filter((a) => a !== null);
  const newest = (list) => list.reduce((best, a) => (best && compareVersions(best.version, a.version) >= 0 ? best : a), null);
  const knownBeta = newest(known.builds.filter((b) => b.channel === "beta"));
  const newerMain = announced.filter((a) => a.channel === "main" && compareVersions(a.version, known.supported.version) > 0);
  const newerBeta = knownBeta
    ? announced.filter((a) => a.channel === "beta" && compareVersions(a.version, knownBeta.version) > 0)
    : [];
  // no post that names a version at all (an empty feed, or a change in how the posts are titled) is a blind check, not a clean one
  const status = announced.length === 0 ? "unchecked" : newerMain.length > 0 ? "STALE" : newerBeta.length > 0 ? "newer-beta" : "current";
  return {
    status,
    supported: known.supported.version,
    knownBeta: knownBeta?.version ?? null,
    officialPosts: official.length,
    versionPosts: announced.length,
    newestMain: newest(announced.filter((a) => a.channel === "main")),
    newestBeta: newest(announced.filter((a) => a.channel === "beta")),
    newerMain,
    newerBeta,
  };
}

export function describe(r) {
  const line = (a) => `${a.version} (${a.channel}, ${a.date}): ${a.title} ${a.url}`;
  const out = [
    `Supported build: ${r.supported} (main). Newest beta known to the repository: ${r.knownBeta ?? "none"}.`,
    `Read ${String(r.officialPosts)} official announcements, ${String(r.versionPosts)} of which name a version.`,
  ];
  if (r.status === "unchecked") {
    out.push("UNCHECKED: no official post names a version (an empty feed, or the titles changed form), so nothing can be said about newer builds.");
  } else if (r.status === "STALE") {
    out.push(
      `STALE: a main-channel build newer than ${r.supported} was announced. The rules on the site are for ${r.supported}; ` +
        "re-verify the changed rules, add the build to packages/game-schema/src/builds.ts and re-run the calculators' golden tests before anything is called supported.",
      ...r.newerMain.map((a) => `  - ${line(a)}`),
    );
  } else {
    out.push(`No main-channel build newer than ${r.supported} has been announced (newest main post: ${r.newestMain ? line(r.newestMain) : "none"}).`);
  }
  if (r.newerBeta.length > 0) {
    out.push(
      `A beta newer than ${r.knownBeta} exists (it stays unsupported; the site refuses beta rules until they are verified):`,
      ...r.newerBeta.map((a) => `  - ${line(a)}`),
    );
  }
  return out.join("\n");
}

async function fetchFeed() {
  let lastError = "no attempt";
  for (const wait of [0, 3000, 8000]) {
    if (wait > 0) await new Promise((done) => setTimeout(done, wait));
    try {
      const res = await fetch(FEED_URL, {
        headers: { "user-agent": "slay2-patch-watch (+https://github.com/JaredVogler2/SLAY2)" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        lastError = `HTTP ${String(res.status)}`;
        continue;
      }
      return await res.json();
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`could not read the Steam news feed: ${lastError}`);
}

async function main() {
  const args = process.argv.slice(2);
  const known = readKnownBuilds(readFileSync(join(root, "packages", "game-schema", "src", "builds.ts"), "utf8"));
  if (args.includes("--print-known")) {
    console.log(JSON.stringify(known));
    return 0;
  }
  const at = args.indexOf("--fixture");
  let feed;
  try {
    feed = at >= 0 ? JSON.parse(readFileSync(resolve(args[at + 1] ?? ""), "utf8")) : await fetchFeed();
  } catch (e) {
    console.error(`UNCHECKED: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
  const items = feed?.appnews?.newsitems;
  if (!Array.isArray(items)) {
    console.error("UNCHECKED: the response has no appnews.newsitems");
    return 2;
  }
  const result = assess(known, items);
  const text = describe(result);
  if (result.status === "unchecked") {
    console.error(text);
    return 2;
  }
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### patch-watch: ${result.status}\n\n\`\`\`\n${text}\n\`\`\`\n`);
  }
  if (process.env.GITHUB_ACTIONS === "true") {
    if (result.status === "STALE") console.log(`::error title=A newer Slay the Spire 2 build was announced::${result.newerMain.map((a) => a.title).join("; ")}`);
    if (result.status === "newer-beta") console.log(`::warning title=A newer Slay the Spire 2 beta was announced::${result.newerBeta.map((a) => a.title).join("; ")}`);
  }
  return result.status === "STALE" ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
