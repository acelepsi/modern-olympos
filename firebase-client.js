// One initialization path for both browser clients. No network work precedes emulator wiring.
const productionConfig = Object.freeze({
  apiKey: 'AIzaSyDQnvkuRP09s7ws-vZ9JC9Z8pJCkt5FYXI',
  authDomain: 'modern-olympia.firebaseapp.com',
  projectId: 'modern-olympia',
  storageBucket: 'modern-olympia.firebasestorage.app',
  messagingSenderId: '69798855365',
  appId: '1:69798855365:web:9a5339ccbf5bd2cc5026ac'
});
const demoConfig = Object.freeze({
  apiKey: 'demo-only-not-a-real-api-key',
  authDomain: 'demo-modern-olympos-browser.invalid',
  projectId: 'demo-modern-olympos-browser',
  appId: 'demo-modern-olympos-browser'
});
export function initializeFirebaseClient(sdk) {
  const local = globalThis.__OLYMPOS_LOCAL_TEST__ === true;
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  // Local pages must opt in through the dedicated server. Flags cannot activate on a hosted site.
  if (local && (!loopback || location.protocol !== 'http:')) throw Error('Local test mode requires HTTP loopback.');
  if (!local && (loopback || location.protocol === 'file:')) throw Error('Firebase blocked: use npm run local:browser for local testing.');
  const app = sdk.initializeApp(local ? demoConfig : productionConfig);
  const auth = local ? sdk.initializeAuth(app, { persistence: sdk.inMemoryPersistence }) : sdk.getAuth(app);
  if (local) sdk.connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  const db = sdk.getFirestore(app);
  if (local) sdk.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { app, auth, db, accountDomain: local ? 'students.demo-modern-olympos.invalid' : 'students.modern-olympia.firebaseapp.com' };
}
