import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { watchCanvasSession } from '../src/canvas-session-watch.js';

const cookie = changes => ({ name: '_normandy_session', value: 'private-cookie-fixture', domain: 'canvas.example',
  hostOnly: true, path: '/', secure: true, httpOnly: true, session: true, ...changes });
function setup(list = [cookie()], origin = 'https://canvas.example') {
  const cookies = new EventEmitter();
  cookies.get = async filter => { assert.deepEqual(filter, { url: origin + '/api/graphql' }); return list; };
  const controller = new AbortController();
  return { cookies, controller, options: { cookies, origin, signal: controller.signal } };
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

test('rejected cookies expose specific diagnostic reasons without cookie contents', async () => {
  for (const [list, reason] of [[null, 'LOOKUP'], [[], 'MISSING'], [[cookie(), cookie()], 'AMBIGUOUS'],
    [[cookie({ path: '/api' })], 'SCOPE'], [[cookie({ domain: 'other.example' })], 'SCOPE'],
    [[cookie({ secure: false })], 'FLAGS'], [[cookie({ httpOnly: false })], 'FLAGS'],
    [[cookie({ value: '' })], 'VALUE'], [[cookie({ value: 'x'.repeat(16385) })], 'VALUE'],
    [[cookie({ session: false, expirationDate: 1 })], 'EXPIRY'], [[cookie({ session: false })], 'EXPIRY']]) {
    const { cookies, options } = setup(list);
    await assert.rejects(watchCanvasSession(options), error => {
      assert.match(error.message, new RegExp('CW_SESSION_' + reason));
      assert.equal(error.code, 'CW_SESSION_' + reason);
      assert.match(error.message, /previous guide is preserved/);
      assert.equal(error.message.includes('private-cookie-fixture'), false);
      assert.equal(error.message.includes('other.example'), false);
      return true;
    });
    assert.equal(cookies.listenerCount('changed'), 0);
  }
});

test('session lookup timeout provides a safe reason and releases its listener', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { cookies, options } = setup();
  cookies.get = () => new Promise(() => {});
  const pending = watchCanvasSession(options);
  t.mock.timers.tick(10000);
  await assert.rejects(pending, /CW_SESSION_TIMEOUT/);
  assert.equal(cookies.listenerCount('changed'), 0);
});

test('a missed event still fails the next cookie check and store errors stay private', async () => {
  for (const replacement of [async () => [cookie({ value: 'new-private-value' })], async () => { throw new Error('private-store-detail'); }]) {
    const { cookies, options } = setup();
    const watch = await watchCanvasSession(options);
    cookies.get = replacement;
    await assert.rejects(watch.check(), error => {
      assert.equal(error.message.includes('private'), false);
      if (error.name !== 'AbortError') assert.match(error.message, /CW_SESSION_LOOKUP/);
      return true;
    });
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

test('UBC session name is accepted only at its reviewed origin with unchanged safeguards', async () => {
  const ubc = changes => cookie({ name: 'canvas_session', domain: 'canvas.ubc.ca', ...changes });
  const { cookies, options } = setup([ubc(), ubc({ name: '_csrf_token', httpOnly: false }), ubc({ name: 'log_session_id' })], 'https://canvas.ubc.ca');
  const watch = await watchCanvasSession(options);
  await watch.check();
  assert.equal(JSON.stringify(watch).includes('private-cookie-fixture'), false);
  // Appearance of the other recognized credential aborts immediately.
  cookies.emit('changed', {}, ubc({ name: '_normandy_session' }));
  assert.equal(watch.signal.aborted, true);
  watch.dispose();
  for (const [list, reason] of [
    [[ubc(), ubc({ name: '_normandy_session' })], 'AMBIGUOUS'],
    [[ubc(), ubc({ path: '/api' })], 'AMBIGUOUS'],
    [[ubc({ path: '/api' })], 'SCOPE'], [[ubc({ domain: 'other.example' })], 'SCOPE'],
    [[ubc({ httpOnly: false })], 'FLAGS'], [[ubc({ secure: false })], 'FLAGS'],
    [[ubc({ session: false, expirationDate: 1 })], 'EXPIRY'], [[ubc({ value: '' })], 'VALUE'],
    [[ubc({ name: 'log_session_id' }), ubc({ name: '_csrf_token' })], 'MISSING'],
  ]) {
    const rejected = setup(list, 'https://canvas.ubc.ca');
    await assert.rejects(watchCanvasSession(rejected.options), { code: 'CW_SESSION_' + reason });
    assert.equal(rejected.cookies.listenerCount('changed'), 0);
  }
  for (const origin of ['https://canvas.example', 'https://canvas.ubc.ca.other.example']) {
    const rejected = setup([ubc({ domain: new URL(origin).hostname })], origin);
    await assert.rejects(watchCanvasSession(rejected.options), { code: 'CW_SESSION_MISSING' });
  }
});

test('a missed UBC cookie-name switch or same-value overwrite cannot preserve the binding', async () => {
  const initial = cookie({ name: 'canvas_session', domain: 'canvas.ubc.ca' });
  for (const event of [true, false]) {
    const { cookies, options } = setup([initial], 'https://canvas.ubc.ca');
    const watch = await watchCanvasSession(options);
    if (event) cookies.emit('changed', {}, initial);
    else cookies.get = async () => [{ ...initial, name: '_normandy_session' }];
    await assert.rejects(watch.check(), { name: 'AbortError' });
    assert.equal(cookies.listenerCount('changed'), 0);
  }
});
