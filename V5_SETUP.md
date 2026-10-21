# Modern Olympos v5 — Moderated courtroom

1. Back up your v4 directory and unzip v5.
2. In `firestore.rules`, replace `REPLACE_WITH_ADMIN_UID` with your existing administrator Firebase Authentication UID. Do not publish the placeholder.
3. In Firebase Console > Firestore Database > Rules, paste the complete updated rules and Publish. Do not weaken the rules for testing.
4. Open `admin.html` through VS Code Live Server and sign in as administrator. Select the active trial, set its status to `trial`, and assign Student A `prosecutor` or `defender`.
5. In a separate browser profile, sign in to `court.html` as Student A. Write a test argument, click **Save draft**, verify it appears under My submissions but not in the public feed. Edit and click **Send for approval**.
6. In the administrator panel, select the same trial, click **Refresh submissions**, and approve the pending entry. Confirm the published argument appears in the appropriate public column.
7. Repeat with **Return for revision** and feedback to test revisions.

Note: The first query for published submissions and the second query for student-owned submissions use Firestore query filters. If Firestore reports a missing index, follow its generated index link and wait until the index builds.

Scope: v5 implements prosecution and defense arguments only. Witness testimony and jury voting are planned separately. Do not use real student data until you have tested access rules with non-admin test accounts. Firebase web configuration is public; security is enforced by Firestore rules.
