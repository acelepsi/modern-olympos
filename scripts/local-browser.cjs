const { seedLocal } = require('./seed-local.cjs');
const { createLocalServer } = require('./local-server.cjs');
(async () => {
  await seedLocal(); // Failed emulator provisioning must never start a usable browser session.
  const server = createLocalServer();
  server.on('error', error => { console.error('Local server failed: ' + error.message); process.exitCode = 1; });
  server.listen(4173, '127.0.0.1', () => console.log('\nLOCAL TEST ONLY: open http://127.0.0.1:4173\nCtrl+C stops the server and emulators. No changes are exported.'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
})().catch(error => { console.error('Local startup stopped: ' + error.message); process.exitCode = 1; });
