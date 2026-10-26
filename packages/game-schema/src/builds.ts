/**
 * Game builds SLAY2 knows about. Rules are pinned per build (ADR-014): an unsupported build is refused, never
 * silently mapped to a supported one. Facts: docs/game/MECHANICS-COVERAGE.md section 10.
 */

export const BUILD_IDS = ["sts2-main-0.107.1", "sts2-beta-0.111.0"] as const;
export type BuildId = (typeof BUILD_IDS)[number];

/** The only build whose rules have been verified. */
export const SUPPORTED_BUILD_ID: BuildId = "sts2-main-0.107.1";

export interface BuildInfo {
  readonly id: BuildId;
  readonly channel: "main" | "beta";
  /** Game version string as shown by Mega Crit's patch notes. */
  readonly version: string;
  readonly steamBuildId: string;
  /** Release date of the patch (ISO date). */
  readonly releasedOn: string;
  readonly support: "supported" | "unsupported";
  /** Why the build is unsupported (shown to users). */
  readonly reason?: string;
  readonly maxAscension: 10;
  readonly actCount: 3;
}

export const BUILDS: Readonly<Record<BuildId, BuildInfo>> = {
  "sts2-main-0.107.1": {
    id: "sts2-main-0.107.1",
    channel: "main",
    version: "0.107.1",
    steamBuildId: "23811903",
    releasedOn: "2026-06-18",
    support: "supported",
    maxAscension: 10,
    actCount: 3,
  },
  "sts2-beta-0.111.0": {
    id: "sts2-beta-0.111.0",
    channel: "beta",
    version: "0.111.0",
    steamBuildId: "24724944",
    releasedOn: "2026-08-13",
    support: "unsupported",
    reason:
      "Beta rules are not verified. Known differences from main include card rarities and the White Beast Statue potion interaction; pools and odds are build-specific.",
    maxAscension: 10,
    actCount: 3,
  },
};

export class UnsupportedBuildError extends Error {
  readonly code = "unsupported_build" as const;

  constructor(
    readonly build: string,
    readonly detail: string,
  ) {
    super(`Unsupported build ${build}: ${detail}`);
    this.name = "UnsupportedBuildError";
  }
}

export function isBuildId(x: unknown): x is BuildId {
  return typeof x === "string" && (BUILD_IDS as readonly string[]).includes(x);
}

/** Returns the build info if (and only if) its rules are verified; throws `UnsupportedBuildError` otherwise. */
export function requireSupportedBuild(build: string): BuildInfo {
  if (!isBuildId(build)) {
    throw new UnsupportedBuildError(build, `unknown build; supported: ${SUPPORTED_BUILD_ID}`);
  }
  const info = BUILDS[build];
  if (info.support !== "supported") {
    throw new UnsupportedBuildError(build, info.reason ?? "rules not verified for this build");
  }
  return info;
}
