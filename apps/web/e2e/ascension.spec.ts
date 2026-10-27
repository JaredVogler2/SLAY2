import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations } from "./helpers";

/**
 * The Ascension 9 study (ADR-058) on the pages: a section of /methods, and one line on each of the advisor's three panels for a run above
 * Ascension 0. What the pages say follows the exported data (registered and not run, or tested), so these tests read it.
 */
const data = JSON.parse(
  readFileSync(join(__dirname, "..", "src", "content", "ascension.generated.json"), "utf8"),
) as { registered: boolean; tests: Record<string, { verdict: string }> | null };

async function addOffered(page: Page, name: string): Promise<void> {
  const box = page.getByRole("combobox", { name: /offered card/i });
  await box.fill(name);
  await box.press("Enter");
}

async function startIronclad(page: Page): Promise<void> {
  await page.goto("/advisor");
  await expect(async () => {
    await page.locator("label").filter({ hasText: "Ironclad" }).first().click({ timeout: 1000 });
    await expect(page.getByRole("heading", { name: "Your run" })).toBeVisible({ timeout: 1000 });
  }).toPass();
}

test.describe("the Ascension 9 study", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("the methods page has its section, and it says whether the tests have been run", async ({
    page,
  }) => {
    expect(data.registered).toBe(true);
    await page.goto("/methods");
    const section = page.locator("#ascension");
    await expect(section).toBeVisible();
    await expect(
      section.getByRole("heading", { level: 2, name: "Do these results hold above Ascension 0?" }),
    ).toBeVisible();
    await expect(section).toContainText("Ascension 10");
    await expect(section).toContainText("A fit at Ascension 9");
    if (data.tests) {
      await expect(section).toContainText(/hold at Ascension 9/);
      for (const key of ["synergy", "values", "neow"]) {
        await expect(section.locator(`#ascension-${key}`)).toBeVisible();
      }
    } else {
      await expect(section).toContainText("registered (ADR-058), not run yet");
      await expect(section).toContainText("Not run yet.");
    }
    await expectNoSeriousA11yViolations(page, "methods with the Ascension section");
    await expectNoHorizontalOverflow(page);
  });

  test("a run above Ascension 0 is told what was tested, on the three panels; a run at 0 is not", async ({
    page,
  }) => {
    await startIronclad(page);
    await addOffered(page, "pommel");
    await addOffered(page, "shrug");
    await addOffered(page, "inflame");
    const synergy = page.getByRole("region", { name: "Synergy of your deck" });
    const opinion = page.locator("#simulation-opinion");
    await expect(synergy).toBeVisible();
    await expect(opinion).toBeVisible();
    // Ascension 0 (the default): no note anywhere
    await expect(page.locator("[data-ascension-note]")).toHaveCount(0);

    await page.locator("#adv-asc").selectOption("5");
    await expect(synergy.locator("[data-ascension-note]")).toHaveCount(1);
    await expect(opinion.locator("[data-ascension-note]")).toHaveCount(1);
    for (const note of [
      synergy.locator("[data-ascension-note]"),
      opinion.locator("[data-ascension-note]"),
    ]) {
      await expect(note).toContainText("Your run is at Ascension 5");
      await expect(note).toContainText(data.tests ? "Ascension 9" : "measured at Ascension 0 only");
      await expect(note.getByRole("link", { name: "Evidence & methods" })).toHaveAttribute(
        "href",
        "/methods#ascension",
      );
    }
    await expectNoSeriousA11yViolations(page, "advisor with the Ascension notes");
    await expectNoHorizontalOverflow(page);

    // Ascension 10 adds a second boss the simulator never plays, and says so
    await page.locator("#adv-asc").selectOption("10");
    await expect(synergy.locator("[data-ascension-note]")).toContainText(
      "second boss that the simulator never plays (gap G1)",
    );
  });
});
