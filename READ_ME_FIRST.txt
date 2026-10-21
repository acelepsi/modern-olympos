Modern Olympos - Firebase configuration inserted into app.js.
IMPORTANT: Do NOT publish or deploy firestore.rules as-is. The current rules allow any authenticated anonymous user to read and claim access codes, and do not enforce one vote per juror. Keep Firestore in production/locked mode until rules and authentication flow are redesigned.
The existing argument submission, verdict submission, and live trial listeners remain TODO and are not functional.
Open the site through a local web server (not file://) for testing. No Firebase connectivity has been verified in this environment.
