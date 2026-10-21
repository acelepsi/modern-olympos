# Firestore authorization review

Baseline: GitHub `main` at `5d897ed0aabed119bf830a14eadc4e2b87f143c8`
(PR #3 merged). Scope: `firestore.rules`, the reads/writes and UI gates in
`app.js` and `admin.js`, and the account-provisioning instructions.

Findings below are confirmed by source inspection. The new emulator assertions
have **not** run in this environment because the official JAR download is
network-blocked. No finding is described as reproduced against production or as
emulator-verified. See [FIRESTORE_SECURITY_TESTS.md](FIRESTORE_SECURITY_TESTS.md)
for the exact execution status and Windows instructions.

## Confirmed defects addressed with small rule changes

| Severity | Original mismatch | Change and compatibility |
| --- | --- | --- |
| Medium | `validContent()` accepted whitespace-only argument text via a direct request; the UI trims and requires a nonempty body. | Check `text.trim().size() > 0`, retaining the existing raw maximum. No document or account changes. |
| Medium | Ballot creation counted padding toward the 15-character justification minimum, allowing a blank or short trimmed reason. | Check `reason.trim().size() >= 15`; retain all existing role, phase, UID, choice, timestamp and maximum-size checks. |
| Low | Administrator return-for-revision allowed whitespace-only feedback; the UI requires nonempty trimmed feedback. | Check `feedback.trim().size() > 0`, preserving the existing maximum and moderation transitions. |
| Low | Evidence URL rules accepted only lowercase schemes; the UI's case-insensitive HTTP(S) check and URL handling accept uppercase schemes. | Match either case in the HTTP(S) scheme. Other schemes, including `javascript:`, remain denied. |

These edits affect validation of future writes only. They do not rewrite or
remove existing submissions or ballots, add fields, change paths or alter
account eligibility. Existing whitespace-only drafts need meaningful text
before a subsequent edit/submission, as already required by the UI.
`String.trim()` is a documented rules API:
https://firebase.google.com/docs/reference/rules/rules.String#trim

## Existing workflow permissions and query compatibility

| Workflow | Expected UI behavior | Rules assessment |
| --- | --- | --- |
| Student profile/assignment | Read own identity and role; no self-provisioning or assignment. | Owner get allowed; other profiles/assignments and collection lists denied. Browser profile writes denied even for the administrator; Console/Admin SDK provisioning is intentional. |
| Administrator dashboard | An active teacher profile and access to all dashboard collections. | A teacher profile alone is insufficient: the UID must be the configured single administrator. Profile-vs-UID mismatch is deferred below. |
| Public court | Read pointer, trial metadata and published submissions without login. | Allowed. The published feed's `where('status', '==', 'published')` matches the rules predicate. |
| My submissions | Query own drafts/pending/returned/published entries. | `where('authorUid', '==', uid)` matches the owner-read predicate. Unfiltered student collection queries are denied. |
| Arguments | Active student prosecutor/defender writes own section during `trial`. | Role is checked in the destination trial. Ownership, author name, trial ID, timestamp and supported draft/pending states are validated. |
| Revision | Author edits draft/returned and resubmits while still eligible. | Supported. Protected fields cannot change; pending/published entries cannot be student-edited. |
| Moderation | Administrator approves pending or returns it with feedback. | Supported. Content cannot be rewritten, nor can a published entry be withdrawn through these client rules. |
| Ballots | Active assigned juror writes once during `verdict`. | A document at `votes/{authUid}` is create-only; overwrite/update/delete denied, including administrator changes. This enforces at most one ballot per UID/trial, not one per human or mandatory turnout. |
| Ballot privacy | Student gets own ballot; administrator counts ballots; no public reasons. | Owner get and administrator list are allowed. Other reads/list queries denied. |
| Verdict publication | Administrator closes first, then publishes integer totals once. | Supported. Closing and publishing in a single update is rejected, matching the two UI operations. Published trials cannot reopen and summaries cannot be replaced. |
| Undefined paths | No accidental access to future collections. | Default deny. Legacy top-level `verdicts` deny reads and writes; top-level `arguments` retain public read and deny writes. |

No definite field-name/query mismatch requiring a schema change was found.
Ballot choice `not-guilty` and summary field `notGuilty` are deliberately mapped
in `admin.js`.

## Deferred authorization and policy risks

These permissions are deliberately unchanged. Tightening them could revoke
previously valid access, block existing accounts/data, or change the project's
trust model. They need an explicit compatibility/policy decision first.

1. **High — administrator profile deactivation does not revoke UID authority.**
   `admin()` checks only the pinned UID, while `admin.js` also checks
   `active=true` and `accountType=teacher`. A correctly authenticated pinned UID
   remains able to send administrative requests when its profile is inactive,
   missing or a different account type. Adding profile checks could block
   existing UID-only setups. The suite includes a named limitation test for
   inactive-profile behavior; it does not endorse it as a safe revocation model.
   Decide the migration/bootstrap and revocation process before changing this.

2. **High — public document fields are not redacted.** Published submissions
   expose `authorUid`, `authorName`, content and evidence URLs to public readers;
   trial documents and legacy `arguments` are also public. Actual personal data
   was not inspected. Require deliberate pseudonyms and a policy for old data.
   Hiding a field in HTML does not make it private. A public/private projection
   would be a separate schema/design change, not a safe automatic rule edit.

3. **High — administrator tally values are trusted.** The rules validate
   nonnegative integer counts but cannot sum arbitrary ballot collections.
   An authorized administrator client can publish arbitrary totals. The suite
   records that limitation. Trusted aggregation and publication provenance
   require a separate backend/design decision.

4. **Medium — per-trial authorization is broader than the current-trial UI.**
   The pointer selects which trial the UI shows; it is not an authorization
   boundary. A student assigned to another trial may participate there when
   its phase permits, even if it is not the active pointer. Cross-trial tests
   deny role reuse without a matching destination assignment and demonstrate
   legitimate different roles for one UID across trials. Restricting every
   write to the pointer could break parallel/historical workflows and setups
   with no pointer; no such restriction is added.

5. **Medium — deactivation preserves historical owner reads.** Participation
   writes require an active student profile, but owner reads of profiles,
   assignments, private submissions and ballots do not. Decide whether
   `active=false` means participation suspension or total access revocation.

6. **Medium — lifecycle and roster policy is not fully enforced.** Before a
   summary exists, administrators can reopen closed trials or move phases
   backward. Assignments can change during voting; existing ballots remain.
   Moderation may publish an argument during or after deliberation. Changing
   these transitions needs an agreed policy and compatibility review.

7. **Medium — published content has no withdrawal transition.** A teacher
   cannot use the application to remove accidentally published sensitive
   material. Withdrawal/audit-history behavior requires a deliberate workflow;
   deletion permission is not loosened in this change.

8. **Low — provisioning and trial-ID constraints need alignment.** The UI
   accepts trial IDs longer than the pointer's 80-character rule limit.
   Profiles are manually provisioned and must have the expected display name,
   account type and active flag. Administrator assignments do not require the
   target profile or parent trial to exist, though the UI supplies existing
   ones. Do not silently rewrite accounts, normalize old roles, or deny legacy
   references without checking them in an authorized migration process.

9. **Low — courtroom eligibility display is not the full authorization check.**
   `renderIdentity()` and jury visibility use an active profile and assigned role,
   while ballot rules additionally require `accountType=student`. An active
   teacher retaining an old juror assignment could see voting controls and then
   receive a permission error. The administrator UI assigns only student
   profiles, so this requires unusual/legacy provisioning. Keep the rules'
   student-only restriction; aligning that UI gate is a separate frontend fix.

The source still contains `REPLACE_WITH_ADMIN_UID`. This is an intentional
configuration template, not evidence about the deployed rules. Tests substitute
only a synthetic UID in memory. This change does not configure, deploy, inspect,
or modify production rules, accounts, data, or Firebase Console settings.

## Review gate

All 70 existing mocked regressions pass. Security-test syntax/import checks and
local-only guard checks passed. The emulator suite and rules compilation remain
unverified: **run all 106 emulator cases before merging or considering any later
deployment**. Browser Firebase SDK behavior, real Authentication login, deployed
indexes/rules, production IAM/Admin SDK access, and account recovery remain
outside this local rules suite.
