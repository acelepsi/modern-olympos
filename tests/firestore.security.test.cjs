// Runs only against the loopback Firestore emulator; never imports browser Firebase config.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, serverTimestamp, Timestamp, writeBatch, setLogLevel, getDocFromServer, getDocsFromServer, runTransaction,
} = require('firebase/firestore');

const PROJECT = 'demo-modern-olympos';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
  throw Error('Refusing to run: use npm run test:security with the loopback Firestore emulator.');
}
for (const key of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
  if (process.env[key] && process.env[key] !== PROJECT) throw Error(`Refusing unexpected ${key}; tests require ${PROJECT}.`);
}
if (process.env.FIREBASE_CONFIG) {
  const config = JSON.parse(process.env.FIREBASE_CONFIG);
  if (config.projectId && config.projectId !== PROJECT) throw Error('Refusing a non-demo FIREBASE_CONFIG.');
}
const ADMIN = 'synthetic-admin';
const template = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');
assert.equal(template.split('REPLACE_WITH_ADMIN_UID').length, 2, 'Expected exactly one administrator UID template. Do not insert real credentials for tests.');
// The sole test substitution is the administrator UID. The checked-in rules are not rewritten.
const rules = template.replace('REPLACE_WITH_ADMIN_UID', ADMIN);
let env;
const clients = new Map();
function db(uid) {
  if (!clients.has(uid)) clients.set(uid, uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
  return clients.get(uid);
}
function ref(uid, path) { return doc(db(uid), path); }
const ballot = (extra = {}) => ({ choice: 'guilty', reason: 'A sufficiently detailed reason.', castAt: serverTimestamp(), ...extra });
const submission = (extra = {}) => ({
  trialId: 'case-a', authorUid: 'prosecutor', authorName: 'Prosecutor', section: 'prosecution',
  text: 'A supported argument.', evidenceUrl: '', status: 'draft', feedback: '', createdAt: serverTimestamp(), ...extra,
});
const storedSubmission = (extra = {}) => submission({ createdAt: Timestamp.fromMillis(1000), ...extra });
async function seed(entries) {
  await env.withSecurityRulesDisabled(async context => {
    const batch = writeBatch(context.firestore());
    for (const [path, data] of Object.entries(entries)) batch.set(doc(context.firestore(), path), data);
    await batch.commit();
  });
}
before(async () => {
  setLogLevel('silent');
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080, rules } });
});
beforeEach(async () => {
  await env.clearFirestore();
  const entries = {};
  for (const [uid, displayName] of [['prosecutor', 'Prosecutor'], ['defender', 'Defender'], ['juror', 'Juror'], ['other-juror', 'Other juror'], ['observer', 'Observer'], ['unassigned', 'Unassigned'], ['inactive', 'Inactive']]) {
    entries[`students/${uid}`] = { displayName, accountType: 'student', active: uid !== 'inactive' };
  }
  entries[`students/${ADMIN}`] = { displayName: 'Administrator', accountType: 'teacher', active: true };
  entries['students/other-teacher'] = { displayName: 'Other teacher', accountType: 'teacher', active: true };
  for (const [id, status] of [['case-a', 'trial'], ['case-b', 'verdict'], ['case-c', 'closed']]) {
    entries[`trials/${id}`] = { title: id, status };
    for (const uid of ['juror', 'other-juror', 'inactive', 'missing-profile', 'other-teacher']) entries[`trials/${id}/assignments/${uid}`] = { role: 'juror' };
  }
  entries['trials/case-a/assignments/prosecutor'] = { role: 'prosecutor' };
  entries['trials/case-a/assignments/defender'] = { role: 'defender' };
  entries['trials/case-a/assignments/observer'] = { role: 'unassigned' };
  entries['trials/case-b/assignments/prosecutor'] = { role: 'defender' };
  entries['settings/currentTrial'] = { trialId: 'case-a' };
  entries['trials/case-a/submissions/draft'] = storedSubmission();
  entries['trials/case-a/submissions/pending'] = storedSubmission({ status: 'pending' });
  entries['trials/case-a/submissions/returned'] = storedSubmission({ status: 'returned', feedback: 'Please cite your source.' });
  entries['trials/case-a/submissions/published'] = storedSubmission({ status: 'published' });
  entries['trials/case-b/votes/other-juror'] = ballot({ castAt: Timestamp.fromMillis(1000) });
  entries['arguments/legacy'] = { text: 'Synthetic legacy public text.' };
  await seed(entries);
});
after(async () => { if (env) await env.cleanup(); });

for (const path of ['settings/currentTrial', 'trials/case-a', 'trials/case-a/submissions/published', 'arguments/legacy']) {
  test(`public read is allowed: ${path}`, async () => { await assertSucceeds(getDoc(ref(null, path))); });
}
for (const uid of [null, 'prosecutor', 'other-teacher']) {
  test(`${uid || 'visitor'} cannot list student profiles or assignments`, async () => {
    await assertFails(getDocs(collection(db(uid), 'students')));
    await assertFails(getDocs(collection(db(uid), 'trials/case-a/assignments')));
  });
}
test('owners can read their profile/assignment but not another student', async () => {
  for (const path of ['students/prosecutor', 'trials/case-a/assignments/prosecutor']) await assertSucceeds(getDoc(ref('prosecutor', path)));
  for (const path of ['students/defender', 'trials/case-a/assignments/defender']) await assertFails(getDoc(ref('prosecutor', path)));
});
for (const uid of [null, 'prosecutor', 'other-teacher', ADMIN]) {
  test(`${uid || 'visitor'} cannot create teachers, promote or delete profiles through client rules`, async () => {
    await assertFails(setDoc(ref(uid, 'students/new-account'), { active: true, accountType: 'teacher', displayName: 'Impostor' }));
    await assertFails(updateDoc(ref(uid, 'students/prosecutor'), { accountType: 'teacher' }));
    if(uid!==ADMIN)await assertFails(updateDoc(ref(uid, 'students/prosecutor'), { active: true }));
    await assertFails(deleteDoc(ref(uid, 'students/prosecutor')));
  });
}
for (const uid of [null, 'prosecutor', 'juror', 'other-teacher']) {
  test(`${uid || 'visitor'} cannot self-assign a role or administer trials`, async () => {
    await assertFails(setDoc(ref(uid, 'trials/case-a/assignments/prosecutor'), { role: 'juror' }));
    await assertFails(setDoc(ref(uid, 'trials/new'), { title: 'Forged', status: 'trial' }));
    await assertFails(updateDoc(ref(uid, 'trials/case-a'), { status: 'verdict' }));
    await assertFails(setDoc(ref(uid, 'settings/currentTrial'), { trialId: 'case-b' }));
    await assertFails(updateDoc(ref(uid, 'trials/case-c'), { verdictSummary: { guilty: 5, notGuilty: 0 } }));
  });
}
test('administrator can list profiles, trials, assignments and private submissions', async () => {
  for (const path of ['students', 'trials', 'trials/case-a/assignments', 'trials/case-a/submissions', 'trials/case-b/votes']) await assertSucceeds(getDocs(collection(db(ADMIN), path)));
});
test('administrator can create, edit, activate trials and set the supported roles', async () => {
  await assertSucceeds(setDoc(ref(ADMIN, 'trials/new'), { title: 'New trial', status: 'trial' }));
  await assertSucceeds(updateDoc(ref(ADMIN, 'trials/new'), { title: 'Renamed', status: 'verdict' }));
  await assertSucceeds(setDoc(ref(ADMIN, 'settings/currentTrial'), { trialId: 'new' }));
  for (const role of ['unassigned', 'prosecutor', 'defender', 'juror']) await assertSucceeds(setDoc(ref(ADMIN, 'trials/new/assignments/prosecutor'), { role }));
});
for (const data of [{ role: 'teacher' }, { role: 'juror', active: true }, {}]) {
  test(`administrator role writes reject unsupported shapes: ${JSON.stringify(data)}`, async () => {
    await assertFails(setDoc(ref(ADMIN, 'trials/case-a/assignments/prosecutor'), data));
  });
}
test('administrator pointer rejects missing trials, invalid IDs and extra fields', async () => {
  for (const data of [{ trialId: 'missing' }, { trialId: 'UPPER' }, { trialId: 'x'.repeat(81) }, { trialId: 'case-b', extra: true }, {}]) await assertFails(setDoc(ref(ADMIN, 'settings/currentTrial'), data));
});
test('administrator trial writes cannot inject fields or invalid phases; deletion is denied', async () => {
  await assertFails(setDoc(ref(ADMIN, 'trials/bad'), { title: 'Bad', status: 'open' }));
  await assertFails(setDoc(ref(ADMIN, 'trials/bad'), { title: 'Bad', status: 'trial', privateNotes: 'secret' }));
  await assertFails(updateDoc(ref(ADMIN, 'trials/case-a'), { privateNotes: 'secret' }));
  for (const path of ['trials/case-a', 'trials/case-a/assignments/prosecutor', 'settings/currentTrial']) await assertFails(deleteDoc(ref(ADMIN, path)));
});
for (const status of ['draft', 'pending', 'returned']) {
  test(`${status} submissions are private to owner and administrator`, async () => {
    for (const uid of [null, 'defender', 'juror', 'other-teacher']) await assertFails(getDoc(ref(uid, `trials/case-a/submissions/${status === 'draft' ? 'draft' : status}`)));
    for (const uid of ['prosecutor', ADMIN]) await assertSucceeds(getDoc(ref(uid, `trials/case-a/submissions/${status}`)));
  });
}
test('real public and owner feed query shapes are authorized; unfiltered student feeds are not', async () => {
  const publicFeed = await assertSucceeds(getDocs(query(collection(db(null), 'trials/case-a/submissions'), where('status', '==', 'published'))));
  assert.equal(publicFeed.size, 1);
  const ownFeed = await assertSucceeds(getDocs(query(collection(db('prosecutor'), 'trials/case-a/submissions'), where('authorUid', '==', 'prosecutor'))));
  assert.equal(ownFeed.size, 4);
  for (const uid of [null, 'prosecutor', 'juror']) await assertFails(getDocs(collection(db(uid), 'trials/case-a/submissions')));
  await assertFails(getDocs(query(collection(db('defender'), 'trials/case-a/submissions'), where('authorUid', '==', 'prosecutor'))));
});
test('prosecutor and defender can save drafts and submit pending arguments in their own section', async () => {
  for (const status of ['draft', 'pending']) {
    await assertSucceeds(setDoc(ref('prosecutor', `trials/case-a/submissions/new-${status}`), submission({ status })));
    await assertSucceeds(setDoc(ref('defender', `trials/case-a/submissions/defense-${status}`), submission({ authorUid: 'defender', authorName: 'Defender', section: 'defense', status })));
  }
});
for (const uid of [null, 'juror', 'observer', 'unassigned', 'inactive', 'missing-profile', 'other-teacher', ADMIN]) {
  test(`${uid || 'visitor'} cannot submit as prosecutor`, async () => {
    await assertFails(setDoc(ref(uid, 'trials/case-a/submissions/attack'), submission()));
  });
}
test('wrong section, author spoofing and cross-trial field spoofing are denied', async () => {
  for (const fields of [{ section: 'defense' }, { authorUid: 'defender' }, { authorName: 'Defender' }, { trialId: 'case-b' }, { status: 'published' }, { feedback: 'fake teacher feedback' }, { createdAt: Timestamp.fromMillis(1) }, { extra: true }]) await assertFails(setDoc(ref('prosecutor', 'trials/case-a/submissions/attack'), submission(fields)));
});
test('roles from another trial confer no write permission here', async () => {
  await seed({ 'trials/case-b': { title: 'B', status: 'trial' } });
  await assertFails(setDoc(ref('prosecutor', 'trials/case-b/submissions/attack'), submission({ trialId: 'case-b' })));
  await assertFails(setDoc(ref('defender', 'trials/case-b/submissions/attack'), submission({ trialId: 'case-b', authorUid: 'defender', authorName: 'Defender', section: 'defense' })));
  // The same UID may legitimately hold a different role in another trial.
  await assertSucceeds(setDoc(ref('prosecutor', 'trials/case-b/submissions/legitimate'), submission({ trialId: 'case-b', section: 'defense' })));
});
for (const status of ['verdict', 'closed']) {
  test(`argument writes are denied during ${status}`, async () => {
    await seed({ 'trials/case-a': { title: 'A', status } });
    await assertFails(setDoc(ref('prosecutor', 'trials/case-a/submissions/new'), submission()));
    await assertFails(updateDoc(ref('prosecutor', 'trials/case-a/submissions/draft'), { text: 'Revised', status: 'pending' }));
  });
}
for (const fields of [{ text: '' }, { text: 'x'.repeat(5001) }, { evidenceUrl: 'javascript:alert(1)' }, { evidenceUrl: 'ftp://example.org' }, { evidenceUrl: 'https://' + 'x'.repeat(1000) }]) {
  test(`invalid submission content is denied: ${Object.keys(fields).join(',')} (${Object.values(fields)[0].length} characters)`, async () => {
    await assertFails(setDoc(ref('prosecutor', 'trials/case-a/submissions/bad'), submission(fields)));
  });
}
test('whitespace-only arguments cannot bypass UI trimming', async () => {
  await assertFails(setDoc(ref('prosecutor', 'trials/case-a/submissions/blank'), submission({ text: ' \n\t ' })));
  await assertFails(updateDoc(ref('prosecutor', 'trials/case-a/submissions/draft'), { text: '   ' }));
});
test('mixed-case HTTPS evidence URLs accepted by UI are accepted by rules', async () => {
  for (const scheme of ['https', 'HtTpS']) await assertSucceeds(setDoc(ref('prosecutor', `trials/case-a/submissions/link-${scheme}`), submission({ evidenceUrl: `${scheme}://example.org/source` })));
});
test('owner draft/returned revision flow works without changing protected fields', async () => {
  for (const fields of [{ authorUid: 'defender' }, { section: 'defense' }, { authorName: 'Impostor' }, { createdAt: serverTimestamp() }, { trialId: 'case-b' }, { status: 'published' }, { feedback: 'Invented' }]) await assertFails(updateDoc(ref('prosecutor', 'trials/case-a/submissions/draft'), fields));
  await assertSucceeds(updateDoc(ref('prosecutor', 'trials/case-a/submissions/draft'), { text: 'Revised draft', status: 'pending', feedback: '' }));
  await assertSucceeds(updateDoc(ref('prosecutor', 'trials/case-a/submissions/returned'), { text: 'Revised returned argument', status: 'pending', feedback: '' }));
  for (const id of ['pending', 'published']) await assertFails(updateDoc(ref('prosecutor', `trials/case-a/submissions/${id}`), { text: 'Tampered' }));
  await assertFails(updateDoc(ref('defender', 'trials/case-a/submissions/returned'), { text: 'Not mine' }));
});
test('administrator can return and approve pending submissions, but cannot rewrite arguments', async () => {
  const pending = ref(ADMIN, 'trials/case-a/submissions/pending');
  await assertFails(updateDoc(pending, { status: 'returned', feedback: '' }));
  await assertFails(updateDoc(pending, { status: 'published', feedback: '', text: 'Rewritten by teacher' }));
  await assertSucceeds(updateDoc(pending, { status: 'returned', feedback: 'Please add a source.' }));
  await assertSucceeds(updateDoc(ref('prosecutor', 'trials/case-a/submissions/pending'), { status: 'pending', feedback: '', text: 'Here is the source.' }));
  await assertSucceeds(updateDoc(pending, { status: 'published', feedback: '' }));
  await assertFails(updateDoc(pending, { status: 'returned', feedback: 'Too late' }));
  await assertFails(deleteDoc(pending));
});
test('blank teacher feedback cannot bypass UI trimming', async () => {
  await assertFails(updateDoc(ref(ADMIN, 'trials/case-a/submissions/pending'), { status: 'returned', feedback: ' \t\n ' }));
});
for (const uid of [null, 'prosecutor', 'juror', 'other-teacher']) {
  test(`${uid || 'visitor'} cannot moderate another submission`, async () => {
    await assertFails(updateDoc(ref(uid, 'trials/case-a/submissions/pending'), { status: 'published', feedback: '' }));
  });
}
test('eligible juror can create exactly one own ballot in a voting trial', async () => {
  const own = ref('juror', 'trials/case-b/votes/juror');
  await assertSucceeds(setDoc(own, ballot()));
  await assertFails(setDoc(own, ballot({ choice: 'not-guilty' })));
  await assertFails(updateDoc(own, { choice: 'not-guilty' }));
  await assertFails(deleteDoc(own));
  await assertSucceeds(getDoc(own));
});
test('two simultaneous writes for one UID produce exactly one ballot', async () => {
  const own = ref('juror', 'trials/case-b/votes/juror');
  const attempts = await Promise.allSettled([setDoc(own, ballot()), setDoc(own, ballot({ choice: 'not-guilty' }))]);
  assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
  const rejected = attempts.find(x => x.status === 'rejected'); assert.equal(rejected.reason.code, 'permission-denied');
  const stored = await assertSucceeds(getDoc(own)); assert.ok(['guilty', 'not-guilty'].includes(stored.data().choice));
});
for (const uid of [null, 'prosecutor', 'defender', 'observer', 'unassigned', 'inactive', 'missing-profile', 'other-teacher', ADMIN]) {
  test(`${uid || 'visitor'} cannot cast a jury ballot`, async () => {
    await assertFails(setDoc(ref(uid, `trials/case-b/votes/${uid || 'visitor'}`), ballot()));
  });
}
test('jurors cannot impersonate another UID or reuse an assignment from another trial', async () => {
  await assertFails(setDoc(ref('juror', 'trials/case-b/votes/prosecutor'), ballot()));
  await seed({ 'trials/other': { title: 'Other', status: 'verdict' } });
  await assertFails(setDoc(ref('juror', 'trials/other/votes/juror'), ballot()));
  await assertFails(setDoc(ref('juror', 'trials/missing/votes/juror'), ballot()));
});
for (const trial of ['case-a', 'case-c']) {
  test(`jury voting is blocked outside verdict phase: ${trial}`, async () => {
    await assertFails(setDoc(ref('juror', `trials/${trial}/votes/juror`), ballot()));
  });
}
for (const fields of [{ choice: 'abstain' }, { reason: 'Too short' }, { reason: 'x'.repeat(2001) }, { castAt: Timestamp.fromMillis(1) }, { authorUid: 'juror' }, { extra: true }]) {
  test(`invalid ballot shape/content is denied: ${Object.keys(fields).join(',')} (${typeof Object.values(fields)[0] === 'string' ? Object.values(fields)[0].length : typeof Object.values(fields)[0]})`, async () => {
    await assertFails(setDoc(ref('juror', 'trials/case-b/votes/juror'), ballot(fields)));
  });
}
test('ballot reasoning must be at least 15 characters after trimming', async () => {
  for (const reason of [' '.repeat(15), '  short reason  ']) await assertFails(setDoc(ref('juror', 'trials/case-b/votes/juror'), ballot({ reason })));
  await assertSucceeds(setDoc(ref('juror', 'trials/case-b/votes/juror'), ballot({ reason: 'x'.repeat(15) })));
});
test('ballots and reasons are private; only owner get and administrator list are allowed', async () => {
  for (const uid of [null, 'juror', 'prosecutor', 'other-teacher']) {
    await assertFails(getDoc(ref(uid, 'trials/case-b/votes/other-juror')));
    await assertFails(getDocs(collection(db(uid), 'trials/case-b/votes')));
  }
  await assertSucceeds(getDoc(ref('other-juror', 'trials/case-b/votes/other-juror')));
  await assertSucceeds(getDocs(collection(db(ADMIN), 'trials/case-b/votes')));
  await assertFails(updateDoc(ref(ADMIN, 'trials/case-b/votes/other-juror'), { choice: 'not-guilty' }));
  await assertFails(deleteDoc(ref(ADMIN, 'trials/case-b/votes/other-juror')));
});
test('removing eligibility prevents subsequent writes without changing existing ballots', async () => {
  await seed({ 'students/juror': { active: false, accountType: 'student', displayName: 'Juror' } });
  await assertFails(setDoc(ref('juror', 'trials/case-b/votes/juror'), ballot()));
  await seed({ 'students/juror': { active: true, accountType: 'student', displayName: 'Juror' }, 'trials/case-b/assignments/juror': { role: 'defender' } });
  await assertFails(setDoc(ref('juror', 'trials/case-b/votes/juror'), ballot()));
});
test('administrator closes, publishes once, and cannot reopen or replace published totals', async () => {
  const trial = ref(ADMIN, 'trials/case-b');
  await assertFails(updateDoc(trial, { verdictSummary: { guilty: 1, notGuilty: 0 } }));
  await assertSucceeds(updateDoc(trial, { status: 'closed' }));
  await assertSucceeds(updateDoc(trial, { verdictSummary: { guilty: 1, notGuilty: 0 } }));
  for (const fields of [{ status: 'verdict' }, { status: 'trial' }, { verdictSummary: { guilty: 2, notGuilty: 0 } }]) await assertFails(updateDoc(trial, fields));
  await assertSucceeds(updateDoc(trial, { title: 'Final title' }));
  const published = await assertSucceeds(getDoc(ref(null, 'trials/case-b'))); assert.equal(published.data().verdictSummary.guilty, 1);
});
for (const summary of [{ guilty: -1, notGuilty: 0 }, { guilty: 1.5, notGuilty: 0 }, { guilty: '1', notGuilty: 0 }, { guilty: 0 }, { guilty: 0, notGuilty: 0, reason: 'private' }]) {
  test(`invalid verdict summaries are denied: ${JSON.stringify(summary)}`, async () => {
    await assertFails(updateDoc(ref(ADMIN, 'trials/case-c'), { verdictSummary: summary }));
  });
}
test('unknown collections and legacy verdicts are denied; legacy arguments cannot be written', async () => {
  for (const uid of [null, 'prosecutor', ADMIN]) {
    for (const path of ['unknown/document', 'verdicts/legacy']) {
      await assertFails(getDoc(ref(uid, path))); await assertFails(setDoc(ref(uid, path), { text: 'Forged' }));
    }
    await assertFails(setDoc(ref(uid, 'arguments/legacy'), { text: 'Tampered' }));
  }
});

// These tests record unchanged policy limits, not endorsements or new permissions.
test('documented limitation: pinned administrator UID remains privileged despite an inactive profile', async () => {
  await seed({ [`students/${ADMIN}`]: { active: false, accountType: 'teacher', displayName: 'Administrator' } });
  await assertSucceeds(updateDoc(ref(ADMIN, 'trials/case-a'), { title: 'Still authorized by UID' }));
});
test('documented limitation: administrator totals are trusted rather than recomputed by rules', async () => {
  await assertSucceeds(updateDoc(ref(ADMIN, 'trials/case-c'), { verdictSummary: { guilty: 999, notGuilty: 888 } }));
});
test('documented policy: active-trial pointer does not replace per-trial write authorization', async () => {
  // The pointer is case-a, but a juror assigned to case-b may vote while B is in verdict.
  await assertSucceeds(setDoc(ref('juror', 'trials/case-b/votes/juror'), ballot()));
});
test('documented policy: deactivation blocks participation, not historical owner reads', async () => {
  await seed({ 'students/prosecutor': { active: false, accountType: 'student', displayName: 'Prosecutor' } });
  await assertSucceeds(getDoc(ref('prosecutor', 'trials/case-a/submissions/draft')));
  await assertFails(setDoc(ref('prosecutor', 'trials/case-a/submissions/new'), submission()));
});

test('forged application-role claims do not grant profile, role or trial administration', async () => {
  const forged = env.authenticatedContext('prosecutor', { admin: true, accountType: 'teacher', role: 'juror' }).firestore();
  await assertFails(updateDoc(doc(forged, 'students/prosecutor'), { accountType: 'teacher' }));
  await assertFails(setDoc(doc(forged, 'trials/case-b/assignments/prosecutor'), { role: 'juror' }));
  await assertFails(updateDoc(doc(forged, 'trials/case-a'), { status: 'verdict' }));
  await assertFails(setDoc(doc(forged, 'trials/case-b/votes/prosecutor'), ballot()));
});
test('batched self-provisioning and role escalation are rejected atomically', async () => {
  const attacker = db('attacker'), batch = writeBatch(attacker);
  batch.set(doc(attacker, 'students/attacker'), { active: true, accountType: 'student', displayName: 'Attacker' });
  batch.set(doc(attacker, 'trials/case-b/assignments/attacker'), { role: 'juror' });
  batch.set(doc(attacker, 'trials/case-b/votes/attacker'), ballot());
  await assertFails(batch.commit());
  const profile = await assertSucceeds(getDoc(doc(attacker, 'students/attacker')));
  assert.equal(profile.exists(), false);
});
for (const key of ['choice', 'reason', 'castAt']) {
  test(`missing ballot field ${key} is denied`, async () => {
    const data = ballot(); delete data[key];
    await assertFails(setDoc(ref('juror', 'trials/case-b/votes/juror'), data));
  });
}
for (const key of ['trialId', 'authorUid', 'authorName', 'section', 'text', 'evidenceUrl', 'status', 'feedback', 'createdAt']) {
  test(`missing submission field ${key} is denied`, async () => {
    const data = submission(); delete data[key];
    await assertFails(setDoc(ref('prosecutor', 'trials/case-a/submissions/incomplete'), data));
  });
}
test('valid multiline arguments and maximum content/URL sizes remain accepted', async () => {
  await assertSucceeds(setDoc(ref('prosecutor', 'trials/case-a/submissions/multiline'), submission({ text: 'First line\nSecond line' })));
  await assertSucceeds(setDoc(ref('prosecutor', 'trials/case-a/submissions/limits'), submission({ text: 'x'.repeat(5000), evidenceUrl: 'https://example.org/'.padEnd(1000, 'a') })));
});
test('both ballot choices and maximum reasoning length remain accepted', async () => {
  await assertSucceeds(setDoc(ref('juror', 'trials/case-b/votes/juror'), ballot({ choice: 'not-guilty', reason: 'x'.repeat(2000) })));
});
test('closing and publishing require the two separate operations used by the UI', async () => {
  await assertFails(updateDoc(ref(ADMIN, 'trials/case-b'), { status: 'closed', verdictSummary: { guilty: 1, notGuilty: 0 } }));
});
test('draft deletion and overlong return feedback remain denied', async () => {
  for (const uid of ['prosecutor', ADMIN]) await assertFails(deleteDoc(ref(uid, 'trials/case-a/submissions/draft')));
  await assertFails(updateDoc(ref(ADMIN, 'trials/case-a/submissions/pending'), { status: 'returned', feedback: 'x'.repeat(1001) }));
});

// Phase 5: immutable closure is the barrier between voting and a server tally.
for (const [from, to] of [['trial', 'trial'], ['trial', 'verdict'], ['trial', 'closed'], ['verdict', 'verdict'], ['verdict', 'closed'], ['closed', 'closed']]) {
  test(`forward lifecycle transition remains allowed: ${from} -> ${to}`, async () => {
    await seed({ 'trials/lifecycle': { title: 'Synthetic lifecycle', status: from } });
    await assertSucceeds(updateDoc(ref(ADMIN, 'trials/lifecycle'), { status: to }));
  });
}
for (const [from, to] of [['closed', 'trial'], ['closed', 'verdict'], ['verdict', 'trial']]) {
  test(`backward lifecycle transition is denied even without a summary: ${from} -> ${to}`, async () => {
    await seed({ 'trials/lifecycle': { title: 'Synthetic lifecycle', status: from } });
    await assertFails(updateDoc(ref(ADMIN, 'trials/lifecycle'), { status: to }));
  });
}
test('an unpublished closed trial still permits title corrections but not empty totals', async () => {
  await assertSucceeds(updateDoc(ref(ADMIN, 'trials/case-c'), { title: 'Corrected title' }));
  await assertFails(updateDoc(ref(ADMIN, 'trials/case-c'), { verdictSummary: { guilty: 0, notGuilty: 0 } }));
});
test('legacy zero summaries remain readable and title-editable without replacement', async () => {
  await seed({ 'trials/legacy-zero': { title: 'Legacy', status: 'closed', verdictSummary: { guilty: 0, notGuilty: 0 } } });
  await assertSucceeds(getDoc(ref(null, 'trials/legacy-zero')));
  await assertSucceeds(updateDoc(ref(ADMIN, 'trials/legacy-zero'), { title: 'Legacy corrected' }));
  await assertFails(updateDoc(ref(ADMIN, 'trials/legacy-zero'), { verdictSummary: { guilty: 1, notGuilty: 0 } }));
});
async function publishServerCounts(client) {
  const trial = doc(client, 'trials/case-b');
  const initial = await getDocFromServer(trial);
  if (initial.data().status !== 'closed') throw Error('Not closed');
  const votes = await getDocsFromServer(collection(client, 'trials/case-b/votes'));
  const summary = { guilty: 0, notGuilty: 0 };
  for (const vote of votes.docs) {
    if (vote.data().choice === 'guilty') summary.guilty++;
    else if (vote.data().choice === 'not-guilty') summary.notGuilty++;
    else throw Error('Malformed ballot');
  }
  await runTransaction(client, async transaction => {
    const latest = await transaction.get(trial);
    if (latest.data().status !== 'closed' || 'verdictSummary' in latest.data()) throw Error('Not publishable');
    transaction.update(trial, { verdictSummary: summary });
  });
  return summary;
}
test('a vote racing closure is either fully counted or rejected, and late votes stay rejected', async () => {
  const result = await Promise.allSettled([
    setDoc(ref('juror', 'trials/case-b/votes/juror'), ballot({ choice: 'not-guilty' })),
    updateDoc(ref(ADMIN, 'trials/case-b'), { status: 'closed' }),
  ]);
  assert.equal(result[1].status, 'fulfilled');
  const vote = await getDocFromServer(ref('juror', 'trials/case-b/votes/juror'));
  assert.equal(vote.exists(), result[0].status === 'fulfilled');
  if (result[0].status === 'rejected') assert.equal(result[0].reason.code, 'permission-denied');
  const summary = await publishServerCounts(db(ADMIN));
  assert.deepEqual(summary, { guilty: 1, notGuilty: vote.exists() ? 1 : 0 });
  await seed({ 'students/late-juror': { displayName: 'Late', active: true, accountType: 'student' }, 'trials/case-b/assignments/late-juror': { role: 'juror' } });
  await assertFails(setDoc(ref('late-juror', 'trials/case-b/votes/late-juror'), ballot()));
});
test('simultaneous valid jury votes are all included after acknowledged closure', async () => {
  await seed({ 'students/new-juror': { displayName: 'New', active: true, accountType: 'student' }, 'trials/case-b/assignments/new-juror': { role: 'juror' } });
  await Promise.all([
    assertSucceeds(setDoc(ref('juror', 'trials/case-b/votes/juror'), ballot())),
    assertSucceeds(setDoc(ref('new-juror', 'trials/case-b/votes/new-juror'), ballot({ choice: 'not-guilty' }))),
  ]);
  await assertSucceeds(updateDoc(ref(ADMIN, 'trials/case-b'), { status: 'closed' }));
  assert.deepEqual(await publishServerCounts(db(ADMIN)), { guilty: 2, notGuilty: 1 });
});
test('two administrator publication transactions result in exactly one stored summary', async () => {
  await updateDoc(ref(ADMIN, 'trials/case-b'), { status: 'closed' });
  const secondClient = env.authenticatedContext(ADMIN).firestore();
  const results = await Promise.allSettled([publishServerCounts(db(ADMIN)), publishServerCounts(secondClient)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const final = await getDocFromServer(ref(ADMIN, 'trials/case-b'));
  assert.deepEqual(final.data().verdictSummary, { guilty: 1, notGuilty: 0 });
});
test('publication racing initial closure either waits for closure or fails without storing premature totals', async () => {
  const results = await Promise.allSettled([
    publishServerCounts(db(ADMIN)),
    updateDoc(ref(ADMIN, 'trials/case-b'), { status: 'closed' }),
  ]);
  assert.equal(results[1].status, 'fulfilled');
  if (results[0].status === 'rejected') {
    const trial = await getDocFromServer(ref(ADMIN, 'trials/case-b'));
    assert.equal('verdictSummary' in trial.data(), false);
    await publishServerCounts(db(ADMIN));
  }
  const final = await getDocFromServer(ref(ADMIN, 'trials/case-b'));
  assert.deepEqual(final.data().verdictSummary, { guilty: 1, notGuilty: 0 });
});
test('later role or active changes do not silently discard an already-cast ballot', async () => {
  await seed({ 'students/other-juror': { displayName: 'Other', active: false, accountType: 'student' }, 'trials/case-b/assignments/other-juror': { role: 'unassigned' } });
  await updateDoc(ref(ADMIN, 'trials/case-b'), { status: 'closed' });
  assert.deepEqual(await publishServerCounts(db(ADMIN)), { guilty: 1, notGuilty: 0 });
});

test('a concurrent title correction retries publication without changing the stable tally', async () => {
  await updateDoc(ref(ADMIN, 'trials/case-b'), { status: 'closed' });
  let notifyRead, releaseRead, attempts = 0;
  const readStarted = new Promise(resolve => { notifyRead = resolve; });
  const release = new Promise(resolve => { releaseRead = resolve; });
  const trial = ref(ADMIN, 'trials/case-b');
  const publishing = runTransaction(db(ADMIN), async transaction => {
    const current = await transaction.get(trial); attempts++;
    assert.equal(current.data().status, 'closed');
    if (attempts === 1) { notifyRead(); await release; }
    transaction.update(trial, { verdictSummary: { guilty: 1, notGuilty: 0 } });
  });
  await Promise.race([readStarted, publishing.then(() => { throw Error('Transaction completed without the expected read barrier'); })]);
  try { await updateDoc(ref(ADMIN, 'trials/case-b'), { title: 'Corrected while publishing' }); }
  finally { releaseRead(); }
  await publishing;
  assert.ok(attempts >= 2);
  const final = await getDocFromServer(trial);
  assert.equal(final.data().title, 'Corrected while publishing');
  assert.deepEqual(final.data().verdictSummary, { guilty: 1, notGuilty: 0 });
});
for (const legacy of [{ title: 'Missing phase' }, { title: 'Old phase', status: 'archived-old' }]) {
  test(`legacy trial phase repair remains allowed: ${legacy.status || 'missing'}`, async () => {
    await seed({ 'trials/legacy-phase': legacy });
    await assertSucceeds(updateDoc(ref(ADMIN, 'trials/legacy-phase'), { status: 'trial' }));
  });
}

// Classroom account management keeps the pinned administrator as the only provisioner.
test('administrator can create a minimal active student profile and pause/resume participation',async()=>{
 await assertSucceeds(setDoc(ref(ADMIN,'students/new-student'),{displayName:'Classroom Alias',accountType:'student',active:true}));
 await assertSucceeds(updateDoc(ref(ADMIN,'students/new-student'),{active:false}));
 await assertSucceeds(updateDoc(ref(ADMIN,'students/new-student'),{active:true}));
});
for(const fields of [{accountType:'teacher'},{active:false},{password:'secret'},{displayName:''},{displayName:'x'.repeat(101)}]){
 test('administrator student creation rejects invalid fields '+Object.keys(fields)[0]+JSON.stringify(fields).length,async()=>{
  await assertFails(setDoc(ref(ADMIN,'students/new-student'),{displayName:'Alias',accountType:'student',active:true,...fields}));
 });
}
test('administrator cannot edit teacher profiles or change the student account type',async()=>{
 await assertFails(updateDoc(ref(ADMIN,`students/${ADMIN}`),{active:false}));
 await assertFails(updateDoc(ref(ADMIN,'students/other-teacher'),{active:false}));
 await assertFails(updateDoc(ref(ADMIN,'students/prosecutor'),{accountType:'teacher'}));
});
test('administrator can pause a legacy student without removing existing extra fields',async()=>{
 await seed({'students/legacy':{displayName:'Legacy Alias',accountType:'student',active:true,legacyField:'preserved'}});
 await assertSucceeds(updateDoc(ref(ADMIN,'students/legacy'),{active:false}));
 assert.equal((await getDoc(ref(ADMIN,'students/legacy'))).data().legacyField,'preserved');
});
test('pausing a student prevents new submissions while preserving old published material',async()=>{
 await assertSucceeds(updateDoc(ref(ADMIN,'students/prosecutor'),{active:false}));
 await assertFails(setDoc(ref('prosecutor','trials/case-a/submissions/paused-student'),submission()));
});
test('public archive query returns only published submissions and never grants draft access',async()=>{
 await seed({'trials/archive-case':{title:'Archived case',status:'closed',verdictSummary:{guilty:1,notGuilty:0}},
 'trials/archive-case/submissions/published':storedSubmission({trialId:'archive-case',status:'published'}),
 'trials/archive-case/submissions/private':storedSubmission({trialId:'archive-case',status:'draft'})});
 const cases=await assertSucceeds(getDocs(query(collection(db(null),'trials'),where('status','==','closed'))));assert.ok(cases.docs.some(item=>item.id==='archive-case'));
 const posts=await assertSucceeds(getDocs(query(collection(db(null),'trials/archive-case/submissions'),where('status','==','published'))));assert.equal(posts.size,1);
 await assertFails(getDoc(ref(null,'trials/archive-case/submissions/private')));
 await assertFails(getDocs(collection(db(null),'trials/archive-case/votes')));
});

// Optional portrait metadata only; authorization and lifecycle predicates are unchanged.
for(const portraitUrl of ['https://images.example/athena.jpg',''])test('administrator can create/edit portrait '+(portraitUrl?'HTTPS':'empty'),async()=>{
 await assertSucceeds(setDoc(ref(ADMIN,'trials/portrait-case'),{title:'Athena',status:'trial',portraitUrl}));
 await assertSucceeds(updateDoc(ref(ADMIN,'trials/case-a'),{portraitUrl}));
});
for(const portraitUrl of ['http://images.example/a.jpg','javascript:alert(1)',42,'https://','https://bad host/a.jpg','https://user:password@images.example/a.jpg','https://images.example/'+ 'a'.repeat(2000)])test('invalid portrait is denied '+String(portraitUrl).slice(0,40),async()=>{
 await assertFails(setDoc(ref(ADMIN,'trials/portrait-case'),{title:'Athena',status:'trial',portraitUrl}));
 await assertFails(updateDoc(ref(ADMIN,'trials/case-a'),{portraitUrl}));
});
test('portrait metadata cannot grant student writes or reopen a closed case',async()=>{
 await assertFails(updateDoc(ref('prosecutor','trials/case-a'),{portraitUrl:'https://images.example/a.jpg'}));
 await seed({'trials/portrait-closed':{title:'Athena',status:'closed'}});
 await assertFails(updateDoc(ref(ADMIN,'trials/portrait-closed'),{portraitUrl:'https://images.example/a.jpg',status:'verdict'}));
 await assertSucceeds(updateDoc(ref(ADMIN,'trials/portrait-closed'),{portraitUrl:'https://images.example/a.jpg'}));
});

for(const uid of [null,'juror','prosecutor','defender','other-teacher'])test(`${uid||'visitor'} cannot create or update portrait metadata`,async()=>{
 await assertFails(setDoc(ref(uid,'trials/unauthorized-portrait'),{title:'Athena',status:'trial',portraitUrl:'https://images.example/a.jpg'}));
 await assertFails(updateDoc(ref(uid,'trials/case-a'),{portraitUrl:'https://images.example/a.jpg'}));
});
test('legacy trials remain writable without adding a portrait field',async()=>{
 await assertSucceeds(setDoc(ref(ADMIN,'trials/portrait-legacy'),{title:'Legacy case',status:'trial'}));
 await assertSucceeds(updateDoc(ref(ADMIN,'trials/portrait-legacy'),{title:'Updated legacy case'}));
 assert.equal('portraitUrl' in (await getDoc(ref(ADMIN,'trials/portrait-legacy'))).data(),false);
});

const publicReasoningId='ABCDEFGHIJKLMNOPQRST';
async function seedReasoning(phase='closed',summary={guilty:1,notGuilty:0}){
 await seed({'trials/reason-case':{title:'Synthetic reasoning case',status:phase,...(summary?{verdictSummary:summary}:{})},
 'trials/reason-case/votes/juror':{choice:'guilty',reason:'Original private reasoning only.',castAt:Timestamp.fromMillis(1000)}});
}
const publicCopy=()=>({choice:'guilty',reason:'An approved anonymous explanation.'});
for(const uid of [null,'prosecutor','defender','juror','observer','other-teacher'])test(`${uid||'visitor'} cannot approve, edit, exclude or read private reasoning reviews`,async()=>{
 await seedReasoning();
 const review='trials/reason-case/reasoningReviews/juror',copy=`trials/reason-case/publicReasoning/${publicReasoningId}`;
 await assertFails(setDoc(ref(uid,review),{state:'approved',publicId:publicReasoningId}));await assertFails(setDoc(ref(uid,copy),publicCopy()));
 await seed({[review]:{state:'approved',publicId:publicReasoningId},[copy]:publicCopy()});
 await assertFails(getDoc(ref(uid,review)));await assertFails(getDocs(collection(db(uid),'trials/reason-case/reasoningReviews')));
 await assertFails(updateDoc(ref(uid,copy),{reason:'Unauthorized replacement reasoning.'}));await assertFails(deleteDoc(ref(uid,copy)));
});
for(const [phase,summary] of [['trial',{guilty:1,notGuilty:0}],['verdict',{guilty:1,notGuilty:0}],['closed',null],['closed',{guilty:0,notGuilty:0}]])test(`reasoning requires permanent closure and a positive published tally ${phase}-${JSON.stringify(summary)}`,async()=>{
 await seedReasoning(phase,summary);const copy=`trials/reason-case/publicReasoning/${publicReasoningId}`;await seed({[copy]:publicCopy()});
 await assertFails(getDoc(ref(null,copy)));await assertFails(getDocs(collection(db(null),'trials/reason-case/publicReasoning')));
 await assertFails(setDoc(ref(ADMIN,copy),publicCopy()));await assertFails(setDoc(ref(ADMIN,'trials/reason-case/reasoningReviews/juror'),{state:'approved',publicId:publicReasoningId}));
});
test('administrator can approve an anonymous copy while public ballots and profiles remain denied',async()=>{
 await seedReasoning();const copy=`trials/reason-case/publicReasoning/${publicReasoningId}`,review='trials/reason-case/reasoningReviews/juror';
 const batch=writeBatch(db(ADMIN));batch.set(ref(ADMIN,copy),publicCopy());batch.set(ref(ADMIN,review),{state:'approved',publicId:publicReasoningId});await assertSucceeds(batch.commit());
 const publicData=(await assertSucceeds(getDoc(ref(null,copy)))).data();assert.deepEqual(Object.keys(publicData).sort(),['choice','reason']);
 await assertSucceeds(getDocs(collection(db(null),'trials/reason-case/publicReasoning')));
 await assertFails(getDoc(ref(null,'trials/reason-case/votes/juror')));await assertFails(getDocs(collection(db(null),'trials/reason-case/votes')));await assertFails(getDoc(ref(null,'students/juror')));
 await assertSucceeds(getDoc(ref('juror','trials/reason-case/votes/juror')));await assertFails(getDoc(ref('observer','trials/reason-case/votes/juror')));
 assert.equal((await getDoc(ref(ADMIN,'trials/reason-case'))).data().verdictSummary.guilty,1);
});
for(const field of ['authorUid','studentCode','email','displayName','castAt','submittedAt','label','publicId'])test('public reasoning rejects identifying/extra field '+field,async()=>{
 await seedReasoning();await assertFails(setDoc(ref(ADMIN,`trials/reason-case/publicReasoning/${publicReasoningId}`),{...publicCopy(),[field]:'sensitive'}));
});
for(const reason of ['', 'short', 'x'.repeat(2001), 'This explanation includes learner@example.invalid.'])test('public reasoning rejects invalid/contact text '+reason.slice(0,35),async()=>{
 await seedReasoning();await assertFails(setDoc(ref(ADMIN,`trials/reason-case/publicReasoning/${publicReasoningId}`),{choice:'guilty',reason}));
});
test('public reasoning cannot expose a source UID as its document ID or change an approved choice',async()=>{
 await seedReasoning();await assertFails(setDoc(ref(ADMIN,'trials/reason-case/publicReasoning/juror'),publicCopy()));
 const copy=`trials/reason-case/publicReasoning/${publicReasoningId}`;await assertSucceeds(setDoc(ref(ADMIN,copy),publicCopy()));
 await assertFails(updateDoc(ref(ADMIN,copy),{choice:'not-guilty'}));await assertSucceeds(updateDoc(ref(ADMIN,copy),{reason:'A newly reviewed anonymous explanation.'}));
});
test('exclusion and withdrawal never alter a ballot or final tally',async()=>{
 await seedReasoning();const copy=`trials/reason-case/publicReasoning/${publicReasoningId}`,review='trials/reason-case/reasoningReviews/juror';
 await assertSucceeds(setDoc(ref(ADMIN,review),{state:'excluded',publicId:publicReasoningId}));assert.equal((await getDocs(collection(db(null),'trials/reason-case/publicReasoning'))).size,0);
 await assertSucceeds(setDoc(ref(ADMIN,copy),publicCopy()));await assertSucceeds(setDoc(ref(ADMIN,review),{state:'approved',publicId:publicReasoningId}));
 const batch=writeBatch(db(ADMIN));batch.delete(ref(ADMIN,copy));batch.update(ref(ADMIN,review),{state:'excluded'});await assertSucceeds(batch.commit());
 assert.equal((await getDoc(ref(ADMIN,'trials/reason-case/votes/juror'))).data().reason,'Original private reasoning only.');assert.deepEqual((await getDoc(ref(ADMIN,'trials/reason-case'))).data().verdictSummary,{guilty:1,notGuilty:0});
});
test('review state requires an existing ballot, fixed random reference and valid fields',async()=>{
 await seedReasoning();await assertFails(setDoc(ref(ADMIN,'trials/reason-case/reasoningReviews/no-ballot'),{state:'approved',publicId:publicReasoningId}));
 const review='trials/reason-case/reasoningReviews/juror';await assertFails(setDoc(ref(ADMIN,review),{state:'automatic',publicId:publicReasoningId}));await assertSucceeds(setDoc(ref(ADMIN,review),{state:'approved',publicId:publicReasoningId}));
 await assertFails(updateDoc(ref(ADMIN,review),{publicId:'ZYXWVUTSRQPONMLKJIHG'}));await assertFails(updateDoc(ref(ADMIN,review),{email:'learner@example.invalid'}));
});
test('previously completed trials need no migration and reasoning is never auto-published',async()=>{
 await seedReasoning();assert.equal((await assertSucceeds(getDocs(collection(db(null),'trials/reason-case/publicReasoning')))).size,0);
 await assertFails(updateDoc(ref(ADMIN,'trials/reason-case'),{status:'verdict'}));await assertFails(updateDoc(ref(ADMIN,'trials/reason-case'),{verdictSummary:{guilty:99,notGuilty:0}}));
 await assertFails(updateDoc(ref(ADMIN,'trials/reason-case/votes/juror'),{reason:'Rewritten ballot must never be allowed.'}));
});

// Optional public case description: no lifecycle or privilege expansion.
for(const charge of ['', 'A supported charge.', 'x'.repeat(2000)])test('administrator can create/edit optional charge '+charge.length,async()=>{
 await assertSucceeds(setDoc(ref(ADMIN,'trials/charge-case'),{title:'Case',status:'trial',charge}));
 await assertSucceeds(updateDoc(ref(ADMIN,'trials/case-a'),{charge}));
});
for(const charge of [null,42,{},'x'.repeat(2001)])test('invalid charge denied on create/update '+typeof charge,async()=>{
 await assertFails(setDoc(ref(ADMIN,'trials/charge-case'),{title:'Case',status:'trial',charge}));
 await assertFails(updateDoc(ref(ADMIN,'trials/case-a'),{charge}));
});
for(const uid of [null,'prosecutor','juror','other-teacher'])test(`${uid||'public'} cannot change charge metadata`,async()=>{
 await assertFails(updateDoc(ref(uid,'trials/case-a'),{charge:'Unauthorized'}));
 await assertFails(setDoc(ref(uid,'trials/charge-case'),{title:'Case',status:'trial',charge:'Unauthorized'}));
});
test('charge preserves legacy fields, permanent closure and immutable published tally',async()=>{
 await seed({'trials/charge-closed':{title:'Case',status:'closed',verdictSummary:{guilty:1,notGuilty:0}}});
 await assertSucceeds(updateDoc(ref(ADMIN,'trials/charge-closed'),{charge:'Clarified description'}));
 await assertFails(updateDoc(ref(ADMIN,'trials/charge-closed'),{charge:'Reopen',status:'verdict'}));
 await assertFails(updateDoc(ref(ADMIN,'trials/charge-closed'),{charge:'Replace tally',verdictSummary:{guilty:0,notGuilty:3}}));
 await assertSucceeds(updateDoc(ref(ADMIN,'trials/case-a'),{title:'Legacy title edit'}));assert.equal('charge' in (await getDoc(ref(ADMIN,'trials/case-a'))).data(),false);
});
for(const evidenceUrl of ['http://example.org/source','HTTP://example.org/source','https://','https://bad host/source','https://user:pass@example.org/source'])test('new insecure/malformed evidence denied '+evidenceUrl,async()=>{
 await assertFails(setDoc(ref('prosecutor','trials/case-a/submissions/new-link'),submission({evidenceUrl})));
 await assertFails(updateDoc(ref('prosecutor','trials/case-a/submissions/draft'),{evidenceUrl}));
});
test('legacy HTTP draft can be revised/resubmitted unchanged, upgraded or cleared, but not replaced by HTTP',async()=>{
 const path='trials/case-a/submissions/legacy-http';await seed({[path]:storedSubmission({evidenceUrl:'http://example.org/original'})});
 await assertSucceeds(updateDoc(ref('prosecutor',path),{text:'Revised supported argument.'}));
 await assertFails(updateDoc(ref('prosecutor',path),{evidenceUrl:'http://example.org/new'}));
 await assertSucceeds(updateDoc(ref('prosecutor',path),{evidenceUrl:'https://example.org/secure'}));
 await assertFails(updateDoc(ref('prosecutor',path),{evidenceUrl:'http://example.org/original'}));
 await assertSucceeds(updateDoc(ref('prosecutor',path),{evidenceUrl:''}));
 await seed({[path]:storedSubmission({evidenceUrl:'http://example.org/original',status:'returned',feedback:'Revise'})});
 await assertSucceeds(updateDoc(ref('prosecutor',path),{status:'pending',feedback:'',text:'Revised argument.'}));
 await assertSucceeds(updateDoc(ref(ADMIN,path),{status:'published',feedback:''}));
 const visible=await assertSucceeds(getDoc(ref(null,path)));assert.equal(visible.data().evidenceUrl,'http://example.org/original');
 await assertFails(updateDoc(ref('prosecutor',path),{text:'Tampered published text'}));
});

// Encyclopedia is an isolated collection; existing trial/ballot rules remain unchanged.
const encyclopediaEntry=(extra={})=>({name:'Synthetic Figure',tradition:'Synthetic Tradition',introduction:'A teacher-written synthetic introduction.',biography:'Teacher-written biography.',actions:'Teacher-written actions.',perspectives:'Teacher-written differing perspectives.',portraitUrl:'',sources:'Teacher-supplied synthetic reference.',relatedTrialId:'',status:'draft',...extra});
for(const uid of [null,'prosecutor','defender','juror','observer','other-teacher'])test(`${uid||'public'} reads published encyclopedia only and cannot edit`,async()=>{
 await seed({'encyclopedia/public-figure':encyclopediaEntry({status:'published'}),'encyclopedia/private-figure':encyclopediaEntry()});
 await assertSucceeds(getDoc(ref(uid,'encyclopedia/public-figure')));await assertFails(getDoc(ref(uid,'encyclopedia/private-figure')));
 await assertSucceeds(getDocs(query(collection(db(uid),'encyclopedia'),where('status','==','published'))));await assertFails(getDocs(collection(db(uid),'encyclopedia')));
 await assertFails(setDoc(ref(uid,'encyclopedia/attack'),encyclopediaEntry({status:'published'})));await assertFails(updateDoc(ref(uid,'encyclopedia/public-figure'),{name:'Tampered'}));await assertFails(deleteDoc(ref(uid,'encyclopedia/public-figure')));
});
test('designated administrator creates, publishes, unpublishes and deletes entries without changing trials',async()=>{
 const entry=ref(ADMIN,'encyclopedia/synthetic-figure'),trialBefore=(await getDoc(ref(ADMIN,'trials/case-c'))).data();
 await assertSucceeds(setDoc(entry,encyclopediaEntry({relatedTrialId:'case-c'})));await assertSucceeds(getDocs(collection(db(ADMIN),'encyclopedia')));
 await assertSucceeds(updateDoc(entry,{status:'published',portraitUrl:'https://images.example/synthetic.jpg'}));await assertSucceeds(getDoc(ref(null,'encyclopedia/synthetic-figure')));
 await assertSucceeds(updateDoc(entry,{status:'draft'}));await assertFails(getDoc(ref(null,'encyclopedia/synthetic-figure')));await assertSucceeds(deleteDoc(entry));assert.deepEqual((await getDoc(ref(ADMIN,'trials/case-c'))).data(),trialBefore);
});
for(const [field,limit] of Object.entries({name:100,tradition:80,introduction:500,biography:8000,actions:8000,perspectives:8000,sources:4000,portraitUrl:2000,relatedTrialId:80})){
 test('encyclopedia rejects invalid type/oversize '+field,async()=>{for(const value of [42,null,'x'.repeat(limit+1)])await assertFails(setDoc(ref(ADMIN,'encyclopedia/invalid'),encyclopediaEntry({[field]:value})));});
}
for(const extra of [{name:' '},{tradition:''},{introduction:'\t '},{status:'public'},{studentUid:'private-uid'},{createdBy:'private-uid'},{portraitUrl:'http://images.example/a.jpg'},{portraitUrl:'https://user:password@images.example/a.jpg'},{portraitUrl:'https://'},{relatedTrialId:'../students/juror'},{relatedTrialId:'missing-trial'}])test('encyclopedia rejects malformed or unexpected data '+JSON.stringify(extra),async()=>{
 await assertFails(setDoc(ref(ADMIN,'encyclopedia/invalid'),encyclopediaEntry(extra)));
});
for(const field of ['name','tradition','introduction','biography','actions','perspectives','portraitUrl','sources','relatedTrialId','status'])test('encyclopedia requires field '+field,async()=>{
 const data=encyclopediaEntry();delete data[field];await assertFails(setDoc(ref(ADMIN,'encyclopedia/invalid'),data));
});
for(const field of ['biography','actions','perspectives','sources'])test('unfinished encyclopedia '+field+' can be drafted but not published',async()=>{
 await assertSucceeds(setDoc(ref(ADMIN,'encyclopedia/unfinished'),encyclopediaEntry({[field]:''})));await assertFails(updateDoc(ref(ADMIN,'encyclopedia/unfinished'),{status:'published'}));
});
test('encyclopedia limits and new traditions remain compatible with public published queries',async()=>{
 await assertSucceeds(setDoc(ref(ADMIN,'encyclopedia/limits'),encyclopediaEntry({name:'x'.repeat(100),tradition:'An additional teacher-defined tradition',introduction:'x'.repeat(500),biography:'x'.repeat(8000),actions:'x'.repeat(8000),perspectives:'x'.repeat(8000),sources:'x'.repeat(4000),status:'published'})));
 const result=await assertSucceeds(getDocs(query(collection(db(null),'encyclopedia'),where('status','==','published'))));assert.equal(result.size,1);
 await assertFails(getDoc(ref(null,'students/juror')));await assertFails(getDoc(ref(null,'trials/case-b/votes/other-juror')));await assertFails(getDocs(collection(db(null),'trials/case-c/reasoningReviews')));
});

// Private school directory, optional affiliation and consent-gated public argument copies.
const consentToken='ABCDEFGHIJKLMNOPQRST';
async function schoolFixture(){await seed({'schools/school-a':{name:'Synthetic School A',countryCode:'TR',active:true},'schools/school-b':{name:'Synthetic School B',countryCode:'RO',active:true},'students/prosecutor':{displayName:'Prosecutor',accountType:'student',active:true,schoolId:'school-a',publicSchool:false,schoolConsentVersion:consentToken}})}
for(const uid of [null,'prosecutor','juror','other-teacher'])test(`${uid||'public'} cannot manage or enumerate school records`,async()=>{
 await schoolFixture();await assertFails(getDoc(ref(uid,'schools/school-a')));await assertFails(getDocs(collection(db(uid),'schools')));await assertFails(setDoc(ref(uid,'schools/new-school'),{name:'School',countryCode:'GR',active:true}));await assertFails(updateDoc(ref(uid,'schools/school-a'),{active:false}));await assertFails(deleteDoc(ref(uid,'schools/school-a')));
});
test('administrator manages school countries/status but no one can delete affiliated schools',async()=>{
 await schoolFixture();await assertSucceeds(getDocs(collection(db(ADMIN),'schools')));for(const countryCode of ['TR','RO','GR'])await assertSucceeds(setDoc(ref(ADMIN,'schools/new-school'),{name:'A school',countryCode,active:true}));await assertSucceeds(updateDoc(ref(ADMIN,'schools/school-a'),{active:false}));await assertFails(deleteDoc(ref(ADMIN,'schools/school-a')));await assertSucceeds(updateDoc(ref(ADMIN,'students/prosecutor'),{active:false}));
});
for(const change of [{name:''},{name:'x'.repeat(161)},{countryCode:'US'},{countryCode:42},{active:'yes'},{studentUid:'secret'}])test('school field validation '+JSON.stringify(change).slice(0,50),async()=>{await assertFails(setDoc(ref(ADMIN,'schools/bad'),{name:'School',countryCode:'TR',active:true,...change}))});
test('new student assignment is optional and private, with existing account fields preserved',async()=>{
 await schoolFixture();await assertSucceeds(setDoc(ref(ADMIN,'students/new-with-school'),{displayName:'Alias',accountType:'student',active:true,schoolId:'school-a',publicSchool:false}));await assertSucceeds(setDoc(ref(ADMIN,'students/new-legacy'),{displayName:'Alias',accountType:'student',active:true}));await assertFails(setDoc(ref(ADMIN,'students/auto-public'),{displayName:'Alias',accountType:'student',active:true,schoolId:'school-a',publicSchool:true}));
 await assertSucceeds(updateDoc(ref(ADMIN,'students/prosecutor'),{schoolId:'school-b',publicSchool:false,schoolConsentVersion:'ZYXWVUTSRQPONMLKJIHG'}));await assertSucceeds(getDoc(ref('prosecutor','students/prosecutor')));await assertFails(getDoc(ref(null,'students/prosecutor')));
});
for(const fields of [{schoolId:'missing',schoolConsentVersion:consentToken},{schoolId:'../students/private',schoolConsentVersion:consentToken},{schoolId:'',publicSchool:true,schoolConsentVersion:consentToken},{schoolId:'school-a',publicSchool:'true',schoolConsentVersion:consentToken},{schoolId:'school-b',schoolConsentVersion:'short'}])test('invalid school assignment denied '+JSON.stringify(fields),async()=>{await schoolFixture();await assertFails(updateDoc(ref(ADMIN,'students/prosecutor'),fields))});
for(const uid of ['prosecutor','juror','other-teacher'])test(uid+' cannot assign schools or enable public affiliation',async()=>{await schoolFixture();await assertFails(updateDoc(ref(uid,'students/prosecutor'),{schoolId:'school-b',publicSchool:true,schoolConsentVersion:consentToken}))});
test('inactive school cannot receive new accounts/public visibility; old account access remains editable',async()=>{
 await schoolFixture();await assertSucceeds(updateDoc(ref(ADMIN,'schools/school-a'),{active:false}));await assertFails(setDoc(ref(ADMIN,'students/new-inactive-school'),{displayName:'Alias',accountType:'student',active:true,schoolId:'school-a',publicSchool:false}));await assertSucceeds(updateDoc(ref(ADMIN,'students/prosecutor'),{active:false}));await assertSucceeds(updateDoc(ref(ADMIN,'students/prosecutor'),{publicSchool:false,schoolConsentVersion:'ZYXWVUTSRQPONMLKJIHG'}));await assertFails(updateDoc(ref(ADMIN,'students/prosecutor'),{publicSchool:true}));
});
test('public copy has only permitted school/country; withdrawal, reassignment and directory edits revoke access',async()=>{
 await schoolFixture();const copy='trials/case-a/attributions/published';await assertSucceeds(setDoc(ref(ADMIN,copy),{schoolName:'Synthetic School A',countryCode:'TR'}));await assertFails(getDoc(ref(null,copy)));await assertFails(getDoc(ref(ADMIN,copy)));await assertFails(getDocs(collection(db(null),'trials/case-a/attributions')));await assertFails(getDocs(collection(db(ADMIN),'trials/case-a/attributions')));
 await assertSucceeds(updateDoc(ref(ADMIN,'students/prosecutor'),{publicSchool:true}));const visible=await assertSucceeds(getDoc(ref(null,copy)));assert.deepEqual(Object.keys(visible.data()).sort(),['countryCode','schoolName']);
 await assertSucceeds(updateDoc(ref(ADMIN,'students/prosecutor'),{publicSchool:false,schoolConsentVersion:'ZYXWVUTSRQPONMLKJIHG'}));await assertFails(getDoc(ref(null,copy)));await assertSucceeds(updateDoc(ref(ADMIN,'students/prosecutor'),{schoolId:'school-b',publicSchool:true,schoolConsentVersion:consentToken}));await assertFails(getDoc(ref(null,copy)));
 await assertSucceeds(setDoc(ref(ADMIN,copy),{schoolName:'Synthetic School B',countryCode:'RO'}));await assertSucceeds(getDoc(ref(null,copy)));await assertSucceeds(updateDoc(ref(ADMIN,'schools/school-b'),{name:'Changed name'}));await assertFails(getDoc(ref(null,copy)));await assertSucceeds(setDoc(ref(ADMIN,copy),{schoolName:'Changed name',countryCode:'RO'}));await assertSucceeds(updateDoc(ref(ADMIN,'schools/school-b'),{active:false}));await assertFails(getDoc(ref(null,copy)));
});
for(const uid of [null,'prosecutor','juror','other-teacher'])test((uid||'public')+' cannot create or forge argument attribution',async()=>{await schoolFixture();await assertFails(setDoc(ref(uid,'trials/case-a/attributions/published'),{schoolName:'Synthetic School A',countryCode:'TR'}))});
for(const extra of [{studentUid:'secret'},{schoolId:'school-a'},{countryCode:'RO'},{schoolName:'A forged name'},{createdAt:1}])test('attribution rejects unexpected or forged metadata '+JSON.stringify(extra),async()=>{await schoolFixture();await assertFails(setDoc(ref(ADMIN,'trials/case-a/attributions/published'),{schoolName:'Synthetic School A',countryCode:'TR',...extra}))});
test('no attribution can be published for drafts, votes or anonymous jury reasoning',async()=>{
 await schoolFixture();await assertSucceeds(updateDoc(ref(ADMIN,'students/prosecutor'),{publicSchool:true}));for(const id of ['draft','pending','returned','other-juror','missing'])await assertFails(setDoc(ref(ADMIN,'trials/case-a/attributions/'+id),{schoolName:'Synthetic School A',countryCode:'TR'}));
 await assertFails(getDoc(ref(null,'trials/case-b/votes/other-juror')));await assertFails(getDocs(collection(db(null),'trials/case-c/reasoningReviews')));await assertFails(getDoc(ref(null,'students/prosecutor')));
});

// Homepage directory is a separate, minimal public projection. No private read grants.
const publicPartner={name:'Approved Synthetic School',countryCode:'TR'};
async function directoryFixture(){await seed({'schools/partner-a':{...publicPartner,active:true},'schools/partner-private':{name:'Private Synthetic School',countryCode:'RO',active:true},'schools/partner-inactive':{name:'Inactive School',countryCode:'GR',active:false}})}
for(const uid of [null,'prosecutor','juror','observer','other-teacher',ADMIN])test((uid||'public')+' can read only the separately approved homepage directory',async()=>{
 await directoryFixture();await assertSucceeds(setDoc(ref(ADMIN,'publicSchools/partner-a'),publicPartner));
 const result=await assertSucceeds(getDocs(collection(db(uid),'publicSchools')));assert.equal(result.size,1);assert.deepEqual(Object.keys(result.docs[0].data()).sort(),['countryCode','name']);
 if(uid!==ADMIN){await assertFails(getDocs(collection(db(uid),'schools')));await assertFails(getDoc(ref(uid,'schools/partner-a')))}
});
for(const uid of [null,'prosecutor','juror','observer','other-teacher'])test((uid||'public')+' cannot publish, alter or withdraw homepage school entries',async()=>{
 await directoryFixture();await assertFails(setDoc(ref(uid,'publicSchools/partner-a'),publicPartner));await assertSucceeds(setDoc(ref(ADMIN,'publicSchools/partner-a'),publicPartner));await assertFails(updateDoc(ref(uid,'publicSchools/partner-a'),{name:'Forged'}));await assertFails(deleteDoc(ref(uid,'publicSchools/partner-a')));
});
for(const extra of [{studentId:'secret'},{alias:'secret'},{schoolId:'secret'},{studentCount:10},{active:true},{consent:true},{email:'secret@example.invalid'},{name:''},{name:'x'.repeat(161)},{countryCode:'US'},{name:17}])test('public school projection rejects extra/invalid data '+JSON.stringify(extra).slice(0,50),async()=>{
 await directoryFixture();await assertFails(setDoc(ref(ADMIN,'publicSchools/partner-a'),{...publicPartner,...extra}));
});
test('only active existing school with exactly matching name/country can be explicitly published',async()=>{
 await directoryFixture();await assertFails(setDoc(ref(ADMIN,'publicSchools/missing'),publicPartner));await assertFails(setDoc(ref(ADMIN,'publicSchools/partner-inactive'),{name:'Inactive School',countryCode:'GR'}));await assertFails(setDoc(ref(ADMIN,'publicSchools/partner-a'),{...publicPartner,name:'Other name'}));await assertFails(setDoc(ref(ADMIN,'publicSchools/partner-a'),{...publicPartner,countryCode:'RO'}));await assertSucceeds(setDoc(ref(ADMIN,'publicSchools/partner-a'),publicPartner));
});
test('private schools stay unpublished until an administrator action and ordinary private edits remain compatible',async()=>{
 await directoryFixture();await assertSucceeds(updateDoc(ref(ADMIN,'schools/partner-private'),{name:'Still private'}));assert.equal((await getDocs(collection(db(null),'publicSchools'))).size,0);await assertSucceeds(updateDoc(ref(ADMIN,'schools/partner-private'),{active:false}));
});
test('published rename and country change require an atomic matching public copy; stale writes fail',async()=>{
 await directoryFixture();await setDoc(ref(ADMIN,'publicSchools/partner-a'),publicPartner);
 await assertFails(updateDoc(ref(ADMIN,'schools/partner-a'),{name:'Renamed'}));await assertFails(updateDoc(ref(ADMIN,'schools/partner-a'),{countryCode:'GR'}));
 const batch=writeBatch(db(ADMIN));batch.update(ref(ADMIN,'schools/partner-a'),{name:'Renamed',countryCode:'GR'});batch.set(ref(ADMIN,'publicSchools/partner-a'),{name:'Renamed',countryCode:'GR'});await assertSucceeds(batch.commit());assert.deepEqual((await getDoc(ref(null,'publicSchools/partner-a'))).data(),{name:'Renamed',countryCode:'GR'});
 await assertFails(setDoc(ref(ADMIN,'publicSchools/partner-a'),publicPartner));
});
test('deactivation atomically removes a public entry and reactivation never republishes it',async()=>{
 await directoryFixture();await setDoc(ref(ADMIN,'publicSchools/partner-a'),publicPartner);await assertFails(updateDoc(ref(ADMIN,'schools/partner-a'),{active:false}));const batch=writeBatch(db(ADMIN));batch.update(ref(ADMIN,'schools/partner-a'),{active:false});batch.delete(ref(ADMIN,'publicSchools/partner-a'));await assertSucceeds(batch.commit());assert.equal((await getDocs(collection(db(null),'publicSchools'))).size,0);await assertSucceeds(updateDoc(ref(ADMIN,'schools/partner-a'),{active:true}));assert.equal((await getDocs(collection(db(null),'publicSchools'))).size,0);
});
test('public trial statistic may count all existing phases without private nested reads',async()=>{
 const result=await assertSucceeds(getDocs(collection(db(null),'trials')));assert.equal(result.size,3);for(const child of ['votes','assignments','reasoningReviews'])await assertFails(getDocs(collection(db(null),'trials/case-a',child)));await assertFails(getDocs(collection(db(null),'students')));
});
