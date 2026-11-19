# HostelFix

Hostel maintenance reporting with an Express/Mongoose API and a Next.js frontend.
The product/API contracts are in [prd.md](prd.md). Frontend documentation is in
[frontend/docs-frontend/README.md](frontend/docs-frontend/README.md). The temporary
implementation verification report is [analysis.md](analysis.md).

## Runtime and installation

Node.js 24 LTS is the verified runtime. The packages retain their declared engine
requirements; older supported runtimes have not been separately validated in this
implementation pass. Root/backend and frontend have separate npm lockfiles.

```powershell
npm.cmd ci
npm.cmd ci --prefix frontend
```

The root npm workspace contains only `backend`; the root command interface also
orchestrates the separate frontend package. `formidable` is an explicit backend
production dependency. Run all commands below from the repository root.

## Local setup

Only copy examples when the destination does not exist; preserve existing configuration.
Configure `backend/.env` using `backend/.env.example` and set:

- `NODE_ENV=development` explicitly.
- `MONGODB_URI=mongodb://127.0.0.1:27018/hostelfix?replicaSet=rs0`
- `TEST_MONGODB_URI=mongodb://127.0.0.1:27018/hostelfix_test?replicaSet=rs0`
- A private, randomly generated JWT secret with at least 32 bytes.
- An absolute upload directory, `CORS_ORIGIN=http://localhost:3000`, and
  `COOKIE_SECURE=false` for local HTTP development only.

Use `frontend/.env.local` for the public, non-secret local API URL:
`NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api/v1`.
Keep localhost naming consistent with the backend CORS origin.

This checkout uses its owned MongoDB on **27018**, because 27017 belongs to an
unrelated instance. Root commands reuse the existing ownership configuration;
they never infer ownership from an occupied port. On a fresh checkout select a
free port explicitly. Environment files are preserved.

Portable MongoDB is managed through the root commands and existing Windows scripts:

```powershell
$env:HOSTELFIX_TEST_PORT='27018'
npm.cmd run db:install
npm.cmd run db:start
npm.cmd run seed
npm.cmd run dev
# In another terminal:
npm.cmd run status
npm.cmd run health
npm.cmd run stop
```

The portable MongoDB instance is loopback-only, unauthenticated development/test
infrastructure. It is not a production database. The scripts verify process identity,
configuration, paths, and replica membership before management or test writes.

### A port conflict with another MongoDB instance

Never terminate, claim, reset, or modify an unrelated instance. Select a free port
explicitly for a separate owned test replica set:

```powershell
$env:HOSTELFIX_TEST_PORT='27018'
npm.cmd run db:start
npm.cmd run db:status
npm.cmd test
npm.cmd run db:stop
```

Alternate-port infrastructure uses `.local/mongodb-test-<port>/` and retains all
ownership/loopback/replica-set guards. Tests use only the corresponding
`hostelfix_test` database; arbitrary database URI overrides remain forbidden.
Use the same `HOSTELFIX_TEST_PORT` for start, tests, browser checks, and stop.
No application environment file is overwritten by selecting a test port.

## Working P0 features

Students can register, sign in, manage profiles/passwords, report issues with up to
three private photos, edit submitted complaints, comment, reopen eligible resolutions,
close repairs, and leave feedback. Administrators can triage/reject reports, change
priority, assign staff, and view scoped operational dashboards. Assigned staff can
view private evidence, start work, resolve repairs, and track their queue.

Complaint and profile mutations use version checks. Comments and activity have
paginated history. Creation retries preserve idempotency keys for the same draft;
concurrent duplicate requests return one complaint. API responses are validated at
runtime. Access tokens stay in memory; refresh cookies are HttpOnly and rotated.

Modern browsers with Web Locks serialize refresh/login/logout across tabs. Logout
is broadcast across same-origin tabs. A local queue coordinates requests even when
Web Locks are absent, but cross-tab coordination requires Web Locks support.

## Verification commands

Root `test` starts/verifies the owned replica set and sequentially runs backend
unit/integration tests, frontend tests and browser regressions. It stops the
database afterward only if it started it. Configure backend development environment
values first. Package-level backend tests still require the owned database to be
running. Infrastructure failures fail the command; they are not reported as skips.

| Location      | Command                                        | Purpose                                                                                                       |
| ------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Root          | `npm.cmd test`                                 | Backend, frontend and browser suites, with owned database management.                                         |
| Root          | `npm.cmd run backend:test -- tests/unit`       | Backend unit suite through the root interface.                                                                |
| Root          | `npm.cmd run test:coverage`                    | Backend V8 coverage plus frontend and browser suites.                                                         |
| Root          | `npm.cmd run build --workspace backend`        | Syntax-check interpreted backend JavaScript; no bundle is needed.                                             |
| Root          | `npm.cmd run verify:production`                | Fresh production-only installation outside the checkout, startup and health probes against the owned test DB. |
| Root          | `npm.cmd run format:check`                     | Repository formatting.                                                                                        |
| Root          | `npm.cmd run format:check --workspace backend` | Backend formatting.                                                                                           |
| Frontend      | `npm.cmd test`                                 | Frontend unit/contract/session regression tests.                                                              |
| Frontend      | `npm.cmd run lint`                             | ESLint with zero permitted warnings.                                                                          |
| Frontend      | `npm.cmd run typecheck`                        | Next route generation and TypeScript.                                                                         |
| Frontend      | `npm.cmd run build`                            | Production build; requires an explicit HTTPS API URL.                                                         |
| Frontend      | `npm.cmd run format:check`                     | Frontend formatting.                                                                                          |
| Frontend      | `npm.cmd run test:browser`                     | Real browser flows using unique owned test accounts and exact-ID cleanup.                                     |
| Both packages | `npm.cmd audit`                                | Complete dependency audit, including development tools.                                                       |

Type generation uses Next's production configuration phase. Set a valid non-secret
HTTPS API URL for type/build checks, for example:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL='https://api.hostelfix.example/api/v1'
npm.cmd run typecheck --prefix frontend
npm.cmd run build --prefix frontend
```

The example domain validates configuration; it is not a provisioned endpoint.
Browser tests run their own frontend on 3100 and backend on 5100, explicitly use a
local API URL, and refuse occupied ports. On Windows with installed Edge:

```powershell
$env:PLAYWRIGHT_CHANNEL='msedge'
npm.cmd run test:browser --prefix frontend
```

Alternatively install Playwright Chromium with `npx playwright install chromium`
from `frontend/` and leave `PLAYWRIGHT_CHANNEL` unset. Test accounts and generated
files are temporary; no demo or development records are reset.

GitHub Actions in `.github/workflows/ci.yml` runs owned MongoDB, backend/frontend
checks, builds, browser regressions, and production-only installation on Windows.
The workflow is configured locally; a remote Actions run requires pushing the branch.

## Production deployment

1. Provision an authenticated, TLS-protected MongoDB replica set with appropriate
   backups and transaction support. Use a random secret from a secret manager.
2. Set backend `NODE_ENV=production`, `COOKIE_SECURE=true`, an exact HTTPS
   `CORS_ORIGIN`, and an absolute durable `UPLOAD_DIR`. Configure HTTPS termination.
3. Use frontend/API hosts within the same site for `SameSite=Strict` refresh cookies.
   Host-only cookies are the default. If setting `COOKIE_DOMAIN`, it must match the
   frontend site and also be valid for the API host; avoid unnecessary domain sharing.
4. Set `TRUST_PROXY` only to actual proxy IPs/CIDRs or the narrowly applicable
   `loopback` value. Empty trusts no proxy. Booleans, hop counts and catch-all networks
   are rejected. Verify forwarded client IPs through the actual proxy.
5. Run `npm.cmd run db:ensure-indexes` against the intended deployment configuration.
   Production disables auto-index creation and refuses startup when declared indexes
   are missing or have incompatible uniqueness/TTL/partial-filter options. The migration
   adds indexes; it does not drop unrelated indexes.
6. Build the frontend with its real HTTPS `NEXT_PUBLIC_API_BASE_URL`. This value is
   bundled into browser assets: changing it requires a rebuild. Missing production
   configuration cannot silently fall back to localhost.
7. Install backend production dependencies with `npm.cmd ci --omit=dev` at root
   and frontend production dependencies with `npm.cmd ci --omit=dev --prefix frontend`
   after building. Root `npm.cmd start` starts both services under production backend
   configuration and leaves external MongoDB management to the deployment. Check both
   `/api/v1/health` and `/api/v1/health/ready`.
8. Verify real HTTPS/cookie behavior, monitoring, backup restoration and rollback in
   staging before routing production traffic.

Current rate limiting is in memory. Deploy a single API process unless shared rate
state is provided. Multiple API instances also require shared durable upload storage.
The cleanup worker removes old unreferenced UUID photo files with a safety grace
period; referenced files, recent writes, unrelated names and symbolic links are kept.
Database unavailability prevents cleanup rather than risking evidence deletion.

Next.js is pinned to the patched 16.4.5 release with matching ESLint configuration.
Recheck advisories before release; passing local tests does not verify production
credentials, real domains/cookies, load capacity or backup recovery.

## Demo data

`npm.cmd run seed` creates 3 demo hostels, 12 wings (`Block` records), 48 rooms,
84 students (7 per wing), 2 admins scoped to all demo hostels, and 15 staff
(3 each for ELECTRICAL, PLUMBING, FURNITURE, CIVIL and CLEANING). All accounts use
the application's password hashing and authorization conventions. The 84 initial
complaints have distinct owners/titles and dated model/audit history over roughly
the preceding 84 days: 45 CLOSED, 22 RESOLVED, 8 ASSIGNED, 7 IN_PROGRESS,
1 TRIAGED and 1 SUBMITTED. This is 67 finished and 17 open (79.8%/20.2%).
Every staff member has one open job and resolved history. Dashboards query these
records through the real scoped APIs.

Generated credentials and all account emails are in local-only [DEMO.md](DEMO.md)
and `.local/demo/credentials.json`, both ignored by Git. Sign in at
`http://localhost:3000/login`. Passwords persist across resets unless overridden
with `HOSTELFIX_DEMO_STUDENT_PASSWORD`, `HOSTELFIX_DEMO_STAFF_PASSWORD`,
`HOSTELFIX_DEMO_ADMIN_PASSWORD` or `HOSTELFIX_DEMO_ENROLLMENT_PASSWORD` before
`reset:demo`; use at least 12 characters. Never deploy these accounts or files.

Plain seed is repeatable and preserves ready demo records, including workflow
changes. `reset:demo` removes only explicitly registered demo records and regenerates
their relative dates. Cleanup requires a verified local `hostelfix` database,
the checkout-bound `.local/demo/owner.json`, matching MongoDB ownership manifest
and matching per-record `demoSeedOwner`. It deletes exact IDs inside a transaction.
Missing/mismatched ownership or external references aborts cleanup. Production,
remote databases, unmarked legacy seeds and arbitrary user data are never reset.
If ownership files are lost, restore them from your local backup; do not delete or
rewrite the manifest to claim existing records. Legacy seed exports remain only
for isolated, marked backend test fixtures.

## Root commands

`npm.cmd` works in PowerShell without changing execution policy. `npm` is
equivalent where the shell permits it. The orchestrator uses Node process handles,
PID metadata and an authenticated loopback control endpoint under
`.local/project-runtime/`. A second start reuses its supervisor and children.
Startup failures stop owned children; unrelated listeners are never adopted.
Ctrl+C stops children and a database started by that supervisor. Explicit `stop`
also stops the verified project database, retaining its files. Standalone package
servers started outside this interface are not claimed or stopped.

`dev` starts MongoDB, then backend with watch, then Next development server.
`start` uses backend's configured mode: in development it starts backend without
watch and Next dev; in production it starts the built frontend and leaves the
database external. `frontend:start` always requires an existing production build.
The supervisor retains its initial mode/configuration; stop before changing modes
or ports. Default URLs are API `http://localhost:5000/api/v1` and frontend
`http://localhost:3000`. Set `PORT`, `HOSTELFIX_FRONTEND_PORT` and the matching
`CORS_ORIGIN` for alternate ports. Production uses the deployed HTTPS API URL
embedded at build time.

| Command                                                  | Purpose                                                                                              |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `dev`, `start`, `stop`                                   | Complete application lifecycle                                                                       |
| `status`, `health`                                       | Ownership/PIDs/URLs and real DB/API/frontend health                                                  |
| `build`                                                  | Backend syntax validation and frontend production build                                              |
| `test`, `test:coverage`                                  | Full sequential suites; backend coverage for the latter                                              |
| `seed`, `reset:demo`                                     | Add/preserve demo, or safely clean and regenerate it                                                 |
| `backend:start`, `backend:dev`, `backend:stop`           | Managed backend lifecycle                                                                            |
| `backend:build`, `backend:test`, `backend:coverage`      | Syntax validation, tests, V8 coverage                                                                |
| `backend:format`                                         | Backend format check; no separate backend linter is configured                                       |
| `frontend:dev`, `frontend:start`, `frontend:stop`        | Managed frontend lifecycle                                                                           |
| `frontend:build`, `frontend:test`                        | Production build, frontend tests                                                                     |
| `frontend:lint`, `frontend:typecheck`, `frontend:format` | ESLint, types, formatting                                                                            |
| `db:install`, `db:start`, `db:stop`                      | Existing portable Windows MongoDB manager                                                            |
| `db:status`, `db:health`, `db:init`                      | Ownership/status, ping, idempotent rs0 setup                                                         |
| `db:ensure-indexes`                                      | Existing deployment index migration; verify target configuration first                               |
| `db:seed`                                                | Alias of `seed`                                                                                      |
| `db:reset`, `seed:reset`                                 | Aliases of `reset:demo`; never a general database reset                                              |
| `demo:clean`, `demo:verify`, `demo:logins`               | Scoped cleanup, seed integrity checks, local login document                                          |
| `demo:verify:api`                                        | Real demo logins/workflow/dashboard and preservation checks; cleans demo on success, then run `seed` |
| `verify:lifecycle`                                       | Alternate-port lifecycle regression; requires application stopped, restores initial DB running state |
| `verify:production`                                      | Fresh backend production-only install/startup smoke test                                             |
| `format`, `format:check`                                 | Repository formatting write/check                                                                    |

No existing MongoDB backup/restore infrastructure or `mongodump`/`mongorestore`
installation was found, so backup/restore commands are not advertised. Provision
and validate real database tools/backups separately before production deployment.
The portable database manager is Windows-only; package tools and Node orchestration
use portable invocation, but other operating systems need their own owned database
adapter. Tests currently enforce the existing project ownership mechanism.

## MongoDB structure and read-only exploration

Connect to the verified port shown by `db:status`:

```powershell
mongosh "mongodb://127.0.0.1:27018/hostelfix?replicaSet=rs0"
```

```javascript
show dbs
use hostelfix
show collections
db.hostelfix_demo_ownership.find({}, { ids: 0 })
const demoOwner = db.hostelfix_demo_ownership.findOne({kind: 'demo-v2'})._id
db.hostels.find({demoSeedOwner: demoOwner}, {name: 1, code: 1})
db.blocks.find({demoSeedOwner: demoOwner}, {name: 1, hostelId: 1})
db.users.find({demoSeedOwner: demoOwner, role: 'STUDENT'}, {name: 1, email: 1, hostelId: 1, blockId: 1}).limit(10)
db.complaints.find({demoSeedOwner: demoOwner}, {title: 1, status: 1, priority: 1, ownerId: 1}).sort({createdAt: -1}).limit(10)
db.complaints.aggregate([{$match: {demoSeedOwner: demoOwner}}, {$group: {_id: '$status', count: {$sum: 1}}}])
const complaint = db.complaints.findOne({demoSeedOwner: demoOwner})
db.activities.find({complaintId: complaint._id}).sort({occurredAt: 1})
db.comments.find({complaintId: complaint._id}).sort({createdAt: 1})
db.feedbacks.find({complaintId: complaint._id})
exit
```

Collections are `users`, `sessions`, `hostels`, `blocks` (wings), `rooms`,
`categories`, `hostelpolicies`, `complaints`, `activities`, `comments`,
`attachments`, `feedbacks`, plus the demo ownership manifest. Students reference
hostel/block/room; staff reference hostel/categories; admins hold `adminHostelIds`.
Complaints reference owner, hostel, category, location, assignee/resolver and
attachments. Activities/comments/feedback reference complaint and actor/author.
`hostelfix_test` is separate and contains isolated test fixtures, never demo cleanup.
