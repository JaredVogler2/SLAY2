import { expect, test, type Page } from "@playwright/test";

import {
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  underdocksStudy,
} from "./helpers";

/**
 * The Underdocks transfer study (ADR-064) on the pages: a row of the landing page's coverage table, a section of /methods, and one note on
 * each of the advisor's three panels for a run in Underdocks. What the pages say follows the exported data (registered and not run, or
 * tested, whichever way each test came out), so these tests read it.
 */
const data = underdocksStudy();

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
  await expect(page.getByRole("heading", { name: "Act 1 and the opening Ancient" })).toBeVisible();
}

const act = (page: Page, name: "Overgrowth" | "Underdocks") =>
  page.locator("label").filter({ hasText: new RegExp(`^${name}$`) });

test.describe("the Underdocks study", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("the landing page's coverage table says where the simulated evidence stands in Underdocks, following the exported study", async ({
    page,
  }) => {
    expect(data.registered).toBe(true);
    await page.goto("/");
    const row = page.getByRole("row", { name: /^Simulated results in Underdocks/ });
    await expect(row).toContainText("Research");
    await expect(row).toContainText("unverified against the live game");
    if (data.tests) {
      await expect(row).toContainText("tested again in Underdocks");
      await expect(row).toContainText("Nothing was fitted in Underdocks");
    } else {
      await expect(row).toContainText("has not been run yet");
      await expect(row).toContainText("measured with Act 1 in Overgrowth");
    }
  });

  test("the methods page has its section, and it says whether the tests have been run", async ({
    page,
  }) => {
    await page.goto("/methods");
    const section = page.locator("#underdocks");
    await expect(section).toBeVisible();
    await expect(
      section.getByRole("heading", {
        level: 2,
        name: "Do these results carry over to Underdocks?",
      }),
    ).toBeVisible();
    await expect(section).toContainText("A fit in Underdocks");
    await expect(section).toContainText("never compared with the live game");
    if (data.tests) {
      // the summary badge counts the tests that came out ahead ("all three ahead", "1 of 3 ahead", "0 of 3 ahead"), whichever way they came out
      await expect(section).toContainText(/ahead in Underdocks/);
      await expect(section).toContainText(/Until this study, every result on this page/);
      for (const key of ["synergy", "values", "neow"]) {
        await expect(section.locator(`#underdocks-${key}`)).toBeVisible();
      }
    } else {
      await expect(section).toContainText("registered (ADR-064), not run yet");
      await expect(section).toContainText("Not run yet.");
      await expect(section.locator("#underdocks-synergy")).toHaveCount(0);
    }
    await expectNoSeriousA11yViolations(page, "methods with the Underdocks section");
    await expectNoHorizontalOverflow(page);
  });

  test("a run in Underdocks is told what was tested, on the synergy panel and on the card-pick panel; a run in Overgrowth is not", async ({
    page,
  }) => {
    await startClass(page, "Ironclad");
    await addOffered(page, "pommel");
    await addOffered(page, "shrug");
    await addOffered(page, "inflame");
    const synergy = page.getByRole("region", { name: "Synergy of your deck" });
    const opinion = page.locator("#simulation-opinion");
    await expect(synergy).toBeVisible();
    await expect(opinion).toBeVisible();
    // Act 1 not said: no note on either panel (the card-pick panel has its quiet line about Overgrowth)
    await expect(synergy.locator("[data-underdocks-note]")).toHaveCount(0);
    await expect(opinion.locator("[data-underdocks-note]")).toHaveCount(0);

    await act(page, "Underdocks").click();
    const synergyNote = synergy.locator("[data-underdocks-note]");
    const opinionNote = opinion.locator("[data-underdocks-note]");
    await expect(synergyNote).toHaveCount(1);
    await expect(opinionNote).toHaveCount(1);
    await expect(synergyNote).toHaveAttribute(
      "data-underdocks-result",
      data.tests ? (data.tests.synergy?.verdict ?? "") : "registered",
    );
    await expect(opinionNote).toHaveAttribute(
      "data-underdocks-result",
      data.tests ? (data.tests.values?.verdict ?? "") : "registered",
    );
    for (const note of [synergyNote, opinionNote]) {
      await expect(note).toContainText(data.tests ? "In Underdocks." : "has not been run");
      await expect(note.getByRole("link", { name: "Evidence & methods" })).toHaveAttribute(
        "href",
        "/methods#underdocks",
      );
    }
    await expectNoSeriousA11yViolations(page, "advisor with the Underdocks notes");
    await expectNoHorizontalOverflow(page);

    // back to Overgrowth: the notes go
    await act(page, "Overgrowth").click();
    await expect(synergyNote).toHaveCount(0);
    await expect(opinionNote).toHaveCount(0);
  });

  // what the page may say about the opening relic follows the exported test, not the other way round (ADR-064 item 6 iii): before the
  // result the advice is as in Overgrowth; after it, a class gets a named relic in Underdocks only if the pooled test passed and the class's
  // own Underdocks games had the rule ahead, and otherwise the page says it has no tested advice
  const OFFERS: readonly (readonly [string, string, readonly [string, string, string]])[] = [
    ["Ironclad", "ironclad", ["FISHING_ROD", "WINGED_BOOTS", "SILVER_CRUCIBLE"]],
    ["Silent", "silent", ["PRECISE_SCISSORS", "STONE_HUMIDIFIER", ""]],
  ];
  for (const [label, id, [first, second, costly]] of OFFERS) {
    test(`${label}: the opening-relic advice in Underdocks follows the Underdocks test`, async ({
      page,
    }) => {
      await startClass(page, label);
      await act(page, "Underdocks").click();
      await page.getByText(/What did Neow offer\? Compare the three/).click();
      await page.getByLabel("First helpful option").selectOption(first);
      await page.getByLabel("Second helpful option").selectOption(second);
      if (costly) await page.getByLabel("Costly option").selectOption(costly);
      const neow = data.tests?.neow;
      const advised = !neow || (neow.verdict === "passed" && neow.classes[id]?.ahead === true);
      if (advised) {
        await expect(page.getByText(/would take/).first()).toBeVisible();
        await expect(page.getByText(/does not say which relic to take in Underdocks/)).toHaveCount(
          0,
        );
      } else {
        await expect(
          page.getByText(/does not say which relic to take in Underdocks/),
        ).toBeVisible();
        await expect(page.getByText(/no tested advice for/)).toBeVisible();
        await expect(page.getByText(/would take/)).toHaveCount(0);
        await expect(page.getByText("Simulated pilot’s pick")).toHaveCount(0);
      }
      await expect(page.locator("[data-underdocks-note]").first()).toBeVisible();
      await expectNoSeriousA11yViolations(page, `advisor Neow offer in Underdocks (${label})`);
      await expectNoHorizontalOverflow(page);
      // in Overgrowth the rule of ADR-055 stands, whatever the Underdocks test found
      await act(page, "Overgrowth").click();
      await expect(page.getByText(/does not say which relic to take in Underdocks/)).toHaveCount(0);
      await expect(page.locator("[data-underdocks-note]")).toHaveCount(0);
    });
  }
});
