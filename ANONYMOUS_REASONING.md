# Reviewed anonymous jury reasoning

This feature adds public **copies**, not public ballots. Existing votes, vote totals,
permanent closure, student permissions and original submission timestamps remain
unchanged. Nothing is backfilled or published automatically, including old trials.

## Teacher workflow

1. Select the completed trial in the administrator dashboard. It must already be
   permanently closed and have a valid positive final tally.
2. Click **Load / refresh private reasoning**. The original choice and reasoning
   are shown only inside the authorized dashboard. No student identifier or vote
   timestamp is displayed as a review label.
3. Read each justification. Edit the **public copy** to remove names, student codes,
   email addresses, handles, contact details and identifying anecdotes. Preserve its
   meaning. The immutable ballot choice cannot be edited.
4. Confirm that school/classroom publication permission covers this copy (especially
   historical work that was submitted before the new privacy notice). Check the anonymity-review confirmation and approve that one copy. A further
   confirmation explains that the edited text/choice will be public. There is no
   bulk approval or automatic historical publication.
5. Use **Exclude from publication** for unsuitable material. If already published,
   **Withdraw public copy** removes the public copy without touching the ballot or
   tally. Withdrawal cannot erase copies already seen/saved by a visitor.

Approved copies appear below the prosecution/defense arguments in the archive.
The archive clearly says that these are selected educational excerpts, not all
votes or a second count. Juror #1/#2 labels are generated from random, trial-local
public document IDs; they are not the private review order and may renumber after
withdrawals/new approvals. No number represents a stable student identity.

## Data and privacy

| Path beneath `trials/{trialId}` | Contents | Access |
| --- | --- | --- |
| `votes/{uid}` (existing) | Original choice, reason, castAt | Existing private ballot rules, unchanged |
| `reasoningReviews/{uid}` (new) | `state` (approved/excluded), random `publicId` | Designated administrator only, including reads |
| `publicReasoning/{randomId}` (new) | Exactly `choice` and reviewed `reason` | Public only after permanent closure and valid final tally; administrator-only writes |

Public IDs are fresh Firestore auto IDs, independent of UIDs and other trials.
The UID-to-public-ID mapping remains private even to the ballot's owner. There are
no source IDs, aliases, codes, emails, labels or timestamps in a public payload.
Public cards use textContent, so HTML-like reasoning is displayed as text.

A transaction rereads the closed/published trial, immutable ballot and private
review reference, then writes the sanitized copy and review state together. It
reuses an existing public ID on retries/concurrent reviews rather than duplicating
copies. Exclusion writes only private state; withdrawal removes only the public
copy. Delayed responses are scoped to the administrator, selected trial and panel
request generation. Success is acknowledged only after the transaction commits.

### Limits that require human review

The system prevents identity **fields/metadata** from being copied. It blocks
recognizable email/handle markers and known UIDs/aliases in the dashboard. This is
not a universal personal-information detector: arbitrary names, custom codes,
writing style and identifying stories require teacher redaction/exclusion. Small
juries or prior classroom knowledge can permit inference even without technical
identifiers. Do not publish a justification whose author could be identified.

The designated administrator remains the trusted publisher, as with argument
approval and final tallies. Rules cannot prove that a human read a text or that its
meaning is anonymous; a direct privileged administrator write is itself an approval
and can bypass UI text checks. No backend could automatically guarantee semantic
anonymity. Do not import raw ballot objects into the public collection. Normal
Firestore document infrastructure may show the *public copy's* publication/update
time; the ballot's submission time is never copied or exposed by this feature.

## Required Firestore rule additions (separate from archive styling)

Only two new subcollection matches and a closed/published gate are added. Existing
ballot/profile/submission/assignment and trial update rules are not relaxed.

- Public reasoning reads/writes require `status: closed` and positive, nonnegative
  integer final counts. Before final publication even an accidentally seeded public
  copy is unreadable to visitors.
- Only the existing pinned administrator can create/edit/withdraw copies or access
  review mappings. Students, other teachers and anonymous users cannot approve or
  modify anything. Their previous own-ballot access remains unchanged.
- Public copies require a random-shaped 20-character ID and exactly `choice`/`reason`,
  with a valid choice and 15–2000 characters of nonempty text; email/handle markers
  are rejected. Extra identifying fields or timestamps are rejected. A published
  copy's choice cannot be changed, only its reviewed text.
- Private review writes require an existing ballot, approved/excluded state and a
  fixed random reference. Mapping IDs cannot be replaced to create duplicate copies.

Deploy the matching prepared rules and website together when the owner chooses:
follow CLASSROOM_PILOT.md, preparing rules with the existing teacher UID. No new
account setup, data migration, Storage, backend service, dependency or production
operation is needed for this feature. Old completed trials initially show an empty
approved-reasoning state until the teacher explicitly reviews them.

## Archive changes

The old archive inherited dark text onto dark argument cards. Archive-only styling
now explicitly sets high-contrast light text, gold aliases/serif headings, charcoal
cards, burgundy/indigo accents, distinct count blocks, responsive argument/reasoning
columns and a completed case header. The selected case hides the overview list so
its title/portrait are not visibly duplicated. The active court changes only its privacy notice, not its design or actions. There is no completion date because
existing documents do not reliably store one; no date is guessed from ballots.

Automated tests cover privacy rules, per-card consent, transaction failure/retry,
exclusion/withdrawal, unchanged ballots/tallies, old-trial compatibility and public
rendering. The existing Chrome fixture also checks actual archive text contrast
(at least 4.5:1), desktop/narrow columns and portrait bounds using synthetic data
and no Firebase scripts or external resources. See the PR for executed results.
