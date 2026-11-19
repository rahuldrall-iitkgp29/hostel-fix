# HostelFix implementation and verification report - temporary

**Date:** 2026-11-19  
**Status:** All 21 safely actionable items from the previous review have been addressed.  
**Assessment:** Ready for staging and deployment validation; production rollout still requires the infrastructure checks below.  
**Git:** Changes are uncommitted and have not been pushed. This remains a temporary report.

This report replaces the previous analysis snapshot with implementation results. It
records completed changes, final successful checks, corrected intermediate failures,
and the limits of production verification.

## P0 - Critical fixes

| Item                                    | Implementation                                                                                                                                                                          | Evidence                                                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Production upload dependency         | `formidable` 3.5.4 is a direct backend runtime dependency, with an updated root lockfile.                                                                                               | Fresh `npm ci --omit=dev` outside the repository resolved formidable locally, excluded Vitest, started the API, and passed both health probes. |
| 2. Upload response mismatch             | The common client validates `{ attachment, expiresAt }` and returns the nested attachment.                                                                                              | Unit regression rejects malformed envelopes; browser photo reporting succeeds.                                                                 |
| 3. Authentication state synchronization | One observable in-memory session snapshot supplies React context and API authentication. Successful refresh publishes the user/token; failure clears both.                              | Scheduled refresh and revoked-session regressions pass.                                                                                        |
| 4. Refresh concurrency                  | Initial and subsequent refreshes share one pending promise. A local queue serializes auth operations, and Web Locks coordinate same-origin browser tabs.                                | Initialization/coalescing tests and simultaneous real-browser tab refresh pass.                                                                |
| 5. Refresh/logout races                 | Generation checks suppress late login/refresh results. Logout clears local state, prevents further refresh until explicit login, waits for cookie rotation, and broadcasts across tabs. | Delayed-response, queued-login, logout and cross-tab browser tests pass.                                                                       |

## P1 - Functional fixes

| Item                                     | Implementation                                                                                                                                                                                                                                     | Evidence                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 6. Priority action mismatch              | UI uses backend `CHANGE_PRIORITY`.                                                                                                                                                                                                                 | An administrator changes priority in the real browser journey.                                                             |
| 7. Student editing                       | Submitted complaints expose a title/description edit form with `expectedVersion`, input validation, and explicit conflict/reload handling.                                                                                                         | Browser edit succeeds; conflict regression prevents overwriting a newer record.                                            |
| 8. Private photo viewing                 | Authorized blob retrieval uses the common API client. The viewer supports full-size opening and cleans up object URLs/aborted requests.                                                                                                            | Student and assigned staff view the photo; unauthorized access is denied.                                                  |
| 9. Idempotent submissions                | Retries of the same draft retain the request ID, simultaneous clicks share the request, and successful repeated submissions reuse the result. Backend duplicate detection is repeated inside the authorized transaction.                           | Lost-response unit test and five repeated concurrent MongoDB submission cases return one complaint and one creation event. |
| 10. Upload cleanup                       | Temporary files are tracked and removed on validation, malformed multipart, size, controller and completion paths. Windows close/unlink races have bounded retries. A worker removes old unreferenced UUID files after a grace period.             | Real multipart success/rejection tests and orphan-cleanup preservation/failure tests pass.                                 |
| 11. Deletion and submission coordination | Failed deletion leaves the photo visible for retry. Upload/delete operations block submission and conflicting photo operations.                                                                                                                    | Browser delayed-upload and failed-deletion scenarios pass.                                                                 |
| 12. Common upload transport              | Multipart and private binary requests share base URL validation, current auth, credentials, CSRF, timeout/cancellation, redirect rejection, and structured error handling. A rejected mutation recovers session state without replaying the write. | Transport tests and real browser upload/deletion flows pass.                                                               |

The cleanup worker skips referenced content, recent writes, unrelated filenames and
symbolic links. A database reference-check failure stops cleanup. If a transaction
commit is ambiguous, file rollback first checks whether a record survived rather
than deleting possibly committed evidence.

## P1 - Security and deployment fixes

| Item                             | Implementation                                                                                                                                                                                                                                                                                     | Evidence                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 13. Production API configuration | Production/type-generation configuration requires an explicit HTTPS `/api/v1` base URL. Silent production localhost fallback is removed.                                                                                                                                                           | Missing/insecure configuration regression and explicit-HTTPS production build pass.    |
| 14. Patched Next.js              | Next.js and eslint-config-next are pinned to compatible patch release 16.4.5. Existing Node/React compatibility was checked before upgrading.                                                                                                                                                      | Production build succeeds; direct npm advisory query for 16.4.5 returns zero findings. |
| 15. Cookies, proxies and indexes | Secure/HttpOnly/Strict refresh cookies are preserved. Cookie domains must match the frontend site. Trusted proxy configuration accepts explicit IPs/CIDRs or loopback and rejects broad boolean/hop/catch-all settings. Production startup verifies declared indexes and requires migration first. | Cookie, proxy trust and missing/non-unique index regressions pass.                     |

Compatible dependency audit updates also removed the newly surfaced Mongoose,
body-parser and development-tool advisories. Backend Vitest/coverage remain within
the existing 4.1 major series at 4.1.12. Nodemon is pinned to unaffected 3.1.11 within
the same 3.1 development-tool series. No forced audit upgrade was used. Both complete
dependency audits, including development dependencies, report zero vulnerabilities.

Database timeout configuration now uses socket timeouts, server command limits and
explicit readiness/startup deadlines instead of the upgraded driver's deprecated
`timeoutMS` option.

## P2 - Engineering improvements

| Item                              | Implementation                                                                                                                                                                                                                                                                                                           | Evidence                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 16. Runtime response validation   | Typed Zod schemas replace complaint/dashboard `z.unknown()` casts. Uploads, people, locations, workflow actions, comments, activity, feedback and pagination are validated. Existing mocked responses now follow real API contracts.                                                                                     | Malformed response and pagination regressions pass alongside existing frontend tests.                                 |
| 17. History pagination            | Comment and activity APIs return validated page metadata; the detail screen exposes separate previous/next controls.                                                                                                                                                                                                     | Browser history with 21 comments and multiple activity pages passes.                                                  |
| 18. Authorization and concurrency | Complaint/upload transactions reload current account/session authorization and take account/session write guards. Permission changes and revocation cannot bypass transaction retries. Creation rechecks/guards active references and attachment binding. Bounded exponential backoff avoids immediate retry exhaustion. | Revoked-session, permission-change, version-conflict, duplicate-submission, quota and transaction regressions pass.   |
| 19. Formatting                    | The three original test formatting faults and new code formatting are corrected. Framework-generated next-env.d.ts is excluded from formatting checks.                                                                                                                                                                   | Backend, frontend and final root formatting checks pass.                                                              |
| 20. Documentation                 | Root and frontend READMEs now describe actual functionality, separate installs, API configuration, test prerequisites, safe alternate-port MongoDB and deployment limitations.                                                                                                                                           | Current commands and local results are recorded here.                                                                 |
| 21. CI                            | A Windows GitHub Actions workflow runs owned MongoDB, backend/frontend tests, lint, types, builds, formatting, browser regressions and production-only installation.                                                                                                                                                     | Equivalent checks pass locally; remote GitHub Actions execution has not been performed because no push was requested. |

Auth fixture cleanup discovers business records using only its exact random user
IDs, including assertion-failure paths. Seed integration tests use unique
`seed_<uuid>_` collection namespaces, so their reset does not erase other fixtures or
existing model collections. Generated seed namespaces are cleaned up explicitly.

## Important files modified or added

| Area                      | Files                                                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependencies/scripts      | `package.json`, `package-lock.json`, `backend/package.json`, `frontend/package.json`, `frontend/package-lock.json`                                                                           |
| Authentication            | `frontend/src/features/auth/session-store.ts`, `frontend/src/features/auth/context/auth-context.tsx`, `backend/src/utils/authorizedTransaction.js`, `backend/src/middleware/authenticate.js` |
| API contracts/transport   | `frontend/src/lib/api/client.ts`, `frontend/src/lib/api/complaints.ts`, `frontend/src/lib/api/url.ts`, `frontend/src/features/complaints/response-schemas.ts`                                |
| Workflow UI               | Complaint creation/detail components, `edit-complaint-form.tsx`, `private-photo.tsx`, `submission.ts`, `private-photo.ts`, `pagination.tsx`, profile view                                    |
| Backend mutations/storage | `backend/src/services/complaint.service.js`, `upload.service.js`, `uploadCleanup.service.js`, `middleware/uploadMultipart.js`, `utils/temporaryUploads.js`, `utils/transactions.js`          |
| Deployment                | `backend/src/config/env.js`, `database.js`, `testDatabase.js`, `backend/src/models/index.js`, `backend/src/server.js`, `frontend/next.config.ts`, `backend/.env.example`                     |
| Safe test infrastructure  | `scripts/mongodb/manage.ps1`, `safety.js`, `test-safety.js`, database/auth fixture helpers, seed integration isolation                                                                       |
| Verification/CI           | `scripts/verify-production.js`, `scripts/browser-fixture.js`, `backend/scripts/check-syntax.js`, `frontend/playwright.config.ts`, `.github/workflows/ci.yml`                                 |
| Documentation             | Root README, frontend README and frontend guide, frontend history, `.prettierignore`, this temporary report                                                                                  |

## New and updated regression tests

New backend tests cover multipart temporary-file cleanup, rejected upload cleanup,
orphan preservation, authorization guards, trusted proxies, production cookie
options, required indexes, repeated duplicate submissions and revocation after
middleware authorization. Existing transaction tests now check bounded backoff;
seed tests and fixture cleanup use safe isolated ownership.

New frontend tests cover the observable session store, refresh/login/logout races,
real upload envelopes, authenticated binary retrieval, malformed responses,
idempotency, versioned editing and page metadata. Existing authentication/complaint
fixtures were updated to assert the corrected behavior and real response contracts.

Four Playwright browser tests exercise:

1. Photo reporting and viewing, student editing, admin priority/triage/assignment,
   staff resolution, student closure and feedback.
2. Simultaneous tab refresh and cross-tab logout.
3. Delayed uploads, failed deletion/retry, edit conflict handling and unauthorized reads.
4. Comment and activity history pagination with more than one page.

Playwright is the only new development test dependency. Formidable is the required
new direct production dependency; its code was already used by the application.

## Final commands and successful results

The verified runtime was Node.js 24.14.0 / npm 11.9.0 on Windows. Database runs used:

```powershell
$env:HOSTELFIX_TEST_PORT='27018'
```

The owned MongoDB 8.0.34 replica set was started with the project script, using new
isolated `.local/mongodb-test-27018/` data/config/log directories. The unrelated
listener on 27017 was neither stopped, claimed, reset nor modified.

| Location | Command                                        | Final result                                                                                                                    |
| -------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Root     | `npm.cmd run test:coverage`                    | PASS: 549 tests, 28 files, zero failures and zero skips. All backend unit/integration suites executed.                          |
| Root     | `npm.cmd test -- tests/unit`                   | PASS: 297 tests across 14 files.                                                                                                |
| Root     | `npm.cmd test --prefix frontend`               | PASS: 85 tests across 8 files.                                                                                                  |
| Frontend | `npm.cmd run lint`                             | PASS: zero errors/warnings.                                                                                                     |
| Frontend | `npm.cmd run typecheck`                        | PASS with explicit HTTPS API configuration.                                                                                     |
| Frontend | `npm.cmd run build`                            | PASS: Next.js 16.4.5 production compilation, TypeScript and route generation. No Next.js security reminder.                     |
| Root     | `npm.cmd run build --workspace backend`        | PASS: backend JavaScript syntax build. The backend is interpreted and needs no bundle.                                          |
| Root     | `npm.cmd run format:check --workspace backend` | PASS.                                                                                                                           |
| Root     | `npm.cmd run format:check --prefix frontend`   | PASS.                                                                                                                           |
| Root     | `npm.cmd run format:check`                     | PASS after this report update.                                                                                                  |
| Root     | `npm.cmd run verify:production`                | PASS: fresh isolated production-only dependency installation, local formidable resolution, API startup, liveness and readiness. |
| Frontend | `npm.cmd run test:browser`                     | PASS: all 4 real Edge browser tests, zero skips, with exact-owned fixture cleanup.                                              |
| Root     | `node scripts/mongodb/test-safety.js`          | PASS: 21 checks with the selected alternate port.                                                                               |
| Root     | `npm.cmd audit --json`                         | PASS: zero vulnerabilities, including development dependencies.                                                                 |
| Root     | `npm.cmd audit --prefix frontend --json`       | PASS: zero vulnerabilities, including development dependencies.                                                                 |
| Root     | `git diff --check`                             | PASS: no whitespace errors.                                                                                                     |
| Registry | Bulk advisory query for `next: ["16.4.5"]`     | HTTP 200, zero advisories.                                                                                                      |

For frontend type/build checks, the explicit non-secret validation URL was:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL='https://api.hostelfix.example/api/v1'
```

This is a configuration example, not a deployed API. Browser tests explicitly use
their local backend on 5100 and frontend on 3100, with:

```powershell
$env:PLAYWRIGHT_CHANNEL='msedge'
```

### Full backend coverage

| Metric     | Result |
| ---------- | ------ |
| Statements | 88.26% |
| Branches   | 73.60% |
| Functions  | 95.00% |
| Lines      | 88.74% |

Reports are generated under `backend/coverage/`. The historical README coverage
figure is superseded by these current full-suite results.

### Corrected intermediate failures

Intermediate failures were resolved, rather than hidden or skipped:

- Windows sandbox worker restrictions required authorized unrestricted test/build runs.
- An alternate-port startup child initially lacked the selected port; fixtures now propagate it.
- Stricter response schemas exposed invalid old mocks; fixtures now follow real contracts.
- Immediate transaction retries exhausted their bound during contention; bounded backoff
  and repeated duplicate-submission tests were added.
- A cleanup projection hydrated a partial Complaint document and triggered its cycle hook;
  cleanup now uses lean ID projections.
- Running browser and backend reset tests together exposed shared collection reset behavior;
  seed tests now use isolated namespaces, and final suites ran sequentially.

The final browser run passed all four scenarios after those corrections. No test was
disabled to obtain the final results. Browser logs retain harmless NO_COLOR/FORCE_COLOR
warnings from the test tooling.

## Remaining limits and manual deployment steps

There are no remaining safely actionable implementation items from the 21-item list.
The following external deployment validations remain; they are not claimed as passed:

1. Provision real authenticated/TLS MongoDB replica-set credentials and a random JWT
   secret. The production-only install smoke test intentionally used test-mode config
   against owned local MongoDB and did not authenticate to a production database.
2. Configure real HTTPS frontend/API domains and verify Secure/HttpOnly/Strict cookie
   delivery in staging. The hosts must have compatible same-site topology.
3. Set actual narrow `TRUST_PROXY` addresses and verify client IP/rate limiting through
   the intended reverse proxy.
4. Run `npm.cmd run db:ensure-indexes` with the intended production configuration,
   then confirm startup/readiness. No external production index migration was executed.
5. Provide durable upload storage, monitoring and backup restoration. Current rate
   limiting is process-local: use one API process unless shared rate state/storage is
   added deliberately.
6. Verify production load capacity, failure recovery, backup restoration and rollback.
   These were not exercised against an external deployment.
7. Use modern browsers supporting Web Locks for cross-tab refresh coordination. Local
   coordination still works without it; unsupported browsers were not validated.
8. Trigger the new CI workflow when ready to push. No commit, push or remote CI run
   was performed in this task.

Ignored build/test artifacts and isolated production-install verification directories
remain available for inspection. The owned test MongoDB data is retained after its
process is stopped; no recursive data deletion was performed.

**Readiness decision:** Application fixes and executable local regressions are complete.
Proceed to staging with the deployment settings above. Approve production traffic
only after real infrastructure, HTTPS/cookies, indexes and recovery checks pass.

---

## Latest demo and lifecycle implementation report — 20 November 2026

This section records the subsequent demo/lifecycle work. It supersedes earlier
statements about root commands and the final running state of local MongoDB.
Existing review fixes and unrelated user changes were preserved. No commit or push
was performed. This file remains a temporary local implementation report.

### Implemented demo and ownership rules

The existing schemas and roles are retained. Wings are existing `Block` records;
staff specialization is represented by existing `categoryIds`, scoped to a hostel.
Both administrators have all three demo hostels in `adminHostelIds`. Passwords use
the existing purpose-specific SHA-256/bcrypt implementation and normal input limits.
No production credentials or fixed new demo passwords were added to source code.

The old seed created Hostel A, Alpha/Beta blocks, five rooms, five categories, one
policy, one student, one staff member, one administrator, three sample complaints,
their activities and one feedback record. Its exports remain for isolated marked
`seed_<uuid>_` test fixtures. Unmarked legacy development data is preserved rather
than adopted. The old collection reset was replaced with scoped ownership cleanup.

New seed ownership has three checks: the local checkout/database/port-bound
`.local/demo/owner.json`, the MongoDB `hostelfix_demo_ownership` manifest with exact
registered IDs/collection names, and matching hidden immutable `demoSeedOwner`
fields. Generated sessions and complaint descendants inherit and register this
ownership within transactions. Ordinary users/catalog records are not claimed
through a hostel reference.

Cleanup first requires explicit development configuration, exact local `hostelfix`
target, actual connection database name and the existing process/path/loopback/rs0
ownership verification. Production, remote and wrong database targets are refused.
Missing manifests, unknown marked IDs, altered markers and unrelated records
referencing demo IDs abort cleanup. Deletion requires one registered ID plus its
matching marker and runs atomically. There is no collection-wide reset, unrestricted
deleteMany or dropDatabase in the demo cleanup. Repeated cleanup returns zero.

Plain seed preserves ready data and its workflow changes; reset cleans only owned
records and rebuilds relative dates. Credential overrides are validated before
cleanup, and changed passwords require reset. Read-only login documentation refuses
missing/partial or mismatched credentials rather than inventing login passwords.

### Final seeded records

| Record | Exact owned count |
| --- | ---: |
| Hostels | 3 |
| Wings / blocks | 12, four per hostel |
| Rooms | 48 |
| Students | 84, seven per wing |
| Administrators | 2 |
| Staff | 15, three per supported domain |
| Categories | 15, five per hostel |
| Hostel policies | 3 |
| Complaints / distinct complainants | 84 / 84 |
| Activities | 564 |
| Comments | 84 |
| Feedback records | 45 |
| Initial attachments / sessions | 0 / 0 |

Hostels: Tagore Residency, Sarojini Hall and Vivekananda House. Each has East,
West, North and South wings. Supported staff domains are ELECTRICAL, PLUMBING,
FURNITURE, CIVIL and CLEANING; each has one specialist in each hostel.

| Initial status | Count |
| --- | ---: |
| CLOSED | 45 |
| RESOLVED | 22 |
| ASSIGNED | 8 |
| IN_PROGRESS | 7 |
| TRIAGED | 1 |
| SUBMITTED | 1 |

Finished: **67/84 (79.8%)**. Unresolved: **17/84 (20.2%)**, of which 15 are assigned
or in progress and two await admin action. Every staff member has an open job and
resolved history. Complaint dates span approximately the preceding 84 days, with
recent open work and chronological assignment/resolution/closure/feedback history.
Models increment complaint versions through sequential saves and generate matching
audit records; the integrity verifier checks references, actors, eligibility and dates.

Admin priority distribution, hostel breakdown and recent activity, and staff
resolution/activity history are backed by scoped database queries. Existing student
dashboards, queues, authorization and response formats are retained, with validated
additive dashboard response fields. No frontend statistics were fabricated.

### Login instructions

Run `npm.cmd run dev`, then open `http://localhost:3000/login`. All account emails
and generated passwords are in root `DEMO.md`, grouped by staff domain and student
hostel/wing. It and `.local/demo/credentials.json` are local-only and ignored by Git.

- Admin: `admin.operations@demo.hostelfix.test`
- Admin: `admin.warden@demo.hostelfix.test`
- Example student: `student.tagore.a01@demo.hostelfix.test`
- Example staff: `staff.electrical.tagore@demo.hostelfix.test`

Use the role password shown in DEMO.md. To change it, configure
`HOSTELFIX_DEMO_STUDENT_PASSWORD`, `HOSTELFIX_DEMO_STAFF_PASSWORD`,
`HOSTELFIX_DEMO_ADMIN_PASSWORD` and/or `HOSTELFIX_DEMO_ENROLLMENT_PASSWORD` before
`npm.cmd run reset:demo`. Account passwords must match normal authentication limits
(12–128 characters and at most 256 UTF-8 bytes); demo enrollment accepts 12–64
characters. Never expose or seed these accounts in production.

### Root commands

Run `npm.cmd run <command>` from root. The root interface reuses existing package
scripts and Windows MongoDB infrastructure without a new process-manager dependency.

| Group | Commands |
| --- | --- |
| Complete application | `dev`, `start`, `stop`, `build`, `test`, `test:coverage`, `status`, `health` |
| Backend | `backend:start`, `backend:dev`, `backend:stop`, `backend:build`, `backend:test`, `backend:coverage`, `backend:format` |
| Frontend | `frontend:dev`, `frontend:start`, `frontend:stop`, `frontend:build`, `frontend:test`, `frontend:lint`, `frontend:typecheck`, `frontend:format` |
| Database | `db:install`, `db:start`, `db:stop`, `db:status`, `db:health`, `db:init`, `db:seed`, `db:reset` |
| Demo | `seed`, `reset:demo`, `seed:reset`, `demo:clean`, `demo:verify`, `demo:logins`, `demo:verify:api` |
| Verification | `verify:lifecycle`; retained `verify:production`, `db:ensure-indexes`, `format`, `format:check` |

`dev` starts/validates MongoDB, then backend with watch, then Next development.
Development `start` uses backend without watch and Next dev; production `start`
uses the built frontend and does not manage external MongoDB. `frontend:start`
always uses a production build. `db:reset` and `seed:reset` are aliases for safe demo
reset, never general database deletion. Root `test` runs backend, frontend and
browser suites sequentially; `test:coverage` adds backend V8 coverage.

The foreground Node supervisor tracks spawned child PIDs and readiness, stores
checkout-bound state, and exposes a token-authenticated loopback control endpoint.
Duplicate starts retain PIDs. Service startup includes actual HTTP readiness checks;
dependency failures stop owned children. Windows shutdown requests use IPC to run
backend/Next cleanup. Ctrl+C stops children and any database started by that manager;
explicit root stop also stops the verified project database and retains its files.
Servers started independently of the manager are not adopted. Changing mode/ports
requires stopping the existing supervisor first.

### Tests and validation executed

No existing test was disabled or skipped to obtain a passing result.

| Exact command / action | Result |
| --- | --- |
| `HOSTELFIX_TEST_PORT=27018 node scripts/mongodb/test-safety.js` (PowerShell env assignment) | PASS: 21 target/process/replica guard checks; no database write |
| `npm.cmd run db:status`, `db:health`, `db:init` | PASS: owned 27018, PRIMARY rs0, hostelfix; idempotent initialization |
| `npm.cmd run reset:demo` | PASS: owned cleanup and regenerated demo |
| `npm.cmd run seed` twice, then `npm.cmd run demo:verify` | PASS: no duplication, exact counts above, valid relations/history/dates |
| `npm.cmd run demo:logins` | PASS: valid local login documentation |
| `npm.cmd run demo:verify:api` | PASS: 12 representative student logins, all 15 staff and both admins; database/dashboard counts including staff workload; real priority, triage, assignment, work, resolution, closure and 201 feedback creation; foreign-staff access rejected and stale assignment returned 409; cleanup preserved unrelated records, rejected external admin references and was idempotent |
| `npm.cmd run verify:lifecycle` | PASS: db start/health, dev/start, duplicate PID retention, status/health, individual stops/restarts, occupied backend port refusal/preservation, full shutdown, production frontend start/page and restoration of original DB running state |
| Manual `npm.cmd run dev` and Ctrl+C | PASS: owned application children stopped, supervisor metadata removed, already-running owned DB retained |
| `$env:PLAYWRIGHT_CHANNEL='msedge'; npm.cmd test` | PASS: 559 backend tests/32 files, 85 frontend tests/8 files and all four real Edge browser scenarios |
| `npm.cmd run backend:coverage` | PASS: 559 backend tests/32 files; 87.50% statements, 73.73% branches, 94.43% functions, 88.08% lines |
| `npm.cmd run backend:test` after final credential guard | PASS: all 560 backend unit/integration tests across 32 files, zero failures/skips; 121.47 seconds |
| `npm.cmd run frontend:test` | PASS: 85 tests/8 files |
| `npm.cmd run frontend:lint` | PASS: zero ESLint warnings |
| `$env:NEXT_PUBLIC_API_BASE_URL='https://api.hostelfix.example/api/v1'; npm.cmd run frontend:typecheck` | PASS: Next route generation and TypeScript |
| Same API env; `npm.cmd run build` | PASS: backend syntax check and Next 16.4.5 optimized production build, 16 routes |
| `npm.cmd run backend:build` | PASS after final seed changes |
| `npm.cmd run backend:format`, `frontend:format`, `format:check` | PASS: backend/frontend/repository formatting; generated credentials/report files excluded |
| `$env:HOSTELFIX_TEST_PORT='27018'; npm.cmd run verify:production` | PASS: fresh isolated production-only installation, formidable resolution, startup and both health probes with owned test-mode DB config |
| `mongosh "mongodb://127.0.0.1:27018/hostelfix?replicaSet=rs0" --quiet --eval 'db.getCollectionNames().filter(n => !n.startsWith("seed_")).sort()'` | PASS: confirmed actual collections listed in README; sandbox blocked optional external shell log file |
| `git diff --check` | PASS |

The four browser cases cover photo reporting/editing/admin priority and assignment/
staff resolution/feedback; concurrent refresh/logout across tabs; upload coordination,
failed deletion, version conflicts and unauthorized access; paginated comments/activity.
Backend suites include all existing unit/integration tests, duplicate-submission and
authorization/concurrency regressions. New tests cover seed allocation/timeline,
production/remote target refusal, forged process ownership, local credentials and
atomic cleanup preservation (missing manifests, altered markers, unregistered IDs,
external references, repeat cleanup).

Initial frontend/Node worker checks hit Windows sandbox EPERM; authorized runs
outside the sandbox passed. The first demo API verifier expected 200 for feedback;
the check now respects the existing 201 API contract. Native Next startup initially
missed development worker initialization, causing config/page errors; the launcher
now follows installed CLI initialization and startup probes actual pages. Formatting
findings were corrected. These failed attempts are not claimed as passed runs.

### Files created or modified for this work

- Root `package.json`, `README.md`, `.gitignore`, `.prettierignore`, `analysis.md`;
  generated local `DEMO.md` and `.local/demo/{owner,credentials,summary}.json`.
- Backend package scripts; `backend/seeds/{demo-cli,demo-plan,demo,ownership,verify-demo}.js`;
  legacy `index.js`, `reset.js` and seed README.
- `backend/src/models/demoOwnership.js`, `common.js`; scoped additions to
  `backend/src/services/dashboard.service.js`.
- `backend/tests/unit/{demo-plan,demo-credentials,project-ownership}.test.js`,
  `backend/tests/integration/demo-cleanup.test.js`; existing isolated seed tests.
- `scripts/{project-config,database,managed-service,supervisor,project,verify-demo-api,verify-project-lifecycle}.js`.
- Frontend admin/staff dashboard pages, `dashboard-history.tsx`, complaint/dashboard
  types and runtime response schemas. Existing frontend package scripts were reused.
- Existing Windows database helpers and CI workflow configuration were updated to
  propagate the selected owned port and support the complete root test interface.
  Prior dependency lockfile changes and review fixes were preserved.

### Limits, final state and manual steps

The local demo is usable and the initial distribution is restored. Project MongoDB
is left running on **27018**, database **hostelfix**, replica set **rs0**. Managed
application services are stopped; start them with `npm.cmd run dev`. The unrelated
MongoDB instance on 27017 was never terminated, reset or written by this work.

The portable MongoDB manager remains Windows-only. Other operating systems need an
equivalent owned database adapter. No existing dump/restore infrastructure or
mongodump/mongorestore tools were available, so no unsupported backup/restore command
was added. Seed ownership files must be retained; restore them rather than claim
unknown records. Generated demo credentials must remain local.

Production checks used the configured HTTPS example URL and a test-mode owned
MongoDB smoke test. Real production credentials, external database administration,
HTTPS cookie/proxy behavior, backup recovery and load testing remain external
deployment steps from the earlier report. Do not treat demo readiness as production
infrastructure verification. The Next launcher uses the pinned native server APIs;
rerun build/browser/lifecycle checks when upgrading Next.js. Remote CI was configured
but not run, since no commit/push was requested.

Manual local use: `npm.cmd run dev`, login with DEMO.md, inspect with `status`/`health`,
then `npm.cmd run stop`. To rebuild the initial demo use `reset:demo`. README contains
all commands, mode/configuration details, actual collection relationships and basic
read-only mongosh navigation. No independent demo infrastructure work remains blocked.

## Follow-up: complaint request loop and dashboard 429 — 20 November 2026

The reported browser requests established HTTP 429 on repeated
`GET /api/v1/complaints?page=1&limit=10&sort=createdAt:desc`. Reproduction with an
existing demo student sent 120 complaint-list requests in four seconds: 118 returned
200 and two returned 429. Returning to the dashboard then displayed “Dashboard
unavailable.” Complaint reads and dashboard reads intentionally share the existing
120 requests/minute per-user limiter.

Root cause: `ComplaintList` used `fixedFilters = {}` as a parameter default and
included `fixedFilters` in its request effect's dependencies. Every response updated
component state and rendered a fresh default object. Its changed identity ran the
effect again, fetching another response and repeating until the read budget was
exhausted. The earlier browser scenarios did not leave a complaint-list page open,
so they missed this behavior. Logging in with another student started the same
loop against that account's separate read budget.

The default is now one frozen module-level empty object. Existing effect dependencies,
real filter changes and pagination are retained. Backend rate limits, authentication,
CSRF and API retry behavior were not relaxed. Dashboard/list error panels now preserve
the common client's validated `ApiError` message; arbitrary exceptions and malformed
server bodies still use safe generic messages. A rate-limited request consequently
shows “Too many requests. Try again later.” instead of incorrectly blaming connectivity.

The `content.js` unsafe-eval/CSP warning names a chrome-extension source and is
separate from the application's 429 responses. Application CSP was not weakened.

Changes: `complaint-list.tsx`, student/admin/staff dashboard pages, common API error
helper, new `request-error.test.ts`, and new `tests/browser/complaint-list.spec.ts`.
The browser regressions cover all four list callers (student complaints, staff
queue, admin triage, admin assignment), bounded initial requests, one request per
filter/page change, safe 429 messages and explicit retry without a request loop.

Validation: frontend unit tests passed (87 tests, nine files); lint, TypeScript,
production build and repository/frontend formatting passed. The five new browser
regressions passed in isolation. Final complete browser command:
`$env:HOSTELFIX_TEST_PORT='27018'; $env:PLAYWRIGHT_CHANNEL='msedge'; npm.cmd run test:browser --prefix frontend`
passed all nine tests in 60.0 seconds, including all four existing workflows.
`npm.cmd run frontend:test` passed 87 tests; `frontend:lint`, `frontend:typecheck`,
`frontend:build`, `frontend:format` and `format:check` passed. Type/build checks used
the existing explicit HTTPS example API configuration. `git diff --check` passed.

The same real demo reproduction after the fix made two successful initial complaint
reads in four seconds, returned dashboard HTTP 200 and did not show the unavailable
panel. The two development reads are consistent with React Strict Mode. The application
was restored with `npm.cmd run start`; `npm.cmd run health` verified MongoDB on 27018,
the API on 5000 and frontend on 3000. No commit or push was performed.

A complete browser attempt was interrupted by another application frontend start
competing with the test frontend for Next's shared development lock; the supervisor
then shut down its owned database, producing 503 failures and a failed fixture
cleanup. That interrupted run is not claimed as passing. Tests were rerun sequentially
with the owned local database explicitly started. No unowned MongoDB or arbitrary
data was deleted. Stop the managed application before browser tests, and restart it
afterward; alternate ports do not remove Next's per-checkout development lock.

Another intermediate full run exhausted the unchanged refresh limit because the new
list tests unnecessarily used full-page navigation for every page switch. Those
tests now exercise the application's normal navigation links, preserving the session
and leaving refresh-specific behavior to the existing concurrent-refresh regression.
All existing tests still execute; no limiter or test assertion was weakened. The
final complete run passed after these test-isolation corrections.
