# Package E — school account batches and confidential login sheets

## What is delivered

The existing single-student workflow is retained. **School Student Accounts** adds
one-school batches (maximum 30 rows), editable aliases/codes, secure random passwords,
per-row results and an A4 school login sheet using native Print / Save as PDF.
Only confirmed new accounts from the current in-memory batch are printed. Existing
and uncertain accounts are excluded and cannot be automatically recreated. School
assignment is taken from active **private** schools, independently of public school
publication and argument-attribution consent. New profiles retain publicSchool=false.

There are no new dependencies, collections, Firestore rules or backend services.
All existing authorization, teacher protections, classroom content and ballots remain
unchanged. No production accounts are created, deleted or modified during development.

## Permanent deletion is deliberately deferred

Repository review found Firebase Hosting + Firestore deployment configuration, no
Functions source, no Admin SDK service, and no authenticated administrative endpoint.
The browser SDK cannot delete arbitrary other Auth users. Its existing deleteUser
call is used only to clean up an account **just created in an isolated Auth session**
when provisioning fails; it is not an administrator deletion facility.

No Delete button pretending to remove Auth accounts is added, and profile deletion
stays denied to everyone by the existing rules. The interface explains this dependency
and points to **Pause participation**, which preserves historical records. Deletion
through a privileged Console remains an owner operation, outside this feature; do
not use it to remove real participants or associated history without a separate
reviewed procedure. Deactivation prevents participation but does not delete Auth or
all historical/private data and is not a complete data-erasure mechanism.

This follows the request's explicit fallback: deliver bulk creation/PDF independently
when secure deletion is unavailable within the existing deployment architecture.
No automatic history scan or permanent deletion operation is implemented or claimed
tested. Deletion authorization, history-blocking and cross-service partial-failure
behavior require the backend work below before a Delete Student action can ship.

### Smallest supportable future deletion backend

A tightly scoped callable HTTPS Cloud Function using Firebase Admin SDK is the
natural Firebase-native option; an existing trusted owner-operated server could
provide the equivalent. It must:

1. Verify the caller's Firebase ID token and the pinned designated administrator UID
   server-side. Never trust client role, email or a supplied administrator flag.
2. Reject the administrator and every teacher/non-student target, verifying private
   profile and Auth state, not just client-supplied alias/code. Display a confirmation
   with verified alias and login identifier before the final server mutation.
3. Freeze the student (active=false, Auth disabled/token revocation) using an
   idempotent server-owned operation record/lock. A narrowly reviewed rule guard
   must prevent reactivation/other administrative writes racing the deletion.
4. After the freeze, authoritatively check all historical submissions, ballots and
   review mappings. Do not rely on the visible current trial or client counts.
   Ballots are keyed by UID without a stored authorUid field, so a naive collection
   group equality query will not prove absence. A small-project server scan of all
   trial histories/ballot document paths, including orphaned subcollections where
   relevant, must be complete before absence can be trusted. Any history or
   uncertain/incomplete scan blocks deletion and offers deactivation instead.
5. Never delete trial contributions, ballots, anonymous reasoning or published
   totals. Bind confirmation to the verified target and frozen state.
6. Delete Auth first, then the private profile, tracking retryable progress without
   passwords. Auth/Firestore cannot share one atomic transaction. Auth failure leaves
   a disabled private profile; profile failure after Auth deletion leaves an inactive
   orphan to finish on retry. Never report complete success until both are confirmed.
   Protect against delayed requests, duplicate actions and account replacement.
7. Add emulator tests for all of these cases before exposing a Delete action.

Cloud Functions deployment normally requires a billing-enabled **Blaze** project,
Functions/Admin SDK dependencies, supported runtime, APIs/IAM and an owner-approved
region. Usage may fit free allowances, but builds/artifacts/network/compute can incur
charges; no zero-cost promise is made. The repository does not establish the live
billing plan or a configured trusted runtime. No plan, Console setting or infrastructure
was changed or deployed. Owner approval/setup and a separate backend review are
required for that follow-up. Never put service-account keys in website code.

## Administrator instructions

1. Open **School Student Accounts** and refresh active schools if needed. Select
   a school from the private directory; published homepage status is irrelevant.
2. Choose 1–30 rows and click **Add student rows**. Enter a display alias per row;
   review/edit the randomly generated permanent login codes (4–24 letters, digits
   or hyphens). Duplicate codes in a batch are rejected before any account creation.
3. Click **Generate secure passwords**. Passwords use browser crypto.getRandomValues,
   rejection sampling and a shuffled 16-character mix of upper/lower/digits/symbols.
   They are never based on school/country/student numbers.
4. Click **Create school accounts** once. It creates sequential isolated, memory-only
   Auth sessions, preserving the teacher session and the existing provisioning
   compensation/server-confirmation logic. Do not leave during creation.
5. Review each result. Existing codes are never reset or included. For unconfirmed
   outcomes, ask the owner to check that code before retrying: Auth/network failures
   can leave an account whose creation response was lost. No credentials sheet is
   invented for such an account. Confirmed successes remain available.
6. Click **Print / Save school PDF**, then choose **Save as PDF** in the browser's
   destination/printer selector (Ctrl+P is not the credential-export action). Use A4,
   default scaling and disable browser headers/footers if desired. This is native
   browser PDF output, not a silent direct-download library; multi-page tables repeat
   column headings and avoid splitting credential rows. Unicode aliases/school names
   are handled by the browser font engine. Flags are local assets.
7. After saving/distributing, click **I saved / distributed the credentials**. The
   app cannot detect whether a print dialog was saved or cancelled and never treats
   afterprint as a successful download. Inspect the resulting PDF before clearing.
8. Click **Clear temporary credentials**, confirming permanent loss from this page.
   Accounts remain intact. Clear before switching schools to prevent mixed sheets.

Passwords cannot be retrieved later. Provide each student only their own credentials;
keep the teacher's combined school sheet confidential. Downloaded/printed copies are
outside application control. Do not send sheets to public project pages/chats.

## Secret lifetime and failure limits

No plaintext passwords are put in Firestore, URLs, localStorage, sessionStorage,
IndexedDB, logs or error messages. Generated values live in the temporary batch;
the normal row view shows only “Generated”. The success-only print DOM exists briefly
for printing and is cleared on afterprint, batch clear or Auth change. Account UIDs
and private school IDs are never included in the sheet. Login URLs contain no codes
or passwords. Beforeunload warns for undelivered successful/unconfirmed accounts or
in-progress work; browsers decide the wording and may suppress this warning.

Signing out/account switching immediately scrubs batch state/print content and
rejects stale callbacks. Strings already passed to an in-flight SDK/network operation
cannot be forcibly zeroed by JavaScript; those requests settle using existing
provisioning safeguards. An already-open print preview/PDF cannot be recalled. A
crash/reload/sign-out loses temporary passwords. There is no recovery database.

Successful rows cannot be edited or regenerated and are not retried. New failed rows
may be corrected when safe. Unknown/permission/network failures are conservatively
marked unconfirmed and frozen, not automatically retried. School activity and identity
are checked from the server before each account; changes stop the remaining batch.
Firebase Auth quotas, anti-abuse limits and owner-configured password policies still
apply. A 16-character generated password may require adjustment if a future custom
policy changes; the current minimum is eight characters.

## Tests and release

Run `npm test`, `npm run test:all`, and all existing Chrome browser scripts including
`node tests/admin-module.browser.cjs`. Full-module browser tests use only synthetic
Auth/store boundaries; emulator integration exercises actual isolated Auth/profile
creation, duplicate protection and teacher-session preservation. Native Chrome PDF
creation verifies A4 pagination with 29 successful synthetic rows and exclusion of
an existing login. Tests never connect to production.

Deploy only the reviewed website through the existing Hosting release process.
**No new rules or Functions deployment is required for this package.** Preserve the
existing configured rules/administrator UID. New JavaScript files are in build/local
server allowlists. No data migration or automatic account provisioning occurs.

Manual verification: use the isolated local demo environment, test two different
schools in separate cleared batches, existing login errors, print/save/cancel, logout
cleanup, mobile keyboard scrolling and the downloaded PDF in Windows Edge/Chrome.
Actual Windows printer dialogs, project-specific live Auth quotas and real accounts
are not exercised by automated tests. Backend deletion tests remain deferred with
the deletion feature, rather than implying a client-side deletion solution exists.
