# SLAY2 deployment (Vercel)

**Status: NOT VERIFIED.** The owner imported this repository into a Vercel project (`slay-part2`), but no build of the application has succeeded there yet, so **no hosted URL is claimed anywhere in this repository**. The cause of the two failed attempts is understood and fixed in the repository (below); the status changes only after a build is READY *and* the smoke test at the bottom passes against it.

## What happened on the first attempts (read from the Vercel deployment record and build log, 2026-10-26)

| # | Production deployment of | Result | Why |
|---|---|---|---|
| 1 | `main` while it held documents only | READY after a 44 ms build, and the URL answered **404** | there was no application on `main` to build, so nothing was published |
| 2 | `main` after the first pull request was merged | **ERROR** at `pnpm install` | `ERR_PNPM_UNSUPPORTED_ENGINE`: the project runs Node **24.x**, `apps/web/package.json` required **22.x**, and `.npmrc` sets `engine-strict=true`. The project was also still on its defaults: Root Directory `./` and no framework preset, so even a passing install would have published nothing |

A deployment that is READY but empty and a deployment that is ERROR both leave the production URL on a 404, which is why the second attempt looked identical to the first.

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
2. **Deployment Protection**: Vercel Authentication is on for every non-custom domain by default, so a visitor who is not signed in to Vercel sees a login page (HTTP 401), not the site. Keep it on until the owner decides to publish; do not turn protection off to make a smoke test easier. To publish, change it under *Settings, Deployment Protection*.
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
| Real hosted URL smoke test | **UNVERIFIED** (no successful build yet) | run the commands below against the READY deployment URL |
| Performance budget on the hosted URL (Lighthouse / Web Vitals) | **UNVERIFIED** | not measured yet |
| Simulator-to-game parity | **UNVERIFIED** | needs an owned game copy; shown as such on `/methods` |
| Beta build v0.111.0 | **UNSUPPORTED** | refused by `game-schema`, shown on the landing page and `/api/v1/capabilities` |

## Smoke test after a READY deployment exists

```bash
# 1. the API and headers (replace SITE with the URL shown for the READY deployment; never invent one).
#    A deployment behind Vercel Authentication answers 401 to curl: use the platform's share link or bypass header.
curl -fsS "$SITE/api/v1/health"
curl -fsSI "$SITE/" | grep -i -E "content-security-policy|strict-transport|x-content-type|referrer-policy"
curl -fsS -X POST "$SITE/api/v1/odds" -H 'content-type: application/json' \
  -d '{"calculator":"draw","pile":10,"targets":1,"draws":5}'   # expect {"n":"1","d":"2"}: exactly 1/2 for one copy in a ten-card pile

# 2. the full browser suite against the hosted site
BASE_URL="$SITE" pnpm --filter @slay2/web e2e
```

## Rollback

Vercel keeps every deployment: roll back from the dashboard (Instant Rollback) or pause the project. The site holds no server state, so a rollback cannot lose user data (runs live in each visitor's browser).

## Open decisions for the owner

1. Whether the first public URL stays behind Vercel Authentication or becomes a public production alias (Deployment Protection).
2. A contact link for `/about` (`NEXT_PUBLIC_CONTACT_URL`) and the canonical origin (`NEXT_PUBLIC_SITE_URL`) once a URL is verified.
