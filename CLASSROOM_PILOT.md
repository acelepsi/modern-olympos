# Modern Olympos: classroom pilot and Windows launch checklist

The intended workflow is now implemented: teacher creates student access → assigns
trial roles → activates the case → students draft/send arguments → teacher approves
or returns them → jurors vote once → teacher confirms permanent closure → publishes
a positive final tally → visitors browse the completed case in the public archive.
No new voting policy or schema migration is required.

## Before the first live lesson

**Must fix/verify before launch**

- The PR's automated regression **and emulator** tests must pass. New account rules
  must be compiled/tested; a blocked emulator download is not a passing result.
  GitHub Actions runs these suites without production credentials, avoiding a long
  manual test procedure. If Actions is unavailable, `npm.cmd run test:all` does the
  same on Windows (Node 24.12+, Java 21+; see LOCAL_BROWSER_TESTING.md).
- Create the one teacher account and matching profile below, and prepare/deploy the
  matching rules with its UID. A teacher-looking profile alone grants no admin rights.
- Confirm Firebase Authentication Email/Password sign-in is enabled and the project's
  Firebase web API key permits the hosted app's domain and Email/Password API.
  This repository does not inspect or change live Console settings.
- Use display aliases, not full student names, and review arguments/evidence for
  personal information before approving. Approved aliases, text and evidence links
  are public, including the archive. Do not publish private Drive documents or
  contact details. The owner remains responsible for school publication consent.
- After deployment, do one brief teacher-controlled check with a newly created pilot
  account: sign in, see an assigned role, and sign out. Production configuration and
  actual Windows/browser rendering cannot be proved from emulator tests.

Optional improvements can wait: a richer mythology encyclopedia, thumbnails,
archive sorting/search, an in-dashboard password reset, and a backend that independently
verifies administrator-supplied tallies. None is needed for the supported small
classroom workflow. The existing trust limit remains: Firestore rules cannot prove a
collection-wide total submitted by the designated administrator. Do not describe
this system as an independently audited election service.

## Windows deployment: six practical steps (owner runs these; nothing auto-deploys)

1. **Install and open the project.** Install Node.js 24.12+ and Java 21+ as described
   in LOCAL_BROWSER_TESTING.md. Open PowerShell in the downloaded project folder:

   ```powershell
   npm.cmd ci
   npm.cmd run test:all
   ```

   Stop any browser emulators before testing. Do not proceed if a test fails or the
   Firestore emulator cannot start. A green PR Actions run verifies the same suites.

2. **Bootstrap the teacher once in Firebase Console.** In project **modern-olympia**,
   Authentication → Sign-in method: enable Email/Password if needed. Authentication
   → Users → Add user: create the teacher's own email/password account. Keep that
   password private; do not put it in source code or send it in chat. Copy the user's
   UID. Firestore Database → Data: create document `students/TEACHER_UID` with:

   | Field | Type | Value |
   | --- | --- | --- |
   | displayName | string | Court Administrator |
   | accountType | string | teacher |
   | active | boolean | true |

   Do not change an existing teacher UID or student profile just to follow this
   checklist. If the teacher account/profile already exists, reuse its UID.

3. **Prepare local launch files**, replacing the sample text with that UID:

   ```powershell
   npm.cmd run prepare:launch -- --admin-uid "PASTE_TEACHER_UID_HERE"
   ```

   This copies only public website files into `dist/` and generates a private local
   `.launch/firestore.rules` file from the checked-in template. It does not deploy,
   modify the template, create Firebase users or connect to Firebase. Both output
   folders are Git-ignored. Keep `REPLACE_WITH_ADMIN_UID` in the source template so
   isolated emulator tests continue working. Do not manually edit the generated rules.

4. **Sign into the owner's Firebase CLI account and deploy deliberately:**

   ```powershell
   npm.cmd exec -- firebase login
   npm.cmd exec -- firebase deploy --project modern-olympia --only "firestore:rules,hosting"
   ```

   Check the printed project name before confirming any CLI prompts. This command
   is for the owner; it was not run by this development task. `firebase.json` hosts
   only `dist/` and rejects stale/mismatched prepared rules. Never deploy the repository
   root or `firebase.browser.json`. No service-account key is needed. Do not deploy
   only the UI while retaining old profile rules: account creation would fail.

5. **Open the printed Hosting URL and `admin.html`.** Sign in as the teacher. Create
   a student with a unique code, public display alias and password of at least eight
   characters. Give those credentials privately to the student; keep a private record
   of codes. Passwords are never saved in Firestore or displayed after creation.
   Do not copy emulator users or fixtures into production.

6. **Prepare the lesson.** Click **Create a new trial** and use a lowercase ID (letters/numbers/hyphens)
   and a title naming the mythological figure, e.g. “Loki: Trickster or Criminal?”.
   Start in **Trial — arguments**, save each student's role, then **Make selected trial
   active**. The trial selection controls teacher panels; activation controls the
   public/student court. When arguments are reviewed, save **Verdict — jury voting**.
   After checking turnout, save **Closed**, explicitly confirm, then publish the tally.
   At least one valid vote is required. The closed case appears automatically in
   **Completed Trials**; no separate archive publication button is needed.

## Teacher account-management notes

- Student creation uses a temporary **memory-only secondary Auth session**. It never
  signs the teacher into the student's account. A validated student profile is then
  written using the teacher's existing session and the pinned administrator rule.
- Only the designated administrator can create profiles with the existing fields
  `displayName`, `accountType: student`, `active: true`, or change a student's
  `displayName`/`active`. No student can create/edit profiles or become a teacher.
  Teacher profiles cannot be changed by this UI/rule path. Existing extra student
  fields are preserved, so no account migration is needed.
- **Pause participation** blocks new arguments and jury votes. It does not disable
  Firebase Authentication, delete work, hide public approved work, erase an existing
  ballot, or revoke the student's access to their own existing profile/submissions.
  To fully disable an Auth identity, the owner uses Firebase Console → Authentication.
- Account creation spans Auth and Firestore; no backend was added. If profile creation
  fails, the client checks whether it committed and removes the newly created Auth
  identity only when the profile is confirmed absent. If neither confirmation nor
  cleanup can be completed, the dashboard gives the new UID and asks the teacher to
  check that specific new account in Console before retrying. Existing accounts are
  never overwritten/recovered via a matching code.
- Forgotten password: Console → Authentication → find the virtual email
  `lowercase-code@students.modern-olympia.firebaseapp.com`; use the Console's account
  controls. These are virtual inboxes, so an emailed reset link is not a usable student
  recovery workflow. If the Console does not offer a direct password change, provision
  a replacement student code and reassign roles; preserve the old UID's work/ballots.
  Do not delete/recreate a juror to enable another vote in an already running trial.
- Review terms: **Approve** publishes immediately; **Return for revision** leaves the
  argument private and includes feedback. Students can edit returned work or drafts.
  Only published arguments are fetched by the public court/archive.
- Closure is permanent. No quorum/deadline/abstention policy has been added. Check that
  the intended jurors have voted before closing; do not close merely to preview totals.
  The published archive shows the existing final counts, without inventing a new
  majority/tie ruling policy. Closed cases awaiting a valid tally are labelled clearly.

## What this development environment verified

See the PR for exact executed counts. Mocked tests cover account failures/cancellation,
unchanged teacher sessions, duplicate actions, moderation, published-only archive
rendering and safe hosting preparation. Auth emulator tests exercise real sign-ins
and secondary account creation. Firestore tests cover account permissions, archive
privacy, the existing lifecycle and vote protections. Tests that cannot start because
of a missing emulator binary are explicitly unverified, not silently skipped.

**Pilot decision:** suitable for a small teacher-supervised pilot once the PR's full
emulator suites pass and the teacher bootstrap/rules deployment above is complete.
Until those conditions are met, this is prepared code, not a verified live launch.
No production data, accounts, Console settings or deployment were changed by this pass.

If sensitive material is approved accidentally, immediately stop sharing its link and ask the project owner to change that submission’s status to `returned` in Firebase Console (with feedback). The app intentionally preserves the existing moderation transitions and does not add a published-content withdrawal button. Public viewers may retain copies; review before approval is essential.
