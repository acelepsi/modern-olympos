# Firestore authorization tests (local only)

These tests run against the Firestore emulator with synthetic identities and data.
They do not use the browser application's Firebase configuration, real student
accounts, passwords, Firebase Console settings, or a deployed database.

## Windows PowerShell setup

Install **Node.js 24 LTS, version 24.12.0 or later**, and **Java 21 or later**.
Ensure both are available on PATH, then open a new PowerShell window in the
repository root. The Firebase CLI is a pinned local development dependency; a
Firebase login or global CLI installation is not needed.

```powershell
node --version
npm.cmd --version
java -version
npm.cmd ci
npm.cmd test
npm.cmd run test:security
```

Use `npm.cmd` to avoid PowerShell's unsigned `npm.ps1` execution-policy issue;
there is no need to weaken the machine's execution policy. To run both suites:

```powershell
npm.cmd run test:all
```

The first emulator run downloads Google's Firestore emulator JAR. This needs
Internet access to `storage.googleapis.com`; dependency installation needs
`registry.npmjs.org`. Subsequent emulator runs use the cached JAR. If a managed
network blocks the download, request access through its normal network policy
process. Do not disable TLS verification or use an unofficial JAR mirror.

`firebase.emulators.json` binds Firestore to `127.0.0.1:8080`, the emulator hub to
`127.0.0.1:4400`, and logging to `127.0.0.1:4500`. The emulator UI is disabled.
Stop any other emulators using those ports before running; Firestore may also
reserve its WebSocket port 9150. Use Ctrl+C if an emulator run must be stopped.
The CLI normally shuts its emulators down automatically after the tests finish.

## Safety and isolation

- The command explicitly selects **`demo-modern-olympos`**, not the live project.
  No `.firebaserc`, deployment command, or Console configuration is added.
- The test module refuses to run unless `FIRESTORE_EMULATOR_HOST` is exactly
  `127.0.0.1:8080`. It also rejects non-demo project IDs in `GCLOUD_PROJECT`,
  `GOOGLE_CLOUD_PROJECT`, or `FIREBASE_CONFIG` when those variables are present.
  Let `emulators:exec` set its child process's emulator variables; do not point
  these tests at a remote endpoint. If an old shell carries production project
  variables, use a clean shell for emulator testing.
- Each test clears and seeds only this dedicated demo emulator database. Do not
  share that emulator project with other local work you need to retain.
- `authenticatedContext()` supplies synthetic claims for rules evaluation; an
  Authentication emulator is not required. Actual password login, account
  provisioning and token issuance are not tested.
- The suite reads the checked-in rules and substitutes only the single
  `REPLACE_WITH_ADMIN_UID` sentinel **in memory**, using `synthetic-admin`. It
  never modifies `firestore.rules`. If the template no longer contains exactly
  one sentinel, it refuses to proceed rather than accepting a real identity.
- `withSecurityRulesDisabled()` is used only to seed test fixtures. All asserted
  reads, queries and writes use ordinary client contexts with rules enabled.
- Tests run serially because each test resets the shared demo database. Client
  contexts are cleaned up afterwards. No data is imported or exported.
- For isolated browser testing, use [LOCAL_BROWSER_TESTING.md](LOCAL_BROWSER_TESTING.md)
  and stop that environment before running this suite (the emulator ports overlap).
  Opening HTML directly or using a generic local server is blocked. These dependencies do not
  upgrade the Firebase SDK imported by the browser pages.

## Coverage and expected failures

The 125 emulator cases cover (106 existing cases plus 19 lifecycle cases):

- Public trial/pointer/published-content reads and the legacy public arguments.
- Private profiles and assignments, prohibited profile provisioning, forged
  role claims, self-assignment and batched privilege escalation.
- Administrator trial creation/editing, activation, supported assignments,
  protected fields, denied deletion and pointer validation.
- Draft, pending and returned privacy; actual public and author-feed queries;
  ownership, per-trial roles, phases, content validation and immutable metadata.
- Draft/revision/submission/review/publication flows, required return feedback,
  and the prohibition on student self-publication.
- Juror eligibility, correct trial/UID, both choices, reason/timestamp/field
  validation, duplicate and concurrent voting, immutable ballots and private
  written reasons.
- Closure and one-time public tally publication; rejected invalid totals,
  replacement, terminal closure even before publication, and forward-only phases.
- Votes racing closure, simultaneous valid votes, competing publication
  transactions, transaction retries after title edits, and legacy compatibility.
- Explicit tests documenting current policy limits, described in
  [FIRESTORE_AUTHORIZATION_AUDIT.md](FIRESTORE_AUTHORIZATION_AUDIT.md).

Permission-denied responses inside `assertFails()` are expected and necessary.
A suite passes only when allowed requests succeed and denied requests fail with
permission denial. A missing emulator is a failure, not a skipped or passing
security suite. JavaScript syntax/import checks are not rules compilation or
security validation.

## Phase 5 validation recorded in this environment

- The project owner reports all baseline 70 mocked and 106 security cases passed
  locally after PR #4. That is separate from execution in this environment.
- Executed here: all **92** current mocked regression tests passed; security-test
  JavaScript syntax/import checks, test-inventory registration and whitespace
  checks passed. No browser application or production configuration was run.
- Not executed here: **all 125 current Firestore emulator cases** and compilation
  of the phase 5 rule edits. The combined test command was attempted, but the
  official emulator JAR download remains network-blocked (HTTP 403 from the
  environment's proxy for `storage.googleapis.com`). No emulator database was
  started or seeded here. Test inventory registration is not execution.
- Required before accepting this change: run `npm.cmd run test:all` on a machine
  that can download the official JAR. Investigate every failed assertion; do not
  weaken rules simply to make a test pass.

See [TRIAL_LIFECYCLE_AND_VERDICTS.md](TRIAL_LIFECYCLE_AND_VERDICTS.md) for the
lifecycle audit, compatibility implications, owner decisions, and the limit on
proving administrator-supplied totals. The package lock still pins the test
SDK/toolchain and does not replace the site's browser SDK.
