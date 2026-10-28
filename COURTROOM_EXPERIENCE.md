# Courtroom experience upgrade

Based on main `3e37c3e18359918e6aa0ded15eaf801c3d8efb2b`.

- The three-step Arguments → Verdict → Closed indicator uses the existing cached trial snapshot. It labels completed/current/upcoming steps with text and `aria-current`, and shows an unavailable state during loading/errors. No new reads or phases.
- Final voting opens an accessible native HTML dialog styled for Modern Olympos. It displays the exact trimmed choice/reason that will be written, warns that voting is final and offers Cancel / Submit Final Vote. Cancel receives initial focus; Escape cancels; Tab stays in the dialog; focus returns to the visible trigger. Review text is erased on dismissal. Unsupported dialog APIs fail closed. Invalid input uses inline feedback, not alerts. Administrator dialogs remain outside this courtroom-only change.
- One review can be pending per context. The form is locked during review; duplicate submit events and in-flight ballot writes are rejected. Eligibility and the captured account/trial generation are rechecked after confirmation. Account/trial changes, access loss, closure or an existing ballot dismiss the review. An old confirmed dialog cannot write into another trial. Existing rule-enforced immutable ballot writes are unchanged.
- My Submissions shows Private draft, Pending review, Returned for revision and Published badges. Returned feedback has a distinct panel and a count derived only from the existing own-submissions snapshot. No new notification storage, polling or cross-student queries.
- Counters display raw character count against existing maxima (arguments 5000; jury reasoning 2000). Jury guidance uses the trimmed minimum of 15, matching existing validation/rules. Input, editing, successful saves/votes and context resets update counters.
- At 860px and below, the side controls become ARIA tabs with roving focus and Arrow/Home/End support. Desktop retains two columns. Without JavaScript, both sides stay visible. Editing a submission selects its side before focusing the composer. Breakpoint changes preserve keyboard focus safely.
- Dossier portraits are 108px desktop / 84px mobile, with a subtle gold frame, contained center-cover image and unchanged Ω fallback. Typography/charge spacing improve only the courtroom. Archive dimensions and styling remain unchanged.

## Release and verification

**No Firestore rule or schema changes are necessary.** Authentication, assignments, moderation, ballots, tally publication, permanent closure and anonymous reasoning storage/authorization are unchanged. Include the new `court-ui.js` public asset (already included by the build and isolated local server). No dependencies added.

Run `npm.cmd run test:all`, `node tests/portrait-layout.browser.cjs`, and `npm.cmd run prepare:site` in Windows PowerShell using the existing local demo emulator setup. New unit/mocked regressions cover phase rendering, cancellation/confirmation, duplicate review/write prevention, context races, badges, counters and tabs. Offline Chrome fixtures exercise the actual presentation helpers and submission renderer, native modal focus/Escape, complete long justification, responsive panels, contrast and portrait containment; existing archive checks remain.

Before classroom release, manually test with synthetic accounts in the isolated local emulator browser: both jury choices, long reasoning, cancellation and retry, sign-out/trial closure while reviewing a ballot, a failed write, a returned argument edit, keyboard-only navigation and a real narrow phone viewport. Automated fixtures do not connect browser CDN modules to Firebase or replace assistive-technology testing. No production data changes, deployment or merge are part of this PR.
