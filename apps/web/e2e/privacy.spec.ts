import { expect, test } from "@playwright/test";

/**
 * The privacy claims of the README and /about, as a test: no accounts, no cookies, no analytics, and the pages do not send
 * a visitor's run anywhere. A whole visit (every page, then the advisor with an example offer and its recommendation) uses
 * one origin, makes no request that is not a plain GET, carries no request body, calls no API route (the API is for other
 * programs; the pages compute in the browser), sets no cookie, and stores only SLAY2's own local keys.
 */
const ROUTES = [
  "/",
  "/advisor",
  "/odds",
  "/odds?tab=potions",
  "/odds?tab=rooms",
  "/odds?tab=draws",
  "/odds?tab=shop",
  "/routes?a=M%3FMER&b=M%3F%3FRE",
  "/codex",
  "/insights",
  "/methods",
  "/about",
];

test("a whole visit uses one origin, no cookies and no request that carries data", async ({
  page,
  context,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "http://localhost:3100").origin;
  const requests: { method: string; url: string; body: boolean }[] = [];
  const cookieSetters: string[] = [];
  page.on("request", (r) => {
    requests.push({ method: r.method(), url: r.url(), body: r.postData() !== null });
  });
  page.on("response", (r) => {
    void r.allHeaders().then((h) => {
      if (h["set-cookie"]) {
        cookieSetters.push(r.url());
      }
    });
  });

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: "networkidle" });
  }
  await page.goto("/advisor", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ })).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(requests.length).toBeGreaterThan(50); // the visit really made requests
  const network = requests.filter((r) => /^https?:/.test(r.url));
  expect([...new Set(network.map((r) => new URL(r.url).origin))]).toEqual([origin]);
  expect(network.filter((r) => r.method !== "GET" || r.body)).toEqual([]);
  expect(network.filter((r) => new URL(r.url).pathname.startsWith("/api/"))).toEqual([]);
  expect(cookieSetters).toEqual([]);
  expect(await context.cookies()).toEqual([]);

  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  expect(keys.filter((k) => !k.startsWith("slay2."))).toEqual([]);
});
