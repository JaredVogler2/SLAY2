/**
 * Deployment-time configuration that is safe to expose to the browser. Everything here is optional: the site must
 * build and render with no environment variables set at all.
 */

/**
 * The public contact link, if the owner configured one. Only https: and mailto: targets are accepted so a bad or
 * hostile value can never become a javascript: or data: link.
 */
export function contactLink(raw: string | undefined = process.env.NEXT_PUBLIC_CONTACT_URL): {
  href: string;
  label: string;
} | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol === "https:") {
      return { href: url.toString(), label: url.host };
    }
    if (url.protocol === "mailto:" && url.pathname.length > 0) {
      return { href: url.toString(), label: decodeURIComponent(url.pathname) };
    }
  } catch {
    // Not a URL: treated as "not configured" below.
  }
  return null;
}

/**
 * The canonical public origin, only if the owner configured one (leave it unset until a deployment exists and its URL
 * has been checked). An https origin or http://localhost; any path, query or credentials are dropped.
 */
export function siteUrl(raw: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    const local = url.protocol === "http:" && url.hostname === "localhost";
    if (url.protocol === "https:" || local) {
      return url.origin;
    }
  } catch {
    // Not a URL: treated as "not configured".
  }
  return null;
}
