import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { watchCanvasSession } from '../src/canvas-session-watch.js';

const cookie = changes => ({ name: '_normandy_session', value: 'private-cookie-fixture', domain: 'canvas.example',
  hostOnly: true, path: '/', secure: true, httpOnly: true, session: true, ...changes });
function setup(list = [cookie()]) {
  const cookies = new EventEmitter();
  cookies.get = async filter => { assert.deepEqual(filter, { url: 'https://canvas.example/api/graphql', name: '_normandy_session' }); return list; };
  const controller = new AbortController();
  return { cookies, controller, options: { cookies, origin: 'https://canvas.example', signal: controller.signal } };
}

test('session watch keeps credentials private, rereads the cookie and releases listeners', async () => {
  const { cookies, options } = setup();
  const watch = await watchCanvasSession(options);
  assert.equal(Object.isFrozen(watch), true);
  assert.equal(JSON.stringify(watch).includes('private-cookie-fixture'), false);
  cookies.emit('changed', {}, cookie({ name: '_csrf_token' }));
  cookies.emit('changed', {}, cookie({ domain: 'other.example' }));
  watch.assertCurrent(); await watch.check();
  assert.equal(cookies.listenerCount('changed'), 1);
  watch.dispose();
  assert.equal(cookies.listenerCount('changed'), 0);
  assert.throws(watch.assertCurrent, { name: 'AbortError' });
});

test('cookie changes and removals abort immediately, including same-value and path-shadow changes', async () => {
  for (const changedCookie of [cookie(), cookie({ value: 'new-private-value' }), cookie({ path: '/api' }), cookie({ domain: '.example', hostOnly: false })]) {
    const { cookies, options } = setup();
    const watch = await watchCanvasSession(options);
    cookies.emit('changed', {}, changedCookie, 'overwrite', true);
    assert.equal(watch.signal.aborted, true);
    assert.throws(watch.assertCurrent, { name: 'AbortError' });
    assert.equal(cookies.listenerCount('changed'), 0);
    assert.equal(watch.signal.reason.message.includes('private'), false);
  }
});

test('missing, ambiguous, expired and nonstandard cookies cannot establish a session watch', async () => {
  for (const list of [[], [cookie(), cookie()], [cookie({ path: '/api' })], [cookie({ secure: false })],
    [cookie({ httpOnly: false })], [cookie({ value: '' })], [cookie({ domain: 'other.example' })],
    [cookie({ session: false, expirationDate: 1 })], [cookie({ session: false })]]) {
    const { cookies, options } = setup(list);
    await assert.rejects(watchCanvasSession(options), /could not be verified/);
    assert.equal(cookies.listenerCount('changed'), 0);
  }
});

test('a missed event still fails the next cookie check and store errors stay private', async () => {
  for (const replacement of [async () => [cookie({ value: 'new-private-value' })], async () => { throw new Error('private-store-detail'); }]) {
    const { cookies, options } = setup();
    const watch = await watchCanvasSession(options);
    cookies.get = replacement;
    await assert.rejects(watch.check(), error => !error.message.includes('private'));
    assert.equal(watch.signal.aborted, true);
    assert.equal(cookies.listenerCount('changed'), 0);
  }
});

test('cancellation interrupts pending cookie lookup and rejects late results', async () => {
  const { cookies, options, controller } = setup();
  let release;
  cookies.get = () => new Promise(resolve => { release = resolve; });
  const pending = watchCanvasSession(options);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(cookies.listenerCount('changed'), 0);
  release([cookie()]);
  await Promise.resolve();
});
