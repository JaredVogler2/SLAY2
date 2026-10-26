// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * Deployment contract with Vercel (docs/DEPLOY.md). The first production build of this repository failed at install
 * (`ERR_PNPM_UNSUPPORTED_ENGINE`: the project's Node 24 against `engines.node: 22.x` in apps/web) and the one before it
 * published nothing, so the pieces that make the default import work are pinned here instead of living in a dashboard.
 */
const root = join(__dirname, "..", "..", "..");
const read = (...parts: string[]): string => readFileSync(join(root, ...parts), "utf8");

const Manifest = z.object({
  engines: z.object({ node: z.string() }),
  scripts: z.record(z.string(), z.string()).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});
const manifest = (...parts: string[]) => Manifest.parse(JSON.parse(read(...parts, "package.json")));

const VercelConfig = z.strictObject({
  $schema: z.string().optional(),
  framework: z.string(),
  installCommand: z.string().optional(),
  buildCommand: z.string().optional(),
  outputDirectory: z.string().optional(),
});
const vercel = (...parts: string[]) =>
  VercelConfig.parse(JSON.parse(read(...parts, "vercel.json")));

describe("Vercel deployment contract", () => {
  it("pins one bounded Node major, identical in the root and in the app, and equal to the CI toolchain", () => {
    const rootNode = manifest().engines.node;
    expect(rootNode).toMatch(/^\^\d+\.\d+\.\d+$/);
    expect(manifest("apps", "web").engines.node).toBe(rootNode);
    const major = /^\^(\d+)\./.exec(rootNode)?.[1];
    expect(read(".node-version").trim()).toBe(major);
  });

  it("declares next at the root with the app's exact version, and Node resolves it from the repository root", () => {
    const appNext = manifest("apps", "web").dependencies?.next;
    expect(appNext).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest().devDependencies?.next).toBe(appNext);
    // Vercel's Next.js builder resolves `next/package.json` from the project directory, which is the repository root
    // when the project keeps its default Root Directory.
    const resolved = createRequire(join(root, "package.json")).resolve("next/package.json");
    const installed = z
      .object({ version: z.string() })
      .parse(JSON.parse(readFileSync(resolved, "utf8")));
    expect(installed.version).toBe(appNext);
  });

  it("root vercel.json builds the workspace app and publishes the .next directory of apps/web", () => {
    const config = vercel();
    expect(config.framework).toBe("nextjs");
    expect(config.installCommand).toBe("pnpm install --frozen-lockfile");
    expect(config.buildCommand).toBe("pnpm run build");
    expect(manifest().scripts?.build).toBe("pnpm --filter @slay2/web build");
    expect(config.outputDirectory).toBe("apps/web/.next");
    expect(existsSync(join(root, "apps", "web", "next.config.ts"))).toBe(true);
    expect(read("apps", "web", "next.config.ts")).not.toMatch(/\bdistDir\b/);
  });

  it("apps/web/vercel.json selects the framework when Root Directory is apps/web", () => {
    expect(vercel("apps", "web")).toMatchObject({ framework: "nextjs" });
  });

  it("leaves headers and routing to next.config.ts (one source of truth for the CSP)", () => {
    // `strictObject` above already rejects `headers`, `routes`, `rewrites`, `env`; keep the assertion explicit.
    for (const file of [["vercel.json"], ["apps", "web", "vercel.json"]]) {
      const keys = Object.keys(JSON.parse(read(...file)) as Record<string, unknown>);
      expect(
        keys.filter((k) =>
          ["headers", "routes", "rewrites", "redirects", "env", "build"].includes(k),
        ),
      ).toEqual([]);
    }
  });
});
