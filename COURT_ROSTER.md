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
the drawer displays its error state; the updated role panel also cannot load its private roster permissions. Release both components together. Existing students remain unlisted.

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

## Compact dossier and visible-row bulk actions

The compact refinement keeps all original description text/newlines (`pre-wrap`),
reduces narrative type/leading to about 16px/1.5, limits desktop measure to 760px,
and tightens dossier spacing. Mobile descriptions span the full dossier width below
portrait/title. No description is truncated or given a fixed height. The single
roster control is now a fixed left-edge handle; a narrow reserved gutter keeps it
off forms and content. It opens the same drawer/subscription, without a duplicate
button or horizontal launch section. Reduced motion and keyboard behavior remain.

**Approve Visible Students** plans only the current selected trial's currently
visible school/search result set. It excludes unsaved or unassigned roles, inactive
students, unknown individual approval states, pending row actions, and invalid or
inactive assigned-school metadata. Students with no school remain eligible under
the existing model and show “School not provided”. Already approved rows are counted
but not republished. Counts are a partition of the visible rows, not hidden students.

The themed confirmation lists the selected trial, eligible count and saved-role
breakdown. Approval stays disabled until the administrator acknowledges that they
have independently obtained permission for **every eligible student**. This checkbox
is not actual student consent and is not a replacement for obtaining it. If any
permission is missing, cancel and use the existing individual controls instead.
No new consent field or collection is added; each confirmed student uses the existing
`setRosterApproval` transaction and existing private permission records.

Bulk changes are sequential per-student transactions, not one atomic all-or-nothing
batch. Successful entries stay approved if another student fails. Feedback separates
newly approved/withdrawn, already resolved, skipped, failed/unconfirmed and not-attempted
counts. Retrying plans only unresolved eligible rows and requires permission confirmation
again. Each transaction rechecks the saved permission; already-resolved server entries
are not rewritten, including a lost acknowledgement or another administrator's approval.
It also verifies that the reviewed alias, role, school name and country still match
current server metadata. Changed details fail safely: refresh roles and review again.

**Withdraw Visible Approvals** has a separate explicit confirmation. It can withdraw
already-approved visible students even if school metadata/activity or unsaved role
edits make them ineligible for new publication. It changes no assignments, accounts,
contributions, ballots, reasoning or totals.

Confirmation/execution locks the bulk buttons, filters and row actions to prevent
duplicates or changing the reviewed set. Switching trials, accounts, refreshing the
panel or programmatically changing filters invalidates the operation's context.
An already-sent authorized transaction can finish in its original trial; subsequent
rows stop, and delayed callbacks never update a newer panel. Return/refresh the
original trial to verify any completed writes. This is not a claim that a client can
cancel an in-flight server commit. Partial failures are not reported as whole-batch
success, and error details/credentials are never added to public records.

For this refinement, deploy the updated **website only** through the existing process:
there are **no Firestore rule/schema changes**, no new dependencies or backend services.
The roster rules introduced earlier must already be deployed. Use the updated admin
page, apply school/search filters, review eligibility and obtain permission before
confirming a bulk action. Check native keyboard/phone behavior manually before class.
