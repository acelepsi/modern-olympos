# Optional school affiliation and compact encyclopedia search

Base main: `e9e1605df357e8fe929279add504e248d67dc7cc`.

## Important existing privacy limitation

**Existing published submission documents already contain `authorUid` and are publicly readable under the existing schema.** This change does not add UIDs to public data or paths and never fetches private profiles in public clients. Removing that pre-existing identifier exposure requires a separate public-submission projection/schema migration and cannot safely be claimed solved while preserving the current submission architecture. No production migration is performed here.

Public alias + school + country can make a minor more identifiable, especially in small groups. Assignment and publication are separate administrator actions; acquire the project's required permission before enabling school display. Printed files, screenshots and previously read copies cannot be recalled. No school information is added to ballots, anonymous reasoning, juror labels or review mappings.

## Data and rules required for release

- `schools/{schoolId}` is an administrator-only directory. Exact fields: `name` (1–160 characters), `countryCode` (`TR`, `RO`, `GR`), `active` (boolean). No school deletion is allowed, preserving existing references. Inactive schools cannot receive new assignments or appear publicly; student participation/roles remain unchanged. Reactivation can restore any retained previously authorized copies if cleanup failed, unless the student's public permission was separately withdrawn.
- Private `students/{uid}` gains optional `schoolId` (empty or valid existing school ID), `publicSchool` (boolean, defaults off), and `schoolConsentVersion` (private random 20-character operation token). School IDs allow 1–80 letters, numbers, `_` or `-`. Only the existing designated administrator changes these fields. New accounts can select an active school but cannot start with public visibility on. Existing accounts without fields remain valid; no automatic affiliation or publication is inferred.
- Public permitted labels live at `trials/{trialId}/attributions/{submissionId}`. These paths use existing public **submission IDs**, never student IDs. Each copy contains exactly `schoolName` and `countryCode`; no UID, school ID, login code, email, consent token, timestamp or role metadata. Public `get` succeeds only when the source is a published Prosecution/Defense argument, the private source student's `publicSchool` is true, and the copy exactly matches the current active assigned school. Public listing is denied. Administrators alone prepare/write/delete copies. Private, draft, vote and reasoning records cannot receive public attribution.

Directory records, private profiles and consent state are not publicly readable. With consent disabled, both present and absent attribution lookups are denied and no identifying metadata is returned. Client markup has no UID or affiliation data attributes. Existing raw submission identifiers remain the limitation described above.

## Publication and withdrawal

Partner Schools provides directory management and a separate student-affiliation form. Its student list shows private school/public-permission status for administrator management. The creation dropdown derives country from its school and is private by default. Student IDs/passwords/roles are never changed to update affiliation.

Saving an affiliation first transactionally writes `publicSchool:false` plus a new private consent token. Explicitly enabling permission prepares minimal copies for that student's existing published arguments, without changing argument text/timestamps. Withdrawal also enumerates the existing published arguments and deletes their attribution copies, causing document listeners to clear even when dependency-only revocation is not delivered. Publication deletes old copies before preparing replacements. Only after all writes succeed does a Firestore transaction recheck the latest token/school and enable visibility. Publication reservation also compares the initial private token/school/permission, so a withdrawal during preflight rejects the old attempt before it can reserve a new token. Withdrawal itself always writes a fresh private token. A newer withdrawal invalidates an older publication attempt, including same-school changes. Partial publication failures leave visibility off; errors never claim public success. Historical sync uses the existing authorUid query separately per trial; no collection-group rule or composite index is added.

Future teacher approvals prepare a permitted copy using the current private permission. Optional label failure never reverses or misreports the successfully approved argument; the teacher receives a sync warning and can re-sync through the affiliation form. No Cloud Function/backend is added.

Public cards attach a small local flag and muted school label only after a confirmed server snapshot. Cached/pending snapshots are suppressed. Rules guard every fresh read. Teacher UI withdrawal explicitly deletes the corresponding public copies; editing/deactivating a school also purges affected copies. Direct document deletion clears current listeners. The emulator did not deliver dependency-only watch revocation reliably, so this feature does not rely on it. An existing watch can retain its last result until explicit copy cleanup or refresh; a fresh server request is denied once permission changes. Failed permission saves display an indeterminate checkbox and require verification rather than claiming withdrawal succeeded. Existing labels may be absent until reload if a previously denied listener needs a fresh subscription after permission is newly granted. Reload after syncing; printing uses only the currently visible public labels and introduces no queries. Withdrawals cannot erase a paper/PDF copy or a screenshot already taken.

New controllers reuse the existing administrator Auth/Firestore client. Session/selection guards and duplicate locks protect pending UI operations; schools are not embedded in jury code. Existing classroom permission/closure/tally/encyclopedia rules remain intact except the narrow student-field extension and added schools/attributions matches.

## Visual assets and search

`flag-tr.svg`, `flag-ro.svg`, `flag-gr.svg` are original lightweight geometric national-flag illustrations created for this project, dedicated under CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/). They have local SVG sources and accessible country alternatives, with no third-party services. No new libraries are used. The build/local server include all assets/modules.

The encyclopedia controls now sit in a compact dark/gold header area on desktop and below the heading on mobile, with 44px touch targets. Detail pages hide the search controls as before. The existing client-side search/filter and initial loading behavior are unchanged. Refresh entries remains available for recovery and new content; no additional encyclopedia queries are introduced.

## Owner setup and verification (not executed against production)

1. Review the PR and run the existing local demo tests: `npm.cmd run test:all`, `node tests/portrait-layout.browser.cjs`, `node tests/platform-polish.browser.cjs`, `npm.cmd run prepare:site`.
2. Follow the existing owner-controlled release process and prepare rules with `npm.cmd run prepare:launch -- --admin-uid YOUR_EXISTING_TEACHER_UID`. Release reviewed rules and the complete site build together. Do not deploy the UID placeholder template.
3. Add actual partner schools manually. Existing students require optional individual manual assignment; no production records are automatically changed. Enable public display only after permission, review the explicit confirmation, then reload the public case to check labels. Uncheck and save to withdraw.
4. Test synthetic local student creation with/without a school, edit/deactivate a school, change/withdraw consent during a delayed sync, approve an argument, check historical/archive/print output and confirm all jury reasoning stays unlabeled. Review browser/screen-reader/real-phone behavior at 320/375/768/1024/1280px.

The synthetic emulator tests verify rules and listener revocation; offline browser fixtures verify actual rendering with synthetic APIs. Production authenticated workflows and project consent procedures remain manual checks. Concurrent directory edits can temporarily hide mismatched copies until explicitly re-synced. Public copies of previously published information are inherently non-recallable. No deploy, merge, account migration or production access is part of this task.
