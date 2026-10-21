// Dependency-free tests of the actual browser scripts with Firebase/DOM mocks.
// Run: node --test tests/regressions.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function element(textContent = '') {
  const classes = new Set(), fields = new Map();
  return {
    hidden: false, value: '', textContent, dataset: {}, attributes: {}, handlers: {}, children: [], style: {},
    classList: { toggle(k, on) { on ? classes.add(k) : classes.delete(k); }, remove(k) { classes.delete(k); }, contains(k) { return classes.has(k); } },
    setAttribute(k, v) { this.attributes[k] = v; },
    addEventListener(k, fn) { this.handlers[k] = fn; },
    replaceChildren() { this.children = []; this.textContent = ''; },
    append(...children) { this.children.push(...children); },
    querySelector(selector) { if (!fields.has(selector)) fields.set(selector, element()); return fields.get(selector); },
    querySelectorAll() { return []; }, focus() {}, scrollIntoView() {},
    reset() { for (const field of fields.values()) field.value = ''; },
  };
}
function harness(file) {
  const nodes = new Map();
  const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const choices = [element('Guilty'), element('Not Guilty')];
  choices.forEach((b, i) => b.dataset.choice = i ? 'not-guilty' : 'guilty');
  const authCallbacks = [], snapshots = [];
  const auth = { currentUser: { uid: 'juror-1' } };
  const c = {
    document: { getElementById: get, querySelectorAll: () => choices, addEventListener() {}, createElement: () => element() },
    initializeApp: () => ({}), getAuth: () => auth, getFirestore: () => ({}),
    onAuthStateChanged: (_, fn) => authCallbacks.push(user => { auth.currentUser = user; return fn(user); }),
    onSnapshot: (ref, next, error) => { const sub = { ref, next, error }; snapshots.push(sub); return () => { sub.stopped = true; }; },
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
  return { c, get, choices, authCallbacks, snapshots, run: code => vm.runInContext(code, c) };
}
function jury() {
  const h = harness('app.js');
  h.authCallbacks[0]({ uid: 'juror-1' });
  h.run("activeTrialId='case-a'; checkingVote=false; currentTrial.status='verdict'; currentAssignment={role:'juror'}; lastKnownSession={role:'juror'};");
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

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const snapshot = data => ({ exists: () => data !== null, data: () => data });
const tick = () => Promise.resolve();
async function emitAuth(h, user) {
  for (const callback of h.authCallbacks) await callback(user);
}
function activate(h, trialId) {
  const pointer = h.snapshots.find(s => JSON.stringify(s.ref) === JSON.stringify(['settings', 'currentTrial']));
  pointer.next(snapshot({ trialId }));
}
function dirty(h) {
  for (const side of ['prosecution', 'defense']) {
    const form = h.get(side + '-composer');
    form.querySelector('textarea').value = 'Private argument';
    form.querySelector('input[type=url]').value = 'https://example.org/private';
    form.dataset.editId = 'old-draft';
    h.get(side + '-feedback').textContent = 'Private feedback';
  }
  select(h);
  h.get('jury-vote-status').textContent = 'Old ballot status';
}
function assertClean(h) {
  for (const side of ['prosecution', 'defense']) {
    const form = h.get(side + '-composer');
    assert.equal(form.querySelector('textarea').value, '');
    assert.equal(form.querySelector('input[type=url]').value, '');
    assert.equal(form.dataset.editId, undefined);
    assert.equal(h.get(side + '-feedback').textContent, '');
  }
  assert.equal(h.get('vote-justification').value, '');
  assert.equal(h.run('selectedChoice'), null);
  for (const b of h.choices) {
    assert.equal(b.attributes['aria-pressed'], 'false');
    assert.equal(b.classList.contains('selected'), false);
  }
}
for (const stage of ['profile', 'collections']) {
  for (const ending of ['resolve', 'reject']) {
    test(`administrator ${stage} ${ending} after sign-out cannot revive dashboard`, async () => {
      const h = harness('admin.js'), wait = deferred();
      h.c.getDoc = stage === 'profile' ? () => wait.promise : async () => snapshot({ active: true, accountType: 'teacher' });
      h.c.getDocs = () => wait.promise;
      const pending = h.authCallbacks[0]({ uid: 'admin' });
      await tick(); await tick(); await tick(); await h.authCallbacks[0](null);
      if (ending === 'reject') wait.reject({ code: 'unavailable' });
      else wait.resolve(stage === 'profile' ? snapshot({ active: true, accountType: 'teacher' }) : { docs: [] });
      await pending;
      assert.equal(h.get('dashboard').hidden, true);
      assert.equal(h.get('login-panel').hidden, false);
      assert.equal(h.get('status').textContent, '');
      assert.equal(h.run('students.length'), 0);
    });
  }
}
test('administrator load cannot overwrite a newer unauthorized account', async () => {
  const h = harness('admin.js'), wait = deferred();
  h.c.getDoc = async () => snapshot({ active: true, accountType: 'teacher' });
  h.c.getDocs = () => wait.promise;
  const old = h.authCallbacks[0]({ uid: 'admin' }); await tick();
  h.c.getDoc = async () => snapshot({ active: true, accountType: 'student' });
  await h.authCallbacks[0]({ uid: 'student' });
  const message = h.get('status').textContent;
  wait.resolve({ docs: [] }); await old;
  assert.equal(h.get('dashboard').hidden, true);
  assert.equal(h.get('switch-account').hidden, false);
  assert.equal(h.get('status').textContent, message);
});
for (const user of [null, { uid: 'another-student' }]) {
  test(`private forms clear on ${user ? 'account switch' : 'sign-out'}`, async () => {
    const h = jury(); dirty(h); await emitAuth(h, user); assertClean(h);
    assert.doesNotMatch(h.get('jury-vote-status').textContent, /Old ballot/);
  });
}
test('private forms clear when trial changes, including returning to the same trial', () => {
  const h = jury(); dirty(h); activate(h, 'case-b'); assertClean(h);
  dirty(h); activate(h, 'case-a'); assertClean(h);
});
for (const operation of ['read', 'write']) {
  for (const ending of ['resolve', 'reject']) {
    for (const change of ['trial', 'account', 'sign-out', 'round-trip']) {
      test(`ballot ${operation} ${ending} cannot affect UI after ${change}`, async () => {
        const h = jury(), wait = deferred();
        if (operation === 'read') h.c.getDoc = () => wait.promise;
        else { select(h); h.c.setDoc = () => wait.promise; }
        const pending = operation === 'read' ? h.run('refreshMyVote()') : submit(h);
        if (change === 'account') await emitAuth(h, { uid: 'new-juror' });
        else if (change === 'sign-out') await emitAuth(h, null);
        else { activate(h, 'case-b'); if (change === 'round-trip') activate(h, 'case-a'); }
        if (change === 'trial' || change === 'round-trip') {
          h.run("currentTrial.status='verdict'; currentAssignment={role:'juror'}; checkingVote=false; applySession({role:'juror'});");
        }
        const before = [h.get('jury-vote-status').textContent, h.get('jury-vote-form').hidden, h.get('retry-ballot').hidden];
        if (ending === 'resolve') wait.resolve(snapshot({ choice: 'guilty' }));
        else wait.reject({ code: 'unavailable' });
        await pending;
        assert.deepEqual([h.get('jury-vote-status').textContent, h.get('jury-vote-form').hidden, h.get('retry-ballot').hidden], before);
        assertClean(h);
      });
    }
  }
}
test('ballot refresh cannot unlock a pending write or start a second write', async () => {
  const h = jury(), wait = deferred(); select(h); let writes = 0;
  h.c.setDoc = () => { writes++; return wait.promise; };
  const pending = submit(h); await h.run('refreshMyVote()');
  assert.equal(h.get('jury-vote-form').hidden, true);
  await submit(h); assert.equal(writes, 1);
  wait.resolve(); await pending;
  assert.match(h.get('jury-vote-status').textContent, /recorded/);
});
test('late argument save cannot clear a new trial draft or show old feedback', async () => {
  const h = jury(), wait = deferred();
  h.run("currentTrial.status='trial'; currentProfile={active:true,accountType:'student',displayName:'Student'}; currentAssignment={role:'prosecutor'};");
  const form = h.get('prosecution-composer'); form.querySelector('textarea').value = 'Case A argument';
  let saved; h.c.addDoc = (ref, data) => { saved = data; return wait.promise; };
  const pending = form.handlers.submit({ preventDefault() {} });
  // The form event wrapper does not return the save promise; flush after resolution below.
  activate(h, 'case-b'); form.querySelector('textarea').value = 'Case B draft';
  wait.resolve(); await tick(); await tick(); await pending;
  assert.equal(saved.trialId, 'case-a');
  assert.equal(form.querySelector('textarea').value, 'Case B draft');
  assert.equal(h.get('prosecution-feedback').textContent, '');
});

test('same-trial notifications preserve unfinished work', () => {
  const h = jury(); dirty(h); activate(h, 'case-a');
  assert.equal(h.get('prosecution-composer').querySelector('textarea').value, 'Private argument');
  assert.equal(h.get('vote-justification').value, 'A sufficiently detailed reason.');
  assert.equal(h.choices[0].attributes['aria-pressed'], 'true');
});
test('old trial and assignment snapshots are ignored after switching away and back', () => {
  const h = jury(); activate(h, 'case-b');
  const oldTrial = h.snapshots.find(s => JSON.stringify(s.ref) === JSON.stringify(['trials', 'case-b']));
  const oldRole = h.snapshots.find(s => JSON.stringify(s.ref) === JSON.stringify(['trials', 'case-b', 'assignments', 'juror-1']));
  activate(h, 'case-a'); activate(h, 'case-b');
  const title = h.get('defendant-name').textContent;
  oldTrial.next(snapshot({ title: 'Stale title', status: 'verdict' }));
  oldRole.next(snapshot({ role: 'juror' }));
  assert.equal(h.get('defendant-name').textContent, title);
  assert.equal(h.run('currentAssignment'), null);
});
test('a new trial can vote while a previous trial write finishes', async () => {
  const h = jury(), wait = deferred(); select(h);
  const paths = [];
  h.c.setDoc = (ref) => { paths.push(Array.from(ref)); return wait.promise; };
  const old = submit(h); activate(h, 'case-b');
  h.run("currentTrial.status='verdict'; currentAssignment={role:'juror'}; checkingVote=false; applySession({role:'juror'});");
  select(h, 1);
  h.c.setDoc = async ref => { paths.push(Array.from(ref)); };
  await submit(h);
  const message = h.get('jury-vote-status').textContent;
  wait.reject({ code: 'unavailable' }); await old;
  assert.match(message, /recorded/);
  assert.equal(h.get('jury-vote-status').textContent, message);
  assert.deepEqual(paths, [['trials', 'case-a', 'votes', 'juror-1'], ['trials', 'case-b', 'votes', 'juror-1']]);
});
for (const fn of ['renderStudents', 'loadReviewQueue', 'refreshVotes']) {
  test(`late ${fn} result does not repopulate signed-out administrator data`, async () => {
    const h = harness('admin.js'), wait = deferred();
    h.run("students=[{id:'student',displayName:'Private name'}];");
    h.get('dashboard').hidden = false; h.get('trial-select').value = 'case-a';
    h.c.getDocs = () => wait.promise;
    const pending = h.run(fn + '()'); await h.authCallbacks[0](null);
    wait.resolve({ size: 1, docs: [] }); await pending;
    assert.equal(h.get('dashboard').hidden, true);
    assert.equal(h.get('student-rows').children.length, 0);
    assert.equal(h.get('review-list').textContent, '');
    assert.equal(h.get('vote-count').textContent, '');
    assert.equal(h.run('students.length'), 0);
  });
}
