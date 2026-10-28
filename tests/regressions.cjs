// Dependency-free tests of the actual browser scripts with Firebase/DOM mocks.
// Run: node --test tests/regressions.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
class MockTimestamp { constructor(value) { this.value = value; } toMillis() { return this.value; } }
const voteRecord = (choice='guilty', extra={}) => ({ id: 'synthetic-juror', data: () => ({ choice, reason: 'A sufficiently detailed reason.', castAt: new MockTimestamp(1000), ...extra }) });
function element(textContent = '') {
  const classes = new Set(), fields = new Map();
  return {
    hidden: false, value: '', textContent, dataset: {}, attributes: {}, handlers: {}, children: [], style: {},
    classList: { toggle(k, on) { on ? classes.add(k) : classes.delete(k); }, remove(k) { classes.delete(k); }, contains(k) { return classes.has(k); } },
    setAttribute(k, v) { this.attributes[k] = v; },
    addEventListener(k, fn) { this.handlers[k] = fn; },
    replaceChildren(...items) { this.children = items; this.textContent = ''; },
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
    initializeFirebaseClient: () => ({ app: {}, auth, db: {}, accountDomain: 'students.modern-olympia.firebaseapp.com' }),
    deleteApp: async()=>{}, createUserWithEmailAndPassword: async()=>({user:{uid:"new-student"}}), deleteUser: async()=>{},
    initializeAuth() {}, inMemoryPersistence: {}, connectAuthEmulator() {}, connectFirestoreEmulator() {},
    initializeApp: () => ({}), getAuth: () => auth, getFirestore: () => ({}),
    onAuthStateChanged: (_, fn) => authCallbacks.push(user => { auth.currentUser = user; return fn(user); }),
    onSnapshot: (ref, next, error) => { const sub = { ref, next, error }; snapshots.push(sub); return () => { sub.stopped = true; }; },
    doc: (...args) => args.length===1?{id:"ABCDEFGHIJKLMNOPQRST"}:args.slice(1), collection: (...args) => args.slice(1), query: () => ({}), where: () => ({}),
    getDoc: async () => ({ exists: () => false }), getDocs: async () => ({ docs: [] }),
    getDocFromServer: async (...args) => ({ metadata: { fromCache: false, hasPendingWrites: false }, ...await c.getDoc(...args) }),
    getDocsFromServer: async (...args) => { const result = await c.getDocs(...args); return { metadata: { fromCache: false, hasPendingWrites: false }, size: result.docs.length, ...result }; },
    runTransaction: async (_, callback) => { const writes = []; const result = await callback({ get: (...args) => c.getDocFromServer(...args), update: (...args) => { writes.push(args); } }); for (const args of writes) await c.updateDoc(...args); return result; },
    Timestamp: MockTimestamp,
    setDoc: async () => {}, updateDoc: async () => {}, addDoc: async () => {}, serverTimestamp: () => 'server-time',
    signOut: async () => {}, signInWithEmailAndPassword: async () => {},
    confirm: () => true, alert: message => { throw Error(message); },
    setTimeout() {}, queueMicrotask() {}, console, URL,
  };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(root,'jury-reasoning.js'),'utf8').replace(/^export /gm,''),c);
  vm.runInContext(fs.readFileSync(path.join(root,'portraits.js'),'utf8').replace(/^export /gm,''),c);
  const accountModule=fs.readFileSync(path.join(root,'student-accounts.js'),'utf8').replace(/^export /gm,'');
  vm.runInContext(accountModule,c);
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
const snapshot = data => ({ exists: () => data !== null, data: () => data, metadata: { fromCache: false, hasPendingWrites: false } });
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
    const h = await adminTrials(), wait = deferred();
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

async function adminTrials() {
  const h = harness('admin.js');
  h.c.getDoc = async () => snapshot({ active: true, accountType: 'teacher' });
  h.c.getDocs = async ref => {
    if (ref[0] === 'students') return { docs: [{ id: 'student', data: () => ({ displayName: 'Student', accountType: 'student' }) }] };
    if (ref.length === 1 && ref[0] === 'trials') return { docs: ['case-a', 'case-b'].map(id => ({ id, data: () => ({ title: id, status: 'trial' }) })) };
    return { size: 0, docs: [] };
  };
  await h.authCallbacks[0]({ uid: 'admin' });
  return h;
}
function textTree(node) {
  return [node.textContent, ...node.children.map(textTree)].join(' ');
}
function panelResult(kind, label) {
  if (kind === 'roles') return { docs: [{ id: 'student', data: () => ({ role: label === 'new' ? 'juror' : 'defender' }) }] };
  if (kind === 'review') return { docs: [{ id: label, data: () => ({ status: 'pending', authorName: label, section: 'prosecution', text: label + ' argument' }) }] };
  return { size: label === 'new' ? 2 : 9, docs: [] };
}
const panelFns = { roles: 'renderStudents', review: 'loadReviewQueue', votes: 'refreshVotes' };
const panelIds = { roles: 'student-rows', review: 'review-list', votes: 'vote-count' };
for (const kind of Object.keys(panelFns)) {
  for (const ending of ['resolve', 'reject']) {
    test(`${kind}: old ${ending} after A-B-A selection cannot replace the newest panel`, async () => {
      const h = await adminTrials(), wait = deferred();
      h.c.getDocs = ref => ref.at(-1) === ({ roles: 'assignments', review: 'submissions', votes: 'votes' })[kind] ? wait.promise : Promise.resolve({ size: 0, docs: [] });
      const old = h.run(panelFns[kind] + '()');
      h.c.getDocs = async ref => panelResult(({ assignments: 'roles', submissions: 'review', votes: 'votes' })[ref.at(-1)], 'new');
      h.get('trial-select').value = 'case-b'; await h.get('trial-select').handlers.change();
      h.get('trial-select').value = 'case-a'; await h.get('trial-select').handlers.change();
      const before = textTree(h.get(panelIds[kind])), message = h.get('status').textContent;
      if (ending === 'reject') wait.reject({ code: 'unavailable' }); else wait.resolve(panelResult(kind, 'old'));
      await old;
      assert.equal(textTree(h.get(panelIds[kind])), before);
      assert.equal(h.get('status').textContent, message);
      if (kind === 'review') assert.match(before, /new argument/);
      if (kind === 'votes') assert.match(before, /2 ballot/);
      if (kind === 'roles') assert.equal(h.get('student-rows').children[0].children[1].children[0].value, 'juror');
    });
  }
}
test('authorization initializes all selected-trial panels explicitly without a timer', async () => {
  const h = await adminTrials();
  assert.equal(h.get('trial-select').value, 'case-a');
  assert.equal(h.get('student-rows').children.length, 1);
  assert.match(textTree(h.get('review-list')), /No pending/);
  assert.match(h.get('vote-count').textContent, /0 ballot.*case-a/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'admin.js'), 'utf8'), /setTimeout/);
});
test('selection immediately clears stale controls and announces loading', async () => {
  const h = await adminTrials(), wait = deferred();
  h.c.getDocs = () => wait.promise;
  h.get('trial-select').value = 'case-b'; const pending = h.get('trial-select').handlers.change();
  assert.equal(h.get('student-rows').children.length, 0);
  assert.match(h.get('roles-status').textContent, /Loading.*case-b/);
  assert.match(h.get('review-list').textContent, /Loading.*case-b/);
  assert.match(h.get('vote-count').textContent, /Loading.*case-b/);
  assert.equal(h.get('publish-verdict').disabled, true);
  wait.resolve({ docs: [], size: 0 }); await pending;
  assert.equal(h.get('publish-verdict').disabled, false);
});
test('detached role and moderation buttons never write after selection changes', async () => {
  const h = await adminTrials();
  h.c.getDocs = async ref => panelResult(({ assignments: 'roles', submissions: 'review', votes: 'votes' })[ref.at(-1)], 'new');
  await h.get('refresh-submissions').handlers.click();
  const role = h.get('student-rows').children[0].children[2].children[0];
  const approve = h.get('review-list').children.find(n => n.className === 'panel').children.find(n => n.textContent === 'Approve');
  let writes = 0; h.c.setDoc = h.c.updateDoc = async () => { writes++; };
  h.get('trial-select').value = 'case-b'; await h.get('trial-select').handlers.change();
  await role.handlers.click(); await approve.onclick();
  assert.equal(writes, 0);
});
for (const existing of [true, false]) {
  test(`${existing ? 'saving' : 'creating'} a trial refreshes roles, review and ballots`, async () => {
    const h = await adminTrials(), reads = [], writes = [];
    h.c.getDoc = async () => snapshot(existing ? { title: 'Before' } : null);
    h.c.getDocs = async ref => { reads.push(Array.from(ref)); return { size: 0, docs: [] }; };
    h.c.setDoc = h.c.updateDoc = async (ref, data) => { writes.push({ ref: Array.from(ref), data }); };
    const id = existing ? 'case-a' : 'case-c';
    h.get('trial-id').value = id; h.get('trial-title').value = 'Saved title'; h.get('trial-status').value = 'verdict';
    await h.get('trial-form').handlers.submit({ preventDefault() {} });
    assert.equal(h.get('trial-select').value, id);
    assert.equal(h.get('trial-title').value, 'Saved title');
    assert.deepEqual(reads.map(ref => ref.join('/')).sort(), ['assignments', 'submissions', 'votes'].map(c => `trials/${id}/${c}`).sort());
    assert.deepEqual(writes[0].ref, ['trials', id]);
  });
}

for (const kind of Object.keys(panelFns)) {
  test(`${kind}: newest refresh wins within a single trial`, async () => {
    const h = await adminTrials(), wait = deferred();
    h.c.getDocs = () => wait.promise; const old = h.run(panelFns[kind] + '()');
    h.c.getDocs = async () => panelResult(kind, 'new'); await h.run(panelFns[kind] + '()');
    const before = textTree(h.get(panelIds[kind]));
    wait.resolve(panelResult(kind, 'old')); await old;
    assert.equal(textTree(h.get(panelIds[kind])), before);
  });
}
for (const kind of ['role', 'moderation']) {
  for (const ending of ['resolve', 'reject']) {
    test(`${kind} write ${ending} after switching cannot alter the new panel or feedback`, async () => {
      const h = await adminTrials(), wait = deferred(), writes = [];
      h.c.getDocs = async ref => panelResult(({ assignments: 'roles', submissions: 'review', votes: 'votes' })[ref.at(-1)], 'new');
      await h.get('refresh-submissions').handlers.click();
      h.c.setDoc = h.c.updateDoc = (ref, data) => { writes.push({ ref: Array.from(ref), data }); return wait.promise; };
      const control = kind === 'role' ? h.get('student-rows').children[0].children[2].children[0] : h.get('review-list').children.find(n => n.className === 'panel').children.find(n => n.textContent === 'Approve');
      const pending = kind === 'role' ? control.handlers.click() : control.onclick();
      h.get('trial-select').value = 'case-b'; await h.get('trial-select').handlers.change();
      const before = [textTree(h.get('student-rows')), textTree(h.get('review-list')), h.get('vote-count').textContent, h.get('status').textContent];
      if (ending === 'reject') wait.reject({ code: 'unavailable' }); else wait.resolve();
      await pending;
      assert.deepEqual([textTree(h.get('student-rows')), textTree(h.get('review-list')), h.get('vote-count').textContent, h.get('status').textContent], before);
      assert.equal(writes.length, 1); assert.equal(writes[0].ref[1], 'case-a');
    });
  }
}
for (const stage of ['trial', 'ballots']) {
  test(`publication stops if selection changes during ${stage} lookup`, async () => {
    const h = await adminTrials(), wait = deferred(); let writes = 0, confirms = 0;
    h.c.getDoc = stage === 'trial' ? () => wait.promise : async () => snapshot({ status: 'closed' });
    const ordinaryReads = h.c.getDocs;
    h.c.getDocs = ref => stage === 'ballots' && ref.at(-1) === 'votes' && ref[1] === 'case-a' ? wait.promise : ordinaryReads(ref);
    h.c.updateDoc = async () => { writes++; }; h.c.confirm = () => { confirms++; return true; };
    const pending = h.get('publish-verdict').handlers.click(); await tick();
    h.get('trial-select').value = 'case-b'; await h.get('trial-select').handlers.change();
    wait.resolve(stage === 'trial' ? snapshot({ status: 'closed' }) : { size: 0, docs: [] }); await pending;
    assert.equal(writes, 0); assert.equal(confirms, 0);
    assert.equal(h.get('publish-verdict').disabled, false);
    assert.match(h.get('vote-count').textContent, /case-b/);
  });
}
test('empty trial list permits creation but disables trial-specific actions', async () => {
  const h = harness('admin.js');
  h.c.getDoc = async () => snapshot({ active: true, accountType: 'teacher' });
  h.c.getDocs = async () => ({ docs: [], size: 0 }); await h.authCallbacks[0]({ uid: 'admin' });
  assert.equal(h.get('dashboard').hidden, false);
  for (const id of ['activate-trial', 'publish-verdict', 'refresh-roles', 'refresh-submissions', 'refresh-votes']) assert.equal(h.get(id).disabled, true);
  h.c.getDoc = async () => snapshot(null);
  h.get('trial-id').value = 'first-case'; h.get('trial-title').value = 'First'; h.get('trial-status').value = 'trial';
  await h.get('trial-form').handlers.submit({ preventDefault() {} });
  assert.equal(h.get('trial-select').value, 'first-case');
  assert.match(h.get('vote-count').textContent, /first-case/);
});
for (const stage of ['lookup', 'write']) {
  test(`save completion does not steal a selection changed during ${stage}`, async () => {
    const h = await adminTrials(), wait = deferred(), writing = deferred(); let writes = 0;
    h.c.getDoc = stage === 'lookup' ? () => wait.promise : async () => snapshot({});
    h.c.updateDoc = () => { writes++; writing.resolve(); return stage === 'write' ? wait.promise : Promise.resolve(); };
    h.get('trial-title').value = 'New A';
    const pending = h.get('trial-form').handlers.submit({ preventDefault() {} });
    if (stage === 'write') await writing.promise;
    h.get('trial-select').value = 'case-b'; await h.get('trial-select').handlers.change();
    wait.resolve(stage === 'lookup' ? snapshot({}) : undefined); await pending;
    assert.equal(h.get('trial-select').value, 'case-b');
    assert.equal(h.get('trial-title').value, 'case-b');
    assert.match(h.get('vote-count').textContent, /case-b/);
    assert.equal(writes, stage === 'lookup' ? 0 : 1);
  });
}
test('failed panel load clears old data, disables publication and supports retry', async () => {
  const h = await adminTrials();
  h.c.getDocs = async () => { throw { code: 'unavailable' }; };
  h.get('trial-select').value = 'case-b'; await h.get('trial-select').handlers.change();
  assert.equal(h.get('student-rows').children.length, 0);
  for (const id of ['roles-status', 'review-list', 'vote-count']) assert.match(h.get(id).textContent, /Cannot.*case-b.*unavailable/);
  assert.equal(h.get('publish-verdict').disabled, true);
  assert.equal(h.get('refresh-votes').disabled, false);
  assert.equal(h.get('refresh-submissions').disabled, false);
  assert.equal(h.get('refresh-roles').disabled, false);
  h.c.getDocs = async () => ({ docs: [], size: 0 });
  await h.get('refresh-roles').handlers.click();
  assert.equal(h.get('student-rows').children.length, 1);
  await h.get('refresh-votes').handlers.click();
  assert.equal(h.get('publish-verdict').disabled, false);
  assert.match(h.get('vote-count').textContent, /0 ballot.*case-b/);
});
test('saving a trial clears dependent panels while their new reads are pending', async () => {
  const h = await adminTrials(), wait = deferred(), loading = deferred();
  h.c.getDoc = async () => snapshot({}); h.c.getDocs = () => { loading.resolve(); return wait.promise; };
  const pending = h.get('trial-form').handlers.submit({ preventDefault() {} });
  await loading.promise;
  assert.match(h.get('roles-status').textContent, /Loading.*case-a/);
  assert.match(h.get('review-list').textContent, /Loading.*case-a/);
  assert.equal(h.get('publish-verdict').disabled, true);
  wait.resolve({ docs: [], size: 0 }); await pending;
  assert.equal(h.get('publish-verdict').disabled, false);
});

test('newly rendered role and review buttons write only to the selected trial', async () => {
  const h = await adminTrials(), writes = [];
  h.c.getDocs = async ref => panelResult(({ assignments: 'roles', submissions: 'review', votes: 'votes' })[ref.at(-1)], 'new');
  h.get('trial-select').value = 'case-b'; await h.get('trial-select').handlers.change();
  h.c.setDoc = h.c.updateDoc = async (ref, data) => { writes.push({ ref: Array.from(ref), data }); };
  const row = h.get('student-rows').children[0];
  row.children[1].children[0].value = 'prosecutor'; await row.children[2].children[0].handlers.click();
  const card = h.get('review-list').children.find(n => n.className === 'panel');
  await card.children.find(n => n.textContent === 'Approve').onclick();
  assert.deepEqual(writes.map(w => w.ref), [['trials', 'case-b', 'assignments', 'student'], ['trials', 'case-b', 'submissions', 'new']]);
  assert.equal(writes[0].data.role, 'prosecutor'); assert.equal(writes[1].data.status, 'published');
});
test('verdict publication retains its existing count calculation and refreshes the current panel', async () => {
  const h = await adminTrials(), writes = [];
  h.c.getDoc = async () => snapshot({ status: 'closed' });
  h.c.getDocs = async () => ({ size: 2, docs: ['guilty', 'not-guilty'].map(choice => ({ data: () => voteRecord(choice).data() })) });
  h.c.updateDoc = async (ref, data) => { writes.push({ ref: Array.from(ref), data: JSON.parse(JSON.stringify(data)) }); };
  await h.get('publish-verdict').handlers.click();
  assert.deepEqual(writes, [{ ref: ['trials', 'case-a'], data: { verdictSummary: { guilty: 1, notGuilty: 1 } } }]);
  assert.match(h.get('vote-count').textContent, /2 ballot.*case-a/);
  assert.equal(h.get('publish-verdict').disabled, false);
});
test('old controls cannot write even before a changed dropdown dispatches its event', async () => {
  const h = await adminTrials();
  const role = h.get('student-rows').children[0].children[2].children[0];
  let writes = 0; h.c.setDoc = async () => { writes++; };
  h.get('trial-select').value = 'case-b'; await role.handlers.click();
  assert.equal(writes, 0);
});
test('initial panels wait for authorization and collection loading, not elapsed time', async () => {
  const h = harness('admin.js'), profile = deferred(), collections = deferred(), collectionStarted = deferred(), reads = [];
  h.c.getDoc = () => profile.promise;
  h.c.getDocs = ref => { reads.push(Array.from(ref)); collectionStarted.resolve(); return collections.promise; };
  const pending = h.authCallbacks[0]({ uid: 'admin' });
  assert.equal(h.get('dashboard').hidden, true); assert.equal(reads.length, 0);
  profile.resolve(snapshot({ active: true, accountType: 'teacher' })); await collectionStarted.promise;
  assert.equal(h.get('dashboard').hidden, true);
  h.c.getDocs = async ref => { reads.push(Array.from(ref)); return { docs: [], size: 0 }; };
  collections.resolve({ docs: [{ id: 'case-a', data: () => ({ title: 'Case A', status: 'trial' }) }] });
  await pending;
  assert.equal(h.get('dashboard').hidden, false);
  for (const name of ['assignments', 'submissions', 'votes']) assert.ok(reads.some(ref => ref.join('/') === `trials/case-a/${name}`));
});

async function publicationHarness() {
  const h = await adminTrials();
  h.c.getDoc = async () => snapshot({ status: 'closed' });
  h.c.getDocs = async () => ({ size: 1, docs: [voteRecord()] });
  return h;
}
for (const invalid of [[], [voteRecord('unknown')], [voteRecord('guilty', { reason: 'short' })], [voteRecord('guilty', { castAt: null })], [voteRecord('guilty', { extra: true })]]) {
  test(`publication rejects empty or malformed ballot collections: ${invalid.length ? Object.keys(invalid[0].data()).join('/') + ':' + invalid[0].data().choice + ':' + invalid[0].data().reason.length + ':' + !!invalid[0].data().castAt : 'empty'}`, async () => {
    const h = await publicationHarness(); let writes = 0;
    h.c.getDocs = async () => ({ size: invalid.length, docs: invalid });
    h.c.updateDoc = async () => { writes++; };
    await h.get('publish-verdict').handlers.click();
    assert.equal(writes, 0); assert.doesNotMatch(h.get('status').textContent, /Final tally published/);
    assert.match(h.get('status').textContent, /ballot|reason|empty|record/i);
  });
}
for (const metadata of [{ fromCache: true, hasPendingWrites: false }, { fromCache: false, hasPendingWrites: true }]) {
  test(`publication rejects an unconfirmed ballot snapshot: ${JSON.stringify(metadata)}`, async () => {
    const h = await publicationHarness(); let writes = 0;
    h.c.getDocs = async () => ({ size: 1, docs: [voteRecord()], metadata });
    h.c.updateDoc = async () => { writes++; };
    await h.get('publish-verdict').handlers.click(); assert.equal(writes, 0);
    assert.doesNotMatch(h.get('status').textContent, /Final tally published/);
  });
}
test('publication transaction rechecks whether another administrator already published', async () => {
  const h = await publicationHarness(); let writes = 0;
  h.c.runTransaction = async (_, callback) => callback({ get: async () => snapshot({ status: 'closed', verdictSummary: { guilty: 1, notGuilty: 0 } }), update: () => { writes++; } });
  h.c.updateDoc = async () => { writes++; };
  await h.get('publish-verdict').handlers.click(); assert.equal(writes, 0);
  assert.match(h.get('status').textContent, /already published/i);
});
test('publication transaction rejects a trial reopened by an older deployment', async () => {
  const h = await publicationHarness(); let writes = 0;
  h.c.runTransaction = async (_, callback) => callback({ get: async () => snapshot({ status: 'verdict' }), update: () => { writes++; } });
  h.c.updateDoc = async () => { writes++; };
  await h.get('publish-verdict').handlers.click(); assert.equal(writes, 0);
});
test('transaction failure never displays publication success and restores retry controls', async () => {
  const h = await publicationHarness(); h.c.runTransaction = async () => { throw Error('Synthetic connection failure'); };
  await h.get('publish-verdict').handlers.click();
  assert.doesNotMatch(h.get('status').textContent, /Final tally published/);
  assert.match(h.get('status').textContent, /not confirmed/i);
  assert.equal(h.get('publish-verdict').disabled, false);
});
test('successful publication is distinguished from a subsequent count refresh failure', async () => {
  const h = await publicationHarness(); let reads = 0;
  h.c.getDocs = async () => { if (++reads > 1) throw Error('Refresh failed'); return { size: 1, docs: [voteRecord()] }; };
  await h.get('publish-verdict').handlers.click();
  assert.match(h.get('status').textContent, /published.*refresh failed/i);
  assert.equal(h.get('publish-verdict').disabled, true);
});
test('server ballot-read failure cannot fall back to cached counts', async () => {
  const h = await publicationHarness(); let writes = 0;
  h.c.getDocsFromServer = async () => { throw Error('Offline'); };
  h.c.updateDoc = async () => { writes++; };
  await h.get('publish-verdict').handlers.click(); assert.equal(writes, 0);
  assert.match(h.get('status').textContent, /Offline/);
});

for (const phase of ['trial', 'verdict']) {
  test(`administrator receives a useful error when reopening closed to ${phase}`, async () => {
    const h = await adminTrials(); let writes = 0;
    h.c.getDoc = async () => snapshot({ status: 'closed' });
    h.c.updateDoc = async () => { writes++; };
    h.get('trial-status').value = phase;
    await h.get('trial-form').handlers.submit({ preventDefault() {} });
    assert.equal(writes, 0); assert.match(h.get('status').textContent, /cannot be reopened/i);
  });
}
test('administrator can cancel permanent closure before any write', async () => {
  const h = await adminTrials(); let writes = 0;
  h.c.getDoc = async () => snapshot({ status: 'verdict' }); h.c.confirm = () => false;
  h.c.updateDoc = async () => { writes++; }; h.get('trial-status').value = 'closed';
  await h.get('trial-form').handlers.submit({ preventDefault() {} });
  assert.equal(writes, 0);
});
test('publication rejects a cached trial snapshot before requesting ballots', async () => {
  const h = await publicationHarness(); let reads = 0;
  h.c.getDoc = async () => ({ ...snapshot({ status: 'closed' }), metadata: { fromCache: true, hasPendingWrites: false } });
  h.c.getDocs = async () => { reads++; return { size: 1, docs: [voteRecord()] }; };
  await h.get('publish-verdict').handlers.click(); assert.equal(reads, 0);
  assert.match(h.get('status').textContent, /confirmed server snapshot/i);
});
test('publication rejects mismatched query size rather than trusting partial counts', async () => {
  const h = await publicationHarness(); let writes = 0;
  h.c.getDocs = async () => ({ size: 2, docs: [voteRecord()] }); h.c.updateDoc = async () => { writes++; };
  await h.get('publish-verdict').handlers.click(); assert.equal(writes, 0);
  assert.match(h.get('status').textContent, /inconsistent/i);
});
test('transaction retries do not repeat the confirmation or change the verified summary', async () => {
  const h = await publicationHarness(); let confirms = 0; const queued = [];
  h.c.confirm = () => { confirms++; return true; };
  h.c.runTransaction = async (_, callback) => {
    for (let attempt = 0; attempt < 2; attempt++) await callback({ get: async () => snapshot({ status: 'closed' }), update: (_, data) => { queued.push(JSON.stringify(data)); } });
  };
  await h.get('publish-verdict').handlers.click();
  assert.equal(confirms, 1); assert.equal(queued.length, 2); assert.equal(queued[0], queued[1]);
  assert.match(h.get('status').textContent, /Final tally published/);
});
test('lost commit acknowledgement never claims success and retry recognizes existing totals', async () => {
  const h = await publicationHarness(); let writes = 0;
  h.c.updateDoc = async () => {
    writes++; h.c.getDoc = async () => snapshot({ status: 'closed', verdictSummary: { guilty: 1, notGuilty: 0 } });
    throw Error('Acknowledgement lost');
  };
  await h.get('publish-verdict').handlers.click();
  assert.match(h.get('status').textContent, /not confirmed/i); assert.doesNotMatch(h.get('status').textContent, /Final tally published/);
  await h.get('publish-verdict').handlers.click();
  assert.equal(writes, 1); assert.match(h.get('status').textContent, /already published/i);
});
test('a delayed transaction read cannot publish after selection changes', async () => {
  const h = await publicationHarness(), waiting = deferred(), started = deferred(); let writes = 0;
  h.c.runTransaction = async (_, callback) => callback({ get: () => { started.resolve(); return waiting.promise; }, update: () => { writes++; } });
  const pending = h.get('publish-verdict').handlers.click(); await started.promise;
  h.get('trial-select').value = 'case-b'; await h.get('trial-select').handlers.change();
  const message = h.get('status').textContent;
  waiting.resolve(snapshot({ status: 'closed' })); await pending;
  assert.equal(writes, 0); assert.equal(h.get('status').textContent, message);
});

test('cancelled publication clears loading feedback and never starts a transaction', async () => {
  const h = await publicationHarness(); let transactions = 0;
  h.c.confirm = () => false; h.c.runTransaction = async () => { transactions++; };
  await h.get('publish-verdict').handlers.click();
  assert.equal(transactions, 0); assert.match(h.get('status').textContent, /cancelled.*No totals/i);
  assert.equal(h.get('publish-verdict').disabled, false);
});
test('retry shows existing server totals without presenting a new publication as successful', async () => {
  const h = await publicationHarness(); let writes = 0;
  h.c.getDoc = async () => snapshot({ status: 'closed', verdictSummary: { guilty: 4, notGuilty: 3 } });
  h.c.updateDoc = async () => { writes++; };
  await h.get('publish-verdict').handlers.click(); assert.equal(writes, 0);
  assert.match(h.get('status').textContent, /Previously published.*Guilty 4, Not Guilty 3/);
  assert.doesNotMatch(h.get('status').textContent, /Final tally published/);
});

for (const exists of [true, false]) {
  test(`permanent closure requires explicit confirmation (${exists ? 'existing' : 'new'} trial)`, async () => {
    const h = await adminTrials(); const writes = []; let prompt;
    h.c.getDoc = async () => snapshot(exists ? { status: 'verdict' } : null);
    h.c.confirm = message => { prompt = message; assert.equal(writes.length, 0); return true; };
    h.c.updateDoc = h.c.setDoc = async (...args) => { writes.push(args); };
    h.get('trial-status').value = 'closed';
    await h.get('trial-form').handlers.submit({ preventDefault() {} });
    assert.match(prompt, /irreversible/i); assert.match(prompt, /cannot be reopened/i);
    assert.match(prompt, /No further jury votes will be accepted/);
    assert.match(prompt, /OK.*Cancel/); assert.equal(writes.length, 1);
    assert.equal(writes[0][1].status, 'closed');
  });
  test(`cancelling closure leaves ${exists ? 'existing' : 'new'} trial unchanged and allows retry`, async () => {
    const h = await adminTrials(); let writes = 0;
    h.c.getDoc = async () => snapshot(exists ? { status: 'verdict' } : null);
    h.c.updateDoc = h.c.setDoc = async () => { writes++; };
    h.get('trial-status').value = 'closed'; h.c.confirm = () => false;
    await h.get('trial-form').handlers.submit({ preventDefault() {} });
    assert.equal(writes, 0); assert.match(h.get('status').textContent, /cancelled.*not changed/i);
    assert.equal(h.get('trial-form').querySelector('button').disabled, false);
    h.c.confirm = () => true;
    await h.get('trial-form').handlers.submit({ preventDefault() {} }); assert.equal(writes, 1);
  });
}
for (const stage of ['read', 'write']) {
  test(`closure suppresses duplicate actions during pending ${stage}`, async () => {
    const h = await adminTrials(), wait = deferred(); let reads = 0, writes = 0, confirms = 0;
    h.c.getDoc = async () => { reads++; return stage === 'read' ? wait.promise : snapshot({ status: 'verdict' }); };
    h.c.updateDoc = async () => { writes++; if (stage === 'write') await wait.promise; };
    h.c.confirm = () => { confirms++; return true; }; h.get('trial-status').value = 'closed';
    const submit = () => h.get('trial-form').handlers.submit({ preventDefault() {} });
    const first = submit(); await tick(); await tick();
    assert.equal(h.get('trial-form').querySelector('button').disabled, true);
    await submit(); assert.equal(reads, 1);
    if (stage === 'write') {
      h.get('trial-select').value = 'case-b'; await h.get('trial-select').handlers.change();
      h.get('trial-select').value = 'case-a'; await h.get('trial-select').handlers.change();
      assert.equal(h.get('trial-form').querySelector('button').disabled, true);
      h.get('trial-status').value = 'closed'; await submit(); assert.equal(reads, 1);
    }
    wait.resolve(snapshot({ status: 'verdict' })); await first;
    assert.equal(writes, 1); assert.equal(confirms, 1);
    assert.equal(h.get('trial-form').querySelector('button').disabled, false);
  });
}
test('already closed trial title edits do not ask for closure again', async () => {
  const h = await adminTrials(); let confirms = 0, writes = 0;
  h.c.getDoc = async () => snapshot({ status: 'closed' });
  h.c.confirm = () => { confirms++; return false; }; h.c.updateDoc = async () => { writes++; };
  h.get('trial-status').value = 'closed';
  await h.get('trial-form').handlers.submit({ preventDefault() {} });
  assert.equal(confirms, 0); assert.equal(writes, 1);
});
test('failed closure releases its lock so the administrator can retry', async () => {
  const h = await adminTrials(); let attempts = 0;
  h.c.getDoc = async () => snapshot({ status: 'verdict' });
  h.c.updateDoc = async () => { if (++attempts === 1) throw Error('Synthetic write failure'); };
  h.get('trial-status').value = 'closed';
  await h.get('trial-form').handlers.submit({ preventDefault() {} });
  assert.match(h.get('status').textContent, /Unable to save.*Synthetic write failure/);
  assert.equal(h.get('trial-form').querySelector('button').disabled, false);
  await h.get('trial-form').handlers.submit({ preventDefault() {} }); assert.equal(attempts, 2);
});

test('administrator creates a student profile without changing the teacher session', async () => {
 const h=await adminTrials(),writes=[];let closed=0;
 h.get('student-code').value='PUPIL-001';h.get('student-name').value='Public Alias';h.get('student-password').value='LocalPassword123!';
 h.c.createUserWithEmailAndPassword=async(_,email,password)=>{assert.equal(email,'pupil-001@students.modern-olympia.firebaseapp.com');assert.equal(password,'LocalPassword123!');return {user:{uid:'new-student'}}};
 h.c.deleteApp=async()=>{closed++};h.c.setDoc=async(...args)=>writes.push(args);
 await h.get('student-account-form').handlers.submit({preventDefault(){}});
 assert.equal(h.c.getAuth().currentUser.uid,'admin');assert.equal(closed,1);assert.equal(writes.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(writes[0])),[['students','new-student'],{displayName:'Public Alias',accountType:'student',active:true}]);
 assert.equal(h.get('student-password').value,'');assert.match(h.get('student-account-status').textContent,/Student created/);
});
test('student creation suppresses duplicate submits while Auth is pending', async () => {
 const h=await adminTrials(),wait=deferred();let calls=0;
 h.get('student-code').value='PUPIL-001';h.get('student-name').value='Alias';h.get('student-password').value='LocalPassword123!';
 h.c.createUserWithEmailAndPassword=async()=>{calls++;return wait.promise};
 const first=h.get('student-account-form').handlers.submit({preventDefault(){}});
 await tick();await h.get('student-account-form').handlers.submit({preventDefault(){}});assert.equal(calls,1);assert.equal(h.get('create-student').disabled,true);
 wait.resolve({user:{uid:'new-student'}});await first;assert.equal(h.get('create-student').disabled,false);
});
test('signing out during account creation prevents profile writes and cleans up the new Auth account', async () => {
 const h=await adminTrials(),wait=deferred();let writes=0,removed=0;
 h.get('student-code').value='PUPIL-001';h.get('student-name').value='Alias';h.get('student-password').value='LocalPassword123!';
 h.c.createUserWithEmailAndPassword=async()=>wait.promise;h.c.setDoc=async()=>{writes++};h.c.deleteUser=async()=>{removed++};
 const first=h.get('student-account-form').handlers.submit({preventDefault(){}});await tick();await h.authCallbacks[0](null);wait.resolve({user:{uid:'new-student'}});await first;
 assert.equal(writes,0);assert.equal(removed,1);assert.equal(h.get('account-rows').children.length,0);assert.equal(h.get('student-account-status').textContent,'');
});
test('administrator can pause a student and failed access changes never report success', async () => {
 const h=await adminTrials(),writes=[];h.c.updateDoc=async(...args)=>writes.push(args);
 h.run('students[0].active=true;renderAccounts()');
 const button=h.get('account-rows').children[0].children[2].children[0];await button.handlers.click();
 assert.equal(writes[0][0][0],'students');assert.equal(writes[0][1].active,false);assert.match(h.get('student-account-status').textContent,/paused/);
 const resume=h.get('account-rows').children[0].children[2].children[0];h.c.updateDoc=async()=>{throw Error('Synthetic error')};await resume.handlers.click();
 assert.match(h.get('student-account-status').textContent,/Unable to change access/);assert.equal(resume.disabled,false);
});
test('authenticated student with missing or paused profile retains a sign-out control', async () => {
 const h=harness('app.js');await h.authCallbacks[0]({uid:'student'});h.run('currentProfile=null;renderIdentity()');
 assert.equal(h.get('session-chip').hidden,false);assert.equal(h.get('logout-btn').hidden,false);assert.match(h.get('account-status').textContent,/not available/);
 h.run("currentProfile={displayName:'Alias',active:false,accountType:'student'};renderIdentity()");
 assert.match(h.get('account-status').textContent,/paused/);assert.equal(h.get('prosecution-composer').hidden,true);assert.equal(h.get('jury-vote-form').hidden,true);
});
test('student sign-out failure is visible instead of being console-only', async () => {
 const h=harness('app.js');h.c.signOut=async()=>{throw Error('Offline')};await h.get('logout-btn').handlers.click();assert.match(h.get('account-status').textContent,/Unable to sign out/);
});
test('duplicate argument submits create only one pending submission', async () => {
 const h=harness('app.js'),wait=deferred();let writes=0;
 h.run("activeTrialId='case-a';currentTrial.status='trial';currentProfile={active:true,accountType:'student',displayName:'Alias'};currentAssignment={role:'prosecutor'}");
 h.get('prosecution-composer').querySelector('textarea').value='Supported argument';h.c.addDoc=async()=>{writes++;return wait.promise};
 const first=h.get('prosecution-composer').handlers.submit({preventDefault(){}});await h.get('prosecution-composer').handlers.submit({preventDefault(){}});assert.equal(writes,1);
 wait.resolve({id:'new-post'});await first;assert.match(h.get('prosecution-feedback').textContent,/Sent to administrator/);
});
test('teacher approval publishes and return includes feedback through the existing moderation workflow', async () => {
 for(const approve of [true,false]){
  const h=await adminTrials();const writes=[];
  h.c.getDocs=async()=>({docs:[{id:'post',data:()=>({authorName:'Alias',section:'prosecution',text:'Argument',status:'pending'})}]});
  await h.get('refresh-submissions').handlers.click();const panel=h.get('review-list').children[1];
  panel.children[2].value='Explain your evidence';h.c.updateDoc=async(...args)=>writes.push(args);
  await panel.children[approve?3:4].onclick();assert.equal(writes[0][0][3],'post');
  assert.equal(writes[0][1].status,approve?'published':'returned');assert.equal(writes[0][1].feedback,approve?'':'Explain your evidence');
 }
});
test('new trial action clears dependent panels and saves a separate case',async()=>{
 const h=await adminTrials();await h.get('new-trial').handlers.click();assert.equal(h.get('trial-id').value,'');assert.equal(h.get('trial-id').readOnly,false);assert.equal(h.get('trial-select').value,'');assert.equal(h.get('publish-verdict').disabled,true);
 h.get('trial-id').value='fresh-case';h.get('trial-title').value='Athena: A Fair Judgment?';h.get('trial-status').value='trial';const writes=[];
 h.c.getDoc=async()=>snapshot(null);h.c.setDoc=async(...args)=>writes.push(args);
 await h.get('trial-form').handlers.submit({preventDefault(){}});assert.equal(writes[0][0][1],'fresh-case');assert.equal(h.get('trial-select').value,'fresh-case');assert.equal(h.get('trial-id').readOnly,true);
});
test('active teacher with a legacy juror assignment never sees student voting controls',async()=>{
 const h=harness('app.js');h.run("activeTrialId='case-a';currentTrial.status='verdict';currentProfile={active:true,accountType:'teacher',displayName:'Teacher'};currentAssignment={role:'juror'};checkingVote=false;renderIdentity()");assert.equal(h.get('jury-vote-form').hidden,true);
});

test('administrator saves an HTTPS portrait and restores it in the editor',async()=>{
 const h=await adminTrials(),writes=[];h.get('trial-portrait-url').value='https://images.example/athena.jpg';h.c.getDoc=async()=>snapshot({status:'trial'});h.c.updateDoc=async(...args)=>writes.push(args);
 await h.get('trial-form').handlers.submit({preventDefault(){}});assert.equal(writes[0][1].portraitUrl,'https://images.example/athena.jpg');assert.equal(h.get('trial-portrait-url').value,'https://images.example/athena.jpg');
});
test('invalid portrait prevents trial reads/writes and never creates an admin preview image',async()=>{
 const h=await adminTrials();let reads=0,writes=0,images=0;h.c.getDoc=async()=>{reads++;return snapshot({status:'trial'})};h.c.updateDoc=async()=>{writes++};const create=h.c.document.createElement;h.c.document.createElement=tag=>{if(tag==='img')images++;return create(tag)};
 h.get('trial-portrait-url').value='http://images.example/athena.jpg';await h.get('trial-form').handlers.submit({preventDefault(){}});assert.equal(reads,0);assert.equal(writes,0);assert.equal(images,0);assert.match(h.get('status').textContent,/HTTPS/);
});
test('legacy trial saves omit the blank optional portrait field',async()=>{
 const h=await adminTrials(),writes=[];h.c.getDoc=async()=>snapshot({status:'trial'});h.c.updateDoc=async(...args)=>writes.push(args);await h.get('trial-form').handlers.submit({preventDefault(){}});assert.equal('portraitUrl' in writes[0][1],false);
});
test('administrator can clear an existing portrait without migration',async()=>{
 const h=await adminTrials(),writes=[];h.c.getDoc=async()=>snapshot({status:'trial',portraitUrl:'https://images.example/old.jpg'});h.c.updateDoc=async(...args)=>writes.push(args);h.get('trial-portrait-url').value='';await h.get('trial-form').handlers.submit({preventDefault(){}});assert.equal(writes[0][1].portraitUrl,'');
});
test('new trial and sign-out clear the portrait editor context',async()=>{
 const h=await adminTrials();h.get('trial-portrait-url').value='https://images.example/unsaved.jpg';await h.get('new-trial').handlers.click();assert.equal(h.get('trial-portrait-url').value,'');h.get('trial-portrait-url').value='https://images.example/unsaved.jpg';await h.authCallbacks[0](null);assert.equal(h.get('trial-portrait-url').value,'');
});
test('court renders trial portrait and restores Ω while another trial loads',()=>{
 const h=harness('app.js'),pointer=h.snapshots.find(sub=>sub.ref.join('/')==='settings/currentTrial');pointer.next({exists:()=>true,data:()=>({trialId:'case-a'})});const trial=h.snapshots.find(sub=>sub.ref.join('/')==='trials/case-a');trial.next({exists:()=>true,data:()=>({title:'Athena',status:'trial',portraitUrl:'https://images.example/athena.jpg'})});assert.equal(h.get('mugshot').children[0].src,'https://images.example/athena.jpg');pointer.next({exists:()=>true,data:()=>({trialId:'case-b'})});assert.equal(h.get('mugshot').textContent,'Ω');assert.equal(h.get('mugshot').children.length,0);
});

async function reasoningAdmin(){
 const h=await adminTrials();
 h.c.getDoc=async()=>snapshot({status:'closed',verdictSummary:{guilty:1,notGuilty:0}});
 h.c.getDocs=async ref=>({docs:ref[ref.length-1]==='votes'?[{id:'private-juror',data:()=>({choice:'guilty',reason:'A private reason supported by the arguments.',castAt:'private-time'})}]:[]});
 await h.get('load-reasoning').handlers.click();return h;
}
test('loading historical private reasoning never publishes and requires individual confirmation',async()=>{
 const h=await reasoningAdmin();let transactions=0;h.c.runTransaction=async()=>{transactions++};
 const card=h.get('reasoning-review-list').children[0];assert.ok(card);await card.children[4].handlers.click();
 assert.equal(transactions,0);assert.match(card.children[6].textContent,/Confirm the anonymity review/);
});
test('confirmed administrator approval copies only redacted text and immutable choice',async()=>{
 const h=await reasoningAdmin(),writes=[];
 h.c.runTransaction=async(_,callback)=>callback({get:async ref=>snapshot(ref[2]==='votes'?{choice:'guilty',reason:'Original private reason',castAt:'secret'}:ref[2]==='reasoningReviews'?null:{status:'closed',verdictSummary:{guilty:1,notGuilty:0}}),set:(ref,data)=>writes.push({ref,data}),delete:()=>{throw Error('Unexpected delete')}});
 const card=h.get('reasoning-review-list').children[0];card.children[2].children[0].value='A reviewed explanation with all identifiers removed.';card.children[3].children[0].checked=true;
 await card.children[4].handlers.click();
 assert.equal(writes[0].ref[2],'publicReasoning');assert.deepEqual(Object.keys(writes[0].data).sort(),['choice','reason']);assert.equal(writes[0].data.choice,'guilty');assert.equal(writes[0].data.reason,'A reviewed explanation with all identifiers removed.');
 assert.equal(writes[1].ref[2],'reasoningReviews');assert.ok(!writes.some(write=>write.ref[2]==='votes'||write.ref.length===2));
});
test('cancelled approval and duplicate clicks cannot submit public copies',async()=>{
 const h=await reasoningAdmin(),wait=deferred();let transactions=0;
 const card=h.get('reasoning-review-list').children[0];card.children[3].children[0].checked=true;h.c.confirm=()=>false;h.c.runTransaction=async()=>{transactions++;return wait.promise};
 await card.children[4].handlers.click();assert.equal(transactions,0);h.c.confirm=()=>true;
 const pending=card.children[4].handlers.click();await card.children[4].handlers.click();assert.equal(transactions,1);wait.resolve();await pending;
});
test('failed reasoning commits preserve a visible unconfirmed state and editable copy',async()=>{
 const h=await reasoningAdmin(),card=h.get('reasoning-review-list').children[0];card.children[3].children[0].checked=true;h.c.runTransaction=async()=>{throw Error('Synthetic offline commit')};await card.children[4].handlers.click();
 assert.match(card.children[6].textContent,/not confirmed/);assert.equal(card.children[4].disabled,false);assert.equal(card.children[2].children[0].value,'A private reason supported by the arguments.');
});
test('private reasoning is cleared on sign-out and stale trial reads cannot render',async()=>{
 const h=await reasoningAdmin();assert.equal(h.get('reasoning-review-list').children.length,1);await h.authCallbacks[0](null);assert.equal(h.get('reasoning-review-list').children.length,0);
 const other=await adminTrials(),wait=deferred();other.c.getDoc=async()=>wait.promise;const pending=other.get('load-reasoning').handlers.click();other.get('trial-select').value='case-b';await other.get('trial-select').handlers.change();
 wait.resolve(snapshot({status:'closed',verdictSummary:{guilty:1,notGuilty:0}}));await pending;assert.equal(other.get('reasoning-review-list').children.length,0);assert.match(other.get('reasoning-review-status').textContent,/Load private reasoning/);
});
