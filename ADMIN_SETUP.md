# Current teacher setup

Use [CLASSROOM_PILOT.md](CLASSROOM_PILOT.md) for the current Windows launch checklist,
teacher bootstrap, student accounts, role assignment, moderation, voting and archive.
Use [LOCAL_BROWSER_TESTING.md](LOCAL_BROWSER_TESTING.md) for isolated synthetic testing.

Older version-specific setup documents are historical. Do not use Live Server with
production Firebase or deploy the unprepared rules template. Local testing must use
`npm.cmd run local:browser`. Deployment files are prepared explicitly using
`npm.cmd run prepare:launch -- --admin-uid YOUR_TEACHER_UID`; nothing auto-deploys.
