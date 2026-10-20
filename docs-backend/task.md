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

> **Session 5 handoff (2026-10-20):** Scoped catalog routes (`/catalog/hostels`, `/catalog/hostels/:id/blocks`, `/catalog/rooms`, `/categories`, `/admin/staff`), deterministic additive seed script, and guarded reset runner verified. Session 1 seed wiring completed with 20 passing tests.
>
> **Session 6 handoff (2026-10-20):** Private uploads (`/uploads`, `/uploads/:id/content`, `DELETE /uploads/:id`) with 5 MiB ceiling, magic byte verification, dimension/MP limits, quota check, and private streaming authorization verified with 11 passing tests.
>
> **Session 7 handoff (2026-10-20):** Complaint CRUD (`POST /complaints`, `GET /complaints`, `GET /complaints/:id`, `PATCH /complaints/:id`, comments, activities) with deterministic priority scoring, SLA computation, idempotency replay/conflict, transactional attachment binding, and strict scoping verified with 40 passing tests. Full suite passing across 20 files. Begin **Session 8**.
>
> **Session 8 handoff (2026-10-20):** Workflow command routes (`/transitions`, `/assignment`, `/priority`, `/reopen`, `/feedback`), optimistic concurrency checks (`expectedVersion`), transactional activity event generation, cycle snapshotting with 7-day reopen window (max 2 reopens), and staff eligibility verified with 12 passing integration tests (WF-T01 through WF-T11, CC-T01). Begin **Session 9**.
>
> **Session 9 handoff (2026-10-20):** Scoped role dashboards (`GET /dashboard/student`, `GET /dashboard/staff`, `GET /dashboard/admin`), status counts, unassigned metrics, active staff workload breakdown, query-time SLA overdue calculations (no background scheduler), §15.4 4-part staff queue sorting, and 366-day bounded date filtering verified with 14 passing integration tests (DB-T01 through DB-T04). Full test suite passing across 22 files (523 tests, 0 failed, 0 skipped). Begin **Session 10**.
>
> **Session 10 handoff (2026-10-20):** All 33 P0 REST endpoints audited against PRD Section 9 tables; zero projection/error/topology leaks; multi-tier rate limiting, CSRF verification, and bounded pagination confirmed across all routes. All 21 database safety checks pass. Begin **Session 11**.
>
> **Session 11 handoff (2026-10-20):** P0 reliability, database safety, clean seed/reset commands, and release gate passed. Added end-to-end full multi-persona lifecycle journey integration test (`lifecycle.test.js`). Full backend test suite passing cleanly across 23 test files (524 tests, 0 failed, 0 skipped). Root `README.md` updated with full P0 routes, demo accounts, and setup commands. Begin **Session 12**.

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
