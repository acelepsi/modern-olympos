# Court roster and assignment workspace

## User-facing changes

The dossier now uses portrait + wider narrative columns with the existing progress
indicator below the narrative. Narrative text uses Cormorant Garamond; prominent
trial headings use Cinzel Decorative with readable serif fallbacks. Buttons/forms
retain their existing interface type. The existing portrait frame/fallback, phases,
submission forms, voting, archive and encyclopedia behavior are unchanged.

View Court Roster opens a native modal dialog styled as a side drawer / mobile
bottom sheet. It supports keyboard focus containment, Escape, close/focus restoration,
loading/empty/error states and explicit refresh. Only opening the drawer subscribes
to roster data; close unsubscribes. Trial changes clear old content and reject delayed
responses. Cached/pending snapshots are not presented as current. Counts are the
number of **approved public roster members**, not full assignment or turnout totals.
Aliases are sorted within Prosecution, Defense and Jury. Students with no school
show “School not provided” and no invented flag.

The administrator role table sorts aliases, shows private school names/local country
flags and supports All Schools, a selected school, no-school and case-insensitive
alias search. Filtering only hides/shows already-loaded rows; it performs no writes
or listener restarts. Filters reset when selecting another trial. Saving always uses
the panel's captured trial context; detached/stale controls cannot write a newer trial.

## Explicit consent, hidden by default

Existing `students.publicSchool` is specifically for school labels on published
arguments. It is **not** roster consent. No existing student is automatically approved,
even when that argument-attribution flag or public school listing is enabled.

In Role Assignments, save the student's role, then use **Approve public roster**.
The confirmation requires separate permission for publishing alias, role, school and
country for that one trial. Approval does not enable or disable argument attribution.
Use **Withdraw roster approval** to remove the copy. A failed/unconfirmed approval
requires Refresh roles before another consent action. Reassigning a previously
unassigned student does not restore withdrawn approval automatically.

This roster is public participation information, **not an anonymous jury list**.
Ballots, vote choices, timestamps and reasoning are not copied or linked. However,
public jury membership plus a very small class or unanimous final tally can allow
inference. Teachers must obtain explicit informed permission, review aliases/school
names for identifying content, and may leave jurors hidden. Counts do not reveal
how many unapproved jurors exist. Existing anonymous reasoning remains separate.

Argument-attribution withdrawal and roster withdrawal are distinct purposes. If a
student withdraws all publication permission, the teacher must withdraw roster
approval for each trial as well; changing the argument-only checkbox is not a blanket
roster-consent operation. The UI explicitly explains this distinction.

## Minimal new data (no student/profile schema migration)

All paths are below `trials/{trialId}`:

- `publicRoster/{random20}`: exactly `alias`, `role` (prosecutor/defender/juror),
  `schoolName`, `countryCode`. For no school the last two are empty strings. No UID,
  login identifier, password, timestamp, vote, consent field or source school ID.
- `rosterPermissions/{studentUid}`: private, administrator-only `{publicId,approved}`.
  Stores the separate per-trial approval. The ID is immutable after creation.
- `rosterSources/{random20}`: private, administrator-only `{uid}`. Immutable link
  used by security rules to validate a copy without putting the UID in public data.

The client generates a random, trial-specific document ID on first approval.
Transaction retries/concurrent approvals reuse the existing private permission ID,
preventing duplicate copies for the same student in the same trial. Reapproval uses
that trial's original ID; it is not a cross-trial identifier. Aliases themselves may
be recognizable across trials, which is why separate permission is required.

## Rules and synchronization

Only the already-pinned administrator may write these collections. Public visitors
can list/read the minimal projection **only for settings/currentTrial**; the
administrator may inspect copies for another trial. Private students, schools,
permissions, identity links, assignments and ballots remain protected by existing
read restrictions. No existing account privilege is expanded.

Public-copy writes must match an active student, their saved role, current school
and true trial-specific permission in the same after-state. The school must be active
unless no school is assigned. Permission withdrawal requires deleting the public
copy atomically. Changing an approved assignment requires a synchronized copy;
unassignment requires withdrawing approval/removing the copy. These transactions
preserve all original assignment fields/permissions and never touch ballots or totals.

The updated workspace withdraws a student's roster approvals in known trials before
pausing/resuming participation or changing their school assignment. Changing school
name/country/activity similarly withdraws affected students before saving metadata;
teachers must review/reapprove the new details. If the later metadata operation fails,
earlier withdrawals remain safely hidden and may need reapproval. Argument labels
retain their existing consent and synchronization behavior.

**Scope/limitation:** without a backend trigger or cross-trial schema, rules cannot
atomically fan out arbitrary private profile/school edits across every historical
trial. Trusted direct Console/Admin SDK edits or older client metadata writes can
leave an approved roster copy outdated. Close/reload older administrator tabs and
use the updated workspace. Withdraw affected approvals before external profile or
school edits, then review/reapprove. Direct metadata edits are not a new supported
publication workflow; this feature does not claim backend-wide synchronization.
Already-read information/screenshots cannot be recalled. An already-sent authorized
transaction can finish against its captured old trial; stale acknowledgements cannot
render or act on a different trial's panel.

Revocation scans existing top-level trials; parents are not client-deletable under
current rules. Orphaned histories created by privileged out-of-band deletions require
owner review. Small-project scans/read overhead are intentional; no indexes,
notifications, polling, Cloud Functions or new npm dependencies are introduced.

## Deployment and setup (not performed automatically)

Deploy the reviewed site and Firestore rules together using the existing prepared
rules/admin UID process. Preserve the real administrator UID substitution. New files
are included in both site/local-server allowlists. No existing documents require a
migration. Until the new rules are released, roster reads/approval are denied and
the drawer displays its error state; existing students remain unlisted.

Reload administrator tabs after release. Old assignment writes for an approved
roster may be rejected because they do not synchronize the copy. Updated role saves
handle this atomically. Assign roles normally, obtain trial-specific permission,
then approve only the students who should be listed. Public school-directory listing
is not required; private partner-school assignment is the source.

## Validation and manual checks

Run `npm test`, `npm run test:all` and all Chrome scripts in the CI workflow, including
`node tests/roster.browser.cjs`. Tests use synthetic fixtures/local emulators only.
Coverage includes strict fields/consent/authorization, source privacy, active-trial
access, role/withdrawal synchronization, actual SDK transactions, filtering/search,
delayed contexts, dialog keyboard behavior and 320/375/768/1024/1280px layouts.

Manual release checks: updated administrator tab, separate-permission confirmation,
role change/unassignment, school change/deactivation and reapproval, public drawer
refresh, desktop/mobile keyboard and screen reader, and browser fonts blocked/offline.
Live Firebase configuration, real student permission records and real device/assistive
technology behavior are not exercised by synthetic browser tests.
