# Modern Olympos v3 — Single Administrator

## Before using the admin panel
1. Keep a backup of v2. Open this v3 folder in VS Code and Live Server.
2. Firebase Console > Authentication > Users > Add user. Create a REAL email/password account controlled only by the project administrator. Do not reuse Student A's account. Copy its User UID.
3. Firebase Console > Firestore Database > Data > students > Add document. Document ID = the new administrator UID. Fields: `displayName` (string) = `Court Administrator`; `accountType` (string) = `teacher`; `active` (boolean) = true. Do this from Firebase Console, NOT the student UI.
4. Open `firestore.rules`. Replace the exact text `REPLACE_WITH_ADMIN_UID` with the administrator UID from step 2. Do not change the surrounding quotes. Publish the entire rules file in Firestore Database > Rules.
5. Open `admin.html` with Live Server and sign in with the administrator's email/password.
6. You can now edit trial title/status and assign existing students' roles for each trial. Role changes update live in `court.html` when that trial is active.

## Important limitations
- The student court still has `const ACTIVE_TRIAL_ID = "november-2026"` in `app.js`. Creating a new trial in the admin panel DOES NOT switch the student court to it. This will be addressed in a future iteration.
- The panel does not create student Authentication accounts, reset passwords, or send invitation codes. Continue provisioning accounts through Firebase Console for now.
- Posting arguments and jury voting are not implemented.
- The admin panel is protected by Firestore rules pinned to one UID. An HTML login screen alone is NOT security.
- If admin sign-in fails with permission denied, double-check the UID in the rules and whether they were published.
- Never share administrator passwords or service-account keys. The Firebase web configuration is not a service-account secret.
