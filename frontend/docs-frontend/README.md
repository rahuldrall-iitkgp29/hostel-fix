# HostelFix frontend guide

The Next.js 16.4.5 App Router frontend implements the P0 student, technician and
administrator workflows. Authentication uses an observable in-memory session store,
rotating HttpOnly refresh cookies, a local request queue, and cross-tab Web Locks.
Logout invalidates pending responses and broadcasts to other same-origin tabs.

## Install and develop

Run `npm.cmd ci` from this directory and install root/backend dependencies separately.
For local development set `NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api/v1` in
`frontend/.env.local` and start `npm.cmd run dev`. Backend CORS must allow the exact
frontend origin. Keep secrets out of `NEXT_PUBLIC_*` variables.

Production/type-generation checks require an explicit HTTPS API base ending in
`/api/v1`. Missing production configuration fails; it cannot fall back to localhost.
Public environment variables are bundled at build time and require rebuilding after
changes. The API and frontend must have a compatible same-site cookie topology.

## Features and response contracts

- Role dashboards and complaint lists use validated backend response schemas.
- Student reporting supports three private uploads, coordinates photo operations with
  submission, and preserves idempotency keys when retrying the same draft.
- Submitted complaints expose versioned title/description editing. Conflicts require
  reviewing the latest record before retrying.
- Private photo viewing fetches content with bearer authentication and disposes object
  URLs when the component unmounts.
- Administrator controls use backend `allowedActions`, including `CHANGE_PRIORITY`.
- Comments and immutable activity expose page navigation.
- Profile and password forms integrate backend versioning/session revocation.

The common API client supplies current authentication, CSRF headers, credentials,
timeouts, cancellation, redirect rejection, structured errors, multipart uploads and
private binary retrieval. GET requests can refresh and retry once; ambiguous writes
are not blindly replayed. Before authenticated requests, suspended-tab token expiry
triggers a coordinated refresh.

## Checks

Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run typecheck`,
`npm.cmd run format:check`, and `npm.cmd run build`. Set a valid non-secret HTTPS
`NEXT_PUBLIC_API_BASE_URL` for type checking and production builds.

`npm.cmd run test:browser` uses Playwright with isolated backend fixture accounts
and real HTTP/database behavior. It starts the frontend on 3100 and backend on 5100;
existing listeners are never reused or terminated. The default browser is Playwright
Chromium; installed Edge can be selected with `PLAYWRIGHT_CHANNEL=msedge`.
Start the project-owned MongoDB first. Set `HOSTELFIX_TEST_PORT=27018` consistently
when the default MongoDB port belongs to another instance.

Browser coverage includes photo reporting/editing, private viewing across authorized
roles, priority/triage/assignment, resolution/closure/feedback, simultaneous tab refresh
and logout, upload/deletion coordination, conflicts, unauthorized reads, and paginated
history. See the root temporary [analysis.md](../../analysis.md) for exact run results.

P1 notifications, duplicate linking, escalations, management writes and analytics are
outside the P0 implementation and remain deferred. Deployment requires validated
HTTPS/cookies, durable storage and a supported modern browser with Web Locks for
cross-tab refresh coordination. No production mock-data adapter is used.
