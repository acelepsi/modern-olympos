# Modern Olympos v4 — Active trial selector

1. Back up your working v3 folder. Extract this ZIP and open its `modern-olympos-v4` folder in VS Code.
2. IMPORTANT: In `firestore.rules`, replace `REPLACE_WITH_ADMIN_UID` with the **same administrator UID** already used in your published v3 rules. Do not publish the placeholder. In Firebase Console > Firestore Database > Rules, publish the new rules.
3. Start `admin.html` using Live Server, sign in as the administrator. Select `november-2026` under Manage trial and click **Make selected trial active**. Confirm the prompt.
4. Open `court.html` with Live Server. Its heading should show the selected trial title, and Student A should show the role assigned for that trial.
5. Create another trial, assign Student A a different role, activate it and verify the court updates (also without refreshing when both pages are open).

Important limitations: Existing sample argument cards and image assets in court.html are static placeholders, not linked to each trial. Argument submissions and jury voting are not implemented. Switching the active trial does not yet replace those placeholders; do not use them for a live case. Only the title, status and role assignment now follow the active trial. Do not publish personal student data until the platform is further reviewed.
