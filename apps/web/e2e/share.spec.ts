import { expect, test } from "@playwright/test";

test("a pasted link has a picture: Open Graph and Twitter tags and a 1200 x 630 PNG drawn from the site's own mark", async ({
  page,
  request,
}) => {
  await page.goto("/about");
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toContain("/opengraph-image");
  expect(await page.locator('meta[property="og:image:width"]').getAttribute("content")).toBe(
    "1200",
  );
  expect(await page.locator('meta[property="og:image:height"]').getAttribute("content")).toBe(
    "630",
  );
  expect(await page.locator('meta[name="twitter:card"]').getAttribute("content")).toBe(
    "summary_large_image",
  );
  expect(await page.locator('meta[name="twitter:image"]').getAttribute("content")).toContain(
    "/opengraph-image",
  );

  // the host inside the tag is the deployment's (localhost:3000 when metadataBase is not set); fetch the path from this server
  const { pathname, search } = new URL(og ?? "");
  const response = await request.get(`${pathname}${search}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  const png = await response.body();
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a"); // the PNG signature
  expect(png.readUInt32BE(16)).toBe(1200); // IHDR width
  expect(png.readUInt32BE(20)).toBe(630); // IHDR height
  expect(png.length).toBeGreaterThan(10_000); // drawn, not blank
});
