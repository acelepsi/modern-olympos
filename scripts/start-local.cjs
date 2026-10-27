// Use the pinned CLI directly, avoiding platform-specific shell quoting and global installations.
const { spawn } = require('node:child_process');
const path = require('node:path');
const { PROJECT, assertLocalEnvironment } = require('./local-settings.cjs');
assertLocalEnvironment(process.env);
const root = path.join(__dirname, '..');
const child = spawn(process.execPath, [require.resolve('firebase-tools/lib/bin/firebase.js'),
  'emulators:exec', '--config', 'firebase.browser.json', '--project', PROJECT,
  '--only', 'auth,firestore', 'node scripts/local-browser.cjs'
], { cwd: root, stdio: 'inherit', env: { ...process.env, FIREBASE_CLI_DISABLE_TELEMETRY: '1' } });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
