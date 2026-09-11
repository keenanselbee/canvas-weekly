import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasSessionAuthentication } from '../src/canvas-csrf.js';

const origin = 'https://canvas.example.edu';
const value = Buffer.alloc(64, 251).toString('base64');
const cookie = { name: '_csrf_token', value: encodeURIComponent(value), domain: 'canvas.example.edu', hostOnly: true,
  path: '/', secure: true, session: true };
const options = (matches, extra = {}) => ({ origin, signal: new AbortController().signal,
  cookies: { get: async filter => { assert.deepEqual(filter, { url: origin + '/api/graphql', name: '_csrf_token' }); return matches; } },
  now: () => 100000, ...extra });

test('Canvas CSRF uses scoped cookie lookup and decodes a masked token exactly once', async () => {
  for (const encoded of [value, encodeURIComponent(value)]) {
    const input = { ...cookie, value: encoded };
    assert.deepEqual(await canvasSessionAuthentication(options([input])), { kind: 'session', value });
    assert.equal(input.value, encoded, 'Authentication must not mutate the stored cookie');
  }
  assert.deepEqual(await canvasSessionAuthentication(options([{ ...cookie, domain: '.example.edu', hostOnly: false }])), { kind: 'session', value });
  assert.equal((await canvasSessionAuthentication(options([{ ...cookie, session: false, expirationDate: 101 }]))).value, value);
});

test('missing, ambiguous, expired, insecure and out-of-scope Canvas CSRF cookies fail closed', async () => {
  const bad = [[], [cookie, cookie], [null], [{ ...cookie, name: 'different' }], [{ ...cookie, path: '/api' }],
    [{ ...cookie, domain: 'evilcanvas.example.edu' }], [{ ...cookie, domain: '.example.edu', hostOnly: true }],
    [{ ...cookie, secure: false }], [{ ...cookie, session: false, expirationDate: 100 }],
    [{ ...cookie, session: false }], [{ ...cookie, session: undefined }]];
  for (const matches of bad) await assert.rejects(canvasSessionAuthentication(options(matches)), /Sign in to Canvas again/);
});

test('malformed, injected and noncanonical masked tokens never reach a header or an error', async () => {
  for (const malformed of ['', 'private-secret', '%', encodeURIComponent(encodeURIComponent(value)), 'x'.repeat(265),
    value.replace(/\+/g, ' '), value.slice(0, -2), value.slice(0, -3) + 'x==', encodeURIComponent(value + '\r\nInjected: private-secret'),
    Buffer.alloc(32).toString('base64'), Buffer.alloc(65).toString('base64')]) {
    await assert.rejects(canvasSessionAuthentication(options([{ ...cookie, value: malformed }])), error =>
      error.message === 'Canvas session verification is unavailable. Sign in to Canvas again.');
  }
});

test('cookie-store failures and invalid origins produce credential-free errors without fallback', async () => {
  let calls = 0;
  const cookies = { get: async () => { calls++; throw new Error('private-cookie-store-error'); } };
  await assert.rejects(canvasSessionAuthentication(options([], { cookies })), error => !error.message.includes('private'));
  assert.equal(calls, 1);
  for (const badOrigin of ['http://canvas.example.edu', origin + '/course', origin + '?as_user_id=1', origin + '#x', 'https://student:secret@canvas.example.edu', 'invalid']) {
    await assert.rejects(canvasSessionAuthentication(options([], { cookies, origin: badOrigin })), /Sign in to Canvas again/);
  }
  assert.equal(calls, 1, 'Invalid origins must not even access the cookie store');
});

test('cancellation before and during cookie lookup cannot return an authentication value', async () => {
  const controller = new AbortController();
  controller.abort(new Error('private-abort-reason'));
  let calls = 0;
  await assert.rejects(canvasSessionAuthentication(options([cookie], { signal: controller.signal,
    cookies: { get: async () => { calls++; return [cookie]; } } })), error => error.name === 'AbortError' && !error.message.includes('private'));
  assert.equal(calls, 0);
  const pending = new AbortController();
  let release;
  const result = canvasSessionAuthentication(options([], { signal: pending.signal,
    cookies: { get: () => new Promise(resolve => { release = resolve; }) } }));
  pending.abort(); release([cookie]);
  await assert.rejects(result, { name: 'AbortError' });
});
