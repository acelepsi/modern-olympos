# Modern Olympos v7 — Jury Voting

1. Back up your working v6 directory. Open this v7 directory with VS Code / Live Server.
2. In `firestore.rules`, replace `REPLACE_WITH_ADMIN_UID` with the SAME administrator Firebase Authentication UID used in v6. Publish the FULL rules in Firestore Console. Do not publish the placeholder.
3. In admin.html, assign Student A the `juror` role for the selected trial. Create a second test student for the prosecutor role if needed.
4. In the Trials form, enter the EXISTING trial ID and its exact title, set Status to `Verdict`, then click Save trial. This opens voting and stops new arguments.
5. Log in as Student A in court.html. Choose Guilty or Not Guilty, provide at least 15 characters of reasoning, submit once. Refresh; you must not be able to vote again.
6. In admin.html, click Refresh jury votes to see the ballot count. Change the trial Status to `Closed` and Save trial. Only then click Publish final tally. Reload court.html to see public totals.

Important: Ballot documents live at `trials/{trialId}/votes/{studentUid}`. Only the administrator can list them; a juror can read their own ballot. Rules prevent updates/deletions and a second vote. Public results are stored only in the trial's `verdictSummary` field after closure. Do not reopen a closed trial after publishing totals, as this could invalidate the tally. This version does not yet enforce phase transitions in security rules or show individual written justifications publicly.
