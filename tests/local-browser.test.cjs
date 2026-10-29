const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { once } = require('node:events');
const { PROJECT, ACCOUNTS, assertLocalEnvironment } = require('../scripts/local-settings.cjs');
const { seedLocal } = require('../scripts/seed-local.cjs');
const { createLocalServer, CSP } = require('../scripts/local-server.cjs');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'firebase-client.js'), 'utf8').replace('export function', 'function');
function client(hostname = '127.0.0.1', local = true, protocol = 'http:', fail) {
  const calls = []; const auth = {}, db = {}, persistence = {};
  const sdk = Object.fromEntries(['initializeApp', 'getAuth', 'initializeAuth', 'connectAuthEmulator', 'getFirestore', 'connectFirestoreEmulator'].map(name => [name, (...args) => {
    calls.push([name, ...args]); if (name === fail) throw Error('Synthetic connection failure');
    return name.includes('Auth') ? auth : name === 'getFirestore' ? db : { options: args[0] };
  }]));
  sdk.inMemoryPersistence = persistence;
  const context = { location: { hostname, protocol }, __OLYMPOS_LOCAL_TEST__: local, sdk };
  vm.createContext(context); vm.runInContext(source, context);
  return { calls, persistence, run: (options={}) => { context.options=options;return vm.runInContext('initializeFirebaseClient(sdk,options)', context); } };
}
test('local initializer selects demo identifiers and wires both emulators before returning', () => {
  const h = client(); const result = h.run();
  assert.deepEqual(h.calls.map(c => c[0]), ['initializeApp', 'initializeAuth', 'connectAuthEmulator', 'getFirestore', 'connectFirestoreEmulator']);
  const config = h.calls[0][1]; assert.equal(config.projectId, PROJECT);
  assert.equal(config.apiKey, 'demo-only-not-a-real-api-key'); assert.doesNotMatch(JSON.stringify(config), /modern-olympia/);
  assert.equal(h.calls[1][2].persistence, h.persistence);
  assert.equal(h.calls[2][2], 'http://127.0.0.1:9099');
  assert.equal(h.calls[4][2], '127.0.0.1'); assert.equal(h.calls[4][3], 8080);
  assert.equal(result.accountDomain, 'students.demo-modern-olympos.invalid');
});
for (const host of ['127.0.0.1', 'localhost', '[::1]']) test(`unmarked local page ${host} fails before Firebase initialization`, () => {
  const h = client(host, false); assert.throws(h.run, /Firebase blocked/); assert.equal(h.calls.length, 0);
});
for (const [host, protocol] of [['example.org', 'https:'], ['127.0.0.1', 'https:'], ['', 'file:']]) test(`local flag rejects unsupported origin ${host} ${protocol}`, () => {
  const h = client(host, true, protocol); assert.throws(h.run, /HTTP loopback/); assert.equal(h.calls.length, 0);
});
test('file pages without local flag also fail closed', () => {
  const h = client('', false, 'file:'); assert.throws(h.run, /Firebase blocked/); assert.equal(h.calls.length, 0);
});
test('hosted production initialization retains all existing identifiers and persistence behavior', () => {
  const h = client('acelepsi.github.io', false, 'https:'); const result = h.run();
  assert.deepEqual(h.calls.map(c => c[0]), ['initializeApp', 'getAuth', 'getFirestore']);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0][1])), {
    apiKey: 'AIzaSyDQnvkuRP09s7ws-vZ9JC9Z8pJCkt5FYXI', authDomain: 'modern-olympia.firebaseapp.com',
    projectId: 'modern-olympia', storageBucket: 'modern-olympia.firebasestorage.app',
    messagingSenderId: '69798855365', appId: '1:69798855365:web:9a5339ccbf5bd2cc5026ac'
  });
  assert.equal(result.accountDomain, 'students.modern-olympia.firebaseapp.com');
});
for (const fail of ['connectAuthEmulator', 'connectFirestoreEmulator']) test(`${fail} failure aborts without production fallback`, () => {
  const h = client('127.0.0.1', true, 'http:', fail);
  assert.throws(h.run, /Synthetic/); assert.equal(h.calls.filter(c => c[0] === 'initializeApp').length, 1);
  assert.equal(h.calls[0][1].projectId, PROJECT); assert.ok(!h.calls.some(c => c[0] === 'getAuth'));
});
for (const file of ['app.js', 'admin.js', 'international-client.js']) test(`${file} uses the sole shared initialization path`, () => {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(content, /import \{\s*initializeFirebaseClient\s*\} from ['"]\.\/firebase-client.js/);
  assert.equal((content.match(/initializeFirebaseClient\(/g) || []).length, file==='admin.js'?2:1);
  assert.doesNotMatch(content, /initializeApp\(/); assert.doesNotMatch(content, /modern-olympia\.firebaseapp\.com/);
  assert.match(content, /initializeFirebaseClient\([\s\S]*?connectAuthEmulator[\s\S]*?connectFirestoreEmulator/);
});
for (const env of [
  { GOOGLE_APPLICATION_CREDENTIALS: 'private.json' }, { FIREBASE_TOKEN: 'real-token' }, { FIREBASE_CONFIG: '{"projectId":"real-project"}' },
  { GCLOUD_PROJECT: 'real-project' }, { GOOGLE_CLOUD_PROJECT: 'real-project' },
  { FIRESTORE_EMULATOR_HOST: 'remote.example:8080' }, { FIREBASE_AUTH_EMULATOR_HOST: 'remote.example:9099' }, { FIREBASE_EMULATOR_HUB: 'remote.example:4400' }
]) test(`startup refuses unsafe environment ${Object.keys(env)[0]}`, () => assert.throws(() => assertLocalEnvironment(env)));
test('only the emulator child may accept a CLI-generated demo configuration', () => {
  const env = { FIREBASE_CONFIG: JSON.stringify({ projectId: PROJECT }) };
  assert.throws(() => assertLocalEnvironment(env)); assert.doesNotThrow(() => assertLocalEnvironment(env, true));
});
test('browser emulator configuration binds every service to loopback and loads unchanged rules', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.browser.json'), 'utf8'));
  assert.equal(config.firestore.rules, 'firestore.rules'); assert.equal(config.emulators.singleProjectMode, true);
  for (const service of ['auth', 'firestore', 'hub', 'logging']) assert.equal(config.emulators[service].host, '127.0.0.1');
  assert.equal(config.emulators.auth.port, 9099); assert.equal(config.emulators.firestore.port, 8080);
});
const emulatorEnv = { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_EMULATOR_HUB: '127.0.0.1:4400' };
test('fixture provisioning refuses missing emulators without making any requests', async () => {
  let requests = 0; await assert.rejects(seedLocal({}, { fetch: () => { requests++; } }), /both local emulators/); assert.equal(requests, 0);
});
test('fixture provisioning creates synthetic accounts, scoped rules and all workflow cases', async () => {
  const writes = new Map(); let loaded, cleaned = false, committed = false, requests = 0;
  const original = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  const accounts = await seedLocal(emulatorEnv, {
    fetch: async (url, options) => {
      assert.ok(url.startsWith('http://127.0.0.1:9099/')); const body = JSON.parse(options.body);
      assert.ok(ACCOUNTS.some(a => a.email === body.email && a.password === body.password));
      return { ok: true, json: async () => ({ localId: `synthetic-${requests++}` }) };
    },
    initializeTestEnvironment: async options => { loaded = options; return {
      withSecurityRulesDisabled: async callback => callback({ firestore: () => ({}) }), cleanup: async () => { cleaned = true; }
    }; },
    firestore: { doc: (_, key) => key, Timestamp: { fromMillis: value => value }, writeBatch: () => ({ set: (key, value) => writes.set(key, value), commit: async () => { committed = true; } }) }
  });
  assert.equal(requests, 5); assert.equal(loaded.projectId, PROJECT); assert.equal(loaded.firestore.host, '127.0.0.1');
  assert.equal(loaded.firestore.rules, original.replace('REPLACE_WITH_ADMIN_UID', 'synthetic-0'));
  assert.equal(fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8'), original);
  assert.ok(cleaned && committed); assert.equal(accounts[0].role, 'admin');
  assert.equal(writes.get('students/synthetic-0').accountType, 'teacher');
  assert.equal(writes.get('trials/local-preparation').status, 'trial'); assert.equal(writes.get('trials/local-voting').status, 'verdict');
  assert.equal(writes.get('trials/local-preparation/assignments/synthetic-4').role, 'unassigned');
  assert.equal(writes.get('trials/local-preparation/submissions/private-prosecutor').status, 'draft');
  assert.equal(writes.get('trials/local-preparation/submissions/private-defender').status, 'pending');
  assert.equal(writes.get('trials/local-published').verdictSummary.guilty, 1);
  assert.ok(![...writes.keys()].some(key => key.startsWith('trials/local-empty/votes/')));
  assert.equal(writes.get('settings/currentTrial').trialId, 'local-preparation');
});
test('failed synthetic signup stops before Firestore initialization', async () => {
  let initialized = false;
  await assert.rejects(seedLocal(emulatorEnv, { fetch: async () => ({ ok: false, json: async () => ({ error: {} }) }), initializeTestEnvironment: () => { initialized = true; } }), /creation failed/);
  assert.equal(initialized, false);
});
function request(port, pathname, host = '127.0.0.1:4173', method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method, headers: { Host: host } }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', text => { body += text; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }); req.on('error', reject); req.end();
  });
}
test('local server preserves local mode on navigation, restricts Firebase network destinations and hides repository internals', async () => {
  const server = createLocalServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const port = server.address().port;
    for (const file of ['/', '/index.html', '/court.html', '/admin.html', '/archive.html', '/who-is-who.html']) {
      const response = await request(port, file); assert.equal(response.status, 200);
      assert.match(response.body, /__OLYMPOS_LOCAL_TEST__=true/); assert.match(response.body, /LOCAL TEST ONLY/);
      assert.equal(response.headers['content-security-policy'], CSP); assert.equal(response.headers['cache-control'], 'no-store');
      assert.ok(response.body.indexOf('__OLYMPOS_LOCAL_TEST__') < response.body.indexOf('<body'));
    }
    assert.doesNotMatch(CSP.split(';')[0], /https:|\*/);
    for (const file of ['/node_modules/firebase/package.json', '/.git/config', '/firestore.rules', '/package.json', '/../package.json', '/scripts/seed-local.cjs']) assert.equal((await request(port, file)).status, 404);
    assert.equal((await request(port, '/admin.html', 'attacker.example')).status, 403);
    assert.equal((await request(port, '/admin.html', undefined, 'POST')).status, 405);
    const module = await request(port, '/firebase-client.js'); assert.equal(module.status, 200); assert.match(module.headers['content-type'], /javascript/);
    const head = await request(port, '/', undefined, 'HEAD'); assert.equal(head.status, 200); assert.equal(head.body, '');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('secondary provisioning uses memory-only Auth even on hosted production pages',()=>{
 const h=client('acelepsi.github.io',false,'https:');h.run({name:'secondary',isolatedAuth:true});
 assert.equal(h.calls[0][2],'secondary');assert.equal(h.calls[1][0],'initializeAuth');assert.equal(h.calls[1][2].persistence,h.persistence);
 assert.ok(!h.calls.some(call=>call[0]==='getAuth'));
});

for(const filename of ['olympos-emblem.svg','portrait-frame.svg','courtroom-architecture.svg'])test('local SVG artwork is served with correct MIME: '+filename,async()=>{
 const server=createLocalServer();server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const response=await request(server.address().port,'/'+filename);assert.equal(response.status,200);assert.match(response.headers['content-type'],/image\/svg\+xml/);assert.match(response.body,/<svg/)}finally{await new Promise(resolve=>server.close(resolve))}
});
