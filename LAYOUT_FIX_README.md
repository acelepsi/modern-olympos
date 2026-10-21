# Modern Olympos v5 — Layout repair

This is a visual-only correction of the uploaded v5.

- Removed malformed leftover HTML and obsolete Prometheus placeholder copy from court.html.
- Restored correct prosecution/defense column nesting.
- Enforced the HTML hidden attribute against CSS display rules, including composer and jury controls.
- Replaced broken empty portrait image with a neutral omega placeholder.
- Improved spacing and contrast of draft/submission buttons.

Firebase JavaScript, admin pages and Firestore rules are unchanged from the uploaded v5. If you previously replaced REPLACE_WITH_ADMIN_UID locally, retain your working deployed rules; the ZIP includes the original template.

Test using Live Server, hard refresh (Ctrl+F5), then verify student draft -> approval -> published post still works.
