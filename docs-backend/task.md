# HostelFix Backend --- Codex Task Queue

> **Purpose:** A persistent, session-by-session execution queue for
> implementing the HostelFix backend. Keep this file as the *active
> backlog*, not a diary. `history.md` is the durable handoff log.
>
> **How to use:** Start every new Codex chat with the **Master Prompt**
> below. Codex must read `prd.md`, this file, `history.md`, and the
> actual repository before changing code. Work only on the first pending
> session unless a dependency or blocker requires a small prerequisite
> fix.
>
> **Current paths:** The product specification is root `prd.md`. This queue,
> `history.md`, and `models.md` are in `docs-backend/`; example configuration
> is `backend/.env.example`. Older history entries retain their original paths.

------------------------------------------------------------------------

# MASTER PROMPT --- READ THIS AT THE START OF EVERY CODEX SESSION

You are the implementation engineer for the **HostelFix backend**.
Continue the existing repository; do not assume prior-chat memory.

## Mandatory first actions

1.  Read these files in order:
    -   `prd.md` --- source of truth for product behavior and API
        contracts.
    -   `task.md` --- this active task queue; begin at the first
        remaining session.
    -   `history.md` --- prior work, commands run, test results,
        decisions, blockers, and next handoff.
    -   `README.md`, `package.json`, `.env.example`, and any `AGENTS.md`
        that exist.
2.  Inspect the actual repository tree, Git status/diff, installed
    dependencies, scripts, current source files, and test setup before
    editing.
3.  Compare repository reality against `task.md` and `history.md`. Never
    overwrite working code or recreate files blindly. If the code
    already implements a queued item, verify it against the PRD and
    tests; then remove that item from `task.md` only if evidence proves
    it is complete.
4.  Confirm the first pending session's prerequisites and identify the
    exact files/routes/tests it will touch.
5.  If `prd.md` is missing, empty, contradictory, or lacks a required
    contract, **do not invent product behavior**. Implement only what
    the PRD clearly supports, and record the unresolved question as a
    blocker in `history.md`. The currently reviewed PRD has detailed
    Sections 1--9.8 but may be missing later referenced sections (for
    example, scoring/policy details). Check the actual local file before
    relying on this note.

## Binding implementation rules

-   **JavaScript only** for the backend. Do not migrate to TypeScript.
-   Use the stack and conventions defined in `prd.md`: Node.js, Express,
    MongoDB/Mongoose, Zod, Vitest and Supertest. Follow the repository's
    existing module system consistently; do not mix ESM and CommonJS.
-   Implement the API under `/api/v1` and match the PRD's exact paths,
    roles, request fields, response envelopes, status codes, error
    codes, pagination, and state transitions.
-   Treat the PRD as the contract. Do not silently simplify security or
    business rules for convenience.
-   Do not trust role, owner, hostel, room, assignee, status, SLA, or
    other privileged fields supplied by clients. Derive access scope
    from the authenticated account and database records.
-   Validate every request at the boundary with strict Zod schemas.
    Reject unknown fields, invalid IDs, unsafe query operators, invalid
    enum values, and invalid pagination/sort inputs.
-   Keep controllers thin. Put reusable business logic in services; keep
    route declarations, validators, middleware, models, and utilities
    separated in a way consistent with the repo.
-   All complaint workflow mutations must enforce the PRD state machine,
    expected-version/optimistic-concurrency checks, and atomic
    activity-history writes. Use MongoDB transactions where required. A
    replica set is required for transaction-backed tests; do not quietly
    downgrade to standalone MongoDB.
-   Implement refresh-session rotation/reuse detection,
    cookie/CSRF/Origin controls, rate limiting, safe response
    projections, and session revocation exactly as specified in the PRD.
-   Never expose passwords, password hashes, OTPs, raw refresh tokens,
    session hashes, secrets, internal storage keys, stack traces, or raw
    database errors.
-   Keep P0 as the release gate. Do not begin P1 features until all P0
    backend requirements and tests are complete, unless the PRD
    explicitly makes a P1 prerequisite necessary for a P0 route.
-   Do not add P2 features, LLM/ML classification, or unrequested
    dependencies.
-   Do not claim a test passed unless you ran it and observed the
    result. Do not hide skipped tests, warnings, or known failures.
-   Do not use destructive database commands against any non-test
    database. Tests must use an explicitly named local test database and
    a dedicated test URI. Keep the future Atlas/production URI separate
    and untouched. If MongoDB must be installed for local work, keep the
    installation/data setup project-local as requested; never overwrite
    production connection settings.
-   Never print `.env` secrets into terminal output, test snapshots,
    logs, `history.md`, or the final summary.

## Session execution loop --- mandatory

For the **first pending session only**:

1.  State the session goal, the PRD requirements it covers,
    dependencies, and acceptance criteria.
2.  Make the smallest coherent implementation that satisfies those
    criteria. Do not implement the entire backend in one uncontrolled
    pass.
3.  Add or update tests alongside the code. Use unit tests for pure
    logic and integration tests for HTTP, database, authorization,
    transactions, and concurrency.
4.  Run the narrow relevant tests first, then the full backend test
    suite when feasible. Run lint/type/syntax/import checks only if
    configured or useful; JavaScript remains the required language.
5.  Fix regressions introduced by the changes. Do not "fix" a failing
    test by weakening a valid requirement.
6.  Review the diff for security issues, accidental scope expansion,
    secrets, dead code, and inconsistent API contracts.
7.  Update `history.md` with:
    -   date/time and session ID;
    -   scope completed and files created/changed;
    -   behavior and design decisions;
    -   exact commands run and actual pass/fail/skip counts;
    -   tests not run and why;
    -   remaining bugs, risks, blockers, and PRD ambiguities;
    -   the exact next session/task to start.
8.  Update `task.md`: **remove only tasks that are fully implemented and
    verified**. Do not leave completed tasks checked off; remove them
    from the active queue. Keep incomplete tasks, split partially
    completed tasks into smaller pending items, and keep the next
    session at the top. If a session is partially complete, leave its
    unfinished work in the queue.
9.  Do not claim a session is complete until acceptance criteria are
    met. If blocked, preserve the task and explain the blocker in
    `history.md`.
10. End with a concise handoff: what changed, tests/results, known
    limitations, and the next task. Do not ask the user to create a new
    prompt; this file is the reusable prompt.

## Definition of done for each task

A task is done only when all relevant conditions hold: - Implementation
matches the PRD, including edge cases and authorization boundaries. -
Tests cover success, validation failures, unauthenticated/unauthorized
access, scope isolation, conflict/concurrency behavior, and relevant
error paths. - Relevant tests were run and results recorded. - No newly
introduced lint/syntax/import/runtime failures remain. -
Documentation/configuration/examples are updated where needed. -
`history.md` is updated and the completed task is removed from
`task.md`. - Any unresolved PRD ambiguity is recorded instead of
guessed.

## Required handoff format in `history.md`

Use this template for each session entry:

### YYYY-MM-DD --- Session N: short title

-   **Goal / PRD references:**
-   **Changes made:**
-   **Files changed:**
-   **Commands run:**
-   **Results:** passed / failed / skipped counts; include the actual
    command output summary.
-   **Security / regression review:**
-   **Known gaps / blockers:**
-   **Next session:**

------------------------------------------------------------------------

# ACTIVE TASK QUEUE

> Work top-to-bottom. Session numbers are stable identifiers; do not
> renumber them after completed sessions are removed. Remove completed
> session/task blocks from this queue and preserve their history in
> `history.md`.

## Session 1 --- Remaining seed-script wiring (dependency pending)

-   [ ] Add and verify the seed execution script when the real PRD
    Section 18 runner exists. It depends on Session 2 database lifecycle,
    Session 3 models, and Session 5 seed implementation. Do not add a
    successful no-op or a script pointing at a missing file. Verify it
    only against the guarded, dedicated local test database.

**Dependency handoff:** The source skeleton, supported dev/start/test/coverage
scripts, dependencies, README/example configuration, environment validation,
app/server separation, and smoke tests were implemented and verified in
Session 1 (see `history.md`). Session 2 infrastructure, Session 3 models, and
Session 4 authentication are verified. Seed wiring remains uncompleted here;
the next executable session is **Session 5**.
Complete this remaining item alongside
the Session 5 seed runner once its prerequisites exist.

**Remaining acceptance:** A real seed command is wired to the implemented
runner and verified safely. Do not claim all of Session 1 complete yet.

> **Prerequisite handoff (2026-10-18):** Project-local MongoDB 8.0.34 was
> installed and verified between Sessions 1 and 2: `rs0` on
> `127.0.0.1:27017`, development `hostelfix`, test `hostelfix_test`, safe
> ownership/start/stop scripts, and real transaction verification. The verified
> prerequisite was removed from the pending queue; exact commands and evidence
> are in the MongoDB prerequisite entry in `history.md` and the README.
> **Session 2 handoff (2026-10-18):** Configuration, Mongoose lifecycle,
> database/private-storage readiness, graceful shutdown, CORS/CSRF and safe common
> infrastructure were verified with 114 passing tests and real local transactions.
> Completed Session 2 tasks were removed; evidence and limitations are in
> `history.md`. No undocumented refresh/HMAC secrets were added (PRD ambiguity B2).
> Session numbering and the pending seed wiring remain intact.
>
> **Session 3 handoff (2026-10-19):** Twelve P0 models, projections, indexes,
> append-only guards, bounded transaction helpers and the additive index command
> are verified. Full suite: **309 passed, 0 failed/skipped**; real `rs0` commit,
> rollback and concurrent version conflicts passed in `hostelfix_test`.
> B3/B4 were clarified with the user and recorded in PRD §§10.4/10.7 before code.
> See `models.md` and `history.md`. Session 4 resolved B1/B2 with the user
> before implementing the cookie/hash paths; the existing Session fields suffice.
>
> **Session 4 handoff (2026-10-19):** All eight auth/profile routes, strict
> validation, JWT/session checks, secure refresh cookies, rotation/reuse,
> logout, profile versions, forced password changes and atomic revocation are
> implemented. Full suite: **426 passed, 0 failed/skipped**, thirteen files;
> statement coverage **96.91%**. Real replica-set race/rollback tests pass.
> B1/B2's approved contracts are in root PRD §§13.1–13.3. Begin **Session 5**:
> reuse the existing models, authentication services and rate policies; use
> `hashUtils.js` for seed password/enrollment hashes. Include the P0 admin staff
> picker (§9.6) and the pending Session 1 seed wiring. See the execution history
> for exact commands and the remaining later-session ambiguities.

## Session 5 --- Scoped catalog and reference-data endpoints

-   [ ] Implement public/authorized active category and location reads
    exactly as defined by the PRD.
-   [ ] Implement hostel/block/room/category models and safe projections
    needed by registration and complaint submission.
-   [ ] Ensure students only receive permitted directory data for their
    hostel; staff are scoped to their hostel; admins are scoped to
    `adminHostelIds`.
-   [ ] Implement seeded reference data and a deterministic seed/reset
    command. Guard destructive reset operations so they cannot target
    non-test/production databases.
-   [ ] Add tests for invalid/inactive/cross-hostel IDs, private
    occupant-data leakage, role-based catalog scope, and reproducible
    seeding.

**Acceptance:** Catalog routes and seed data work with no cross-hostel
leakage; seed safety checks are tested.

## Session 6 --- Private uploads and attachment authorization

-   [ ] Implement a storage interface with persistent local-directory
    storage as the initial adapter, rooted at a configured path and
    never serving files directly as public static assets.
-   [ ] Implement `POST /api/v1/uploads` according to the PRD: one file
    per request, allowed JPEG/PNG/WebP, 5 MiB limit, decoded image
    validation (maximum 12 MP and 6000 px per dimension), safe generated
    names, and no trust in client MIME/filename.
-   [ ] Implement authorized content retrieval; every read must
    reauthorize access through the associated complaint/attachment.
-   [ ] Track owner, storage metadata, validation state, and attachment
    usage. Prevent attaching another user's upload or reusing it outside
    permitted scope.
-   [ ] Add cleanup/orphan handling only where defined by the PRD;
    otherwise record it as an operational follow-up.
-   [ ] Test invalid type, malformed image, oversize file,
    image-dimension limit, unauthorized retrieval, cross-user
    attachment, and successful upload/download.
-   [ ] Document that deployment must provide persistent storage; do not
    claim local disk is durable on an ephemeral hosting platform.

**Acceptance:** Upload validation and private authorization tests pass;
storage is not public; deployment persistence limitation is explicit.

## Session 7 --- Complaint creation, idempotency, list/detail/edit, comments, activity

-   [ ] Implement complaint creation using the PRD's exact fields,
    priority indicators, allowed location types, category validation,
    and attachment constraints.
-   [ ] Enforce idempotency using the PRD's client UUID/key and
    canonical payload hash: same owner/key/hash replays the original
    result; same key with a different payload returns conflict.
-   [ ] Implement scoped student/staff/admin list and detail routes with
    strict pagination, filters, search, safe projections, stable
    sorting, and server-derived scope before filtering/aggregation.
-   [ ] Implement student edits only while `SUBMITTED`, with
    expected-version checks and immutable activity where required.
-   [ ] Implement public comments only for authorized actors and allowed
    complaint states; do not permit private/internal notes unless the
    PRD defines them.
-   [ ] Implement chronological activity reads and ensure successful
    mutations write activity atomically with the change.
-   [ ] Add tests for duplicate create retries, key/hash conflict, owner
    isolation, assigned-staff scope, admin hostel scope, unsafe query
    operators, pagination boundaries, edit-after-triage rejection,
    comments, and activity ordering.

**Acceptance:** Complaint CRUD/read surfaces match Section 9;
idempotency and scope tests pass; no client-supplied ownership or scope
is trusted.

## Session 8 --- Complaint workflow commands and concurrency

-   [ ] Implement dedicated command routes for triage, reject,
    assign/reassign, begin work, resolve, student close, reopen,
    feedback, and priority override according to the PRD.
-   [ ] Enforce the exact status transition table. Do not use a generic
    PATCH endpoint to alter status, assignee, ownership, priority, or
    SLA data.
-   [ ] Require `expectedVersion` for every complaint mutation and
    atomically compare/update version with the activity event.
-   [ ] Ensure assigned/in-progress complaints have exactly one eligible
    staff assignee; enforce same-hostel/category eligibility.
-   [ ] Implement required reasons/notes and validate lengths and actor
    permissions.
-   [ ] Implement resolution confirmation, the seven-day
    reopen/administrative-close window, maximum two reopens, cycle
    tracking, clearing assignee on reopen, new SLA cycle, and feedback
    replacement/history exactly as defined by the PRD.
-   [ ] Use MongoDB transactions for state plus
    activity/feedback/related-record changes. Make concurrent commands
    fail with the PRD's conflict error rather than silently overwriting.
-   [ ] Add transition-matrix tests, role/state tests, stale-version
    race tests, duplicate concurrent command tests, and transaction
    rollback tests.

**Acceptance:** All P0 transitions and conflict behavior pass
integration tests; state changes and activity records cannot diverge.

## Session 9 --- SLA deadlines, priority, overdue queries, and dashboards

-   [ ] Implement seeded SLA/priority policy snapshots and calculate
    response/resolution deadlines in UTC using the policy contract
    actually present in `prd.md`.
-   [ ] Track first human response per cycle and calculate overdue state
    at query time; do not require a scheduler for P0 overdue filters.
-   [ ] Implement deterministic priority scoring only if the complete
    formula and tie-breakers are present in the PRD. If referenced rules
    are missing, keep the task blocked and record the exact missing
    contract rather than inventing a score.
-   [ ] Implement scoped role dashboards: status counts, recent
    complaints/activity, staff workload, unassigned and overdue
    summaries. Reuse the same server-side scope predicates as list
    endpoints.
-   [ ] Test UTC/deadline boundaries, policy snapshot immutability,
    resolved-state SLA behavior, first-response semantics, overdue
    filters, and aggregation scope isolation.

**Acceptance:** P0 SLA and dashboard routes are correct, scoped,
bounded, and covered by integration tests; undefined policy rules are
documented as blockers.

## Session 10 --- Remaining P0 routes, security audit, and API contract sweep

-   [ ] Compare every P0 route in PRD Section 9 against the
    implementation; build a checklist with exact method/path, auth role,
    validation, status code, response schema, and error cases.
-   [ ] Implement missing P0 endpoints only from explicit PRD contracts.
    Do not infer request fields or response behavior from route names.
-   [ ] Audit every route for authentication, current-session checks,
    role gate, scoped query, state checks, and transaction behavior in
    the required order.
-   [ ] Audit all projections and logs for sensitive data; inspect
    injection/operator handling, mass assignment, rate limits,
    CORS/CSRF, uploads, and error leakage.
-   [ ] Run full unit/integration suite and coverage. Add missing
    negative tests rather than weakening assertions.
-   [ ] Check all list endpoints for bounded pagination and all
    mutations for consistent response/error contracts.

**Acceptance:** All P0 API contracts have implementation and test
evidence, or each exception is explicitly blocked by missing PRD
information.

## Session 11 --- P0 reliability, integration, and backend release gate

-   [ ] Run tests against a clean, dedicated local replica-set test
    database. Verify test setup refuses to run against production/Atlas
    URIs.
-   [ ] Run the complete backend test suite repeatedly to expose order
    dependence and leaked state.
-   [ ] Validate clean install, environment validation, app import,
    start command, graceful shutdown, readiness/health, seed command,
    and a fresh database bootstrap.
-   [ ] Add/verify integration coverage for the full API lifecycle:
    student creates complaint → admin triages/assigns → staff
    starts/resolves → student confirms/reopens/feedback as allowed.
-   [ ] Verify transaction rollback, idempotency, session rotation/reuse
    detection, authorization isolation, and concurrency against real
    MongoDB test infrastructure.
-   [ ] Fix critical/high issues. Record any external-service checks
    that cannot be completed (SMTP is not a P0 dependency unless
    explicitly required; HTTPS/proxy behavior must be documented for
    deployment).
-   [ ] Update README with local setup, environment variables, test
    database setup, seed/demo accounts (never real credentials), test
    commands, API conventions, and deployment caveats.

**Acceptance:** P0 backend release gate passes with reproducible
commands and honest test evidence. No critical/high security issue
remains unresolved.

## Session 12 --- P1 backend features (start only after P0 gate passes)

-   [ ] Implement deterministic duplicate suggestions and safe candidate
    visibility only when the scoring/visibility contract is fully
    specified in `prd.md`.
-   [ ] Implement administrator duplicate link/unlink with reason,
    same-hostel checks, cycle/chain prevention, version checks, and
    atomic activity on both complaints.
-   [ ] Implement durable in-app notifications and read-state APIs with
    deduplication, event-driven creation, and stale-link
    reauthorization.
-   [ ] Implement manual/idempotent escalation only according to the
    PRD; scheduled processing must be safe to retry.
-   [ ] Implement P1 staff/account/category/location/policy management
    only where Section 9 and supporting policy sections define the
    contracts.
-   [ ] Add tests for every P1 feature, especially access isolation,
    idempotency, version conflicts, and cross-resource consistency.

**Acceptance:** Each P1 feature is implemented only from a complete
contract and has integration coverage. P1 must not destabilize P0.

## Session 13 --- Final backend verification and handoff

-   [ ] Run all tests and record exact results; include skipped tests
    and their reasons.
-   [ ] Perform a final route inventory against `prd.md`; no
    undocumented route or unimplemented required P0 route may be hidden.
-   [ ] Inspect Git diff/status, secrets, accidental generated files,
    TODOs, unhandled promises, logs, and dead code.
-   [ ] Confirm README, `.env.example`, seed instructions, and
    `history.md` describe the actual code---not intended future
    behavior.
-   [ ] Produce a final backend completion report: completed P0/P1
    scope, route count, test results, known limitations, deployment
    assumptions, and unresolved PRD blockers.

**Acceptance:** Backend status is auditable and reproducible. Do not say
"complete" if required routes/tests remain blocked or unverified.

------------------------------------------------------------------------

# Queue maintenance rules

-   Remove a completed task/session from this active queue only after
    its acceptance criteria are verified.
-   Keep stable session numbers in headings; never renumber remaining
    sessions.
-   If only part of a session is done, leave the session and its
    unfinished tasks in place. Rewrite the remaining bullets to be
    precise.
-   If a discovered bug affects an earlier completed session, add a new
    top-priority task describing the regression and record the link to
    the prior history entry.
-   If the PRD changes, record the changed contract and date in
    `history.md` before implementing it.
-   `task.md` is the **current work queue**; `history.md` is the
    **append-only execution log and handoff**. Never replace history
    with a short summary.
