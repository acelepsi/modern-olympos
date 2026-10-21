# Modern Olympos — Simplified Courtroom

Based on the previously tested v5 layout fix, NOT the extra Evidence/Witness v6.

## What changed
- Admin role options: Unassigned, Prosecutor, Defender, Juror.
- The extra Evidence Gallery and Witness Statements pages/sections are not included.
- Existing optional evidence URLs in prosecution/defense submissions remain.
- The unfinished jury voting form is hidden until secure voting is implemented.
- Existing accounts and submissions are not deleted.

## Installation
1. Back up the working folder. Open this folder in VS Code using Live Server.
2. In firestore.rules replace REPLACE_WITH_ADMIN_UID with the same administrator UID as before, then publish rules in Firebase Console. DO NOT publish the placeholder.
3. In admin.html, check that the role dropdown contains only the four options above.
4. Existing old role assignments (judge, jury, witness, observer) will display Unassigned until reassigned. Assign Juror where appropriate and click Save.
5. Check a Prosecutor submission and administrator approval still work.

## Important
- This release does NOT implement jury voting. It is deliberately hidden because the old button was a nonfunctional placeholder.
- The single administrator account and Firestore permissions remain enforced through your UID in firestore.rules.
- No real Firebase integration test was run here.
