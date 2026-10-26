# SLAY2 deployment (Vercel)

**Status: NOT DEPLOYED.** There is no hosted URL, and none is claimed anywhere in this repository. The production build is verified locally and in CI; creating the hosting project in the owner's Vercel account was attempted from the agent session and was **denied by the session's permission policy** (it is an account-level change), so it needs the owner's explicit go-ahead or a manual import. Nothing else about the site depends on that decision.

## What was verified (read-only)

| Check | Result |
|---|---|
| A Vercel team is reachable from the agent session | yes: one personal team (`jaredvogler2s-projects`) with unrelated existing projects |
| GitHub is connected to Vercel for the owner | yes, namespace `JaredVogler2`, access not restricted |
| A Vercel project named like `slay2` or linked to this repository already exists | no |
| `get_auth_user` | returned 404 (token is team-scoped); irrelevant to deploying |

## Build facts

| Item | Value |
|---|---|
| Framework | Next.js 16.4.3, App Router, Turbopack build (`next build`) |
| Rendering | all pages statically prerendered; only `/api/v1/*` are dynamic route handlers (no database, no secrets) |
| Node | 22.x (`apps/web/package.json` `engines.node`; CI uses `.node-version`) |
| Package manager | pnpm 10.28.0 pinned by the root `packageManager`; lockfile committed |
| Workspace packages | `@slay2/{odds,game-schema,game-data,decision}` are TypeScript sources transpiled by Next (`transpilePackages`), so the build needs the files outside `apps/web` |
| Secrets required | **none** |
| Optional public env vars | `NEXT_PUBLIC_SITE_URL` (canonical origin, enables the sitemap), `NEXT_PUBLIC_CONTACT_URL` (https or mailto link on `/about`). See `.env.example` |
| Third-party requests at runtime | none (fonts are bundled; no analytics) |

## Settings to use when importing the repository into Vercel

1. **Import** `JaredVogler2/SLAY2`. Project name `slay2`.
2. **Root Directory** `apps/web`, and **enable "Include source files outside of the Root Directory in the Build Step"** (the workspace packages live in `packages/`).
3. **Framework preset** Next.js. Leave the install and build commands on their defaults (`pnpm install`, `next build`).
4. **Environment variable** `ENABLE_EXPERIMENTAL_COREPACK=1` (all environments) so Vercel installs the pinned pnpm 10.28.0 instead of choosing a pnpm version from the lockfile. Confirm `pnpm 10.28.0` in the first build log.
5. **Production branch**: keep the repository default. Only merge the pull request after review; until then the branch deploys as a *preview*.
6. **Deployment Protection**: keep Vercel Authentication on for previews until the owner decides to publish. Do not turn protection off to make a smoke test easier.
7. **Firewall**: add a rate-limit rule for `/api/v1/*`. The built-in limiter is an in-memory, per-instance token bucket (120 requests per minute per connecting address) and is only a courtesy; real flood protection belongs to the platform.
8. **Plan and terms**: a Hobby team is for personal, non-commercial use, which matches the project stance (no ads, no paywall, no donations). Re-read the plan terms before any change to that stance.

## Release gate (PASS / FAIL / UNVERIFIED, with the command that proves it)

| Gate | Status | Evidence |
|---|---|---|
| Typecheck, lint, format, unit tests, production build | PASS | `pnpm check` (152 TypeScript tests) |
| Python harness tests | PASS | `PYTHONPATH=sim python -m pytest sim/tests` (51 passed, 1 strict xfail) |
| End to end on the production server, desktop + mobile, axe WCAG 2.2 AA (serious/critical) | PASS locally (72 tests); CI job `e2e` added | `pnpm --filter @slay2/web e2e` |
| Security headers, hydration under the CSP with zero violations | PASS | `e2e/security.spec.ts` |
| No third-party files, text or assets in git | PASS | `pnpm guard` (pre-commit and CI) |
| Dependency audit (high and above) | PASS on the last CI run | `pnpm audit --audit-level high` |
| Real hosted URL smoke test | **UNVERIFIED** (not deployed) | run the commands below against the preview URL |
| Performance budget on the hosted URL (Lighthouse / Web Vitals) | **UNVERIFIED** | not measured yet |
| Simulator-to-game parity | **UNVERIFIED** | needs an owned game copy; shown as such on `/methods` |
| Beta build v0.111.0 | **UNSUPPORTED** | refused by `game-schema`, shown on the landing page and `/api/v1/capabilities` |

## Smoke test after a deployment exists

```bash
# 1. the API and headers (replace PREVIEW with the URL printed by Vercel; never invent one)
curl -fsS "$PREVIEW/api/v1/health"
curl -fsSI "$PREVIEW/" | grep -i -E "content-security-policy|strict-transport|x-content-type|referrer-policy"
curl -fsS -X POST "$PREVIEW/api/v1/odds" -H 'content-type: application/json' \
  -d '{"calculator":"draw","pile":10,"targets":1,"draws":5}'   # expect {"n":"1","d":"2"}: exactly 1/2 for one copy in a ten-card pile

# 2. the full browser suite against the hosted site (protected previews need the platform's automation bypass header)
BASE_URL="$PREVIEW" pnpm --filter @slay2/web e2e
```

## Rollback

Vercel keeps every deployment: roll back from the dashboard (Instant Rollback) or pause the project. The site holds no server state, so a rollback cannot lose user data (runs live in each visitor's browser).

## Open decisions for the owner

1. Approve creating the Vercel project (or import it manually with the settings above).
2. Whether the first public URL is a protected preview or a public production alias.
3. A contact link for `/about` (`NEXT_PUBLIC_CONTACT_URL`) and the canonical origin (`NEXT_PUBLIC_SITE_URL`) once a URL is verified.
