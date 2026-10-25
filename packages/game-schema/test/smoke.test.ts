import { expect, test } from "vitest";

import { GAME_SCHEMA_PACKAGE } from "../src/index";

test("package loads", () => {
  expect(GAME_SCHEMA_PACKAGE).toBe("@slay2/game-schema");
});
