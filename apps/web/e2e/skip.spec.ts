import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations } from "./helpers";

/**
 * The price of a slot and its registered simulated check (ADR-065). Until the two legs are played the pages say that the check is registered and has not been run;
 * once they are, they say what the exporter's reader found. These tests follow the exported file, so they hold in either state.
 */
const exported = JSON.parse(
  readFileSync(join(__dirname, "..", "src", "content", "skip.generated.json"), "utf8"),
) as {
  registered: boolean;
  result: null | {
    legs: Record<string, { verdict: string; meanFloors: { interval95: [number, number] } }>;
    harmless: boolean | null;
  };
};

const catalog = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "..",
      "..",
      "..",
      "packages",
      "game-data",
      "data",
      "cards.sts2-main-0.107.1.json",
    ),
    "utf8",
  ),
) as { cards: { id: string; name: string; class: string; rewardEligible: boolean }[] };

/** A leg whose interval of the mean floors lies wholly below zero: a small cost that the pages say all the same. */
const floorsCostShows = Object.values(exported.result?.legs ?? {}).some(
  (l) => l.meanFloors.interval95[1] < 0,
);

function stage(): "registered" | "partial" | "harmless" | "not-shown" {
  const legs = Object.values(exported.result?.legs ?? {});
  if (legs.length === 0) return "registered";
  if (legs.some((l) => l.verdict === "not-shown-harmless")) return "not-shown";
  return legs.length === 2 ? "harmless" : "partial";
}

const BADGE = {
  registered: /registered, not run yet/,
  partial: /half done/,
  harmless: /no gross harm found/,
  "not-shown": /not shown harmless/,
} as const;

test.describe("the price of a slot and its check", () => {
  test("the Methods page has its section, with the design and the state of the check", async ({
    page,
  }) => {
    await page.goto("/methods#price-of-a-slot", { waitUntil: "networkidle" });
    const section = page.locator("#price-of-a-slot");
    await expect(section).toBeVisible();
    await expect(
      section.getByRole("heading", { level: 2, name: "Does charging for a slot do harm?" }),
    ).toBeVisible();
    await expect(section).toContainText(BADGE[stage()]);
    await expect(section).toContainText("1.0 index point for every card from the 21st on");
    await expect(section).toContainText("It cannot show that the price helps");
    if (stage() === "registered") await expect(section).toContainText("Not run yet.");
    else await expect(section.locator("[data-skip-leg]").first()).toBeVisible();
    if (floorsCostShows)
      await expect(section).toContainText("The interval of the floors excludes zero");
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, "/methods price of a slot");
  });

  test("a recommendation that the price touched says that the price is a judgement and where its check stands; a small deck says nothing", async ({
    page,
  }) => {
    const ids = catalog.cards
      .filter((c) => c.class === "ironclad" && c.rewardEligible)
      .map((c) => c.id);
    await page.goto("/advisor", { waitUntil: "networkidle" });
    await page
      .locator("label")
      .filter({ hasText: /ironclad/i })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Your run" })).toBeVisible();
    const offer = async (): Promise<void> => {
      const box = page.getByRole("combobox", { name: /offered card/i });
      for (const name of ["Anger", "Shrug It Off", "Body Slam"]) {
        await box.fill(name);
        await box.press("Enter");
      }
      await expect(page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ })).toBeVisible();
    };
    // a fresh run (ten cards): the price does not touch the call
    await offer();
    await expect(page.locator("[data-skip-check]")).toHaveCount(0);
    // a deck of 24 cards: it does
    await page.evaluate((cards) => {
      const run = JSON.parse(window.localStorage.getItem("slay2.run.v2") ?? "{}") as Record<
        string,
        unknown
      >;
      run.deck = cards.slice(0, 12).map((id) => ({ id, count: 2 }));
      window.localStorage.setItem("slay2.run.v2", JSON.stringify(run));
    }, ids);
    await page.reload({ waitUntil: "networkidle" });
    await offer();
    const note = page.locator("[data-skip-check]");
    await expect(note).toBeVisible();
    await expect(note).toContainText("The price of a slot");
    await expect(note).toContainText("is a judgement, not a measurement");
    if (stage() === "harmless" && floorsCostShows)
      await expect(note).toContainText("it did reach slightly fewer floors on average");
    await expect(note.getByRole("link", { name: "Evidence & methods" })).toHaveAttribute(
      "href",
      "/methods#price-of-a-slot",
    );
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, "/advisor price note");
  });
});
