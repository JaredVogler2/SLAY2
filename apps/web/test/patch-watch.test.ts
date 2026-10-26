// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BUILD_IDS, BUILDS, SUPPORTED_BUILD_ID } from "@slay2/game-schema";
import { describe, expect, it } from "vitest";

/**
 * `scripts/patch-watch.mjs` (ADR-047) is the answer to "what if a patch lands and nobody notices": a weekly job compares
 * the official Steam announcements with the builds in builds.ts. These tests run it on a saved response (the real feed of
 * 2026-10-26, titles only) and on copies with one post added, so that "current", "stale" and "could not check" are each
 * shown to be what the script says, and so that its reading of builds.ts cannot drift from the TypeScript.
 */
const repo = join(__dirname, "..", "..", "..");
const script = join(repo, "scripts", "patch-watch.mjs");
const fixture = join(repo, "scripts", "fixtures", "steam-news-2026-10-26.json");

interface Feed {
  appnews: { appid: number; newsitems: Record<string, unknown>[] };
}

function run(args: string[]) {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_ACTIONS: "", GITHUB_STEP_SUMMARY: "" },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

function withPost(post: Record<string, unknown> | null, official = true): string {
  const feed = JSON.parse(readFileSync(fixture, "utf8")) as Feed;
  if (post) {
    feed.appnews.newsitems.unshift({
      gid: "1",
      url: "https://example.invalid/post",
      date: 1793000000,
      feedname: official ? "steam_community_announcements" : "PCGamesN",
      ...post,
    });
  }
  const dir = mkdtempSync(join(tmpdir(), "slay2-patch-watch-"));
  const file = join(dir, "feed.json");
  writeFileSync(file, JSON.stringify(feed), "utf8");
  return file;
}

describe("patch-watch", () => {
  it("reads the builds from builds.ts exactly as the TypeScript declares them", () => {
    const known = JSON.parse(run(["--print-known"]).out) as {
      builds: { id: string; channel: string; version: string }[];
      supported: { id: string };
    };
    expect(known.builds.map((b) => b.id)).toEqual([...BUILD_IDS]);
    expect(known.supported.id).toBe(SUPPORTED_BUILD_ID);
    for (const b of known.builds) {
      const info = BUILDS[b.id as keyof typeof BUILDS];
      expect([b.channel, b.version]).toEqual([info.channel, info.version]);
    }
  });

  it("finds the supported build current in the real feed of 2026-10-26", () => {
    const r = run(["--fixture", fixture]);
    expect(r.status).toBe(0);
    expect(r.out).toContain("Supported build: 0.107.1 (main)");
    expect(r.out).toContain("No main-channel build newer than 0.107.1 has been announced");
    expect(r.out).toContain("Major Update #2 - v0.107.1");
    expect(r.out).not.toContain("STALE");
  });

  it("fails, naming the post, when a newer main build is announced", () => {
    for (const title of ["Major Update #3 - v0.108.0", "Hotfix Patch Notes - v0.107.2"]) {
      const r = run(["--fixture", withPost({ title })]);
      expect(r.status, title).toBe(1);
      expect(r.out).toContain("STALE");
      expect(r.out).toContain(title);
    }
  });

  it("treats a beta that was promoted to main as a newer main build", () => {
    expect(run(["--fixture", withPost({ title: "Major Update #3 - v0.111.0" })]).status).toBe(1);
  });

  it("warns, and passes, when only a newer beta exists", () => {
    const r = run(["--fixture", withPost({ title: "Beta Patch Notes - v0.112.0" })]);
    expect(r.status).toBe(0);
    expect(r.out).toContain("A beta newer than 0.111.0 exists");
    expect(r.out).toContain("it stays unsupported");
  });

  it("compares versions as numbers, not as text", () => {
    expect(run(["--fixture", withPost({ title: "Hotfix Patch Notes - v0.1000.0" })]).status).toBe(
      1,
    );
    expect(run(["--fixture", withPost({ title: "Hotfix Patch Notes - v0.99.9" })]).status).toBe(0);
  });

  it("ignores third-party coverage and posts that name no version", () => {
    expect(
      run(["--fixture", withPost({ title: "A huge update arrives: v0.200.0" }, false)]).status,
    ).toBe(0);
    expect(run(["--fixture", withPost({ title: "The Neowsletter - November 2026" })]).status).toBe(
      0,
    );
  });

  it("never reads a feed it could not use as 'current'", () => {
    const dir = mkdtempSync(join(tmpdir(), "slay2-patch-watch-"));
    const empty = join(dir, "empty.json");
    writeFileSync(empty, JSON.stringify({ appnews: { appid: 1, newsitems: [] } }), "utf8");
    const nonsense = join(dir, "nonsense.json");
    writeFileSync(nonsense, "{ not json", "utf8");
    const untitled = join(dir, "untitled.json"); // official posts exist, but none names a version: a blind check
    writeFileSync(
      untitled,
      JSON.stringify({
        appnews: {
          appid: 1,
          newsitems: [
            {
              title: "The Neowsletter",
              feedname: "steam_community_announcements",
              date: 1,
              url: "x",
            },
          ],
        },
      }),
      "utf8",
    );
    const wrongShape = join(dir, "shape.json");
    writeFileSync(wrongShape, JSON.stringify({ error: "forbidden" }), "utf8");
    for (const file of [empty, untitled, nonsense, wrongShape, join(dir, "missing.json")]) {
      const r = run(["--fixture", file]);
      expect(r.status, file).toBe(2);
      expect(r.err, file).toContain("UNCHECKED");
    }
  });
});
