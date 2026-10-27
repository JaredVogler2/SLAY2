import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  measuredSets,
  neowInfo,
} from "./helpers";

test.describe("methods", () => {
  test("is an honest ledger: rules with evidence, verification layers, simulator results with intervals", async ({
    page,
  }) => {
    await page.goto("/methods");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ledger");
    await expect(page.getByRole("heading", { name: /Four independent layers/ })).toBeVisible();
    await expect(page.getByText("Parity with the live game unverified").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Paired comparisons" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Things this site does not know/ }),
    ).toBeVisible();

    // every batch row carries its denominator and Wilson interval
    const batches = page.getByRole("region", { name: "Simulator batches" });
    await expect(batches.getByRole("row")).not.toHaveCount(0);
    await expect(batches.getByText(/\(0\.00%–\d+\.\d+%\)/).first()).toBeVisible();
  });

  test("explains the card values with their intervals, the caveats and the pre-registered test", async ({
    page,
  }) => {
    await page.goto("/methods#card-values");
    const panel = page.locator("#card-values");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { level: 2 })).toContainText("randomised drafting");
    const sets = measuredSets();
    expect(sets.length).toBeGreaterThan(0);
    // one block per measured class, each with its own tables (the names carry the class so they stay distinguishable)
    for (const s of sets) {
      await expect(
        panel.getByRole("table", { name: `Highest measured values · ${s.label}` }),
      ).toBeVisible();
      await expect(
        panel.getByRole("table", { name: `Lowest measured values · ${s.label}` }),
      ).toBeVisible();
      await expect(
        panel.getByRole("heading", { level: 3, name: s.label, exact: true }),
      ).toBeVisible();
    }
    // the result of the held-out test is printed for every class that has had one, and only for those
    const tested = sets.filter((s) => s.validation !== null);
    expect(tested.length).toBeGreaterThan(0);
    for (const s of tested) {
      await expect(panel).toContainText(`Does acting on the ${s.label} values help?`);
    }
    await expect(panel.getByText(/Does acting on the \w+ values help\?/)).toHaveCount(
      tested.length,
    );
    await expect(panel).toContainText(/Past the Act-1 boss/);
    await expect(panel).toContainText("Simulated, not measured in the live game");
  });

  test("lists every measured opening relic with its interval, and reports the one test whichever way it came out", async ({
    page,
  }) => {
    test.skip(
      neowInfo().relics.length === 0,
      "no valid opening-relic measurement is published (the first one was void, ADR-049)",
    );
    await page.goto("/methods#opening-ancient");
    const panel = page.locator("#opening-ancient");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { level: 2 })).toContainText("opening choices");
    const { test: held, relics } = neowInfo();
    expect(relics.length).toBeGreaterThan(20);
    const table = panel.getByRole("table", { name: "Every measured relic, best first" });
    await expect(table.getByRole("row")).toHaveCount(relics.length + 1);
    await expect(table).toContainText("Silver Crucible");
    await expect(panel).toContainText("Massive Scroll, a co-op option");
    if (held === null) {
      await expect(panel).toContainText("has not been run");
    } else {
      await expect(
        panel.getByRole("heading", { level: 3, name: "The one held-out test" }),
      ).toBeVisible();
      await expect(panel).toContainText(
        held.passed ? "passed its test, in simulation" : "measurement only",
      );
      await expect(panel.getByRole("table", { name: /^By class/ })).toBeVisible();
    }
  });

  test("reports the synergy reading with its intervals and its limits, and the state of the registered test", async ({
    page,
  }) => {
    const study = JSON.parse(
      readFileSync(join(__dirname, "..", "src", "content", "synergy.generated.json"), "utf8"),
    ) as {
      b1: { bossFights: number; cohorts: unknown[]; mechanics: { rows: unknown[] } | null } | null;
      b2: { verdict: string } | null;
    };
    test.skip(study.b1 === null, "no synergy reading is exported");
    await page.goto("/methods#synergy");
    const panel = page.locator("#synergy");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { level: 2 })).toContainText("synergy parts");
    await expect(panel).toContainText(
      `${(study.b1?.bossFights ?? 0).toLocaleString("en-US")} simulated runs`,
    );
    const tiles = panel.getByRole("list", {
      name: "Result of the exploratory reading of the synergy parts",
    });
    await expect(tiles.getByRole("listitem")).toHaveCount(4);
    await expect(tiles).toContainText("95 %");
    const table = panel.getByRole("table", { name: /By class and seed set/ });
    await expect(table.getByRole("row")).toHaveCount((study.b1?.cohorts.length ?? 0) + 1);
    await expect(panel).toContainText("The exploratory readings above, not the registered test");
    await expect(panel).toContainText("Simulated, not measured in the live game");
    await expect(
      panel.getByRole("heading", { level: 3, name: "The registered test" }),
    ).toBeVisible();
    if (study.b2 === null) {
      await expect(panel).toContainText("It has not been run on its held-out seeds");
      await expect(panel).toContainText("whether the readings themselves hold at the game's HP");
    } else {
      const said = {
        ahead: "adding the synergy term improved what the heuristic index picks",
        "not-shown": "does not show that the term makes no difference",
        behind: "made the simulated picks worse",
      }[study.b2.verdict];
      await expect(panel).toContainText(said ?? "no such verdict");
      await expect(panel).not.toContainText("It has not been run on its held-out seeds");
    }
    if (study.b1?.mechanics) {
      await panel.getByText("Which needs the runs support, one mechanic at a time").click();
      const mechanics = panel.getByRole("table", { name: /Worth of a point of each mechanic/ });
      await expect(mechanics.getByRole("row")).toHaveCount(study.b1.mechanics.rows.length + 2);
    }
    await panel.getByText("How the readings changed the tags").click();
    await expect(panel).toContainText("the figures flatter them");
  });

  test("every rule is a deep-linkable anchor", async ({ page }) => {
    await page.goto("/methods#CARD-8");
    const row = page.locator("#CARD-8");
    await expect(row).toBeVisible();
    await expect(row).toContainText("CARD-8");
  });

  test("meets layout and accessibility basics", async ({ page }) => {
    await page.goto("/methods");
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, "methods");
  });
});

test.describe("about", () => {
  test("states what the site is, is not, and what is undecided", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("independent fan project");
    await expect(page.getByText(/not affiliated/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /What stays in your browser/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /still undecided/ })).toBeVisible();
    await expect(page.getByText("No public contact channel has been configured")).toBeVisible();
  });

  test("meets layout and accessibility basics", async ({ page }) => {
    await page.goto("/about");
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, "about");
  });
});

test.describe("not found", () => {
  test("unknown paths answer 404 with a helpful, accessible page", async ({ page }) => {
    const response = await page.goto("/definitely-not-a-page");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("not on the map");
    await expect(
      page.getByRole("list", { name: "Where to go instead" }).getByRole("link"),
    ).toHaveCount(3);
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, "not-found");
  });
});

test.describe("navigation", () => {
  test("the header reaches every top-level page", async ({ page, isMobile }) => {
    await page.goto("/");
    for (const [name, heading] of [
      ["Advisor", /Take it, or skip it/i],
      ["Odds", /Exact odds/i],
      ["Codex", /Card codex/i],
      ["Methods", /ledger/i],
    ] as const) {
      const link = page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name });
      await expect(link, `${name} link${isMobile ? " (mobile)" : ""}`).toBeVisible();
      await link.click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
      await page.goto("/");
    }
  });
});
