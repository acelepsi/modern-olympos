// Real Auth emulator smoke test; deliberately needs no Firestore binary or data.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const appSdk = require('firebase/app');
const authSdk = require('firebase/auth');
const { PROJECT, ACCOUNTS, assertLocalEnvironment } = require('../scripts/local-settings.cjs');
assertLocalEnvironment(process.env, true);
if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' || process.env.GCLOUD_PROJECT !== PROJECT) throw Error('Use npm run test:local:auth with the demo Auth emulator.');
test('all five synthetic accounts sign in through the shared initializer with real emulator Auth', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'firebase-client.js'), 'utf8').replace('export function', 'function');
  for (const account of ACCOUNTS) {
    const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-only-not-a-real-api-key', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true })
    });
    assert.equal(response.ok, true); const created = await response.json();
    const context = { location: { hostname: '127.0.0.1', protocol: 'http:' }, __OLYMPOS_LOCAL_TEST__: true,
      sdk: { ...appSdk, ...authSdk, initializeApp: config => appSdk.initializeApp(config, account.role),
        getFirestore: () => ({}), connectFirestoreEmulator() {} } };
    vm.createContext(context); vm.runInContext(source, context);
    const client = vm.runInContext('initializeFirebaseClient(sdk)', context);
    try {
      const signedIn = await authSdk.signInWithEmailAndPassword(client.auth, account.email, account.password);
      assert.equal(signedIn.user.uid, created.localId);
      assert.equal((await signedIn.user.getIdTokenResult()).claims.aud, PROJECT);
      assert.equal(client.app.options.apiKey, 'demo-only-not-a-real-api-key');
      await authSdk.signOut(client.auth); assert.equal(client.auth.currentUser, null);
    } finally { await appSdk.deleteApp(client.app); }
  }
});
