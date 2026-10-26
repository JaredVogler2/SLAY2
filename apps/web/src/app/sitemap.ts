import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site-config";

const PATHS = ["/", "/advisor", "/odds", "/codex", "/methods", "/about"] as const;

/** A sitemap needs absolute URLs, so it stays empty until the owner has set a verified NEXT_PUBLIC_SITE_URL. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return base ? PATHS.map((path) => ({ url: `${base}${path === "/" ? "" : path}` })) : [];
}
