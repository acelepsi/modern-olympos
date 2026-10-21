// Dependency-free tests of the actual browser scripts with Firebase/DOM mocks.
// Run: node --test tests/regressions.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function element(textContent = '') {
  const classes = new Set();
  return {
    hidden: false, value: '', textContent, dataset: {}, attributes: {}, handlers: {},
    classList: { toggle(k, on) { on ? classes.add(k) : classes.delete(k); }, remove(k) { classes.delete(k); }, contains(k) { return classes.has(k); } },
    setAttribute(k, v) { this.attributes[k] = v; },
    addEventListener(k, fn) { this.handlers[k] = fn; },
    replaceChildren() {}, append() {}, querySelector() { return element(); },
    querySelectorAll() { return []; }, focus() {}, reset() {},
  };
}
function harness(file) {
  const nodes = new Map();
  const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const choices = [element('Guilty'), element('Not Guilty')];
  choices.forEach((b, i) => b.dataset.choice = i ? 'not-guilty' : 'guilty');
  const authCallbacks = [];
  const c = {
    document: { getElementById: get, querySelectorAll: () => choices, addEventListener() {}, createElement: () => element() },
    initializeApp: () => ({}), getAuth: () => ({ currentUser: { uid: 'juror-1' } }), getFirestore: () => ({}),
    onAuthStateChanged: (_, fn) => authCallbacks.push(fn), onSnapshot: () => () => {},
    doc: (...args) => args.slice(1), collection: () => ({}), query: () => ({}), where: () => ({}),
    getDoc: async () => ({ exists: () => false }), getDocs: async () => ({ docs: [] }),
    setDoc: async () => {}, updateDoc: async () => {}, addDoc: async () => {}, serverTimestamp: () => 'server-time',
    signOut: async () => {}, signInWithEmailAndPassword: async () => {},
    confirm: () => true, alert: message => { throw Error(message); },
    setTimeout() {}, queueMicrotask() {}, console,
  };
  vm.createContext(c);
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];/gm, '');
  vm.runInContext(source, c, { filename: file });
  return { c, get, choices, authCallbacks, run: code => vm.runInContext(code, c) };
}
function jury() {
  const h = harness('app.js');
  h.run("activeTrialId='case-a'; currentTrial.status='verdict'; currentAssignment={role:'juror'}; lastKnownSession={role:'juror'};");
  return h;
}
const submit = h => h.get('jury-vote-form').handlers.submit({ preventDefault() {} });
function select(h, index = 0) {
  h.choices[index].handlers.click();
  h.get('vote-justification').value = 'A sufficiently detailed reason.';
}
test('signed-out administrator sees login and no dashboard/account switch', async () => {
  const h = harness('admin.js'); await h.authCallbacks[0](null);
  assert.equal(h.get('login-panel').hidden, false);
  assert.equal(h.get('dashboard').hidden, true);
  assert.equal(h.get('switch-account').hidden, true);
});
test('unauthorized user can sign out and return to login', async () => {
  const h = harness('admin.js'); let signedOut = false;
  h.c.signOut = async () => { signedOut = true; await h.authCallbacks[0](null); };
  await h.authCallbacks[0]({ uid: 'student' });
  assert.equal(h.get('dashboard').hidden, true);
  assert.equal(h.get('switch-account').hidden, false);
  assert.match(h.get('status').textContent, /not authorized/);
  await h.get('switch-account').handlers.click();
  assert.equal(signedOut, true); assert.equal(h.get('login-panel').hidden, false);
});
test('permission failure preserves account-switch control; logout errors are visible', async () => {
  const h = harness('admin.js');
  h.c.getDoc = async () => { throw { code: 'permission-denied' }; };
  await h.authCallbacks[0]({ uid: 'teacher' });
  assert.equal(h.get('switch-account').hidden, false);
  h.c.signOut = async () => { throw { code: 'network-error' }; };
  await h.get('switch-account').handlers.click();
  assert.match(h.get('status').textContent, /Sign-out failed: network-error/);
});
test('authorized administrator sees dashboard and existing logout', async () => {
  const h = harness('admin.js');
  h.c.getDoc = async () => ({ exists: () => true, data: () => ({ active: true, accountType: 'teacher' }) });
  await h.authCallbacks[0]({ uid: 'admin' });
  assert.equal(h.get('dashboard').hidden, false);
  assert.equal(h.get('login-panel').hidden, true);
  assert.equal(h.get('switch-account').hidden, true);
  assert.equal(typeof h.get('logout').handlers.click, 'function');
});
test('failed lookup never confirms a vote; explicit retry recovers', async () => {
  const h = jury(); h.c.getDoc = async () => { throw { code: 'unavailable' }; };
  await h.run('refreshMyVote()');
  assert.match(h.get('jury-vote-status').textContent, /Cannot verify ballot: unavailable/);
  assert.doesNotMatch(h.get('jury-vote-status').textContent, /recorded/);
  assert.equal(h.get('jury-vote-form').hidden, true);
  assert.equal(h.get('retry-ballot').hidden, false);
  select(h); let writes = 0; h.c.setDoc = async () => { writes++; };
  await submit(h); assert.equal(writes, 0);
  h.c.getDoc = async () => ({ exists: () => false });
  await h.get('retry-ballot').handlers.click();
  assert.equal(h.get('jury-vote-form').hidden, false);
  assert.equal(h.get('retry-ballot').hidden, true);
  assert.equal(h.get('jury-vote-status').textContent, '');
});
test('existing ballot is confirmed and cannot be submitted again', async () => {
  const h = jury(); h.c.getDoc = async () => ({ exists: () => true });
  await h.run('refreshMyVote()');
  assert.match(h.get('jury-vote-status').textContent, /recorded/);
  select(h); let writes = 0; h.c.setDoc = async () => { writes++; };
  await submit(h); assert.equal(writes, 0);
});
test('failed submission retains error and selection; successful retry clears both', async () => {
  const h = jury(); select(h, 1);
  h.c.setDoc = async () => { throw { code: 'permission-denied' }; };
  await submit(h);
  assert.match(h.get('jury-vote-status').textContent, /Vote failed: permission-denied/);
  assert.doesNotMatch(h.get('jury-vote-status').textContent, /recorded/);
  assert.equal(h.get('jury-vote-form').hidden, false);
  assert.equal(h.choices[1].attributes['aria-pressed'], 'true');
  let written; h.c.setDoc = async (ref, data) => { written = { ref, data }; };
  await submit(h);
  assert.deepEqual(Array.from(written.ref), ['trials', 'case-a', 'votes', 'juror-1']);
  assert.equal(written.data.choice, 'not-guilty');
  assert.equal(written.data.castAt, 'server-time');
  assert.match(h.get('jury-vote-status').textContent, /recorded/);
  assert.equal(h.get('jury-vote-form').hidden, true);
  for (const b of h.choices) assert.equal(b.attributes['aria-pressed'], 'false');
});
test('pending submission is gated and never shows premature success', async () => {
  const h = jury(); select(h);
  let finish; h.c.setDoc = () => new Promise(resolve => finish = resolve);
  const pending = submit(h);
  assert.equal(h.get('jury-vote-form').hidden, true);
  assert.doesNotMatch(h.get('jury-vote-status').textContent, /recorded/);
  finish(); await pending;
  assert.match(h.get('jury-vote-status').textContent, /recorded/);
});
test('verdict choices expose exclusive visual and announced selection', () => {
  const h = jury();
  for (const i of [0, 1]) {
    h.choices[i].handlers.click();
    h.choices.forEach((b, j) => {
      assert.equal(b.classList.contains('selected'), i === j);
      assert.equal(b.attributes['aria-pressed'], String(i === j));
    });
    assert.equal(h.get('jury-selection-status').textContent, `Selected verdict: ${h.choices[i].textContent}.`);
  }
  const html = fs.readFileSync(path.join(root, 'court.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  for (const choice of ['guilty', 'not-guilty']) {
    assert.ok(html.includes(`data-choice="${choice}" aria-pressed="false"`));
    assert.ok(css.includes(`button[data-choice="${choice}"].selected`));
  }
  assert.match(html, /id="jury-selection-status" role="status" aria-live="polite"/);
  assert.match(css, /button\.selected\s*\{[^}]*outline:/);
});
