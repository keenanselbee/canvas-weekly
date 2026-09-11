import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasResponseIdentity } from '../src/canvas-identity.js';

test('response identity preserves global IDs without inferring them from local profile IDs', () => {
  const headers = new Headers({ 'X-Canvas-User-Id': '10000000000099' });
  const identity = canvasResponseIdentity(headers);
  assert.deepEqual(identity, { globalUserId: '10000000000099' });
  assert.equal(Object.isFrozen(identity), true);
  assert.deepEqual(canvasResponseIdentity(headers, identity.globalUserId), identity);
  assert.throws(() => canvasResponseIdentity(headers, '99'), /confirm the account identity/);
  headers.set('X-Canvas-Real-User-Id', identity.globalUserId);
  assert.deepEqual(canvasResponseIdentity(headers, identity.globalUserId), identity);
});

test('missing, malformed, conflicting or impersonated response identities are rejected without disclosure', () => {
  for (const values of [{}, { 'x-canvas-user-id': '' }, { 'x-canvas-user-id': '0' }, { 'x-canvas-user-id': '099' },
    { 'x-canvas-user-id': '99, 100' }, { 'x-canvas-user-id': '1'.repeat(33) },
    { 'x-canvas-user-id': '99', 'x-canvas-real-user-id': '100' },
    { 'x-canvas-user-id': '99', 'x-canvas-real-user-id': '' },
    { 'x-canvas-user-id': '99', 'x-canvas-real-user-id': 'private-header' }]) {
    assert.throws(() => canvasResponseIdentity(new Headers(values)), error =>
      /confirm the account identity/.test(error.message) && !/private-header|100/.test(error.message));
  }
  assert.throws(() => canvasResponseIdentity({ get() { throw new Error('private-cookie'); } }),
    error => !error.message.includes('private-cookie'));
});
