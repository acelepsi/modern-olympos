# Our International Court (Package D)

## Public data and privacy

The landing page reads **only** `publicSchools` and the already-public top-level
`trials` collection. It never reads private schools, student profiles, assignments,
ballots, moderation or consent records. Existing classroom authentication, roles,
votes, verdicts, encyclopedia, archive and argument attribution are unchanged.

`publicSchools/{schoolId}` is a new explicit publication projection with exactly:

- `name`: nonblank school display name, at most 160 characters.
- `countryCode`: TR, RO or GR.

It contains no account IDs, student aliases, assignments, counts, consent records
or timestamps. Its document ID is the existing **school** directory ID, never a
student/account identifier. Local flags are reused. Publishing a school does not
enable student argument attribution and does not affect jury anonymity.

Only the UID already designated by the `admin()` rule can create/update/delete
these copies. Public visitors can list copies, but cannot enumerate or read the
private `schools` collection. Previously configured private schools are not
published automatically. There is no migration, backend job or Cloud Function.

## Administrator setup

1. Open **Partner Schools** in the existing administrator workspace.
2. Add or select a school. Enter its name/country, leave Active checked and save.
3. Review the saved name and country, then click **Publish school on homepage**.
   Confirm explicitly. Cancelling writes nothing. Repeat only for approved schools.
4. Use **Remove from homepage** to withdraw a listing without affecting private
   school assignments or student attribution permissions.

The status below the school editor states whether the selected school is public.
Saving a published school's name/country updates its public copy atomically.
Deactivation atomically deletes the copy. Reactivation does **not** republish;
publication requires another explicit action. Unsaved edits cannot be published.
Duplicate actions are disabled while pending. An unconfirmed operation is reported
as unconfirmed; refresh the directory to check the saved state before retrying.

## Counts and failure states

Countries and Partner Schools count the **approved active public directory**, not
all private configured schools. This scope is stated below the statistics.
All school names in each represented country are listed alphabetically. Countries
without approved schools do not get an empty card. An empty authorized directory
shows zero countries/schools and a compact approval message.

Trials counts every top-level document public visitors may read under existing
rules: preparation/arguments, voting and closed cases. It does not imply completed
trials, student participation or any turnout. No timestamps or indexes are added.
A failed read displays an em dash and an unavailable message, never a fabricated
zero. School/trial failures are independent. Refresh clears stale cards/counts;
request generations prevent an older response replacing a newer refresh.

Public queries run once on page load and when **Refresh public information** is
clicked. Already-open pages need refresh/reload after directory changes; there is
no polling or background service. Two collection reads fetch the public directory
and public trial metadata; this is appropriate for the current classroom scale.
If the number of public trials becomes large, a separately reviewed public count
projection could reduce reads. Existing private schools are never counted publicly.

Names use textContent, flags load from local assets, and all cards remain keyboard
and screen-reader readable. Static hero artwork and links remain available even
when Firebase cannot load; JavaScript-disabled visitors receive an explanation.

## Release requirements (not performed automatically)

Deploy the reviewed website changes and **Firestore rules together** through the
project's normal release process. Keep the existing administrator UID substitution
and all other deployed authorization configuration; never replace it with the
checked-in template value. No Console changes, credentials or data migrations are
needed. Until the rules are released, public reads/publication are denied and the
homepage uses its unavailable state. Once a public copy exists, older administrator
clients cannot rename/deactivate it with a private-only write: rules reject that
inconsistent operation. Reload the updated administrator page before school edits.

A project administrator must explicitly publish approved schools after release.
Nothing in this change publishes historical schools during build/deployment.
Removing a listing cannot recall information already read, printed or captured.
The pre-existing public argument authorUid exposure documented in
SCHOOL_AFFILIATIONS.md is outside this directory feature and is unchanged.

## Validation

- `npm test`: existing regressions plus focused projection/count/empty/race tests.
- `npm run test:all`: adds Auth/Firestore emulator authorization and actual helper
  integration tests, using only demo projects and synthetic records.
- `node tests/admin-module.browser.cjs`: real module graph with offline Firebase
  boundaries, administrator publication/rename/deactivation/cancellation and public
  homepage counts/errors; 320, 375, 768, 1024 and 1280px, contrast, flags, keyboard,
  reduced motion and absence of unexpected browser console errors.
- `node tests/portrait-layout.browser.cjs` and
  `node tests/platform-polish.browser.cjs`: existing classroom/archive/platform checks.
- `npm run prepare:site`: verifies the explicit public bundle. This does not deploy.

Manual release verification: approve one synthetic/non-identifying partner school,
check its homepage card/counts, rename/deactivate/withdraw, refresh the public page,
and check a real keyboard/screen reader and mobile device. Production records are
not created or altered by automated tests. Real live Firebase behavior is not
exercised by the offline browser fixture; emulator tests cover rule enforcement.
