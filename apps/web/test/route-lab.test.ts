import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MAX_ROUTE_ROOMS, ROUTE_ROOMS } from "@slay2/odds";

import {
  EXAMPLE_ROUTES,
  describeRoute,
  formatRoute,
  formatUnknownHistory,
  parseRoute,
  parseRouteParam,
  parseUnknownHistory,
  parseUnknownParam,
} from "@/lib/route-lab";

describe("route shorthand", () => {
  it("reads letters, ignores separators and accepts Q for a “?”", () => {
    const got = parseRoute("m ? E, r-s.T q");
    expect(got).toEqual({
      ok: true,
      rooms: ["monster", "unknown", "elite", "rest", "shop", "treasure", "unknown"],
    });
    expect(parseRoute("")).toEqual({ ok: true, rooms: [] });
  });

  it("names the first character that is not a room", () => {
    const got = parseRoute("ME?X");
    expect(got.ok).toBe(false);
    expect(!got.ok && got.error).toContain("“X”");
  });

  it("refuses a route longer than an act", () => {
    expect(parseRoute("M".repeat(MAX_ROUTE_ROOMS)).ok).toBe(true);
    expect(parseRoute("M".repeat(MAX_ROUTE_ROOMS + 1)).ok).toBe(false);
  });

  it("round-trips any route through its compact form", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...ROUTE_ROOMS), { maxLength: MAX_ROUTE_ROOMS }),
        (rooms) => {
          expect(parseRoute(formatRoute(rooms))).toEqual({ ok: true, rooms });
        },
      ),
    );
  });

  it("a link parameter that does not parse is ignored instead of crashing the page", () => {
    expect(parseRouteParam("M?ER")).toBe("M?ER");
    expect(parseRouteParam("m e")).toBe("ME");
    expect(parseRouteParam("<script>")).toBeUndefined();
    expect(parseRouteParam("M".repeat(500))).toBeUndefined();
  });

  it("the example shows two different ways through the same stretch", () => {
    expect(EXAMPLE_ROUTES[0]).not.toBe(EXAMPLE_ROUTES[1]);
    for (const route of EXAMPLE_ROUTES) {
      expect(parseRoute(route).ok).toBe(true);
    }
  });

  it("describes a route for a screen reader", () => {
    expect(describeRoute([])).toBe("no rooms yet");
    expect(describeRoute(["monster", "unknown", "rest"])).toBe("Monster, “?” room, Rest site");
  });
});

describe("“?” history shorthand", () => {
  it("round-trips outcomes and unnoted rooms", () => {
    const h = parseUnknownHistory("efstx");
    expect(h).toEqual([
      { outcome: "event" },
      { outcome: "fight" },
      { outcome: "shop" },
      { outcome: "treasure" },
      {},
    ]);
    expect(formatUnknownHistory(h ?? [])).toBe("efstx");
  });

  it("refuses anything else, and an act's worth at most", () => {
    expect(parseUnknownHistory("efz")).toBeUndefined();
    expect(parseUnknownParam("e".repeat(20))).toBe("e".repeat(20));
    expect(parseUnknownParam("e".repeat(21))).toBeUndefined();
    expect(parseUnknownParam("EF")).toBe("ef");
  });
});
