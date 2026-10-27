import { RELIC_CATALOG } from "@slay2/game-data";
import { describe, expect, it } from "vitest";

import {
  MAX_RELICS,
  newRun,
  parseRunState,
  resetToStart,
  withCharacter,
  withRelic,
  withoutRelic,
} from "../src/lib/run-state";

describe("the relics of a run", () => {
  it("start empty, are added once each by catalog id and removed again", () => {
    const run = newRun("ironclad");
    expect(run.relics).toEqual([]);
    const one = withRelic(run, "VAJRA");
    expect(one.relics).toEqual(["VAJRA"]);
    expect(withRelic(one, "VAJRA")).toBe(one);
    expect(withRelic(one, "NOT_A_RELIC")).toBe(one);
    const two = withRelic(one, "ANCHOR");
    expect(two.relics).toEqual(["VAJRA", "ANCHOR"]);
    expect(withoutRelic(two, "VAJRA").relics).toEqual(["ANCHOR"]);
    expect(withoutRelic(two, "KUNAI")).toBe(two);
  });

  it("stop at the limit", () => {
    let run = newRun("ironclad");
    for (const relic of RELIC_CATALOG.relics.slice(0, MAX_RELICS + 10)) {
      run = withRelic(run, relic.id);
    }
    expect(run.relics).toHaveLength(MAX_RELICS);
    expect(withRelic(run, RELIC_CATALOG.relics[MAX_RELICS + 20]?.id ?? "VAJRA")).toBe(run);
  });

  it("do not follow the run to another class, and a restart from the opening clears them", () => {
    const held = withRelic(newRun("ironclad"), "VAJRA");
    expect(withCharacter(held, "silent").relics).toEqual([]);
    expect(resetToStart(held).relics).toEqual([]);
  });

  it("are saved, read back, and absent in a save from before relics existed (none)", () => {
    const held = withRelic(newRun("defect"), "DATA_DISK");
    const back = parseRunState(JSON.stringify(held));
    expect(back.ok && back.state.relics).toEqual(["DATA_DISK"]);
    const { relics: _omit, ...old } = held;
    const parsedOld = parseRunState(JSON.stringify(old));
    expect(parsedOld.ok && parsedOld.state.relics).toEqual([]);
  });

  it("refuse an unknown relic id in an imported file and read a repeated id once", () => {
    const held = newRun("silent");
    const bad = parseRunState(JSON.stringify({ ...held, relics: ["VAJRA", "NOT_A_RELIC"] }));
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error).toContain("relics");
    const twice = parseRunState(JSON.stringify({ ...held, relics: ["VAJRA", "VAJRA"] }));
    expect(twice.ok && twice.state.relics).toEqual(["VAJRA"]);
  });
});
