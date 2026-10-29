const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { ACCOUNTS, PROJECT, PASSWORD } = require('./local-settings.cjs');
const ROOT = path.join(__dirname, '..');
const FILES = new Set(['index.html', 'court.html', 'admin.html', 'archive.html', 'who-is-who.html', 'style.css', 'landing.js', 'app.js', 'admin.js', 'firebase-client.js', 'student-accounts.js','portraits.js','jury-reasoning.js','case-content.js','court-ui.js','olympos-emblem.svg','courtroom-architecture.svg','portrait-frame.svg','mythological-entrance.svg','admin-workspace.js','admin-workspace.css','archive-print.css','how-it-works.html','encyclopedia.js','encyclopedia-admin.js','encyclopedia-data.js','encyclopedia.css','school-directory.js','international-court.js','international-client.js','school-data.js','school-admin.js','school-attribution.js','flag-tr.svg','flag-ro.svg','flag-gr.svg', 'archive.js']);
const CSP = "connect-src http://127.0.0.1:9099 http://127.0.0.1:8080 ws://127.0.0.1:8080; object-src 'none'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'";
function decorate(html) {
  // Insert before application modules, on every HTML page, so navigation cannot lose local mode.
  return html.replace(/<head>/i, '<head><script>globalThis.__OLYMPOS_LOCAL_TEST__=true;</script>')
    .replace(/<body([^>]*)>/i, '<body$1><aside role="note" style="padding:14px;background:#ffe49b;color:#191919;font:16px system-ui"><strong>LOCAL TEST ONLY — synthetic accounts and data.</strong> Never enter real passwords. <a href="/local-test.html" style="color:#191919">Test accounts and instructions</a></aside>');
}
function guide() {
  const rows = ACCOUNTS.map(a => `<tr><td>${a.role}</td><td>${a.role === 'admin' ? a.email : a.role.toUpperCase()}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Local Modern Olympos</title></head><body><main style="max-width:850px;margin:30px auto;font:18px system-ui;padding:20px"><h1>Local browser testing</h1><p>Project: <strong>${PROJECT}</strong>. Both emulators must remain running. All accounts use the synthetic password <code>${PASSWORD}</code>.</p><p><a href="/admin.html">Administrator sign in</a> · <a href="/court.html">Student / observer court</a></p><table><thead><tr><th>Workflow</th><th>Administrator email or student code</th></tr></thead><tbody>${rows}</tbody></table><p>Student codes are case insensitive. Observer is an active student with the unassigned role. Signing out also allows anonymous observer testing.</p><p>Start with <code>local-preparation</code> for drafts and review. Select <code>local-voting</code> and click “Make selected trial active” to vote. <code>local-closed</code> has one synthetic vote ready to publish; <code>local-empty</code> must reject publication; <code>local-published</code> already has a final tally. Select and activate each case before checking the court.</p><p>Local sign-in is kept in this page's memory. Reloading or navigating to another page signs you out. Use separate tabs for roles; signing into one tab does not switch another tab's account. Never use real credentials, evidence URLs or student information.</p><p>Stop with Ctrl+C in PowerShell. Restarting creates fresh fixtures. Do not run security tests while this environment is running: the emulator ports are shared.</p></main></body></html>`;
}
function createLocalServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    // Loopback binding plus Host validation prevents exposing fixtures through DNS rebinding.
    if (!['127.0.0.1:4173', 'localhost:4173'].includes(req.headers.host)) { res.writeHead(403); res.end(); return; }
    try {
      const pathname = new URL(req.url, 'http://127.0.0.1:4173').pathname;
      const filename = pathname === '/' ? 'local-test.html' : pathname.slice(1);
      if (filename !== 'local-test.html' && !FILES.has(filename)) { res.writeHead(404); res.end(); return; }
      let content = filename === 'local-test.html' ? guide() : await fs.readFile(path.join(ROOT, filename), 'utf8');
      const ext = path.extname(filename);
      if (ext === '.html') content = decorate(content);
      res.setHeader('Content-Type', ext === '.html' ? 'text/html; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : ext === '.svg' ? 'image/svg+xml' : 'text/javascript; charset=utf-8');
      res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : content);
    } catch { res.writeHead(500); res.end('Unable to load local test page.'); }
  });
}
module.exports = { createLocalServer, decorate, CSP };
