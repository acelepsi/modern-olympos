// Local synthetic fixtures only. No Admin SDK, service account or production endpoint.
const fs = require('node:fs');
const path = require('node:path');
const { PROJECT, ACCOUNTS, assertLocalEnvironment } = require('./local-settings.cjs');
async function seedLocal(env = process.env, adapters = {}) {
  assertLocalEnvironment(env, true);
  for (const [key, value] of Object.entries({ FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_EMULATOR_HUB: '127.0.0.1:4400' })) {
    if (env[key] !== value) throw Error('Start with npm run local:browser; both local emulators must be running.');
  }
  const request = adapters.fetch || fetch;
  const accounts = [];
  for (const account of ACCOUNTS) {
    const response = await request('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-only-not-a-real-api-key', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true })
    });
    const result = await response.json();
    if (!response.ok || typeof result.localId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(result.localId)) {
      throw Error('Synthetic account creation failed. Stop emulators and restart for fresh test data.');
    }
    accounts.push({ ...account, uid: result.localId });
  }
  const template = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  if (template.split('REPLACE_WITH_ADMIN_UID').length !== 2) throw Error('Expected the administrator UID placeholder; refusing to use customized production rules.');
  const initialize = adapters.initializeTestEnvironment || require('@firebase/rules-unit-testing').initializeTestEnvironment;
  const testEnv = await initialize({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080,
    rules: template.replace('REPLACE_WITH_ADMIN_UID', accounts[0].uid) } });
  try {
    await testEnv.withSecurityRulesDisabled(async context => {
      const { doc, writeBatch, Timestamp } = adapters.firestore || require('firebase/firestore');
      const db = context.firestore(), batch = writeBatch(db);
      const put = (key, value) => batch.set(doc(db, key), value);
      for (const account of accounts) put(`students/${account.uid}`, {
        displayName: `Local ${account.role}`, active: true, accountType: account.role === 'admin' ? 'teacher' : 'student'
      });
      const cases = [['local-preparation', 'trial'], ['local-voting', 'verdict'], ['local-closed', 'closed'], ['local-empty', 'closed'], ['local-published', 'closed']];
      const juror = accounts.find(a => a.role === 'juror');
      for (const [id, phase] of cases) {
        put(`trials/${id}`, { title: `Synthetic mythology case: ${id}`, status: phase,
          ...(id === 'local-published' ? { verdictSummary: { guilty: 1, notGuilty: 0 } } : {}) });
        for (const account of accounts.filter(a => a.role !== 'admin')) put(`trials/${id}/assignments/${account.uid}`, { role: account.role === 'observer' ? 'unassigned' : account.role });
        for (const side of ['prosecutor', 'defender']) {
          const account = accounts.find(a => a.role === side);
          const submission = { trialId: id, authorUid: account.uid, authorName: `Local ${side}`,
            section: side === 'prosecutor' ? 'prosecution' : 'defense', text: `Synthetic published ${side} argument.`,
            evidenceUrl: '', status: 'published', feedback: '', createdAt: Timestamp.fromMillis(1000) };
          put(`trials/${id}/submissions/published-${side}`, submission);
          if (id === 'local-preparation') put(`trials/${id}/submissions/private-${side}`, {
            ...submission, text: `Synthetic private ${side} argument.`, status: side === 'prosecutor' ? 'draft' : 'pending'
          });
        }
        if (['local-closed', 'local-published'].includes(id)) put(`trials/${id}/votes/${juror.uid}`, {
          choice: 'guilty', reason: 'Synthetic juror reasoning for local testing only.', castAt: Timestamp.fromMillis(2000)
        });
      }
      put('settings/currentTrial', { trialId: 'local-preparation' });
      await batch.commit();
    });
  } finally { await testEnv.cleanup(); }
  return accounts;
}
module.exports = { seedLocal };
