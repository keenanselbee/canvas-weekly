import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import dns from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readHttps, SiteReader, siteScope } from '../src/site-reader.js';

test('real HTTPS website transport uses GET, pins checked DNS, scopes Basic auth and enforces limits', async t => {
  // Ephemeral fixture certificate; no Windows certificate-store changes.
  const script = `
$fixtureRsa = [System.Security.Cryptography.RSA]::Create(2048)
$fixtureRequest = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=course.example', $fixtureRsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$fixtureSan = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$fixtureSan.AddDnsName('course.example')
$fixtureRequest.CertificateExtensions.Add($fixtureSan.Build())
$fixtureCertificate = $fixtureRequest.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-1), [DateTimeOffset]::UtcNow.AddHours(1))
@{pfx=[Convert]::ToBase64String($fixtureCertificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx,'fixture-only'));cert=[Convert]::ToBase64String($fixtureCertificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))} | ConvertTo-Json -Compress
$fixtureCertificate.Dispose()
$fixtureRsa.Dispose()
`;
  const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
  const certificate = JSON.parse(stdout);
  const received = [];
  const server = https.createServer({ pfx: Buffer.from(certificate.pfx, 'base64'), passphrase: 'fixture-only' }, (request, response) => {
    received.push({ path: request.url, method: request.method, authorized: Boolean(request.headers.authorization), cookie: request.headers.cookie });
    if (request.url.endsWith('large.html')) { response.writeHead(200, { 'content-type': 'text/html' }); response.end('x'.repeat(4096)); return; }
    if (request.url.endsWith('escape.html')) { response.writeHead(302, { location: 'https://outside.example/lecture.html' }); response.end(); return; }
    if (request.url.endsWith('slow.html')) return;
    if (request.headers.authorization !== 'Basic ' + Buffer.from('student:fixture-password').toString('base64')) {
      response.writeHead(401, { 'www-authenticate': 'Basic realm="course"' }); response.end(); return;
    }
    if (request.url === '/data311/') { response.writeHead(302, { location: 'lecture.html' }); response.end(); return; }
    response.writeHead(200, { 'content-type': 'text/html' }); response.end('<main><h1>Lecture</h1><p>Optional practice.</p></main>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
    const request = https.request;
    t.mock.method(https, 'request', (url, options, callback) => {
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.Cookie, undefined);
      assert.notEqual(options.rejectUnauthorized, false);
      options.lookup(url.hostname, {}, (error, address) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); });
      // Only this fixture adapter maps the inspected request to localhost. TLS
      // still verifies course.example using the fixture's per-request CA.
      const local = new URL(url); local.port = String(server.address().port);
      return request(local, { ...options, ca: `-----BEGIN CERTIFICATE-----\n${certificate.cert}\n-----END CERTIFICATE-----`,
        lookup: (_hostname, lookupOptions, done) => lookupOptions.all ? done(null, [{ address: '127.0.0.1', family: 4 }]) : done(null, '127.0.0.1', 4),
      }, callback);
    });
    const scope = siteScope('https://course.example/data311/');
    const result = await new SiteReader().page(scope.seed, scope, { username: 'student', password: 'fixture-password', realm: 'course' });
    assert.equal(result.status, 'ok');
    assert.match(result.text, /Optional practice/);
    assert.deepEqual(received.map(item => [item.path, item.authorized]), [['/data311/', false], ['/data311/', true], ['/data311/lecture.html', false], ['/data311/lecture.html', true]]);
    assert.ok(received.every(item => item.method === 'GET' && !item.cookie));
    await assert.rejects(new SiteReader().page('escape.html', scope), /outside/);
    await assert.rejects(readHttps(new URL(scope.seed + 'large.html'), { maxBytes: 64 }), /securely|limit/);
    await assert.rejects(readHttps(new URL(scope.seed + 'slow.html'), { signal: AbortSignal.timeout(30) }), /cancelled|aborted/);
    const count = received.length;
    dns.lookup.mock.mockImplementation(async () => [{ address: '127.0.0.1', family: 4 }]);
    await assert.rejects(readHttps(new URL(scope.seed)), /private/);
    assert.equal(received.length, count);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
