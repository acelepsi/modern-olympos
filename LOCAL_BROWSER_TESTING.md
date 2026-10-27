# Safe local browser testing on Windows

This setup uses **only synthetic data** in the separate project
`demo-modern-olympos-browser`. A Firebase account, Firebase login, service-account
file, real password, and Firebase Console changes are not needed. Do not deploy.
The setup does not import or export production data. Existing account permissions,
production Firebase configuration and `firestore.rules` remain unchanged.

## 1. Install the prerequisites once

1. Install **Node.js 24.12 or newer** from https://nodejs.org/ (the Windows installer).
2. Install a **Java 21 or newer JDK**, for example Eclipse Temurin 21 from
   https://adoptium.net/ (Windows x64 installer). Enable its PATH option.
3. Close and reopen PowerShell after installation.
4. Download or clone this repository and open its folder. Do not open HTML files
   directly and do not use a generic “Live Server” extension for this test.

In PowerShell, change to your actual project folder. For example:

```powershell
cd "$HOME\Downloads\modern-olympos-main"
node --version
java -version
npm.cmd ci
```

`node --version` must show at least `v24.12.0`; Java must report 21 or newer.
`npm.cmd` avoids the Windows PowerShell script execution-policy problem; do not
change your Windows execution policy. Installation and the first emulator startup
need internet access to download packages and the official emulator binary.
Browser Firebase modules still load from Google's public `www.gstatic.com` CDN;
this setup isolates Firebase **services and data**, and is not fully offline.

## 2. Start everything with one command

From the project folder in PowerShell:

```powershell
npm.cmd run local:browser
```

Keep this window open. Wait until it prints:

```text
LOCAL TEST ONLY: open http://127.0.0.1:4173
```

Open exactly **http://127.0.0.1:4173** in your browser. Every page must show the
**LOCAL TEST ONLY** banner. The start page lists accounts and links to the court
and administrator dashboard. No automatic browser opening or Firebase login is
performed. If startup fails, stop and resolve it; do not substitute a production
project ID or start a generic web server.

The command starts the pinned local Firebase CLI, Auth (127.0.0.1:9099), Firestore
(127.0.0.1:8080), hub (127.0.0.1:4400), logging (127.0.0.1:4500), provisions fixtures,
and starts the loopback-only web server (127.0.0.1:4173). Emulator UI is disabled.
The server starts only after both emulators and fixture provisioning succeed.

## 3. Use these synthetic accounts only

All five accounts use this public **local-only** password:

```text
Olympos-local-only-2026!
```

| Role | Where to sign in | Email or student code |
| --- | --- | --- |
| Administrator | `admin.html` | `admin@demo-modern-olympos.invalid` |
| Prosecutor | Court → Login | `PROSECUTOR` |
| Defender | Court → Login | `DEFENDER` |
| Juror | Court → Login | `JUROR` |
| Observer | Court → Login | `OBSERVER` |

The observer is an active synthetic student assigned `unassigned`; there is no
new production “observer” permission. You can also sign out for anonymous viewing.
Student codes map to `@students.demo-modern-olympos.invalid`, not production email
identifiers. Never enter a real password or copy real student information or
private evidence URLs into this environment. Decline browser password-manager
saving/autofill of real credentials.

Local Auth uses **memory-only persistence**: a reload or page navigation signs you
out. Use separate tabs for the administrator and each student role. Logging in or
out in one tab does not switch the account in another tab. Keep a tab open to test
session/context switching, and use that page's Sign out / Login controls.

## 4. Suggested manual checks

The active trial initially is `local-preparation`. In the administrator dashboard,
choose a trial using **Manage trial**, then click **Make selected trial active**
and confirm if you want students to see it. Selection alone does not activate it.

| Trial | Starting phase | What to test |
| --- | --- | --- |
| `local-preparation` | Trial | Published examples on both sides, a private prosecutor draft, and a pending defender argument. Submit/edit as the assigned student. Review, approve, or return as administrator. Check other roles cannot see private arguments. |
| `local-voting` | Verdict | Juror can vote once; other roles cannot vote or read private ballots. Observe pending/error feedback. Close only after testing votes. |
| `local-closed` | Closed | One synthetic valid ballot is ready for final tally publication. Check publication and public totals. |
| `local-empty` | Closed | No votes. Publication must fail clearly; zero totals must not be published. |
| `local-published` | Closed | An existing immutable tally and ballot. Check public display and repeated-publication feedback. |

To test the full lifecycle, use `local-preparation`: submit and review arguments,
save status **Verdict**, cast a juror ballot, save **Closed**, check the irreversible
OK/Cancel dialog (Cancel must not save), then publish the tally. Closed trials
cannot reopen; restart for a new round. Synthetic seeded historical examples are
fixtures, not claims about real turnout or quorum.

Also check rapid trial switching with browser network throttling; switching
accounts while requests are pending; and stopping the emulators to inspect error
feedback. Never make production network requests to simulate errors. Browser DevTools
Network should show Auth/Firestore traffic only at `127.0.0.1:9099` and `:8080`.
External static artwork/CDN downloads may still appear. Local test responses set a
Content Security Policy restricting fetch/XHR/WebSocket connections to the emulator
ports, blocking production Firebase calls even if the client is misconfigured.

## 5. Stop and reset

Press **Ctrl+C** in the PowerShell window and wait for emulator shutdown. Close the
test tabs. To reset, run again:

```powershell
npm.cmd run local:browser
```

No emulator import/export is configured. Each clean emulator restart gets new
synthetic accounts and fixtures. Do not run the seed script manually against an
already populated session. It does not clear data or silently reuse accounts;
duplicate-account provisioning fails and prevents the web server from starting.

## 6. Run automated tests (with the browser environment stopped)

```powershell
npm.cmd test
npm.cmd run test:local:auth
npm.cmd run test:security
npm.cmd run test:local:integration
```

Or run all suites sequentially:

```powershell
npm.cmd run test:all
```

`npm.cmd test` runs the existing regression suite plus isolation/configuration,
fixture and loopback web-server tests. The Auth-only command verifies all five
synthetic accounts with the real Auth emulator without requiring Firestore.
The security command uses
`demo-modern-olympos`; the local integration command uses the separate
`demo-modern-olympos-browser`, real emulator Auth sign-ins and the shared client
initializer. These commands use synthetic data only. They intentionally share fixed
loopback ports, so do not run them concurrently or while browser testing is active.

## Safeguards and troubleshooting

- Local mode is injected into every HTML response by the dedicated server. It does
  not depend on a query string, a browser preference, or carrying flags in links.
- Both application entry points share one initializer. On loopback without explicit
  local mode, or from `file:`, initialization fails **before Firebase starts**.
  Hosted production pages retain the existing configuration and session behavior.
- Local mode rejects hosted/non-HTTP origins, uses a fixed `demo-` project and dummy
  API key, wires both emulators before listeners/requests, and never falls back to
  production when an emulator is absent. Auth tokens are not persisted locally.
- All services bind to loopback; the server validates Host headers, serves only
  allowlisted public files, and does not expose repository files or credentials.
- The seed process verifies emulator environment variables and refuses remote hosts.
  It substitutes the synthetic administrator UID **in emulator memory only** using
  the same checked-in rules template. It never rewrites production rules. This is
  necessary because Auth creates a fresh synthetic UID each restart.
- Startup rejects `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_TOKEN`, inherited
  `FIREBASE_CONFIG`, conflicting project IDs and remote emulator addresses. Use a
  fresh PowerShell window without production configuration; do not paste any
  credential values into messages or delete credential files. The child accepts
  only the CLI-generated configuration for the exact demo project.
- “Port already in use”: stop the other local emulator/server with Ctrl+C. Never
  change a URL to a production Firebase endpoint to work around this error.
- Emulator download failure: check internet/firewall access to the official
  `storage.googleapis.com` download. Do not disable security software/TLS checks.
- Browser cannot load Firebase modules: the Google SDK CDN needs internet access.
  Refresh after restoring access; emulators cannot replace the SDK files.
- No banner or wrong URL: close the tab and use the printed `127.0.0.1:4173` link.
  This server must never be reverse-proxied or published as a public test site.

## Validation limits

Automated mocked tests cover configuration, wiring order, rejection paths, fixture
content, server responses and network-policy headers. Emulator integration tests
add real SDK Auth/Firestore checks. They do not replace browser testing of dialogs,
layout, navigation, password managers, or actual browser enforcement of CSP.
Check the PR validation results for which emulator tests could run in its environment.
The installed Node test SDK version and the browser CDN SDK version differ; manual
browser checks remain necessary. No production Firebase verification is performed.
