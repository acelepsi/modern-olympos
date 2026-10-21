# Modern Olympos v2 — permanent student code + password

## What works now
- Firebase email/password authentication with a student code converted internally to a virtual email.
- The student's permanent identity is loaded from `students/{authUid}`.
- Their *current trial* role is loaded from `trials/november-2026/assignments/{authUid}`.
- Missing role defaults to observer. The UI reacts to teacher assignment changes.
- Existing public court design is retained.

## Important limitations
- This is an **authentication and role display milestone**, not a complete court app.
- Posting arguments, voting, trial dossier loading and teacher dashboard are not wired yet.
- Do not give students accounts until moderation, permissions, and data protection are reviewed.
- The role controls the UI, not authorization for posting yet. No posting/voting writes are allowed by the rules.
- The teacher profile must be provisioned using Firebase Console or Admin SDK; never allow students to assign themselves teacher status.
- Virtual emails cannot receive password-reset messages. Teachers must reset passwords through Firebase Console (or a future secure backend).

## Firebase setup (do in order)
1. Authentication > Sign-in method: enable **Email/Password**. Anonymous can remain enabled temporarily for previous tests, but v2 does not use it.
2. Firestore > Rules: paste `firestore.rules`, Publish. These rules DENY most writes by default.
3. Authentication > Users > Add user: email `student-001@students.modern-olympia.firebaseapp.com`, choose a strong unique password (8+ characters; preferably 12+). This is a virtual sign-in identifier, not an inbox. Never put the password in Firestore.
4. Copy the created user's UID from Authentication > Users.
5. Firestore > Data: create collection `students`, document ID = that UID. Fields: `displayName` (string) = `Student A`; `active` (boolean) = true; `accountType` (string) = `student`.
6. Firestore > Data: create collection `trials`, document ID `november-2026`; add fields `status` (string) = `trial`, `title` (string) = `Prometheus: Hero or Thief?`. Inside this trial document, create subcollection `assignments`, document ID = same student UID; add `role` (string) = `prosecutor`.
7. Open `court.html` via VS Code Live Server, click Login; code `STUDENT-001`, password = the password created in step 3. The header should display `Student A` and `prosecutor`.
8. To simulate a monthly role change, change the `role` field to `defender` in Firestore and refresh or wait for the listener. The same credentials work.

## Teacher accounts
For now use Firebase Console to manage assignments. A future teacher dashboard requires a teacher Auth account and `students/{teacherUid}` document with `accountType=teacher`, `active=true`. Only a trusted project owner with Firebase Console access should create that profile. Never create teacher profiles from browser code.

## Security/privacy
- The app is public-read for trial metadata and arguments (no personal student data should be placed in public collections).
- Student profiles and assignments are restricted to their owner and teachers.
- Assignments can only be changed by teacher accounts. Passwords are handled by Firebase Authentication.
- Keep a record of codes/passwords in a secure, access-controlled school process; don't publish them in TwinSpace or shared public documents.
- These rules are a starting point and should be tested with the Firestore Rules simulator/emulator before broad deployment.
