# HostelFix

JavaScript/CommonJS backend for hostel maintenance. Product contracts are in
[prd.md](prd.md); the active backend queue and verified work are in
[docs-backend/task.md](docs-backend/task.md) and [docs-backend/history.md](docs-backend/history.md).

## Current backend (P0 Complete)

The backend implements all **33 P0 REST endpoints** under `/api/v1` matching the PRD specification:

| Area           | Method / Path                                      | Role / Access        | Purpose                                                                             |
| -------------- | -------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| **Health**     | `GET /api/v1/health`                               | Public               | Process liveness probe.                                                             |
| **Health**     | `GET /api/v1/health/ready`                         | Public               | Database & private storage readiness probe.                                         |
| **Auth**       | `POST /api/v1/auth/register`                       | Public + CSRF        | Student registration with enrollment code verification.                             |
| **Auth**       | `POST /api/v1/auth/login`                          | Public + CSRF        | Creates session, returns JWT and sets `hf_refresh` cookie.                          |
| **Auth**       | `POST /api/v1/auth/refresh`                        | Refresh cookie       | Rotates refresh token, detects reuse, and revokes compromised family.               |
| **Auth**       | `POST /api/v1/auth/logout`                         | Bearer / Cookie      | Revokes addressed session(s) and clears cookie.                                     |
| **Auth**       | `GET /api/v1/auth/me`                              | Authenticated        | Current session user profile.                                                       |
| **Users**      | `GET /api/v1/users/me`                             | Authenticated        | Profile view.                                                                       |
| **Users**      | `PATCH /api/v1/users/me`                           | Authenticated + CSRF | Updates editable profile fields (`name`, `phone`) with version check.               |
| **Users**      | `POST /api/v1/users/me/password`                   | Authenticated + CSRF | Password change, revokes all sessions, forces re-login.                             |
| **Catalog**    | `GET /api/v1/catalog/hostels`                      | Public               | Paginated list of active hostels.                                                   |
| **Catalog**    | `GET /api/v1/catalog/hostels/:hostelId/blocks`     | Public               | Active blocks in a hostel.                                                          |
| **Catalog**    | `GET /api/v1/catalog/rooms`                        | Public               | Paginated rooms in a block without leaking occupants.                               |
| **Categories** | `GET /api/v1/categories`                           | Authenticated        | Active categories in caller's hostel (`includeInactive` admin only).                |
| **Uploads**    | `POST /api/v1/uploads`                             | STUDENT + CSRF       | Stages complaint photo (JPEG, PNG, WebP ≤5 MiB, ≤12 MP). Max 10 unattached.         |
| **Uploads**    | `GET /api/v1/uploads/:attachmentId/content`        | Authorized           | Streams private photo with secure headers.                                          |
| **Uploads**    | `DELETE /api/v1/uploads/:attachmentId`             | STUDENT owner + CSRF | Deletes unattached staged upload.                                                   |
| **Complaints** | `POST /api/v1/complaints`                          | STUDENT + CSRF       | Submits report with deterministic SLA deadlines & priority calculation. Idempotent. |
| **Complaints** | `GET /api/v1/complaints`                           | Authenticated        | Scoped complaint list (Student: own; Staff: assigned; Admin: scoped hostels).       |
| **Complaints** | `GET /api/v1/complaints/:complaintId`              | Authorized           | Detailed complaint view with allowed actions and cycle history.                     |
| **Complaints** | `PATCH /api/v1/complaints/:complaintId`            | STUDENT owner + CSRF | Edits complaint content before triage (`SUBMITTED` only).                           |
| **Complaints** | `GET /api/v1/complaints/:complaintId/comments`     | Authorized           | Chronological public discussion comments.                                           |
| **Complaints** | `POST /api/v1/complaints/:complaintId/comments`    | Authorized + CSRF    | Adds comment to nonterminal complaint.                                              |
| **Complaints** | `GET /api/v1/complaints/:complaintId/activity`     | Authorized           | Immutable timeline of audit events.                                                 |
| **Workflow**   | `POST /api/v1/complaints/:complaintId/transitions` | Authorized + CSRF    | State transitions (`TRIAGED`, `REJECTED`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`).     |
| **Workflow**   | `POST /api/v1/complaints/:complaintId/assignment`  | ADMIN + CSRF         | Assigns/reassigns eligible technician in hostel/category with concurrency check.    |
| **Workflow**   | `POST /api/v1/complaints/:complaintId/priority`    | ADMIN + CSRF         | Overrides priority and tightens deadlines.                                          |
| **Workflow**   | `POST /api/v1/complaints/:complaintId/reopen`      | STUDENT owner + CSRF | Reopens resolved complaint within 7-day window (max 2 reopens). Clears assignee.    |
| **Workflow**   | `POST /api/v1/complaints/:complaintId/feedback`    | STUDENT owner + CSRF | Rates resolution 1–5 stars on `RESOLVED` or `CLOSED` complaint.                     |
| **Admin**      | `GET /api/v1/admin/staff`                          | ADMIN                | Assignment picker with `eligibleForComplaintId` filtering and open count.           |
| **Dashboard**  | `GET /api/v1/dashboard/student`                    | STUDENT              | Personal overview (status counts, recent complaints, latest activity).              |
| **Dashboard**  | `GET /api/v1/dashboard/staff`                      | STAFF                | Workload overview (status counts, overdue counts, work queue sorted per §15.4).     |
| **Dashboard**  | `GET /api/v1/dashboard/admin`                      | ADMIN                | Operational overview (hostel-scoped counts, unassigned, overdue, staff workload).   |

## Seed and Demo Accounts

To populate the development database with deterministic reference data and demo accounts:

```powershell
npm.cmd run seed
```

To cleanly reset the test/local database and re-seed (strictly guarded against non-test hosts):

```powershell
npm.cmd run seed:reset
```

### Provisioned Demo Accounts

| Role      | Name            | Email                      | Password           | Scope                             |
| --------- | --------------- | -------------------------- | ------------------ | --------------------------------- |
| `STUDENT` | Asha Student    | `student.a@hostelfix.demo` | `DemoStudent@2026` | Hostel A, Block Alpha, Room A-101 |
| `STAFF`   | Ravi Technician | `staff.r@hostelfix.demo`   | `DemoStaff@2026!`  | Hostel A, Electrical & Plumbing   |
| `ADMIN`   | Priya Warden    | `admin.p@hostelfix.demo`   | `DemoAdmin@2026!`  | Hostel A (Admin scope)            |

Enrollment code for Hostel A: `ENROLL-HOSTEL-A-2026`.

## Local setup

Use Node.js **20.19+** (the PRD targets Node 20 LTS) and npm. Run commands from the
repository root. The root package delegates to the `backend` npm workspace;
there is one root lockfile. Backend source, configuration and tests use CommonJS.

```powershell
npm.cmd ci
Copy-Item backend/.env.example backend/.env
```

Only copy the example if `backend/.env` does not already exist. For a fresh checkout,
fill the two database placeholders with the local URIs below, set `JWT_SECRET` to a
cryptographically random secret of at least 32 bytes, and set `UPLOAD_DIR` to
an absolute persistent directory on your machine.
Keep credentials out of Git and terminal output.

| Command                         | Behavior                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `npm.cmd run dev`               | Nodemon watches backend JavaScript and runs the server.                             |
| `npm.cmd start`                 | Validates config, connects to replica set, prepares storage, listens on port 5000.  |
| `npm.cmd test`                  | Runs all backend Vitest/Supertest tests.                                            |
| `npm.cmd run test:coverage`     | Runs the full suite with V8 coverage; HTML report at `backend/coverage/index.html`. |
| `npm.cmd run seed`              | Seeds deterministic reference data, policies, accounts, and sample complaints.      |
| `npm.cmd run seed:reset`        | Guarded test reset runner (drops collections and re-seeds cleanly).                 |
| `npm.cmd run db:ensure-indexes` | Adds declared indexes for all twelve models using the configured database.          |

## Configuration

`backend/.env.example` lists the PRD §13.9 settings. Startup requires
`MONGODB_URI`, `JWT_SECRET`, `CORS_ORIGIN`, and `UPLOAD_DIR`. Invalid settings
produce a nonzero exit and safe variable names, never their values or a stack.

- `MONGODB_URI` is parsed by the MongoDB driver without connecting. A non-SRV
  URI requires a nonempty `replicaSet`; direct/secondary-only connections are
  rejected. Startup verifies a transaction-capable replica-set primary. Production
  requires database username/password authentication. Atlas SRV syntax is accepted
  for deployment; local development/tests use the project-local MongoDB below.
- `NODE_ENV=test` also requires the exact documented local `TEST_MONGODB_URI`.
  The database layer uses that independent key exclusively in test mode, even if
  `MONGODB_URI` names another environment. Remote, alternate-database/port, missing,
  credentialed or extra-option test URIs are rejected before connecting.
- `CORS_ORIGIN` is one exact origin with no path or trailing slash. HTTP is
  allowed only for localhost/loopback; production requires HTTPS.
- `COOKIE_SECURE` defaults to `true`; `false` is limited to localhost development.
  Production always requires `true`. Empty `COOKIE_DOMAIN` means host-only.
- The PRD's access/refresh lifetimes and bcrypt cost are enforced as
  `600`, `604800`, and `12`, respectively; other supplied values are rejected.
- `PORT` is an integer from 1–65535; `LOG_LEVEL` defaults to `info`.
  `UPLOAD_DIR` must be absolute. Startup creates the directory if missing and
  verifies private read/write access; no static upload route is registered.
- Configuration validation does not prove secret randomness or storage durability.
  Deployment must provide a random secret, HTTPS and persistent upload storage.

The JSON limit (32 KiB), cookie attributes, upload bounds and rate policies are
fixed PRD constants in `src/config/policy.js`, not undocumented environment knobs.
Refresh cookies now use these settings; the approved hashing/locator contracts
are recorded in PRD §§13.1–13.3 and the Session 4 history.

CORS allows only `CORS_ORIGIN`, with credentials and the exact PRD methods/headers.
Every POST/PUT/PATCH/DELETE requires that exact `Origin` and
`X-CSRF-Protection: 1`, including local test clients; missing/mismatched values
return 403 `CSRF_INVALID`. Preflight does not require those mutation credentials.
Pino logs generated request IDs, method, status and duration, plus safe lifecycle
events; it does not serialize request bodies, URLs, headers, configuration or raw
driver errors. In-memory rate limiting is for a single process; Redis remains P1.

Database connection/selection and storage startup checks use five-second timeouts.
Production disables Mongoose `autoIndex`; run `db:ensure-indexes` against the
intended deployment configuration to add indexes without dropping existing ones.
Ctrl+C/SIGINT or SIGTERM stops new HTTP connections, drains
requests for up to five seconds, then closes the application's database connection.
Shutdown is idempotent; a failed database shutdown has a five-second deadline and
the CLI exits unsuccessfully. This does not stop the separate MongoDB process.

## Source layout and tests

`backend/src/app.js` exports `createApp()` with no env loading, database access,
or network listener. `src/server.js` is the executable entry point. Routers,
controllers, middleware, validators, config and utilities are separate. Models
are registered explicitly on a connection through `src/models/index.js`.
Authentication and profile services are implemented. Other product services and
the seed runner remain in their later sessions.

The full suite now requires the project-local `rs0` below. Test fixtures explicitly
select `hostelfix_test`, never a real env file or the development URI. An optional
process `TEST_MONGODB_URI` override is validated against the same exact target.
Database tests check the project's ownership record, actual MongoDB settings and
single local replica-set member before discovery/writes. Missing infrastructure
fails with startup instructions instead of silently skipping tests.

Tests cover transport/security, safe errors/logs, production configuration,
readiness failures/recovery, graceful shutdown and real transaction isolation,
commit and rollback, model/index uniqueness, safe serialization, immutable
history, concurrent version conflicts, auth validation, long credentials,
session rotation/reuse, forced changes, password revocation and auth races.
Infrastructure tests delete only their
UUID record from `hostelfix_infrastructure_test`; model tests track and remove
only their own random ObjectIds. Auth fixtures discover route-created records
through their exact random emails and track those IDs for guarded cleanup.
Empty test collections and indexes remain. Temporary
storage fixtures are under ignored `backend/.local/` and removed without recursive
deletion. No development records, database drops or resets are used.

Verified Session 4 suite: **426 passed, 0 failed/skipped** across thirteen files;
statement coverage **96.91%**. Run it after starting MongoDB:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\mongodb\start.ps1
npm.cmd test
npm.cmd run test:coverage
```

## Project-local MongoDB on Windows

MongoDB Community **8.0.34** uses the same portable ZIP, checksum verification,
hidden-process and ownership-record pattern as PCB. Ghar Se's older portable
installation is 8.0.12. This setup makes no system PATH, service, registry or
machine execution-policy changes. The Node MongoDB driver **7.2.0** is a root
development-only administration dependency. The backend runtime uses Mongoose
**9.11.2** with its own driver dependency.

After a reboot, run these from the project root in PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\mongodb\start.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\mongodb\status.ps1
```

`start.ps1` starts the owned process if needed, initializes `rs0` only when MongoDB
reports `NotYetInitialized`, and waits for PRIMARY. Repeating it retains the PID
and existing replica-set configuration. Every script resolves paths from its
own location, so an absolute `-File 'C:\path\to\checkout\scripts\mongodb\start.ps1'`
also works from another directory. The execution-policy override applies only to
that PowerShell process. No administrator service installation is required.

First-time installation and explicit initialization (already performed here):

```powershell
npm.cmd ci
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\mongodb\install.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\mongodb\start.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\mongodb\init-replica-set.ps1
```

The installer downloads the [official Windows ZIP](https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.34.zip)
and its [official SHA-256](https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.34.zip.sha256),
then compares both to the pinned digest before extraction:
`6b021a0864494e4decf278b36477a29eb36072432773e4e62c2f42c302630db0`.
It retains existing installations and refuses a partial installation or mismatched
archive. Windows x64/AVX and the Visual C++ x64 runtime are required; missing
system prerequisites are reported, never automatically installed.

| Setting                       | Local value                                                        |
| ----------------------------- | ------------------------------------------------------------------ |
| Executable                    | `tools/mongodb/mongodb-win32-x86_64-windows-8.0.34/bin/mongod.exe` |
| Archive/checksum              | `tools/mongodb/mongodb-windows-x86_64-8.0.34.zip[.sha256]`         |
| Data                          | `.local/mongodb-data/`                                             |
| Logs                          | `.local/mongodb-logs/mongod.log`, `stdout.log`, `stderr.log`       |
| Runtime config/ownership/lock | `.local/mongodb-runtime/`                                          |
| Bind / port                   | `127.0.0.1:27017` exclusively                                      |
| Replica set                   | `rs0`, single member `127.0.0.1:27017`                             |
| WiredTiger cache              | 0.25 GB                                                            |

The ignored **`backend/.env`** uses the existing application key and an independent
test key. For a new checkout, set these non-secret local URIs there:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/hostelfix?replicaSet=rs0
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/hostelfix_test?replicaSet=rs0
```

No Atlas configuration was overwritten: the root `.env` was empty and retained;
`backend/.env` was absent before setup. A fresh random local JWT secret was
generated privately to satisfy the existing app configuration loader. The example
file contains only placeholders for secrets/database URIs. Preserve any existing
nonlocal configuration instead of copying over it. MongoDB creates databases
lazily: `hostelfix` may not appear in database listings until the application
first writes to it; the setup only pings that database.

Verify and stop:

```powershell
node .\scripts\mongodb\test-safety.js
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\mongodb\verify.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\mongodb\stop.ps1
```

Verification uses `replSetGetStatus` (the command behind `rs.status()`), checks the
actual PID/config/data directory/bind address and PRIMARY, pings both configured
databases, and performs insert/read/delete and real transaction isolation,
commit and rollback in **`hostelfix_test` only**. It also checks the existing
application configuration loader without printing credentials. It removes only
its random UUID test record; an empty, uniquely named `hostelfix_setup_*` test
collection remains intentionally. No collection/database reset is implemented.

The URI guards accept only the two exact documented targets and reject alternate
hosts, databases, ports, credentials and extra options before connecting through
those URIs. Process-level URI overrides take precedence and are validated as
strictly as the local env file. Management uses a fixed loopback direct connection
so an uninitialized replica set can be inspected safely.

Start/stop/init/status/verify operations share an exclusive management lock. Stop
checks executable, PID, creation time, command line, checkout, runtime config and
actual MongoDB settings before requesting graceful shutdown. It neither kills
unrelated processes nor deletes data. Repeated stop is safe. An unowned listener
on 27017 causes startup to fail; it is never terminated automatically.

For a failure, inspect only these local logs:

```powershell
Get-Content .\.local\mongodb-logs\mongod.log -Tail 40
Get-Content .\.local\mongodb-logs\stderr.log -Tail 40
```

Do not delete data to fix startup/election failures or rewrite ownership records
to claim another process. Checksum/download failures stop installation. A missing
DLL must be resolved separately. This loopback-only, unauthenticated server is
for local development/testing, not production. Session 2 integrates this existing
replica set with application startup, readiness and guarded backend tests.

Start the API and check both probes from a second PowerShell terminal:

```powershell
npm.cmd start
# In a second terminal (default API port):
Invoke-RestMethod http://127.0.0.1:5000/api/v1/health
Invoke-RestMethod http://127.0.0.1:5000/api/v1/health/ready
```
