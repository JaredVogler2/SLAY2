import { expect, test } from "@playwright/test";

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the page still reads, and says why the tools do not work", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("evidence");
    await expect(page.getByText(/need\s+JavaScript/)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveCount(
      7,
    );
  });

  test("the advisor is drawn, with its controls inert instead of a spinner that never ends", async ({
    page,
  }) => {
    await page.goto("/advisor");
    await expect(page.getByRole("heading", { name: "Choose your character" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try an example" })).toBeDisabled();
    await expect(page.getByText(/need\s+JavaScript/)).toBeVisible();
  });
});
