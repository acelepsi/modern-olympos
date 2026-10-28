# Maintenance and consistency corrections

Verified against main `b4b3867c13183d5d29fedfc161eeacee72bf5aea`.

- Courtroom and archive published arguments previously used Firestore snapshot order. Both now sort client-side by `createdAt.toMillis()`, oldest first, before routing to their existing side columns. Missing, nonfinite or throwing timestamps follow dated arguments. Equal/unknown dates preserve snapshot order. No timestamp writes or new index requirements. Archive cases remain alphabetically sorted.
- Trials previously read `charge` without providing an editor or allowing writes. The administrator now edits an optional public Charge / Case Description, limited to 2000 characters and rendered as plain text. Blank legacy fields are omitted; an existing description can be cleared. No backfill or migration.
- `renderIdentity` previously reconnected both feeds. Subscription changes now occur explicitly from auth, profile and trial callbacks. Public subscription key: trial. Private subscription key: trial + UID + active student access. Role/alias changes do not affect either query's authorization. Separate revisions reject delayed callbacks, including after access loss and trial changes. No duplicate current-trial or auth subscriptions.
- Browser CDN imports previously used Firebase 10.13.0 while emulator integration used npm Firebase 13.1.0. That left runtime/API compatibility with the shipped SDK untested; it was not evidence of a production failure. Browser imports now match the already-pinned 13.1.0 test dependency. No npm/lockfile changes or new packages. A regression assertion prevents future drift. Mocked browser regressions still cannot prove CDN delivery, real network conditions or persisted-session upgrade behavior; a local-emulator browser smoke check is recommended before release.
- New/changed evidence must be an HTTPS URL of at most 1000 characters, with a host and no embedded credentials/whitespace. Unchanged well-formed historical HTTP links remain editable/resubmittable, or may be upgraded to HTTPS/removed. Existing published HTTP links still render safely as links; no historical submissions are rewritten. Invalid historical URLs must be corrected or removed before resubmission.
- Corrected the obsolete anonymous-auth persistence comment. Removed an unused submission collection wrapper; no broad renaming or historical documentation cleanup.

## Firestore rules required for deployment

The website and reviewed rule changes must be released together by the owner:

1. Add only `charge` to administrator trial create/update metadata allowlists. Optional string, maximum 2000 characters; validate updates only when the field changes so existing data does not block unrelated lifecycle operations.
2. Require HTTPS for submission creation or changed evidence links. Permit an unchanged historical HTTP source only on an otherwise authorized owner update to a draft/returned submission. Administrator moderation of existing pending submissions retains its existing independent status/feedback-only permission.

No authorization, assignment, ballot privacy, single-vote, permanent closure, positive/immutable tally or anonymous reasoning rules change. No production data modification or deployment is part of this PR.

## Validation

Run `npm.cmd ci`, `npm.cmd run test:all`, `node tests/portrait-layout.browser.cjs`, and `npm.cmd run prepare:site` in Windows PowerShell with Node 24.12+, Java 21+ and Chrome installed. Existing emulator scripts use demo projects and loopback services only. See `LOCAL_BROWSER_TESTING.md` and `FIRESTORE_SECURITY_TESTS.md` for local setup.

New tests cover dated/undated argument ordering in both pages, nonmutating stable sorting, charge create/save/clear/validation/authorization, subscription counts and stale callbacks across trial/account/access changes, evidence compatibility and SDK version consistency. Real SDK integration additionally checks metadata authorization, evidence submission/moderation and unchanged timestamps. Offline Chrome fixtures retain portrait/contrast/responsive checks and exercise sorting/evidence helpers.
