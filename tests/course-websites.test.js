import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { SiteReader, siteScope, siteUrl, publicAddress, publicLookup } from '../src/site-reader.js';
import { CourseWebsites } from '../src/course-websites.js';
import { buildGuide, reconcile, renderMarkdown } from '../src/guide.js';
import { planningEvidence } from '../src/codex-client.js';

const account = { origin: 'https://canvas.example', userId: '1' };
const site = { id: 'fixture', url: 'https://course.example/data311/' };
const html = body => ({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body });

test('website scopes reject assessment actions, cross-scope redirects and private network addresses', async () => {
  const scope = siteScope(site.url);
  for (const value of ['https://elsewhere.example/data311/', '../other/', 'quiz/take', 'resume.html', 'api/user', 'page.html?token=secret', '%252fapi', '/data311-other/']) assert.equal(siteUrl(value, scope), null, value);
  for (const value of ['http://course.example/data311/', 'https://student:secret@course.example/data311/', 'https://127.0.0.1/', 'https://canvas.example./courses/1', 'https://course.example/data311/login']) assert.throws(() => siteScope(value));
  for (const address of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '192.168.1.1', '100.64.1.2', '198.19.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', '2001:db8::1', '2001:20::1', '2002:7f00:1::1']) assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.equal(publicAddress('2001:4860:4860::8888'), true);
  await assert.rejects(publicLookup('course.example', async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]), /private/);
  const requests = [];
  const reader = new SiteReader({ transport: async url => { requests.push(url.href); return { status: 302, headers: { location: 'https://elsewhere.example/data311/' }, body: '' }; } });
  await assert.rejects(reader.page(site.url, scope), /outside/);
  assert.deepEqual(requests, [site.url]);
});

test('Basic credentials require a matching challenge and are never carried across a redirect', async () => {
  const credential = { username: 'student', password: 'synthetic-pass', realm: 'course' };
  const requests = [];
  const reader = new SiteReader({ transport: async (url, init) => {
    requests.push({ url: url.href, auth: init.authorization });
    if (url.pathname.endsWith('second.html')) return { status: 401, headers: { 'www-authenticate': 'Basic realm="different"' }, body: '' };
    if (!init.authorization) return { status: 401, headers: { 'www-authenticate': 'Basic realm="course"' }, body: '' };
    return { status: 302, headers: { location: 'second.html' }, body: '' };
  } });
  const result = await reader.page(site.url, siteScope(site.url), credential);
  assert.equal(result.status, 'needs-login');
  assert.equal(requests.length, 3);
  assert.equal(requests[0].auth, undefined);
  assert.ok(requests[1].auth.startsWith('Basic '));
  assert.equal(requests[2].auth, undefined);
});

test('website collection preserves optional/table text and exposes unsupported, bounded and failed content', async () => {
  const fetched = [];
  const reader = new SiteReader({ transport: async url => {
    fetched.push(url.href);
    if (url.pathname.endsWith('login.html')) throw new Error('Must never fetch action link');
    if (url.pathname.endsWith('slides.pdf')) return { status: 200, headers: { 'content-type': 'application/pdf' }, body: Buffer.from('Unreadable PDF fixture') };
    if (url.pathname.endsWith('schedule.html')) return html('<main><h1>Tentative schedule</h1><table><tr><th>Topic</th><th>Reading</th></tr><tr><td>Keys</td><td>Supplementary reading is optional.</td></tr></table></main>');
    return html('<title>Course site</title><nav>Unrelated menu</nav><main><h1>Machine learning</h1><p>Read the lecture.</p><a href="schedule.html">Schedule</a><a href="slides.pdf">Slides</a><img src="diagram.png"><a href="login.html">Sign in</a><a href="schedule.html?token=secret">Signed link</a></main><script>fetch("https://elsewhere.example")</script>');
  } });
  const result = await reader.collect(site);
  assert.equal(result.pages.length, 2);
  assert.match(result.pages[1].body, /Keys \| Supplementary reading is optional/);
  assert.equal(result.pages[0].body.includes('Unrelated menu'), false);
  assert.ok(result.references.some(reference => reference.sourceUrl.endsWith('.pdf')));
  assert.ok(result.references.some(reference => reference.sourceUrl.endsWith('diagram.png') && reference.status.includes('media contents not collected')));
  assert.equal(result.references.some(reference => reference.sourceUrl.endsWith('login.html')), false);
  assert.deepEqual(fetched, [site.url, site.url + 'schedule.html', site.url + 'slides.pdf']);
  assert.ok(result.coverage.some(source => source.source.endsWith('slides.pdf') && source.status === 'error'));
  const protectedPage = await new SiteReader({ transport: async () => html('<form><input type="password"></form>') }).page(site.url, siteScope(site.url));
  assert.equal(protectedPage.status, 'needs-login');
  const bounded = new SiteReader({ transport: async () => html('<main><p>Reading</p>' + Array.from({ length: 40 }, (_, i) => `<a href="${i}.html">Lecture ${i}</a>`).join('') + '</main>') });
  assert.ok((await bounded.collect(site)).coverage.some(source => source.status === 'partial'));
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(new SiteReader({ signal: cancelled.signal, transport: async () => { throw new Error('Must not run'); } }).collect(site), /abort/i);
  let failures = 0;
  const failing = new SiteReader({ transport: async () => { failures++; throw new Error('Truncated response'); } });
  failing.byteLimit = 64;
  await assert.rejects(failing.page(site.url, siteScope(site.url)), /Truncated/);
  await assert.rejects(failing.page(site.url, siteScope(site.url)), /byte limit/);
  assert.equal(failures, 1, 'Failed downloads consume their allowance so retries cannot evade the byte budget');
});

test('website connections isolate accounts, protect credentials, audit reads and preserve changed/stale evidence', async () => {
  await fs.mkdir('.codex-temp', { recursive: true });
  const root = path.resolve('.codex-temp');
  const directory = await fs.mkdtemp(path.join(root, 'websites-'));
  assert.equal(path.dirname(directory), root);
  try {
    const sealed = new Map();
    const secrets = { encrypt: async value => { const key = crypto.randomUUID(); sealed.set(key, value); return Buffer.from(key); }, decrypt: async value => sealed.get(value.toString()) };
    const password = 'fixture-private-password';
    let text = 'Tentative schedule: Friday. Supplementary work is optional.';
    let fail = false;
    let rejectLogin = false;
    let requests = 0;
    const transport = async (_url, init) => {
      requests++;
      if (fail) throw new Error('Unavailable');
      if (rejectLogin || init.authorization !== 'Basic ' + Buffer.from('student:' + password).toString('base64')) return { status: 401, headers: { 'www-authenticate': 'Basic realm="course"' }, body: '' };
      return html(`<main><h1>Schedule</h1><p>${text}</p><p>Server echo: ${password}</p></main>`);
    };
    const store = new CourseWebsites({ directory, secrets, transport });
    const id = await store.add(account, '1', site.url);
    assert.equal((await store.probe(account, id))[0].needsPassword, true);
    await assert.rejects(store.add(account, '1', account.origin + '/courses/1'), /Canvas pages/);
    assert.equal((await store.probe(account, id, { username: 'student', password }))[0].status, 'ok');
    assert.equal(JSON.stringify(await store.list(account)).includes(password), false);
    assert.equal((await store.list({ ...account, userId: '2' })).length, 0);
    const restarted = new CourseWebsites({ directory, secrets, transport });
    const first = await restarted.collect(account, ['1']);
    assert.equal(first[0].pages.length, 1);
    assert.equal(JSON.stringify(first).includes(password), false);
    const record = external => ({ id: '1', coverage: external.flatMap(site => site.coverage), sources: { course: { name: 'Learning', course_code: 'DATA 311' },
      assignments: [{ id: 2, name: 'Canvas assignment', due_at: '2026-09-11T18:00:00Z', submission: { workflow_state: 'unsubmitted' } }], websites: external } });
    const options = { origin: account.origin, timeZone: 'UTC', now: '2026-09-10T18:00:00Z' };
    const previous = reconcile([record(first)], null, options);
    text = 'Tentative schedule: Monday. Supplementary work is optional.';
    const changed = reconcile([record(await restarted.collect(account, ['1']))], previous, options);
    assert.ok(changed.changes.some(change => change.field === 'course-information'));
    assert.equal(changed.items[0].dueAt, previous.items[0].dueAt, 'Website schedules must not replace Canvas deadlines');
    const guide = buildGuide(changed);
    assert.equal(JSON.stringify(planningEvidence(guide)).includes(password), false);
    assert.match(renderMarkdown(guide), /Supplementary work is optional/);
    rejectLogin = true;
    await restarted.collect(account, ['1']);
    const afterRejectedLogin = requests;
    await restarted.collect(account, ['1']);
    assert.equal(requests - afterRejectedLogin, 1, 'Do not automatically retry rejected saved credentials on later refreshes');
    rejectLogin = false;
    await restarted.probe(account, id, { username: 'student', password });
    fail = true;
    const failed = reconcile([record(await restarted.collect(account, ['1']))], changed, options);
    assert.ok(failed.courses[0].evidence.find(source => source.kind === 'website').stale);
    const auditDir = path.join(directory, 'request-audit');
    const audit = (await Promise.all((await fs.readdir(auditDir)).map(file => fs.readFile(path.join(auditDir, file), 'utf8')))).join('');
    assert.equal(audit.includes(password), false);
    assert.equal(audit.includes('Authorization'), false);
    assert.ok(audit.includes('network-error'));
    assert.equal(audit.split('\n').filter(line => line.includes('"event":"request"')).length, requests);
    const beforeFailure = requests;
    const unavailableEncryption = new CourseWebsites({ directory, transport, secrets: { encrypt: () => { throw new Error('Encryption unavailable'); } } });
    await assert.rejects(unavailableEncryption.probe(account, id, { username: 'student', password }), /Encryption unavailable/);
    assert.equal(requests, beforeFailure, 'Do not transmit credentials when encryption is unavailable');
    const blockedDirectory = path.join(directory, 'blocked-audit');
    const blocked = new CourseWebsites({ directory: blockedDirectory, secrets, transport });
    const blockedId = await blocked.add(account, '1', site.url);
    await fs.writeFile(path.join(blockedDirectory, 'request-audit'), 'Synthetic file blocks audit directory');
    assert.equal((await blocked.probe(account, blockedId))[0].status, 'error');
    assert.equal(requests, beforeFailure, 'Failed audit intent must prevent the request');
    await restarted.remove(account, id);
    assert.deepEqual(await restarted.list(account), []);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('collection stops at the first failed website login instead of retrying every queued page', async () => {
  const requests = [];
  const reader = new SiteReader({ transport: async url => {
    requests.push(url.href);
    if (url.href === site.url) return html('<main><p>Lectures</p><a href="one.html">One</a><a href="two.html">Two</a></main>');
    return { status: 401, headers: { 'www-authenticate': 'Basic realm="course"' }, body: '' };
  } });
  const result = await reader.collect(site, { username: 'student', password: 'old-password', realm: 'course' });
  assert.deepEqual(requests, [site.url, site.url + 'one.html', site.url + 'one.html']);
  assert.ok(result.coverage.some(source => source.status === 'needs-login'));
  assert.equal(result.coverage.some(source => source.source.endsWith(':limit')), false);
});
