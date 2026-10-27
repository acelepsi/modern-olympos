const PROJECT = 'demo-modern-olympos-browser';
const PASSWORD = 'Olympos-local-only-2026!';
const ACCOUNTS = ['admin', 'prosecutor', 'defender', 'juror', 'observer'].map(role => ({
  role, email: role === 'admin' ? 'admin@demo-modern-olympos.invalid' : `${role}@students.demo-modern-olympos.invalid`,
  password: PASSWORD
}));
function assertLocalEnvironment(env, allowEmulatorConfig = false) {
  for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN']) {
    if (env[key]) throw Error(`Remove ${key} from this terminal before local testing; no real credentials are needed.`);
  }
  if (env.FIREBASE_CONFIG && (!allowEmulatorConfig || JSON.parse(env.FIREBASE_CONFIG).projectId !== PROJECT)) throw Error('Refusing an inherited Firebase configuration.');
  for (const key of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
    if (env[key] && env[key] !== PROJECT) throw Error(`Unexpected ${key}: local testing requires ${PROJECT}.`);
  }
  for (const [key, value] of Object.entries({ FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_EMULATOR_HUB: '127.0.0.1:4400' })) {
    if (env[key] && env[key] !== value) throw Error(`Unexpected ${key}; only fixed loopback emulators are allowed.`);
  }
}
module.exports = { PROJECT, PASSWORD, ACCOUNTS, assertLocalEnvironment };
