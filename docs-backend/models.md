# Database models and transaction conventions

Session 3 implements the twelve P0 Mongoose models from PRD §10. Import
`createModels` from `backend/src/models` and call it with the application's
connected Mongoose connection. Registration is connection-local and repeatable;
imports do not read configuration, connect, register global models, or build
indexes. JavaScript/CommonJS is used throughout.

## Models and boundaries

| Model | Stored data / constraints |
|---|---|
| User | One role with its fields on the same document; normalized unique email; immutable role; active/inactive status; version and hidden credential hashes. |
| Session | User, unique UUID-v4 refresh family, hidden bcrypt hash, expiry, revocation, refresh time and bounded private audit fields. |
| Hostel / Block / Room | Separate reference documents with normalized codes/labels, scoped uniqueness and active flags. Enrollment hashes are excluded from API projections. |
| Category | Hostel-scoped immutable code, name/description and active flag. |
| HostelPolicy | One policy per hostel, complete ordered SLA targets, positive weights, descending thresholds and independently incremented policyVersion. |
| Complaint | Immutable ownership/reference/create key/attachments, version, validated location/indicators, state fields, current SLA snapshot and at most two immutable prior cycles. |
| Activity / Comment | Public actor/author snapshots, bounded text and append-only history, with chronological indexes. |
| Attachment | Validated-image metadata, private UUID storage key, staged expiry and one-time binding. Bound metadata cannot be deleted or rebound. |
| Feedback | One replaceable document per complaint; cycle and validity flag. Earlier ratings/comments belong in immutable activity. |

Model validation checks document structure and relationships among its fields.
It does **not** authenticate callers or implement command authorization, active
foreign-reference lookup, staff eligibility, the complete state machine, or
create-replay behavior. Those checks belong to the scoped services and strict
Zod HTTP boundaries in Sessions 4–9. MongoDB ObjectId refs are not foreign-key
constraints. These models do not make the currently absent product routes usable.

Reserved P1 fields/enums in §10 are represented, but no notification model,
duplicate/escalation command, worker, or administrative management route is
implemented. Attachment records represent successfully validated images; the
actual decoder/storage adapter belongs to Session 6.

## Mutations

Use `runTransaction(connection, work)` and
`updateWithVersion(Model, {filter, expectedVersion, session, mutate, select})`
from `backend/src/utils/transactions.js`.

1. Build `filter` in the service from the authenticated account and database
   scope, including one concrete `_id`. Never pass a request object as a filter.
2. The helper loads through that predicate before comparing the expected
   version. Missing/out-of-scope returns 404; an accessible stale version returns
   409 `VERSION_CONFLICT`.
3. Validate the action and modify the loaded document in `mutate`. A complete
   document is validated and saved with an atomic `_id` + version predicate.
   The model advances `version` exactly once. Never assign it directly or disable
   validation. The optional `select` is for explicit private-field opt-ins; do not
   exclude fields needed for validation or guards.
4. Save comments/feedback/activity with the **same** session. New complaints,
   activity, comments and feedback require an active transaction. The caller
   groups state and history and emits the HTTP response only after commit.

All existing-document saves require a transaction. Query updates/replacements,
`insertMany`, `bulkWrite`/`bulkSave`, and aggregation `$out`/`$merge` are rejected
because they can bypass complete-document validation or mutation guards.
Activity/comment saves after creation and all their delete paths are rejected.
Other model hard deletes are prohibited except a single staged attachment
deleted by explicit ID inside a transaction. MongoDB TTL operates independently.
Application services must not bypass this through `Model.collection` or the raw
driver; that access is used only by the guarded test-record cleanup.

Transactions use snapshot reads, primary routing and majority writes. Transient
transaction failures retry at most three times, re-running the callback with
fresh scoped reads. Unknown commit outcomes retry the **same commit** at most
three times; they never replay the callback. Exhaustion returns safe 503
unavailability. Business conflicts and validation errors are not retried. Keep
database work sequential within one transaction; do not perform filesystem,
network, or HTTP-response side effects in a retried callback.

## Reference and parent guards

A versioned save with an empty `mutate` callback still increments `version` and
takes a write guard. Use it for every active reference participating in a
creation/edit and for an eligible staff account during assignment (§7.4).
Deactivation/eligibility changes must take the same guard before checking active
assignments and revoking sessions.

Blocks are stored separately. Block commands use the client's expected **Hostel**
version, save the parent guard, and then write the Block in the same transaction;
the Block has its own incremented version. The service checks the 20-block cap
while holding that parent guard. Reference use/deactivation must follow the same
parent convention. The integration suite verifies parent and child versions
commit together and stale parent versions cannot mutate a child. Catalog/seed
and P1 management services will wire their own scoped business checks.

## SLA and feedback history

`Complaint.slaPolicy` contains the full `HostelPolicy.slaTargets` map, copied at
cycle start. Current fields stay flat in storage. `currentCycle` is derived for
detail. Prior entries also retain `startedAt`, targets and both deadlines, plus
the resolution and reopen fields defined in the clarified PRD §10.7. This allows
earlier response/resolution breaches to be reconstructed after policy changes.

Existing cycle policy and first-response time cannot be rewritten; deadlines can
only tighten. Prior entries and complaint attachment IDs cannot be edited,
including through in-place array changes. The service starting a new cycle must
append the previous summary and clear current resolution/assignment fields.

Feedback has a unique complaint index in addition to the §10.11 cycle index.
Reopen updates that document to `isCurrent=false`; the next valid submission
replaces it and appends `FEEDBACK_SUBMITTED` activity atomically. Only valid
feedback matching the detail's current resolved/closed cycle is projected.

## Projections and secrets

`backend/src/models/projections.js` contains explicit allowlists for self/staff,
catalog, complaints/cycles, policy, activity, comments, attachments and feedback.
They accept hydrated or lean records. Populate the required display references
before producing complaint responses; unpopulated names are null. Detail takes
service-computed `allowedActions`, authorized attachment records/current feedback,
and an optional independently authorized canonical complaint. It does not load
relations or decide authorization itself. Use the paginated activity endpoint for
the timeline, not an unbounded detail array.

Hashes, refresh family, private session audit data, storage keys and the canonical
request hash use `select:false`. Opt them in only for the service that needs them.
`toJSON` delegates to safe projections and `toObject` redacts those fields; never
return a raw lean/aggregate result as an API response. Public complaint identities
exclude email/phone; catalog output excludes occupants and enrollment secrets.
Activity `changes` has per-type, typed allowlists in `activityChanges.js` and is
never copied wholesale from Mixed storage. Add new supported command fields there
deliberately when implementing their services.

## Index deployment and tests

`npm.cmd run db:ensure-indexes` uses the normal validated application configuration,
connects, ensures all twelve models' declared indexes, and disconnects. It adds
indexes and never calls `syncIndexes` or drops collections/indexes. Production
still disables `autoIndex`. Check the target configuration before deploying.
Session 5's real seed runner must call the same helper; no seed placeholder exists.

Tests require the project-local `rs0` and the exact `hostelfix_test` URI documented
in the root README. Ownership and replica membership are checked before writes
and cleanup. New model tests track their exact random ObjectIds and delete only
those records, preserving unrelated data and indexes; no reset or database drop
is used. Missing infrastructure fails the suite instead of skipping tests.

TTL is verified through the actual Session/Attachment index definitions and
binding rules. Tests do not wait for the asynchronous TTL monitor. Metadata TTL
does not remove files: actual storage cleanup/failure semantics remain Session 6
(PRD ambiguity B6). Session 4 resolved B1/B2 with the user; see root PRD §§13.1–13.3.
Session `tokenHash` now enforces bcrypt cost 12 over the specified full-input
prehash. The cookie carries the family locator and random secret; the database
stores only the existing family/hash fields. Future seeds must use the shared
password/enrollment hash helpers. Authentication mutations take User/Session
write guards as described in the README, incrementing their versions.
