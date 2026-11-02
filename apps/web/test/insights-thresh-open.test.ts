import { afterEach, describe, expect, it, vi } from "vitest";

import { openQuestions } from "@/lib/insights-content";
import type * as ThreshModule from "@/lib/thresh";
import { nextStep, resultLine, threshData, type ThreshVerdict } from "@/lib/thresh";

import { PEAK_NETS, threshFixture } from "./fixtures/thresh-test";

vi.mock("@/lib/thresh", async (importOriginal) => {
  const actual = await importOriginal<typeof ThreshModule>();
  return { ...actual, threshData: vi.fn(actual.threshData) };
});

/**
 * The open question "what wins a run" at every stage of the threshold study (ADR-062) and for every way its replication can come out: the page reads the study through
 * `threshData()`, so the stage is injected here; the fixtures are consistent made-up numbers, not simulations.
 */
const later = () => {
  const q = openQuestions().find((x) => x.id === "later");
  if (!q) throw new Error("the open question about winning is missing");
  return q;
};

afterEach(() => {
  vi.mocked(threshData).mockReset();
});

describe("the open question about winning, by the stage of the threshold study", () => {
  it("says nothing about the study before it is registered", () => {
    vi.mocked(threshData).mockReturnValue(null);
    expect(later().why).not.toMatch(/ADR-062/);
    expect(later().first).not.toMatch(/ADR-062 (did not|contradicted)/);
  });

  it("says that it is registered and has no result, and keeps the acts study's next step that names it", () => {
    vi.mocked(threshData).mockReturnValue(threshFixture({ stage: "registered" }));
    expect(later().why).toMatch(/\(ADR-062\) repeats the Act-2 test on seeds nobody has played/);
    expect(later().why).toMatch(/registered before any of its games/);
    expect(later().first).toMatch(/the next registered study, ADR-062, repeats the Act-2 test/);
  });

  it("says that the development screen has been read and the held-out games are not finished", () => {
    vi.mocked(threshData).mockReturnValue(threshFixture({ stage: "screened" }));
    expect(later().why).toMatch(/its development screen has been read/);
    expect(later().why).toMatch(/no result yet/);
    expect(later().first).toMatch(/the next registered study, ADR-062, repeats the Act-2 test/);
  });

  it("says what the screen did: no other threshold was tested, or the one it sent forward", () => {
    vi.mocked(threshData).mockReturnValue(
      threshFixture({ stage: "tested", verdicts: { T1: "passed" } }),
    );
    expect(later().why).toMatch(
      /Its development screen advanced no other threshold, so none was tested on held-out seeds\./,
    );
    vi.mocked(threshData).mockReturnValue(
      threshFixture({
        stage: "tested",
        nets: PEAK_NETS,
        verdicts: { T1: "passed", T2: "passed", T3: "passed" },
      }),
    );
    expect(later().why).toMatch(/Its development screen sent the threshold 0\.3 forward as well\./);
    expect(later().why).not.toMatch(/advanced no other threshold/);
  });

  it.each<ThreshVerdict>(["passed", "not-shown", "reversed"])(
    "reads the result and names the next step when the replication is %s",
    (verdict) => {
      const d = threshFixture({ stage: "tested", verdicts: { T1: verdict } });
      vi.mocked(threshData).mockReturnValue(d);
      const results = d.tests?.results ?? {};
      expect(later().why).toContain(resultLine(results));
      expect(later().first).toBe(nextStep(results));
      expect(later().first).not.toMatch(/the next registered study/);
      expect(later().why).not.toMatch(/there is no result yet/);
    },
  );

  it("names a pass of the screen's choice beside the replication when T2 passed", () => {
    const d = threshFixture({
      stage: "tested",
      nets: PEAK_NETS,
      verdicts: { T1: "not-shown", T2: "passed", T3: "not-shown" },
    });
    vi.mocked(threshData).mockReturnValue(d);
    expect(later().first).toMatch(
      /The development screen's choice, the threshold 0\.3, also won more games than the baseline/,
    );
    expect(later().first).toMatch(/did not show the Act-2 result of ADR-061 again/);
  });
});
