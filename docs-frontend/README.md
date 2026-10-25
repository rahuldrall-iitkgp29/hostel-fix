# HostelFix frontend

Independent Next.js App Router frontend for hostel maintenance. The application lives
in `frontend/`; the canonical frontend documentation lives here in `docs-frontend/`
as requested. Root backend scripts/workspaces are independent.

## Prerequisites

Verified on Windows PowerShell with **Node v24.14.0** and **npm 11.9.0**.
Use Node 24 LTS for this frontend. The package allows Node >=22.13.0; older runtimes
were not tested. Next.js itself supports an older Node floor, but the chosen toolchain
targets modern Node. Root/backend runtime requirements are documented separately.

## Start from PowerShell

From the repository root:

```powershell
Set-Location -LiteralPath '.\frontend'
npm.cmd ci --workspaces=false
if (!(Test-Path -LiteralPath '.env.local')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
}
npm.cmd run dev
```

Open **http://localhost:3000**. Dependencies are already installed in this checkout;
`npm.cmd run dev` is enough after entering `frontend/`. Stop with Ctrl+C.
Use `npm.cmd` to avoid Windows execution-policy restrictions on npm.ps1.
Stop running frontend servers before reinstalling: Next's native Windows binary is
locked while a server uses it.

Do not run the root `npm run dev` expecting the frontend: root scripts start the backend.
Do not add this package to the root workspace or alter its lockfile. Use
`--workspaces=false` for frontend install/ci commands.

## Commands

Run from `frontend/`:

| Command                         | Purpose                                                 |
| ------------------------------- | ------------------------------------------------------- |
| `npm.cmd ci --workspaces=false` | Reproduce dependencies from frontend/package-lock.json  |
| `npm.cmd run dev`               | Local development, default port 3000                    |
| `npm.cmd run lint`              | Next Core Web Vitals + TS ESLint, zero warnings allowed |
| `npm.cmd run typecheck`         | Generate route types, then strict TypeScript check      |
| `npm.cmd test`                  | Vitest API transport/URL tests, no database writes      |
| `npm.cmd run build`             | Optimized production build                              |
| `npm.cmd start`                 | Serve the already-built application on port 3000        |
| `npm.cmd audit --omit=dev`      | Audit production dependency tree                        |
| `npm.cmd audit`                 | Include development tooling advisories                  |

`typecheck` runs `next typegen` so it works on a clean checkout before a build.
The generated `next-env.d.ts`, `.next/`, node_modules and TS build cache are ignored.
The app uses local system fonts and an SVG favicon; build does not fetch Google Fonts.

## Environment and API connection

`frontend/.env.example` contains the sole frontend setting:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api/v1
```

Copy it safely to `frontend/.env.local`. It is required when configured API calls are
used; the public foundation currently renders without making API requests.
There is no automatic production fallback to localhost.
Restart dev/rebuild production after changing a NEXT_PUBLIC variable: it is bundled
for the browser at build time. No secrets, passwords, JWT keys or tokens belong here.

The base URL must include exactly the `/api/v1` namespace. It accepts HTTPS or local
HTTP, and rejects embedded credentials/query/fragment. The typed transport only allows
resource paths under that namespace and rejects redirects to prevent credential forwarding.
Feature modules should call centralized API methods; do not scatter raw fetch in components.

Confirmed transport uses:

- `{data,meta:{requestId,...}}` on JSON success and explicit 204 handling.
- `{error:{code,message,fields?,requestId}}` on failure; field errors are path/message pairs.
- `credentials: "include"`; `X-CSRF-Protection: 1` on mutations.
- Browser-managed Origin matching the backend's exact CORS origin.
- No cached protected responses, arbitrary retries, token persistence or raw error leakage.
- Optional access-token callback for future **in-memory** session state; currently unused.
- Request cancellation and a 15-second request timeout.

Health wrappers exist for `/health` and `/health/ready`. They are developer integration
utilities, not proof of usable accounts. No mock-data adapter or application fixtures exist.

Backend default CORS is `http://localhost:3000`. Keep localhost consistent for frontend
and API; switching one to 127.0.0.1 or another port can break Origin/cookie requirements.
Production must use HTTPS and same-site deployment compatible with the backend's Strict
refresh cookie. Do not weaken CORS/CSRF/SameSite to make a cross-site deployment work.
See root/backend docs for backend setup; this frontend does not manage its database/seeds.

## Routes and current behavior

| Route              | Implemented behavior                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------- |
| /                  | Responsive landing page, complaint journey illustration, role explanations, real navigation  |
| /login             | Sign-in entry shell explaining that account access is not available in this build            |
| /register          | Student registration entry shell, enrollment context; no role selector/credential collection |
| /student/dashboard | Fixed redirect to /login?returnTo=%2Fstudent%2Fdashboard                                     |
| /staff/dashboard   | Fixed redirect to /login?returnTo=%2Fstaff%2Fdashboard                                       |
| /admin/dashboard   | Fixed redirect to /login?returnTo=%2Fadmin%2Fdashboard                                       |
| Unknown routes     | Custom 404, actual HTTP 404 status                                                           |

Dashboard redirects are temporary route shells, not an authentication implementation.
No protected data is rendered, and no role dashboard or complaint workflow is falsely
presented as working. The landing illustration is explanatory content, not live data.

## Structure and decisions

```text
frontend/
  src/
    app/
      (public)/                 Landing, login, registration and public layout
      (dashboard)/              PRD-aligned student/staff/admin route shells
      layout.tsx                Metadata, skip link and toast provider
      globals.css               Tailwind 4 tokens and accessibility foundations
      loading.tsx, error.tsx, not-found.tsx, icon.svg
    components/
      ui/                       Buttons/links, cards, badges, text field, skeleton
      layout/                   Brand, public header/footer, mobile disclosure, container
      feedback/                 Shared empty/error/unavailable panel
    features/auth/components/   Account-entry composition
    config/                     Public navigation (no pretend role/session state)
    lib/api/                    URL validation, transport, errors, health wrappers
    lib/utils/                  Small class-name helper
  tests/api-client.test.ts
  package.json, package-lock.json
  next.config.ts, tsconfig.json, eslint.config.mjs, postcss.config.mjs, vitest.config.ts
  .env.example, .gitignore
  AGENTS.md                     Generated Next.js guidance; read before later code changes
  task.md, history.md, README.md Forwarding documents
docs-frontend/
  task.md                       Canonical master instructions and Sessions 0–13
  history.md                    Canonical append-only log
  README.md                     This file
```

Use feature folders as real workflows arrive; do not make empty placeholder directories.
No shadcn, chart library, state-management library or component framework was necessary
for this public foundation. A supported accessible dialog primitive can be added when needed.
Plain system typography avoids external build-time font dependencies. Colors and spacing
form the shared campus identity; product pages reuse those components.

## Dependencies and compatibility

Runtime: Next **16.4.2**, React/React DOM **19.3.1**, Lucide **1.59.0**,
React Hook Form **7.90.0**, Zod **4.6.7**, hookform resolvers **5.9.2**, Sonner **2.0.8**.
Development: Tailwind/PostCSS plugin **4.3.3**, TypeScript **6.0.3**, ESLint **9.39.5**,
eslint-config-next **16.4.2**, Vitest **5.0.5**, Node 24/React 19 types.
Exact direct versions and resolved transitive versions are pinned in the frontend lockfile.

At installation, latest TypeScript 7 was outside typescript-eslint's <6.1 peer range,
and latest ESLint 10 was outside eslint-plugin-react's <=9 range. ESLint 9 is deprecated
upstream but is the mutually compatible option for this Next lint stack. Resolver 6.0.0
caused conflicting optional effect peers; stable 5.9.2 resolved without force/legacy flags.
Reassess these constraints in Session 12.

## Verification and current limits

Verified after a successful clean lockfile install:

- Lint: PASS, no errors or warnings.
- Strict typecheck: PASS.
- API tests: **31 passed**, 1 file, none failed/skipped.
- Production build: PASS, all public/placeholder routes generated.
- HTTP smoke: public pages 200, fixed role-to-login redirects, unknown page 404,
  favicon and 10 referenced JS/CSS assets 200; account shells do not collect credentials.
- Production dependency audit: **0 vulnerabilities**.
- Development server startup and homepage: PASS; test servers stopped at handoff.

Full audit reports **5 high development-dependency entries** from the single
[braces stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
through the Next lint plugin's fast-glob/micromatch chain. Latest braces is still 3.0.3;
no patched version is available in the inspected registry. Do not run audit fix --force:
npm proposes downgrading Next lint configuration to an incompatible major. This remains
a documented tooling issue for later review.

Browser visual/keyboard/responsive checks and end-to-end business integration were **not
run**: this session had no available browser surface and backend workflows are still
being developed. Responsive CSS and accessibility semantics are implemented, not claimed
as a completed visual audit. No deployed frontend or live auth success is claimed.

## Backend handoff and next session

Initial reconnaissance found only health endpoints. During this run, parallel backend
Session 4 added auth/profile routes and resolved cookie-locator/full-input-hashing
ambiguities in the PRD. Its final completion/test record was not yet available when read.
Frontend Sessions 3–4 must recheck that source and integrate real sessions safely.
Registration catalogs/seeds, uploads, complaints, workflow and dashboards remain dependencies.

**Next: Session 2 — Design system and shared UI.** Existing shared/public components are
a starting point. Add/audit the app frame, responsive navigation and accessible interactions
without exposing a fake authenticated shell. Later sessions implement forms and sessions.

Resume exactly with:
`Read frontend/task.md and frontend/history.md, then execute the next pending session.`
Follow the forwarding files to the canonical docs in this directory.

## Troubleshooting

- Windows npm.ps1 execution policy: use `npm.cmd`.
- EPERM spawning build/test workers in an agent sandbox: rerun with approved execution;
  do not disable checks or change machine execution policy.
- EPERM unlinking Next's native binary during npm ci: stop this frontend's dev/preview server,
  then retry. Do not terminate unrelated Node/backend processes.
- Port 3000 occupied: stop only your known frontend server or choose a port knowingly;
  backend CORS must be coordinated for auth integration.
- Missing/incompatible API URL: check the frontend env example and /api/v1 suffix.
- Auth still unavailable: expected in this foundation; do not add mock sessions or assume
  a healthy backend means all features are integrated.
