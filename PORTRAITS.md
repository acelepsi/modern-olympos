# Optional character portraits

In the teacher dashboard, create/select a trial and enter a public **HTTPS** image
URL in **Character Portrait URL**, then save. Use an image you have permission to
publish; avoid private/signed links or personal photographs. No preview request is
made in the administrator page. URL validation happens before any save/image load.

The active court retains its 76 × 76 image area and uses `object-fit: cover`.
Completed Trials uses the same portrait in its list thumbnails and case heading.
Missing, invalid or failed images show Ω. Clear the field and save to restore Ω.
There is no Storage integration/upload, account migration or existing-data rewrite.

The optional trial field is `portraitUrl`. New/legacy trials without a URL omit it;
clearing an existing URL stores an empty string. To support this metadata, the rule
allowlist includes the optional field with an HTTPS/length check. The existing
administrator predicate, student permissions, moderation, voting, closure and
publication conditions are unchanged. Deploy matching prepared rules and UI only
when the owner chooses; nothing is deployed by this change. Continue to prepare
rules using `npm.cmd run prepare:launch -- --admin-uid "YOUR_TEACHER_UID"` (replace
that placeholder with the actual existing UID), as described in CLASSROOM_PILOT.md.

External image availability/hotlink restrictions vary by provider. Blocked images
fall back to Ω; no automatic proxy or external fetch is performed by the server.
The two decorative seal labels are removed; the desktop divider is narrower and
still hides when the court stacks its columns on mobile.
