import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Windows creates an ephemeral certificate in memory, not in a certificate store.
// The private key exists only in this test process; it never enters app storage.
const certificateScript = `
$testRsa = [System.Security.Cryptography.RSA]::Create(2048)
$testRequest = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=Canvas Weekly local test', $testRsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$testCertificate = $testRequest.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-1), [DateTimeOffset]::UtcNow.AddHours(1))
[Convert]::ToBase64String($testCertificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, 'fixture-only'))
$testCertificate.Dispose()
$testRsa.Dispose()
`;
const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', certificateScript], { windowsHide: true });
const received = [];
const server = https.createServer({ pfx: Buffer.from(stdout.trim(), 'base64'), passphrase: 'fixture-only' }, (request, response) => {
  const route = new URL(request.url, 'https://127.0.0.1').pathname;
  received.push({ method: request.method, route });
  if (route === '/login') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>Local login fixture</title><p>Synthetic login</p>');
  } else if (route === '/api/v1/courses/1/quizzes') {
    response.writeHead(302, { location: '/api/v1/courses/1/modules' }); response.end();
  } else {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ id: 123, name: 'Synthetic student' }));
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `https://127.0.0.1:${server.address().port}`;
await fs.mkdir('.codex-temp', { recursive: true });
const directory = await fs.mkdtemp(path.resolve('.codex-temp/network-'));
const environment = { ...process.env, CANVAS_NETWORK_TEST_DATA: directory, CANVAS_NETWORK_TEST_ORIGIN: origin };
delete environment.ELECTRON_RUN_AS_NODE;
let application;
try {
  application = await electron.launch({ args: ['tools/fixtures/network-app.mjs'], env: environment });
  await application.evaluate(async () => {
    await globalThis.networkFixtureReady;
    const { connection } = globalThis.networkFixture;
    const profile = await connection.client().read('profile');
    if (profile.id !== 123) throw new Error('Approved read failed');
  });
  assert.deepEqual(received, [{ method: 'GET', route: '/api/v1/users/self/profile' }]);
  const denied = await application.evaluate(async (_electron, origin) => {
    const { connection } = globalThis.networkFixture;
    const results = [];
    for (const [route, method] of [
      ['/api/v1/users/self/profile?per_page=100', 'GET'],
      ['/api/v1/courses/1/modules', 'GET'],
      ['/api/v1/conversations/7', 'GET'],
      ['/files/2/download', 'GET'],
      ['/api/v1/files/2/public_url', 'GET'],
      ['/api/v1/courses/1/quizzes/2/submissions', 'POST'],
    ]) {
      try { await connection.session.fetch(origin + route, { method }); results.push(false); }
      catch { results.push(true); }
    }
    return results;
  }, origin);
  assert.ok(denied.every(Boolean));
  assert.equal(received.length, 1, 'Denied requests must never reach the HTTPS server');
  await assert.rejects(application.evaluate(async () => globalThis.networkFixture.connection.client().read('quizzes', { courseId: 1 }, true)), /redirect/i);
  assert.equal(received.some(request => request.route.includes('/modules')), false);
  await application.evaluate(async (_electron, origin) => {
    const { connection, window } = globalThis.networkFixture;
    connection.loginWindow = window;
    await window.loadURL(origin + '/login');
  }, origin);
  const page = await application.firstWindow();
  const browserDenied = await page.evaluate(async () => {
    const results = [];
    for (const route of ['/api/v1/conversations/7', '/api/v1/courses/1/modules', '/api/v1/users/self/profile?per_page=100', '/files/2/download', '/courses/1/files/2/preview']) {
      try { await fetch(route); results.push(false); } catch { results.push(true); }
    }
    return results;
  });
  assert.ok(browserDenied.every(Boolean));
  await application.evaluate(async () => {
    const { connection } = globalThis.networkFixture;
    // Verification must work even while dashboard/browser requests are denied.
    await connection.client().read('profile');
    connection.loginWindow = null;
  });
  await assert.rejects(page.evaluate(async () => fetch('/login')));
  assert.deepEqual(received.map(request => request.route), [
    '/api/v1/users/self/profile', '/api/v1/courses/1/quizzes', '/login', '/api/v1/users/self/profile',
  ]);
  console.log('Network checks passed: real Electron interception, approved reads, denied writes/module/message/file-content reads, manual redirects, and login/collector separation on local HTTPS.');
} finally {
  if (application) await application.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  // Preserve only test logs/profile for diagnostics, inside ignored .codex-temp.
}
