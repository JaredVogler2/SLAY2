import { describe, expect, it } from "vitest";

import {
  ACT_INDICES,
  ASCENSION_EFFECTS,
  AscensionSchema,
  BUILDS,
  CHARACTER_IDS,
  ErrorEnvelopeSchema,
  MAX_ASCENSION,
  SUPPORTED_BUILD_ID,
  UnsupportedBuildError,
  isBuildId,
  requireSupportedBuild,
} from "../src/index";

describe("build registry", () => {
  it("supports exactly one build: main v0.107.1", () => {
    const supported = Object.values(BUILDS).filter((b) => b.support === "supported");
    expect(supported.map((b) => b.id)).toEqual(["sts2-main-0.107.1"]);
    expect(requireSupportedBuild(SUPPORTED_BUILD_ID).steamBuildId).toBe("23811903");
  });

  it("refuses beta and unknown builds instead of falling back", () => {
    expect(() => requireSupportedBuild("sts2-beta-0.111.0")).toThrow(UnsupportedBuildError);
    expect(() => requireSupportedBuild("sts2-main-0.999.0")).toThrow(UnsupportedBuildError);
    expect(() => requireSupportedBuild("")).toThrow(/unknown build/);
  });

  it("type-guards build ids", () => {
    expect(isBuildId("sts2-main-0.107.1")).toBe(true);
    expect(isBuildId("sts1")).toBe(false);
    expect(isBuildId(7)).toBe(false);
  });
});

describe("STS2 is not STS1", () => {
  it("has five characters, three acts and a maximum ascension of 10", () => {
    expect(CHARACTER_IDS).toHaveLength(5);
    expect(CHARACTER_IDS).not.toContain("WATCHER");
    expect(ACT_INDICES).toEqual([0, 1, 2]);
    expect(MAX_ASCENSION).toBe(10);
    expect(ASCENSION_EFFECTS.map((e) => e.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("rejects A11-A20 and non-integers", () => {
    expect(AscensionSchema.safeParse(10).success).toBe(true);
    expect(AscensionSchema.safeParse(11).success).toBe(false);
    expect(AscensionSchema.safeParse(20).success).toBe(false);
    expect(AscensionSchema.safeParse(-1).success).toBe(false);
    expect(AscensionSchema.safeParse(2.5).success).toBe(false);
  });
});

describe("error envelope", () => {
  it("accepts the documented shape", () => {
    const ok = ErrorEnvelopeSchema.safeParse({
      error: {
        code: "unsupported_build",
        message: "nope",
        details: [{ path: "build", message: "beta" }],
      },
    });
    expect(ok.success).toBe(true);
    expect(ErrorEnvelopeSchema.safeParse({ error: { code: "wat", message: "x" } }).success).toBe(
      false,
    );
  });
});
