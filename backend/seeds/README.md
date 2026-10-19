Seed execution is pending Session 5, after the database lifecycle and models exist.
Do not add a successful no-op seed command or reset a non-test database.
The future runners are `index.js` (additive seed) and `reset.js` (guarded local test reset), per PRD §18.
