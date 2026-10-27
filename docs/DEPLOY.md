# SLAY2 deployment (Vercel)

**Status: VERIFIED for `main` at `453864d` (2026-10-26, about 40 minutes after the merge).** The production deployment `dpl_8EX1qaSiVT9zDQLQ61GHKAo7SBMt` of the merge commit of pull request #2 is **READY**, and **https://slay-part2.vercel.app** (the project's production alias) answers without a login. The evidence is in "Hosted smoke test (2026-10-26)" below. Re-checked after pull request #6 was merged (17:31 UTC): at 17:32 UTC `/api/v1/health` reported `1c4542d`, the merge commit, and `/`, `/advisor`, `/methods`, `/routes`, `/odds`, `/about`, `/sitemap.xml` and `/robots.txt` answered 200 anonymously; the browser suite was not re-run against the hosted site. Checked again after pull request #9 was merged (2026-10-27): at 01:42 UTC the production deployment `dpl_9M3awiBW…` was READY on `db67e11` and the routes listed in [docs/STATUS.md](STATUS.md) answered 200, and at 03:53 UTC `/api/v1/health` still reported `db67e11`; pull request #10 (the held-out synergy result) is open and not yet live. Not verified: performance on the hosted URL (Lighthouse / Web Vitals), and anything about the live game (simulator parity is a separate, unverified item).

## What happened on the first attempts (read from the Vercel deployment record and build log, 2026-10-26)

| # | Production deployment of | Result | Why |
|---|---|---|---|
| 1 | `main` while it held documents only | READY after a 44 ms build, and the URL answered **404** | there was no application on `main` to build, so nothing was published |
| 2 | `main` after the first pull request was merged | **ERROR** at `pnpm install` | `ERR_PNPM_UNSUPPORTED_ENGINE`: the project runs Node **24.x**, `apps/web/package.json` required **22.x**, and `.npmrc` sets `engine-strict=true`. The project was also still on its defaults: Root Directory `./` and no framework preset, so even a passing install would have published nothing |

A deployment that is READY but empty and a deployment that is ERROR both leave the production URL on a 404, which is why the second attempt looked identical to the first.

**Both historical deployments still exist and are still broken, by design of the platform.** The first one (`slay-part2-pjvck2qkr-…`, built from the documents-only `main`) keeps answering Vercel's `NOT_FOUND`: opening it from the dashboard's deployment list, or from an old bookmark, shows the 404 forever, although the production alias now serves the application. The way to open the site is the alias, `https://slay-part2.vercel.app`.

## What the repository now does without any dashboard setting

| File | Effect |
|---|---|
| `package.json`, `apps/web/package.json`: `engines.node` is `^22.12.0` in both | Vercel maps the range to the latest Node 22 and **overrides** the project's Node setting ([Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)), so the build runs on the same major as CI (`.node-version`) whatever the project says. The two ranges are identical, so pnpm's workspace engine check cannot disagree with itself again. The range is bounded: an open `>=` range would jump to the next major on its own |
| `vercel.json` (repository root) | For the default import (Root Directory `./`): framework `nextjs`, install with `pnpm install --frozen-lockfile`, build with the root `build` script (`pnpm --filter @slay2/web build`), publish `apps/web/.next` |
| `next` as a root devDependency (same exact version as the app) | Vercel's Next.js builder resolves `next/package.json` from the project directory; with Root Directory `./` that is the repository root, where pnpm does not link the app's dependencies |
| `apps/web/vercel.json` | For the other supported layout (Root Directory `apps/web`): selects the Next.js framework even when the project's preset is still "Other" |
| `apps/web/test/deploy-config.test.ts` | Fails the build if any of the above drifts (one bounded Node major everywhere, equal `next` versions, `next` resolvable from the root, output directory = the app's `.next`, no `headers`/`routes`/`env` in `vercel.json` so the CSP stays in `next.config.ts` only) |

## Project settings

Either layout works; nothing else is required.

| | A. Default import (what the owner has) | B. Textbook monorepo |
|---|---|---|
| Root Directory | `./` | `apps/web`, with **"Include source files outside of the Root Directory in the Build Step"** on (the workspace packages live in `packages/`) |
| Framework preset | any (the root `vercel.json` sets it) | any (`apps/web/vercel.json` sets it) |
| Install / build / output | from the root `vercel.json` | Vercel defaults |
| Node.js version | any (`engines.node` wins) | any (`engines.node` wins) |

Recommended for both:

1. **Production branch**: the repository default (`main`). Pull requests build as previews.
2. **Deployment Protection** (observed 2026-10-26): the production alias `slay-part2.vercel.app` is **public** (HTTP 200 for an anonymous request); every other URL of the project (per-deployment hostnames, the `-git-main-` and the team alias) redirects an anonymous visitor to a Vercel login (HTTP 302). Previews of a branch are therefore private unless the platform's share link is used. Whether the production alias should stay public is the owner's decision; do not change protection just to make a test easier. Settings: *Settings, Deployment Protection*.
3. **Optional**: `ENABLE_EXPERIMENTAL_COREPACK=1` as an environment variable makes Vercel install exactly the pnpm pinned by `packageManager` (10.28.0). Confirm the pnpm version in the first build log either way.
4. **Firewall**: add a rate-limit rule for `/api/v1/*`. The built-in limiter is an in-memory, per-instance token bucket (120 requests per minute per connecting address) and is only a courtesy; real flood protection belongs to the platform.
5. **Plan and terms**: a Hobby team is for personal, non-commercial use, which matches the project stance (no ads, no paywall, no donations). Re-read the plan terms before any change to that stance.

## Build facts

| Item | Value |
|---|---|
| Framework | Next.js 16.4.3, App Router, Turbopack build (`next build`) |
| Rendering | all pages statically prerendered; only `/api/v1/*` are dynamic route handlers (no database, no secrets) |
| Node | `^22.12.0` (`engines.node`; CI uses `.node-version`) |
| Package manager | pnpm 10.28.0 pinned by the root `packageManager`; lockfile committed; `engine-strict=true` |
| Workspace packages | `@slay2/{odds,game-schema,game-data,decision}` are TypeScript sources transpiled by Next (`transpilePackages`), so the build needs the files outside `apps/web` |
| Secrets required | **none** |
| Optional public env vars | `NEXT_PUBLIC_SITE_URL` (canonical origin, enables the sitemap), `NEXT_PUBLIC_CONTACT_URL` (https or mailto link on `/about`). See `.env.example` |
| Third-party requests at runtime | none (fonts are bundled; no analytics) |

## Triage when a deployment misbehaves

| Symptom | Look at | Usual cause |
|---|---|---|
| 404 on a READY deployment | the commit the production deployment was built from, and its build log length | the build published nothing (no app on that commit, or no `vercel.json` and no framework preset) |
| ERROR at install, `ERR_PNPM_UNSUPPORTED_ENGINE` | the `Expected version` / `Got` lines | `engines.node` differs between the root and `apps/web`, or names a major Vercel does not run |
| "No Next.js version detected" | Root Directory and whether root `node_modules/next` exists after install | Root Directory points at a folder without `next`, or the root devDependency was removed |
| Login page, HTTP 401 | the response body mentions Vercel Authentication | Deployment Protection (see above), not a build problem |
| Build passes, a page is missing | `apps/web/.next/routes-manifest.json` in the build log | `outputDirectory` no longer points at the app's `.next` |

## Release gate (PASS / FAIL / UNVERIFIED, with the command that proves it)

| Gate | Status | Evidence |
|---|---|---|
| Typecheck, lint, format, unit tests, production build | PASS | `pnpm check` (152 TypeScript tests) |
| Python harness tests | PASS | `PYTHONPATH=sim python -m pytest sim/tests` (51 passed, 1 strict xfail) |
| End to end on the production server, desktop + mobile, axe WCAG 2.2 AA (serious/critical) | PASS locally (72 tests); CI job `e2e` added | `pnpm --filter @slay2/web e2e` |
| Security headers, hydration under the CSP with zero violations | PASS | `e2e/security.spec.ts` |
| No third-party files, text or assets in git | PASS | `pnpm guard` (pre-commit and CI) |
| Dependency audit (high and above) | PASS on the last CI run | `pnpm audit --audit-level high` |
| Deployment configuration is consistent | PASS | `apps/web/test/deploy-config.test.ts` |
| Real hosted URL smoke test | **PASS** (2026-10-26, `453864d`) | the section "Hosted smoke test" below |
| Vercel builds the pull request's head (preview) | **PASS** (2026-10-26 12:49 UTC, head `20d4efe`, deployment `dpl_FRWHDADHgMsw5wmv8hr96L1kiW4r`) | build log: Node 22.x, Next.js 16.4.3, 16 static pages including `/routes` and `/opengraph-image`, 7 API routes, "Build Completed in /vercel/output [16s]"; the preview URL itself sits behind Vercel login, so the hosted page was not fetched |
| Web Vitals on a local production build (lab) | **MEASURED** (2026-10-26, see "Web Vitals (lab)" below): layout shift 0 on all seven pages, first and largest paint 0.26 to 0.42 s on a desktop and 0.96 to 1.75 s on a throttled phone | `pnpm --filter @slay2/web vitals`; `e2e/stability.spec.ts` pins the layout shift |
| Web Vitals on the hosted URL | **MEASURED** (2026-10-26 18:57 UTC, the site at `1c4542d`; see "Web Vitals on the hosted site" below): layout shift 0 on all seven pages; first and largest paint 0.53 to 0.95 s on a desktop and 1.4 to 2.2 s on a throttled phone; blocking time on the throttled phone 243 to 535 ms | `BASE_URL=https://slay-part2.vercel.app pnpm --filter @slay2/web vitals` |
| Lighthouse on the hosted URL | **NOT RUN** | it would download and run an external package, which the owner has not approved |
| Simulator-to-game parity | **UNVERIFIED** | needs an owned game copy; shown as such on `/methods` |
| Beta build v0.111.0 | **UNSUPPORTED** | refused by `game-schema`, shown on the landing page and `/api/v1/capabilities` |

## Web Vitals (lab)

Measured on 2026-10-26 against a local production build (`next start`) with `pnpm --filter @slay2/web vitals` (`apps/web/scripts/vitals.mjs`: Chromium's own `paint`, `largest-contentful-paint`, `layout-shift` and `longtask` observers and the resource timings, an empty cache for every load, three loads per page, medians; no third-party package). "Phone" is a 390 x 844 screen with a 4x CPU slowdown and the slow-4G profile Lighthouse uses (150 ms round trip, 1.6 Mbit/s); "desktop" is 1440 x 900 without throttling.

| Page | Phone FCP = LCP (ms) | Phone TBT-like (ms) | Desktop FCP = LCP (ms) | Desktop TBT-like (ms) | Layout shift |
|---|---|---|---|---|---|
| `/` | 956 | 447 | 340 | 80 | 0 |
| `/advisor` | 1,080 | 263 | 288 | 16 | 0 |
| `/odds` | 1,152 | 518 | 328 | 30 | 0 |
| `/routes` | 1,076 | 476 | 324 | 17 | 0 |
| `/codex` | 1,748 | 416 | 388 | 0 | 0 |
| `/methods` | 1,300 | 460 | 424 | 0 | 0 |
| `/about` | 1,072 | 365 | 256 | 0 | 0 |

Every page transfers about 470 to 510 KB on its first load (about 270 KB of script, 9 KB of CSS, 117 KB of fonts before the unused bold Cinzel file was dropped, 102 KB after) in 38 to 39 requests; the same figure on every page is the router prefetching the other pages' payloads for the six header links. Against the Web Vitals thresholds: largest contentful paint (good: 2.5 s or less) and layout shift (good: 0.1 or less) are good everywhere, including the throttled phone; "TBT-like" is the sum, over the long tasks after the first paint, of the time beyond 50 ms, a stand-in for Total Blocking Time (good: 200 ms or less) that is **not** Lighthouse's number.

What these numbers are not: field data (nobody visited); a measurement on a quiet machine (the load average was 10 to 12 on 4 cores, with simulation jobs running, so every time is pessimistic and the throttled phone's blocking time in particular is probably an over-estimate); a Lighthouse score; Interaction to Next Paint, which needs a person. The hosted site is a different measurement again (a real network and a CDN) and has not been measured with this script.

## Web Vitals on the hosted site

Measured on 2026-10-26 at 18:57 UTC against https://slay-part2.vercel.app, which then served `1c4542d` (the merge of pull request #6; `/api/v1/health` reports the commit), with the same script and profiles as above (three cold loads per page, medians), from this repository's sandbox: the machine was idle (load average 0.03 at the start, 1.2 at the end) and the network is the sandbox's, behind its agent proxy, to Vercel's CDN.

| Page | Phone FCP = LCP (ms) | Phone TBT-like (ms) | Desktop FCP = LCP (ms) | Desktop TBT-like (ms) | Layout shift | Phone transfer (KB) |
|---|---|---|---|---|---|---|
| `/` | 1,716 | 309 | 656 | 0 | 0 | 527 |
| `/advisor` | 1,660 | 268 | 548 | 0 | 0 | 508 |
| `/odds` | 1,604 | 282 | 564 | 0 | 0 | 513 |
| `/routes` | 1,444 | 243 | 608 | 0 | 0 | 510 |
| `/codex` | 2,196 | 414 | 676 | 0 | 0 | 515 |
| `/methods` | 2,196 | 535 | 952 | 0 | 0 | 451 |
| `/about` | 1,416 | 286 | 532 | 0 | 0 | 510 |

Against the Web Vitals thresholds: layout shift is 0 everywhere and largest contentful paint is good (2.5 s or less) on every page, on the throttled phone as well; `/codex` and `/methods` are the slowest at 2.2 s there. The "TBT-like" time on the throttled phone (4x CPU slowdown) is 243 to 535 ms, which is in the "needs improvement" band of the Lighthouse thresholds for Total Blocking Time (200 to 600 ms) on all seven pages; `/methods` is the heaviest (it renders the evidence tables) and `/routes` the lightest. On a desktop it is 0. A real phone is unlikely to be as slow as a 4x slowdown of this machine, but this was not measured on one.

What these numbers are not: field data (nobody visited); a Lighthouse score (Lighthouse was not run); Interaction to Next Paint, which needs a person. The hosted payload is the same 451 to 527 KB per first load as the local build, in 36 to 39 requests.

## Smoke test after a READY deployment exists

```bash
# 1. the API and headers (replace SITE with the URL shown for the READY deployment; never invent one).
#    A deployment behind Vercel Authentication answers 401 to curl: use the platform's share link or bypass header.
curl -fsS "$SITE/api/v1/health"
curl -fsSI "$SITE/" | grep -i -E "content-security-policy|strict-transport|x-content-type|referrer-policy"
curl -fsS -X POST "$SITE/api/v1/odds" -H 'content-type: application/json' \
  -d '{"calculator":"draw","pile":10,"targets":1,"draws":5}'   # expect {"n":"1","d":"2"}: exactly 1/2 for one copy in a ten-card pile

# 2. the picture a pasted link gets: the tag must name the hosted site (not localhost) and the file must be a 1200 x 630 PNG
curl -fsS "$SITE/about" | grep -o '<meta property="og:image" content="[^"]*"'
curl -fsS -o /tmp/og.png "$SITE/opengraph-image" && file /tmp/og.png     # PNG image data, 1200 x 630

# 3. the full browser suite against the hosted site
BASE_URL="$SITE" pnpm --filter @slay2/web e2e

# 4. Web Vitals of the hosted site (lab numbers from where this runs; see "Web Vitals (lab)" above)
BASE_URL="$SITE" pnpm --filter @slay2/web vitals
```

## Hosted smoke test (2026-10-26)

Against `https://slay-part2.vercel.app`, production deployment `dpl_8EX1qaSiVT9zDQLQ61GHKAo7SBMt` (commit `453864dfbf48…`, Node 22.x selected by `engines` over the project's 24.x, Next.js 16.4.3, 14 routes, build 39 s):

| Check | Result |
|---|---|
| `GET /`, `/odds`, `/advisor`, `/codex`, `/methods`, `/about`, `/robots.txt`, `/sitemap.xml`, `/icon.svg` | 200 each (`/methods` carries the card-value panel and "6 simulated games have been won so far") |
| `GET /api/v1/health` | `{"status":"ok", ... "commit":"453864dfbf489847d09a96140ef4f93ab54c200f"}`: the hosted build is the merged commit |
| `GET /api/v1/capabilities`, `/api/v1/manifest` | 200; main v0.107.1 supported, beta v0.111.0 refused |
| `POST /api/v1/odds` `{"calculator":"draw","pile":10,"targets":1,"draws":5}` | `{"n":"1","d":"2"}` as documented |
| Unknown path | 404 with the site's own page; `/advisor/` and `/odds/` redirect (308) to the slash-less route; `/Advisor`, `/index.html`, `/docs` are 404 (paths are case-sensitive and those pages do not exist) |
| Headers on `/` | `content-security-policy`, `strict-transport-security`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: no-referrer`, `permissions-policy`, `cross-origin-opener-policy` present |
| Full browser suite against the hosted site (`BASE_URL=https://slay-part2.vercel.app pnpm --filter @slay2/web e2e`, desktop + mobile, axe WCAG 2.2 AA, security spec) | **96 passed**, 2.6 min |

## Rollback

Vercel keeps every deployment: roll back from the dashboard (Instant Rollback) or pause the project. The site holds no server state, so a rollback cannot lose user data (runs live in each visitor's browser).

## Open decisions for the owner

1. Whether the public production alias stays public (it is, today, by the platform's default) or is put behind Vercel Authentication (Deployment Protection).
2. A contact link for `/about` (`NEXT_PUBLIC_CONTACT_URL`) and the canonical origin: the URL is now verified, so `NEXT_PUBLIC_SITE_URL=https://slay-part2.vercel.app` can be set in the project's environment variables whenever the owner wants the sitemap and canonical metadata published (today `/sitemap.xml` is an empty list and `robots.txt` has no `Sitemap:` line, on purpose: that is a publicity decision, not a build fix).
