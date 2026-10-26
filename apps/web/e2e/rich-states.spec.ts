import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { expectNoClippedText, expectNoHorizontalOverflow } from "./helpers";

/**
 * The states that put the most on a screen, at a phone, a tablet and a laptop width: a 40-card deck with forty recorded
 * packs, the three longest card names of each class on offer, a long "?" history, a long search result, every section of
 * /methods open. The default state of a page is not where layouts break: a card name that does not fit, a list that
 * grows, an input that is longer than the box. Each of these nets is a state that was probed by hand first.
 */
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

const CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"] as const;

function poolOf(character: string): { id: string; name: string }[] {
  return catalog.cards.filter((c) => c.class === character && c.rewardEligible);
}

async function documentFits(page: Page): Promise<void> {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
  await expectNoHorizontalOverflow(page);
  await expectNoClippedText(page);
}

test.describe("rich states", () => {
  test.skip(({ isMobile }) => !isMobile, "the widths are set here: one project is enough");

  for (const width of [360, 768, 1280]) {
    test.describe(`${String(width)} px`, () => {
      test.use({ viewport: { width, height: 900 } });

      for (const character of CLASSES) {
        test(`advisor, ${character}: a big deck, a long history and the longest card names on offer`, async ({
          page,
        }) => {
          const pool = poolOf(character);
          const ids = pool.map((c) => c.id);
          const longest = [...pool].sort((a, b) => b.name.length - a.name.length).slice(0, 3);
          await page.goto("/advisor", { waitUntil: "networkidle" });
          await page
            .locator("label")
            .filter({ hasText: new RegExp(character, "i") })
            .first()
            .click();
          await expect(page.getByRole("heading", { name: "Your run" })).toBeVisible();
          await page.evaluate((cards) => {
            const raw = window.localStorage.getItem("slay2.run.v1");
            const run = JSON.parse(raw ?? "{}") as Record<string, unknown>;
            run.deck = cards.slice(0, 40).map((id, i) => ({ id, count: 1 + (i % 3) }));
            run.packs = Array.from({ length: 40 }, (_, i) => ({
              at: "2026-10-26T10:00:00Z",
              source: ["regular", "elite", "boss", "shop", "event"][i % 5],
              actIndex: i % 3,
              offered: [
                cards[i % cards.length],
                cards[(i + 1) % cards.length],
                cards[(i + 2) % cards.length],
              ],
              picked: i % 4 === 0 ? "skip" : cards[i % cards.length],
            }));
            run.unknownRooms = Array.from({ length: 12 }, (_, i) => ({
              outcome: ["fight", "treasure", "shop", "event"][i % 4],
            }));
            window.localStorage.setItem("slay2.run.v1", JSON.stringify(run));
          }, ids);
          await page.reload({ waitUntil: "networkidle" });
          await expect(page.getByRole("list", { name: "Recorded packs" })).toBeVisible();
          await documentFits(page);
          const box = page.getByRole("combobox", { name: /offered card/i });
          for (const card of longest) {
            await box.fill(card.name);
            await box.press("Enter");
          }
          await expect(page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ })).toBeVisible();
          await documentFits(page);
        });
      }

      test("odds: the card-reward history with eight packs", async ({ page }) => {
        await page.goto("/odds?mode=history", { waitUntil: "networkidle" });
        const add = page.getByRole("button", { name: "Add pack" });
        for (let i = 0; i < 8; i++) {
          await add.click();
        }
        await expect(page.getByRole("list", { name: "Packs listed" })).toBeVisible();
        await documentFits(page);
      });

      test("routes: three long routes, a long '?' history and an impossible one", async ({
        page,
      }) => {
        await page.goto(
          "/routes?a=M%3FMERM%3F%3FSM%3FERM%3FT&b=%3F%3F%3F%3F%3F%3F%3F%3F%3F%3F&c=EEEEEEEEEE&u=efstfsfsxefs",
          { waitUntil: "networkidle" },
        );
        await expect(page.getByRole("heading", { name: "Route A" })).toBeVisible();
        await documentFits(page);
        await page.goto("/routes?a=M%3FMER&b=M%3F%3FRE&c=ESRT&u=eeeeeeeeeee", {
          waitUntil: "networkidle",
        });
        await documentFits(page);
      });

      test("codex: a search with no result and one with the longest name", async ({ page }) => {
        await page.goto("/codex", { waitUntil: "networkidle" });
        const search = page.getByRole("searchbox").first();
        await search.fill("zzzz");
        await documentFits(page);
        const longest = [...catalog.cards].sort((a, b) => b.name.length - a.name.length)[0];
        await search.fill(longest?.name ?? "");
        await documentFits(page);
      });

      test("methods: every section open", async ({ page }) => {
        await page.goto("/methods", { waitUntil: "networkidle" });
        await page.evaluate(() => {
          document.querySelectorAll("details").forEach((d) => {
            d.open = true;
          });
        });
        await documentFits(page);
      });
    });
  }
});
