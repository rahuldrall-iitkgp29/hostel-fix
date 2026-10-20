## Frontend Master Instructions for Every Codex Session

You are continuing the HostelFix frontend project. Before doing any work:

1. Read this entire `frontend/task.md`.
2. Read `frontend/history.md`.
3. Inspect the current frontend repository, package scripts, tests, and relevant backend/API contract files.
4. Identify the first pending session. Do not repeat completed work.
5. Execute only that session, unless a small prerequisite is strictly necessary.
6. Preserve completed work and follow existing architectural decisions.
7. Never modify backend files or backend task/history files.
8. Do not invent undocumented API endpoints, business rules, or permissions.
9. Run appropriate lint, typecheck, tests, and/or production build checks for the changes.
10. Fix regressions introduced by your changes. Report unrelated failures separately.
11. Append a dated entry to `frontend/history.md` containing the session, changes, verification results, and remaining issues.
12. Mark tasks completed only when their acceptance criteria have actually passed.
13. Do not delete session definitions. Preserve completed sessions and their acceptance criteria as an audit trail.
14. Stop after the current session and provide a concise handoff identifying the next pending session.

# HostelFix frontend execution plan

## Documentation location and safe boundaries

The user's final instruction places frontend Markdown under the existing repository-root
`docs-frontend/`, beside `docs-backend/`. **This is the canonical task queue.**
`frontend/task.md`, `frontend/history.md`, and `frontend/README.md` are forwarding
documents that keep the original resume command and package entry points usable.
Reading either forwarding task/history file requires following its canonical link.
For instruction 11, append to `docs-frontend/history.md`; do not create a second log.

Resume with:
`Read frontend/task.md and frontend/history.md, then execute the next pending session.`

- All application code, package files, generated artifacts and tests belong in `frontend/`.
- Only frontend Markdown belongs in root `docs-frontend/`. This documented exception is
  authorized by the user's explicit docs-location instruction.
- Never edit root/backend manifests, lockfiles, scripts, environment, PRD, source,
  or backend queues. Re-read them as contracts evolve.
- Preserve unrelated staged/untracked work. The root Git index already contained changes
  before frontend initialization. Do not reset, stage, commit, or clean those changes.
- No applicable ancestor/repository `AGENTS.md` existed at initial reconnaissance.
  The final `next dev` smoke test generated `frontend/AGENTS.md`; it is retained.
  Read it on resumption and follow its relevant installed Next.js documentation pointers.
  This generated instruction file is an additional necessary frontend-local Markdown file.
- This bootstrap explicitly covered Sessions 0–1 plus useful prerequisites from 2–4.
  The one-session rule governs subsequent resumes. Partial foundations do not complete
  their owning future sessions.

## Master objective and implementation standards

Build a production-quality Next.js App Router frontend for HostelFix, independently of
parallel backend development. Finish the P0 operational workflow before P1.
Use strict TypeScript, React, Tailwind, npm, reusable typed UI, and feature modules.
Keep business rules in features/services, not presentational components. Prefer
server components; use client components for interaction and session state.
Use React Hook Form + Zod + the installed resolver for real forms, and Sonner for feedback.
Do not add dependencies without a concrete requirement.

Maintain this folder strategy as features become real:
`src/app` for route composition; `components/ui|layout|feedback` for shared presentation;
`features/auth|complaints|dashboard|profile|notifications|administration` for domain work;
`lib/api|auth|validation|utils`, `hooks`, `types`, `config`, `public`, and `tests`
only when they contain useful files. No empty scaffolding, shadcn config without shadcn,
or unnecessary libraries. No chart library until P1 reporting is actually implemented.

Design: green/ivory campus-operations identity, readable typography, restrained UI,
mobile-first below 768px, 44px targets, accessible labels/focus/keyboard navigation,
responsive content and public/app navigation. Reuse tokens and primitives. Add loading
skeletons, empty/error/unauthorized states and recoverable validation/concurrency feedback.
Avoid nonfunctional controls, fabricated adoption metrics, fake live complaints, and
unsupported role navigation. P1 controls stay hidden until usable.
The landing workflow figure is an explicitly labeled explanatory illustration, not
a data fixture. No application mock mode currently exists.

If later needed, mock data must live behind an explicit development-only adapter,
be visibly labeled, and be excluded from production paths. Never interpret fixtures
as successful backend authentication, mutation, or authorization.

## Reconnaissance and authoritative contracts (2026-10-19)

Sources: root `prd.md` v1.0 including approved 2026-10-19 clarifications;
`backend/src/routes`, controllers, validators, middleware, config, models/projections,
`backend/.env.example`; `docs-backend/task.md` and `docs-backend/history.md`.
Root `task.md`/`history.md` do not exist. Root README has stale `docs/*` links:
read the actual paths above; do not repair backend documentation in a frontend session.
PRD exists and defines §§1–20. User explicitly requires TypeScript over PRD's default JS.

### Roles, lifecycle, and release priorities

- STUDENT: one active hostel and assigned room; only own complaints; permitted room,
  block-common and hostel-common reports. Public registration never accepts role selection.
- STAFF: one hostel, configured categories; only currently assigned complaints and permitted
  history. Staff start work/resolve/comment; no triage/assign/reject/close/reopen actions.
- ADMIN: explicit `adminHostelIds`; no institution-wide/super-admin UI. Triage/reject,
  eligible assignment/reassignment, priority change, and closure only after the server's window.
- Exact states: SUBMITTED, TRIAGED, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED, REOPENED, REJECTED.
  Open = SUBMITTED/TRIAGED/ASSIGNED/IN_PROGRESS/REOPENED; RESOLVED awaits confirmation and
  is excluded from active SLA backlog. Use PRD §7 and server advisory `allowedActions`;
  the backend always reauthorizes.
- P0 includes **profile edit/password change, comments, student close/reopen and feedback**.
  Do not defer them to generic P1 Session 9. P0 also includes photo staging/deletion,
  concurrency, complaint idempotency, overdue filters, role dashboards and inline staff picker.
- P1: notifications, duplicate suggestions/linking, escalations, rich reporting, staff/account
  management, catalogs and policy editing. No P1 catalog-management pages in the P0 dashboard.
- P2: email password recovery, SSO, AI/ML, live chat, WebSockets, offline/PWA, payments,
  bulk merges, complaint deletion and emergency dispatch. Never call HostelFix AI-powered.
- PRD supplies exact SLA/priority policy in §§10.13/14; do not invent durations. Use server
  deadlines/overdue flags. Seven-day reopen window and maximum two reopens are PRD-defined;
  use server time/eligibility, not the browser clock as security authority.
- Every complaint mutation requires `expectedVersion`; 409 VERSION_CONFLICT means refetch
  and ask the user to review/reapply, never silently repeat. Create uses a stable client UUID
  and canonical payload replay rules. Lost mutation responses require refetch before retry.
- All timeline notes/comments are public to authorized complaint readers; no internal notes.
  Private photos require bearer-authenticated blob fetches, object URL lifecycle/revocation.

### Initial backend readiness and integration map

Only `GET /api/v1/health` and `GET /api/v1/health/ready` are registered as of this entry.
Infrastructure and twelve P0 model factories exist, but model projections are not evidence
that an HTTP endpoint is implemented. Backend's next session is 4 (authentication).
Reinspect before every integration session. **The handoff update below supersedes
this initial snapshot for auth/profile readiness.**

| Area | PRD-defined endpoints under /api/v1 | Initial implementation |
| --- | --- | --- |
| Health | GET /health; GET /health/ready | Confirmed routes; frontend typed wrappers exist |
| Auth | POST /auth/register, /auth/login, /auth/refresh, /auth/logout; GET /auth/me | Backend pending; no frontend endpoint calls |
| Profile | GET/PATCH /users/me; POST /users/me/password | Backend pending |
| Registration catalogs | GET /catalog/hostels; GET /catalog/hostels/:hostelId/blocks; GET /catalog/rooms | Backend pending |
| Categories/photos | GET /categories; POST /uploads; GET /uploads/:id/content; DELETE /uploads/:id | Backend pending |
| Complaints | GET/POST /complaints; GET/PATCH /complaints/:id; GET/POST comments; GET activity | Backend pending |
| Workflow | /complaints/:id/transitions, /assignment, /priority, /reopen, /feedback | Backend pending; confirm methods/schema in PRD §9.4 before use |
| Dashboards | GET /dashboard/student, /dashboard/staff, /dashboard/admin | Backend pending |
| Assignment picker | GET /admin/staff?eligibleForComplaintId=... | P0, backend pending; account-management mutations P1 |

Confirmed transport from `response.js`, `errorHandler.js`, `csrf.js`, `cors.js`, `policy.js`:
success `{data,meta:{requestId,...}}`; 204 no body; errors
`{error:{code,message,fields?:[{path,message}],requestId}}`. IDs/dates/enums per PRD §9.1.
Pagination is PRD-defined (page 1–1000, limit 1–100, totalPages 0 when empty) but no list
route is implemented yet; add helpers with Session 5 rather than fabricated response fields.

### Authentication/security decisions and initial dependencies

- Access JWT is intended to live only in memory, never localStorage/sessionStorage.
  No tokens or session storage have been implemented yet.
- Intended refresh: HttpOnly `hf_refresh`, SameSite=Strict, Path=/api/v1/auth, Secure in
  production, 600-second access token and 7-day refresh per PRD. Issuance/rotation not implemented.
- Browser client includes credentials. Every mutation carries `X-CSRF-Protection: 1`.
  Browser supplies Origin; don't fake or disable it. Backend CORS defaults to
  `http://localhost:3000`, API to `http://localhost:5000/api/v1`.
- Use localhost consistently; localhost vs 127.0.0.1 affects origin/cookie behavior.
  Production requires same-site HTTPS frontend/API deployment compatible with Strict cookies;
  unrelated Vercel/Render domains are not automatically compatible. Don't weaken cookies.
- No guessed refresh endpoint implementation, proxy, persistent token store, or auth bypass.
  API transport has no retry behavior; Session 4 adds one coordinated refresh and at most
  one safe read retry. Mutations keep command-specific retry semantics.
- Future `returnTo` handling must allow only safe relative application paths.
  Current route shells use fixed internal paths and ignore user-supplied redirect targets.
- Backend ambiguity B1: opaque cookie does not specify how to locate tokenFamily/session.
  B2: bcrypt's 72-byte limit conflicts with long passwords/128-character refresh input.
  Those backend decisions remain unresolved; frontend must not invent formats/prehash/secrets.
- B3/B4 model decisions were clarified on Oct 19 (separate Block collection; flat current
  cycle with derived detail and retained prior-cycle evidence). HTTP detail still pending.
- Recheck B5 validation/auth ordering, B6 upload cleanup, B7 private audit/notification enum,
  B8 report bucket/sample semantics if relevant. Full records are in backend history.
- PRD §9.8's empty pagination example is not a blocker: §9.1 defines the envelope.

### Handoff update — parallel backend progress (2026-10-19, approximately 17:52 IST)

During this frontend run, the separate backend work added auth/user routers, controllers,
validators, services and authentication middleware. The router now mounts /auth and /users.
Inspected `auth.routes.js`, `user.routes.js`, auth/user controllers, common/auth validators,
and relevant services. Login/refresh return data `{user,accessToken,expiresIn:600}`;
registration returns `{user}` without a session; logout/password change return 204.
Common validators now implement the PRD email/password/name/phone/ID rules.

Backend history records user-approved B1/B2 clarification at 17:29 IST. The HttpOnly
cookie is `v1.<UUID-v4 family>.<64-byte random hex secret>`; hashing uses server-side
domain-separated SHA-256/base64 before bcrypt. Frontend must neither parse the HttpOnly
cookie nor prehash passwords. Rotation retains absolute session expiry. **B1/B2 are
resolved, superseding the initial blockers above.** Concurrent refresh can revoke the
family; coordinated refresh across relevant browser execution contexts needs verification.

Backend Session 4's final completion/test record had not appeared at the time of this
check. Treat these as new implemented source requiring reinspection and live integration
verification, not proof of a working deployment. Registration catalogs, seeds, uploads,
complaints, workflow and dashboards remain pending. The frontend session flow stays in
Sessions 3–4; this bounded initialization does not expand to full auth implementation.
Public shells therefore still truthfully say access is unavailable **in this frontend build**.

Hash comparison detected these parallel backend/PRD/document changes; they were not made
or reverted by the frontend work. Root package/lockfile/gitignore and scripts were preserved.

## Architecture already delivered

Independent npm package/lockfile in `frontend/`; NOT registered in root backend workspace.
Next 16.4.2 / React 19.3.1 / Tailwind 4.3.3. Strict TS 6.0.3 and ESLint 9.39.5 are the
latest compatible majors for the installed lint dependencies: parser requires TS <6.1,
React ESLint plugin excludes ESLint 10. Resolver 6.0.0 failed npm peer resolution; 5.9.2
installs cleanly with RHF 7/Zod 4. No force/legacy-peer-deps.

Tokens in globals.css; system typography avoids remote-font build dependency.
Local favicon; no external images/fonts/CDN. Button/link, card, badge, field, skeleton,
state-panel, public header/footer, mobile disclosure, container, heading and toast host.
`lib/api` handles validated relative URLs, Zod response envelopes, safe structured errors,
credentials/CSRF, deadlines/cancellation and explicit 204 responses. Only health wrappers.
No fake session, business data, product mutation endpoints, or automatic API requests.

Routes: public /, /login and /register (honest unavailable shells); role dashboard paths
redirect to login with a fixed returnTo. Missing routes return real 404. Error/loading
boundaries exist. Dashboard routes are placeholders, not implemented/protected workflows.

## Session queue — preserve every definition and acceptance criterion

### Session 0 — Repository reconnaissance and frontend plan
**Status: COMPLETE (2026-10-19).**

- [x] Inspect PRD, actual backend routes/models/security, root instructions, existing files.
- [x] Record roles, P0/P1 workflows, UI requirements, API dependencies, unresolved decisions.
- [x] Document docs-location exception and independent package boundaries.
**Acceptance:** Findings and integration assumptions documented in this queue/history. Passed.

### Session 1 — Next.js initialization and development foundation
**Status: COMPLETE (2026-10-19).**

- [x] Initialize independent App Router application and compatible dependencies/lockfile.
- [x] Configure strict TypeScript, ESLint, Tailwind, dev/build/start/lint/typecheck/test scripts.
- [x] Add purposeful structure, styles, layout, metadata/favicon and safe environment example.
- [x] Deliver first useful public foundation and account/role route shells as bootstrap scope.
- [x] Run install, lint, typecheck, API tests and production build.
**Acceptance:** Dependencies install; lint/typecheck work; production build succeeds.
Passed. Lockfile reinstall and final results recorded in history; visual audit remains open.

### Session 2 — Design system and shared UI
**Status: COMPLETE (2026-10-20).**

- [x] Inspect/reuse existing tokens, buttons, fields, cards, badges, skeletons and state panels.
- [x] Audit typography, contrast, spacing and responsive behavior in an available browser.
- [x] Build shared application frame/sidebar/mobile navigation and page header/breadcrumb
  primitives with typed roles. Do not expose them as authenticated navigation before Session 4.
- [x] Add an accessible dialog when a real flow needs it; use a supported primitive for
  focus trapping/restoration and Escape behavior rather than a hand-rolled inaccessible modal.
- [x] Verify keyboard navigation, 44px targets, mobile disclosure and loading/error/empty states.
**Acceptance:** Responsive, consistent components, accessible interactions, no avoidable
duplication; actual browser evidence. No business dashboard fixtures presented as live data. Passed.

### Session 3 — Public landing page and authentication UI
**Status: COMPLETE (2026-10-20).**

- [x] Review/finish landing; retain its explanatory illustration and real entry routes.
- [x] Reinspect implemented auth/catalog validators before wiring endpoint calls.
- [x] Build RHF/Zod login and student-only registration using PRD-supported fields:
  name/email/password/optional phone plus hostel/block/room and enrollment code.
- [x] Follow exact validation: normalized email; untrimmed password/UTF-8 limit from PRD;
  E.164 phone; cascading active catalogs; no role/status/scope selection.
- [x] Add pending/disabled/field/server/network error states. No false auth success;
  registration success leads to login and never creates a frontend session.
- [x] Connect only confirmed endpoints. If still absent, keep explicit unavailable state
  and record integration subtask blocked; do supported UI work without inventing catalogs.
**Acceptance:** Forms work and validate, never claim successful authentication without a
real response; pending backend integration is explicitly tracked, not marked passed. Passed.

### Session 4 — API client and session lifecycle
**Status: COMPLETE (2026-10-20).**

- [x] Reinspect backend auth, response contracts, cookies, CORS and B1/B2 resolutions.
- [x] Extend tested transport for confirmed UserSelf/auth schemas and field errors.
- [x] Implement in-memory access token, coordinated refresh, one read retry, logout
  revocation handling, expiry, safe returnTo and forced password change.
- [x] Implement PRD P0 profile read/edit name/phone and password-change flow for all roles
  (or retain explicit P0 follow-up in Session 8 if needed); never allow role/room/email edits.
- [x] Add route protection and role-aware navigation; render no protected content until auth
  completes. Backend remains authorization authority. Hide P1 and other-role controls.
- [x] Verify credentials/Origin/CSRF/SameSite assumptions in real browser integration.
**Acceptance:** Tested API utilities and verified integration path; if backend unavailable,
document exact blockers and keep affected tasks incomplete. No fabricated session success. Passed.

### Session 5 — Student dashboard and complaint list
**Status: NEXT PENDING.**

- [ ] Integrate GET /dashboard/student and GET /complaints once implemented.
- [ ] Implement status cards, recent 5 complaints, latest 10 activities, personal overdue state.
- [ ] Implement status/category/date/search filters, supported sorts, pagination and typed
  summaries; no ownerId filters, scope expansion or undocumented dashboard metrics.
- [ ] Add pagination helpers and loading/empty/network/unauthorized/retry states as needed.
**Acceptance:** Typed, role-appropriate workflow with real API data when ready; absent APIs
are explicit blockers, not substituted production fixtures.

### Session 6 — Complaint creation and details
**Status: PENDING.**

- [ ] Integrate active catalogs, permitted location variants, four priority indicators,
  title/description validation, stable clientRequestId and supported priority explanation.
- [ ] Implement up to 3 photos, staging/removal/retry states and private authenticated blob
  reads/revocation; enforce PRD file limits without pretending client checks authorize access.
- [ ] Implement detail/status/activity/comments and student edit-before-triage.
- [ ] Implement **P0 close/reopen and current-cycle feedback** with allowedActions, notes,
  server deadlines, expectedVersion and conflict review. Preserve resolved vs closed.
- [ ] Handle lost create response using documented idempotency; never repeat mutations blindly.
**Acceptance:** Creation and tracking work against documented API, including P0 student
follow-up; no invented state transitions, fields, priorities, locations or deadlines.

### Session 7 — Staff dashboard and complaint handling
**Status: PENDING.**

- [ ] Build /staff/dashboard, /staff/queue and assigned complaint detail using actual APIs.
- [ ] Use documented workQueue ordering, workload/overdue counts and assignment visibility.
- [ ] Add permitted start-work, public response and resolution forms with exact notes/versions.
- [ ] Verify no triage/assignment/reject/close/reopen controls and correct unauthorized states.
**Acceptance:** Staff sees only relevant options; real API mutations follow actual contracts.

### Session 8 — Admin dashboard and operational management
**Status: PENDING.**

- [ ] Build scoped operational overview, hostel selector, lists, workload and overdue/unassigned.
- [ ] Implement triage/rejection, priority override, eligible staff assignment/reassignment,
  public comments and admin closure only after the server-defined window.
- [ ] Use P0 GET /admin/staff?eligibleForComplaintId picker; explain eligibility/conflict errors.
- [ ] Verify all roles' P0 profile/password workflows from Session 4 are complete.
- [ ] Defer staff/account management writes and catalogs/settings to Session 9 per actual PRD.
**Acceptance:** UI reflects backend authorization, scope, validation and version-conflict
handling; P0 includes working assignment without requiring P1 management screens.

### Session 9 — P1 features
**Status: PENDING; starts only after the P0 work above is demonstrable.**

- [ ] Implement supported in-app notifications, duplicate suggestions/linking, escalations,
  reports/analytics, and appropriate profile improvements.
- [ ] Implement supported staff/account and category/location/policy management.
- [ ] Add a chart library only for an actual report requirement; accessible table fallback.
- [ ] Reconcile open P1 contracts with implementation before choosing fields or formulas.
**Acceptance:** No fabricated data or unsupported actions; every delivered feature has proper
states/checks. Record deferred P1 explicitly. P0 feedback/profile must not wait for this session.

### Session 10 — UX, accessibility, responsive behavior
**Status: PENDING.**

- [ ] Audit major routes at mobile, tablet and desktop sizes, with keyboard and reduced motion.
- [ ] Fix focus management, labels, contrast, overflow, responsive navigation, dialogs, skeletons,
  empty states and recoverable errors; ensure no protected-content flash.
**Acceptance:** Key workflows usable at target sizes; record actual browser evidence/limitations.

### Session 11 — Tests and integration hardening
**Status: PENDING — 31 initial transport tests are not full product coverage.**

- [ ] Extend meaningful API/unit/component tests for auth failure, navigation by role, forms,
  complaint lifecycle, version conflicts, lost responses and error states.
- [ ] Implement the PRD §17.9 Playwright critical three-role browser journey once the backend,
  seeded accounts and an authorized isolated test environment exist. Do not reset shared DBs.
- [ ] Check live CORS/CSRF/cookie/session behavior including StrictMode refresh coordination,
  wrong roles, inactive users, forced password change and denied resources.
**Acceptance:** Tests pass; unresolved integration problems are documented, not silently skipped.

### Session 12 — Production readiness and README
**Status: PENDING.**

- [ ] Verify clean install from frontend lockfile with preview/dev servers stopped on Windows.
- [ ] Run lint, typecheck, tests, production build and dependency audit.
- [ ] Update docs-frontend/README.md for actual environment, routes, architecture, API/auth,
  mock mode if introduced, deployment limitations and troubleshooting.
- [ ] Revisit lint-tool advisory/peer compatibility without force flags or backend changes.
**Acceptance:** Another developer can start frontend from the docs and reproduce verification.

### Session 13 — Final demo readiness
**Status: PENDING.**

- [ ] Verify complete P0 workflow against the backend, remove unintended production fixtures.
- [ ] Check navigation, authorization/role isolation, errors, responsive behavior, console/build.
- [ ] Produce concise demo walkthrough, exact working feature list, remaining mocked/blocked
  features and final handoff. Do not claim deployment/pilot impact from seeded data.
**Acceptance:** Evidence-based P0 demo readiness; mocks/blockers clearly distinguished.

## Live status — update this section after every session

- **Current completed session:** Session 4 (Sessions 0, 1, 2, 3 also complete).
- **Current next pending session:** Session 5 — Student dashboard and complaint list.
- **Blockers/dependencies:** Auth and catalog routes/validators implemented on backend;
  frontend Sessions 2–4 fully integrated, tested, and audited in browser. Registration catalogs
  cascade cleanly (hostel -> block -> room). Backend MongoDB and server startup needed for live
  data seeding in Session 5. Same-site deployment must support Strict refresh cookies.
- **Exact verification status:** install PASS; lint PASS (zero warnings, max-warnings=0);
  strict typecheck PASS; Vitest PASS (59/59 tests across 4 test suites); production build PASS
  (Next 16.4.2, all 10 static routes generated). Browser subagent audit PASS: verified landing,
  login form, cascading registration form, responsive layout, 44px touch targets, accessibility
  and unauthenticated route redirects.
- **Next action:** Execute Session 5 (Student dashboard and complaint list) integrating
  GET /dashboard/student and GET /complaints with real operational workflows.

