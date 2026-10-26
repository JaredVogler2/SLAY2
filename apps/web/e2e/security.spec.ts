import { expect, test } from "@playwright/test";

const PAGES = ["/", "/odds", "/routes", "/advisor", "/methods", "/about"] as const;

test.describe("security headers", () => {
  test("every page carries a closed-down policy", async ({ request }) => {
    for (const path of PAGES) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      const h = response.headers();
      const csp = h["content-security-policy"] ?? "";
      expect(csp, path).toContain("default-src 'self'");
      expect(csp, path).toContain("frame-ancestors 'none'");
      expect(csp, path).toContain("object-src 'none'");
      expect(csp, path).toContain("base-uri 'self'");
      expect(csp, path).not.toContain("unsafe-eval");
      expect(csp, path).not.toMatch(/https?:\/\//);
      expect(h["x-content-type-options"], path).toBe("nosniff");
      expect(h["x-frame-options"], path).toBe("DENY");
      expect(h["referrer-policy"], path).toBe("no-referrer");
      expect(h["x-powered-by"], path).toBeUndefined();
    }
  });

  test("API responses are not cacheable and are not sniffed", async ({ request }) => {
    const response = await request.get("/api/v1/health");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("pages hydrate and work under the policy with no violations", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/content security policy|refused to (load|execute|apply|connect)/i.test(message.text())) {
        violations.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      violations.push(`pageerror: ${error.message}`);
    });
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    // prove scripts actually ran (not just that nothing was reported): the pity demo is client-side only
    await page.goto("/");
    const slider = page.getByLabel("Non-rare cards since your last rare");
    await expect(async () => {
      await slider.fill("12");
      await expect(page.getByText("12").first()).toBeVisible({ timeout: 1000 });
    }).toPass();
    expect(violations).toEqual([]);
  });
});
