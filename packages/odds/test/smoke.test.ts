import { expect, test } from "vitest";

import { ODDS_PACKAGE } from "../src/index";

test("package loads", () => {
  expect(ODDS_PACKAGE).toBe("@slay2/odds");
});
