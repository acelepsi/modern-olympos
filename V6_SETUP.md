# Modern Olympos v6 — Evidence & Witnesses

1. Back up your working v5 folder. Extract this ZIP into a new folder and open it in VS Code.
2. In `firestore.rules`, replace `REPLACE_WITH_ADMIN_UID` with your existing administrator Authentication UID. IMPORTANT: Do not publish the placeholder. Publish the entire updated rules in Firebase Console → Firestore Database → Rules.
3. Run `court.html` using Live Server. With a prosecutor or defender account, check the Evidence Gallery form; with a witness account, check Witness Statements.
4. Save a draft, submit for approval, then use `admin.html` → Submission Approval Queue to approve. Published entries should appear in the correct gallery.
5. The existing Prosecution and Defense two-column layout is retained. The new galleries sit below it.

Notes: Only links (not file uploads) are supported. External links should be reviewed before approval. Do not share student personal information in publicly visible text. Jury voting is not implemented.
