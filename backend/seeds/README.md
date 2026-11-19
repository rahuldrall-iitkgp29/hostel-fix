# Local demo seeds

Use the root interface: `npm run seed`, `npm run reset:demo`, `npm run demo:clean`,
`npm run demo:verify`, and `npm run demo:logins`. See the root README and generated
local-only DEMO.md for counts, credentials and commands.

The CLI requires local development configuration and verifies the checkout-owned
MongoDB replica set. Cleanup requires the local ownership file, a matching MongoDB
manifest and matching record markers. Only registered IDs are deleted, atomically.
Unrelated references block cleanup; unmarked legacy data is preserved.

`demo-plan.js` creates deterministic IDs and realistic relative dates. `demo.js`
uses existing models, version hooks, hashing utilities and transactions.
`verify-demo.js` validates counts, references, assignment eligibility and chronology.
`index.js`/`reset.js` retain legacy test exports solely for isolated marked
`seed_<uuid>_` fixture collections; they are not general database reset tools.
