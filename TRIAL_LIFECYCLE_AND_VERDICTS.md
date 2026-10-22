# Trial lifecycle integrity and jury publication

Baseline: `main` at `a95320edf4df1fca9cc014c42353402f3e579919` (PR #4 merged).
No production Firebase access, data migration, deployment, account-permission
change, new backend, or Cloud Function is included.

## Lifecycle audit: existing behavior and implemented changes

| Stage | Baseline behavior | Phase 5 behavior |
| --- | --- | --- |
| Creation | Administrator creates a title and `trial`, `verdict`, or `closed` status. | These creation options remain compatible. Choosing a later starting phase does not establish that earlier stages happened. |
| Preparation | No distinct preparation state. In `trial`, an active assigned prosecutor/defender can submit, including by direct request to a non-current trial. | Unchanged. Withhold participating roles until ready; the public pointer is navigation, not an authorization boundary. A future preparation state needs approval. |
| Arguments | Authors save drafts, submit pending work, revise returned work; administrator approves. | Unchanged. Administrators should finish review before opening voting. Late moderation is still permitted by rules and is a residual policy issue. |
| Voting | Active student profile plus per-trial `juror` assignment at ballot commit. One immutable ballot per UID/trial, two choices, reason and server timestamp. | Unchanged. Existing ballots are not retrospectively removed because a profile or role later changes. |
| Closing | `verdict`/`trial` could become `closed`, then reopen before summary publication. | Closure is terminal even without a summary. `verdict -> trial` is denied; same-phase edits, `trial -> verdict`, `trial -> closed`, and `verdict -> closed` remain allowed. The administrator confirms permanent closure. |
| Publication | Separate trial and ballot reads could use cache; unknown choices were ignored; a direct update stored counts. Zero totals were permitted. | Supported client requires confirmed server reads, permanent closure, a nonempty collection with valid records, then a transaction rechecking phase and prior publication. New summaries must have a positive total. |
| Final record | Summary immutable; trial with summary could not reopen. Counts only, not a formal ruling. | Same summary shape and public display. Title corrections remain allowed; ballots and summaries remain immutable. No automatic guilt rule, quorum rule or deadline is added. |

There is intentionally no separate `prepared`, `votingOpen`, `cancelled` or
`published` status. A closed trial without a summary is distinguishable from a
published trial by the absence of `verdictSummary`. A closed empty/cancelled
trial remains closed without publishing a fictitious 0-0 jury result.

## Findings and protections

| Severity | Failure mode | Protection or remaining limit |
| --- | --- | --- |
| High | Trial closes, client reads ballots, another session reopens voting, accepts more ballots, closes again, then the first client publishes stale counts. | Forward-only phase rules make `closed` an irreversible barrier. Once a server read confirms closure, ordinary client ballot creates cannot succeed. |
| High | A cached or locally pending view omits ballots while publication still reports success. | `getDocFromServer` and `getDocsFromServer`; reject snapshots marked cached or pending. Server-read failure aborts. Dashboard ballot counts also use server-only reads. |
| High | Two administrators publish concurrently or a title update conflicts with publication. | Firestore transaction rereads the trial, requires `closed` and no summary, and writes the immutable summary. Retry checks the conditions again; confirmation is outside the retry callback. |
| Medium | Imported/malformed ballots or unsupported choices are silently omitted. | Reject the entire publication attempt for malformed fields, invalid choices/reasons/timestamps, or inconsistent query size. Do not silently count a subset. |
| Medium | Empty collection produces an apparently final verdict. | Client rejects empty ballots; rules reject a new 0-0 summary. This is a nonempty-count sanity check, not a turnout quorum. |
| Medium | Commit failure or lost acknowledgement is displayed as success. | Announce new publication only after transaction acknowledgement. Otherwise say publication is not confirmed. Retrying the check reads the server and shows already-published totals instead of writing again. |
| Medium | Totals are saved, then refreshing the count fails and is confused with publication failure. | Explicitly distinguish “published; count refresh failed” from an unconfirmed transaction. |
| Medium | A delayed response updates a different selected trial. | Existing selection/request guards remain at every read and transaction callback boundary. Already-issued commits may finish for their original document, but cannot change a new selection's UI. |
| High, unresolved | An authorized administrator supplies fabricated positive integers directly, or privileged tooling modifies/imports ballots. | The unchanged data model cannot prove a collection-wide sum to rules. Administrator and privileged server operations remain trusted. |
| Medium, unresolved | Expected jurors have not voted, pending client votes never reached the server, or current eligibility differs from opening-day eligibility. | No frozen roster, deadline or quorum exists. Publication confirmation warns that turnout may be incomplete and that no quorum/deadline policy is enforced. |

Publication validates the existing ballot format: exactly `choice`, `reason`,
`castAt`; supported choice; reason within the current UI limits; a real Firebase
Timestamp. It does not check current profiles to discard older votes: doing so
would silently change eligibility from “eligible when cast” to “eligible now.”
It cannot reconstruct historical eligibility or provenance of privileged imports.

## Race ordering and scope of the guarantee

1. A vote that commits before closure is a stored ballot and is included by the
   post-closure server collection read. A vote racing closure either commits
   under the voting phase or is denied; it must not partially exist.
2. Closure must be acknowledged by Firestore. A local/offline status selection
   is not proof that voting has stopped.
3. Under the new rules, ballots cannot be created after closure, updated or
   deleted by browser clients. Therefore the complete server collection read is
   stable while the publication confirmation and transaction run.
4. Concurrent publication is serialized through the trial document. Once one
   transaction stores a summary, another retry observes it and must stop.
5. A concurrent title correction can trigger a transaction retry; it cannot
   change the stable ballot collection or authorize reopening.

This guarantee applies to the supported client with the matching rules in force.
**No deployment happened here. A frontend-only release while old reopening rules
remain deployed does not establish the stable-collection guarantee.** Any later
release must coordinate reviewed frontend and rule versions; production rules
were not inspected. Admin SDK, Console/IAM owners, privileged imports, and a
modified administrator client are outside the ordinary-client trust boundary.

## Why this does not prove the tally to Firestore

`runTransaction` prevents conflicting publication, not dishonest arithmetic. The
web transaction reads named documents; it cannot put an arbitrary collection
query into its transactional read set. Rules validate document fields and bounded
document lookups, not the sum of an unbounded ballot collection. A direct
administrator request with fabricated positive counts still passes the rules;
the existing limitation test deliberately demonstrates this.

For a guarantee against a faulty/modified administrator client, one option is a
trusted tally endpoint/worker that computes the sum and becomes the only writer
of summaries. This would require a backend deployment, its authentication/IAM,
removing browser authority to publish supplied counts, idempotence, and operational
review. Another option is a separately designed schema with counters whose atomic
updates are enforced by rules for every ballot; that would require migration,
new write protocols and contention testing. Neither is introduced or claimed
solved by this phase. Project-owner approval is required before either design.

## Proposed policy — requires owner approval, not implemented

The table below is a concrete recommendation for discussion, not an assertion
about current behavior. Until agreed, the application publishes recorded counts
only and makes no claim of full turnout or a formally valid jury ruling.

| Topic | Existing behavior | Recommended policy / approval needed |
| --- | --- | --- |
| Eligible jurors | Active student profile and juror assignment at each vote's server commit. Roles can change during voting. | Freeze an administrator-reviewed roster when voting opens. Keep participation suspension available for safeguarding, with an explicit audit trail; do not silently remove already-cast ballots. Decide whether withdrawals alter the quorum denominator. A private roster snapshot/new fields need design approval. |
| Preparation | `trial` already allows assigned argument authors to submit. | Review dossier, roles, sources and the jury roster before opening participation. Decide whether a distinct preparation phase is needed; adding it changes the phase protocol. |
| Quorum | None; this phase only prevents zero recorded ballots from being published. | At least two-thirds of the frozen roster, rounded up, with at least three participants and a roster of at least three. Smaller educational groups need an explicit alternative. Decide the threshold before implementing enforcement. |
| Deadline | None; the server-acknowledged manual closure is the cutoff. | Announce an absolute deadline stored as a UTC timestamp, display it in the project timezone, and enforce `request.time < deadline` in rules. Manual early closure remains explicit. New fields, edit permissions and late-vote communication need approval. |
| Abstention | Only `guilty` or `not-guilty`; absence is not a stored ballot. | If pedagogy requires abstention, add an explicit recorded abstention choice, count it toward turnout, exclude it from decisive-vote percentages, and display it separately. This changes valid values and summary fields; approve schema compatibility first. |
| Final ruling | Two counts, no quorum or majority interpretation. | If quorum is met and there is at least one decisive vote, use strict majority of decisive votes; a tie is “inconclusive”, never an automatic acquittal/conviction. Without quorum, report “no jury verdict.” The educational project may choose another burden of proof; approve it explicitly. |
| Arguments after voting opens | New student arguments blocked; pending teacher approvals may still publish. | Resolve pending review before voting and freeze the evidentiary record. Define exceptions and whether an amended record requires a new trial. Not enforced here to avoid breaking the existing moderation workflow. |
| Corrections and new rounds | Summaries immutable; earlier versions permitted reopening before publication. | Keep immutable results; create a new trial for a new round. Define any historical annotation/appeal mechanism separately instead of rewriting ballots or summaries. |

## Compatibility and owner decisions for this PR

- No student profile, assignment or ballot structure, administrator identity,
  privacy permission, or summary field changes. No migration or data rewrite.
- Intentional lifecycle restriction: once voting opens it cannot go back to
  arguments; once closed it cannot reopen, including older closed-but-unpublished
  trials. Create a new trial for a fresh round. Same-phase title edits still work.
- Existing zero summaries remain readable/title-editable and immutable. Only new
  empty summaries are rejected. Valid previously recorded ballots keep counting.
- Malformed/legacy imported ballots now block the supported publisher instead of
  being silently ignored. They require an owner-reviewed repair decision; the
  application does not rewrite/delete them or weaken ballot immutability.
- Missing/unknown legacy phase values may still be repaired by the administrator
  to a supported phase, preserving the earlier normalization behavior.
- Existing creation options remain; creating directly in `verdict` or `closed`
  does not provide historical proof of preparation or voting. No such proof is
  claimed without a separately approved lifecycle/audit schema.
- Owner review should explicitly accept permanent closure, rejection of new empty
  tallies, and the remaining administrator-trust limitation. The proposed roster,
  quorum, deadline, abstention, ruling, and backend/counter changes are deferred
  policy/design decisions and are not silently enabled by merging this PR.

## Tests and execution status

- **Executed here:** all 92 mocked regressions passed, including the original 70;
  JavaScript syntax, HTML ID, JSON and whitespace checks; registration of 125
  unique emulator test cases for inventory only.
- **Not executed here:** the 125 emulator cases (106 existing plus 19 new) and
  compilation of the modified rules. `npm run test:all` was attempted; the proxy
  still blocks the official Firestore emulator JAR on `storage.googleapis.com`
  with HTTP 403. No emulator database was started or seeded here.
- The owner reports the prior 70/106 baseline suites passed locally after PR #4.
  This does not verify the phase 5 rule changes or concurrency cases.
- New emulator cases cover permitted/denied phase transitions, preserved legacy
  data, empty totals, vote/closure ordering, simultaneous votes, two administrator
  transactions, title-conflict retries and ballots surviving later role changes.
  They exercise actual Firestore rules/SDK protocols; mocked regressions exercise
  the real administrator handler's validation, transaction calls and feedback.
- Real network acknowledgement loss, browser/device behavior and deployed-rule
  compatibility remain unverified. The acknowledgement-loss case is mocked.

Before accepting the changes, run on Windows PowerShell with Node 24.12+ and
Java 21+:

```powershell
npm.cmd ci
npm.cmd run test:all
```

See [FIRESTORE_SECURITY_TESTS.md](FIRESTORE_SECURITY_TESTS.md) for local-only
configuration and safety guards. Do not treat mock or syntax checks as emulator
verification. No merge or deployment is automatic.
