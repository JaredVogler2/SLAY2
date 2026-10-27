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
) as {
  registered: boolean;
  tests: Record<
    string,
    { verdict: string; classes: Record<string, { ahead: boolean; behind: boolean }> }
  > | null;
};

async function addOffered(page: Page, name: string): Promise<void> {
  const box = page.getByRole("combobox", { name: /offered card/i });
  await box.fill(name);
  await box.press("Enter");
}

async function startClass(page: Page, label: string): Promise<void> {
  await page.goto("/advisor");
  await expect(async () => {
    await page.locator("label").filter({ hasText: label }).first().click({ timeout: 1000 });
    await expect(page.getByRole("heading", { name: "Your run" })).toBeVisible({ timeout: 1000 });
  }).toPass();
}
const startIronclad = (page: Page): Promise<void> => startClass(page, "Ironclad");

test.describe("the Ascension 9 study", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // what the page may say about the opening relic follows the exported test, not the other way round (ADR-058 item 5 iii): before the
  // result the advice is as at Ascension 0; after it, a class gets a named relic only if the pooled test passed and the class's own
  // Ascension 9 games had the rule ahead, and otherwise the page says it has no tested advice
  const OFFERS: readonly (readonly [string, string, readonly [string, string, string]])[] = [
    ["Ironclad", "ironclad", ["FISHING_ROD", "WINGED_BOOTS", "SILVER_CRUCIBLE"]],
    ["Silent", "silent", ["PRECISE_SCISSORS", "STONE_HUMIDIFIER", ""]],
  ];
  for (const [label, id, [first, second, costly]] of OFFERS) {
    test(`${label}: the opening-relic advice at Ascension 5 follows the Ascension 9 test`, async ({
      page,
    }) => {
      await startClass(page, label);
      await page.locator("#adv-asc").selectOption("5");
      await page.getByText(/What did Neow offer\? Compare the three/).click();
      await page.getByLabel("First helpful option").selectOption(first);
      await page.getByLabel("Second helpful option").selectOption(second);
      if (costly) await page.getByLabel("Costly option").selectOption(costly);
      const neow = data.tests?.neow;
      const advised = !neow || (neow.verdict === "passed" && neow.classes[id]?.ahead === true);
      if (advised) {
        await expect(page.getByText(/would take/).first()).toBeVisible();
        await expect(page.getByText(/does not say which relic to take at Ascension 5/)).toHaveCount(
          0,
        );
      } else {
        await expect(
          page.getByText(/does not say which relic to take at Ascension 5/),
        ).toBeVisible();
        await expect(page.getByText(/no tested advice for/)).toBeVisible();
        await expect(page.getByText(/would take/)).toHaveCount(0);
        await expect(page.getByText("Simulated pilot’s pick")).toHaveCount(0);
      }
      await expect(page.locator("[data-ascension-note]").first()).toBeVisible();
      await expectNoSeriousA11yViolations(page, `advisor Neow offer at Ascension 5 (${label})`);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("the methods page has its section, and it says whether the tests have been run", async ({
    page,
  }) => {
    expect(data.registered).toBe(true);
    await page.goto("/methods");
    const section = page.locator("#ascension");
    await expect(section).toBeVisible();
    await expect(
      section.getByRole("heading", {
        level: 2,
        name: "Do these results carry over to Ascension 9?",
      }),
    ).toBeVisible();
    await expect(section).toContainText("Ascension 10");
    await expect(section).toContainText("A fit at Ascension 9");
    if (data.tests) {
      // the summary badge counts the tests that came out ahead ("all three ahead", "1 of 3 ahead", "0 of 3 ahead"), whichever way they came out
      await expect(section).toContainText(/ahead at Ascension 9/);
      await expect(section).toContainText(/Until this study, every result on this page/);
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
