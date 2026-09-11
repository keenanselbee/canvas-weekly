import { app } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CanvasConnection } from '../../src/canvas-session.js';

const directory = process.env.CANVAS_CONNECTION_TEST_DATA;
if (!directory || !path.isAbsolute(directory)) throw new Error('An isolated test profile is required.');
app.setPath('userData', directory);

globalThis.connectionFixtureResults = app.whenReady().then(async () => {
  const passed = [];
  let index = 0;
  const setup = () => {
    const settings = { value: { canvasBaseUrl: 'https://canvas.example', selectedCourseIds: ['1'] } };
    const connection = new CanvasConnection({ directory: path.join(directory, String(++index)), settings, onChange: () => {} });
    const state = { connection, settings, userId: 99, queued: [], requests: 0 };
    connection.session.fetch = async (address, init) => {
      assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual');
      assert.equal(new URL(address).origin, 'https://canvas.example');
      state.requests++;
      const gate = state.queued.shift();
      if (gate) { gate.enter(); return gate.response; }
      return new Response(JSON.stringify({ id: state.userId, name: 'Synthetic student' }), { headers: { 'content-type': 'application/json' } });
    };
    state.hold = () => {
      let enter, release;
      const entered = new Promise(resolve => { enter = resolve; });
      const response = new Promise(resolve => { release = resolve; });
      state.queued.push({ enter, response });
      return { entered, release: (id = 99, status = 200) => release(new Response(JSON.stringify({ id, name: 'Delayed student' }), { status, headers: { 'content-type': 'application/json' } })) };
    };
    return state;
  };
  const check = async (name, run) => { await run(); passed.push(name); };

  await check('late verification cannot reconnect a disconnected account', async () => {
    const state = setup(), gate = state.hold();
    const pending = state.connection.verify().catch(error => error);
    await gate.entered;
    await state.connection.disconnect();
    gate.release();
    assert.equal((await pending).name, 'AbortError');
    assert.equal(state.connection.status.connected, false);
    assert.equal(state.connection.status.error, null);
  });
  await check('an old failure cannot clear a newer account or verification', async () => {
    const state = setup(), oldGate = state.hold();
    const old = state.connection.verify().catch(error => error);
    await oldGate.entered;
    state.connection.invalidate();
    const newGate = state.hold();
    const current = state.connection.verify();
    await newGate.entered;
    const flight = state.connection.verification;
    oldGate.release(99, 401);
    assert.equal((await old).name, 'AbortError');
    assert.equal(state.connection.verification, flight);
    newGate.release(100);
    await current;
    assert.equal(state.connection.profile.id, '100');
    assert.equal(state.connection.status.error, null);
    assert.equal(state.connection.verification, null);
  });
  await check('bindings retain identity through same-account checks and abort on account switch', async () => {
    const state = setup(); await state.connection.verify();
    const binding = state.connection.capture();
    await state.connection.verify(); binding.assertCurrent();
    assert.equal(Object.isFrozen(binding), true);
    assert.equal(Object.isFrozen(binding.courseIds), true);
    assert.deepEqual(binding.courseIds, ['1']);
    state.userId = 100;
    await state.connection.verify();
    assert.equal(binding.signal.aborted, true);
    assert.throws(binding.assertCurrent, { name: 'AbortError' });
    assert.equal(state.connection.capture().userId, '100');
  });
  await check('binding checks reject changed selections, origins and credentials', async () => {
    for (const change of [state => { state.settings.value.selectedCourseIds = ['2']; },
      state => { state.settings.value.canvasBaseUrl = 'https://other.example'; }, state => { state.connection.token = 'changed-fixture-token'; }]) {
      const state = setup(); await state.connection.verify();
      const binding = state.connection.capture(); change(state);
      assert.throws(binding.assertCurrent, { name: 'AbortError' });
    }
    const state = setup(); await state.connection.verify();
    const binding = state.connection.capture();
    state.connection.invalidate();
    assert.equal(binding.signal.aborted, true);
  });
  await check('old clients cannot read after disconnect and caller cancellation stays local', async () => {
    const state = setup(); await state.connection.verify();
    const controller = new AbortController();
    const cancelled = state.connection.client({ signal: controller.signal });
    const existing = state.connection.client();
    controller.abort();
    await assert.rejects(cancelled.read('profile'), { name: 'AbortError' });
    assert.equal(state.requests, 1);
    await existing.read('profile');
    await state.connection.disconnect();
    await assert.rejects(existing.read('profile'), { name: 'AbortError' });
    assert.equal(state.requests, 2);
  });
  await check('disconnect wins over a queued token save without restoring old credentials', async () => {
    const state = setup();
    let release;
    const blocked = state.connection.writeCredential(() => new Promise(resolve => { release = resolve; }));
    await Promise.resolve();
    const saving = state.connection.connectToken('synthetic-token-not-a-real-credential').catch(error => error);
    await state.connection.verify();
    const disconnecting = state.connection.disconnect();
    release();
    await blocked; await disconnecting;
    assert.equal((await saving).name, 'AbortError');
    assert.equal(state.connection.token, null);
    assert.equal(state.connection.profile, null);
    await assert.rejects(fs.access(state.connection.file), { code: 'ENOENT' });
  });
  await check('invalid and rounded profile IDs never establish an account', async () => {
    for (const userId of ['0', '01', 'private-invalid-id', 9007199254740992]) {
      const state = setup(); state.userId = userId;
      await assert.rejects(state.connection.verify(), /valid account profile/);
      assert.equal(state.connection.profile, null);
    }
  });
  await check('session verification waits for pending local credential cleanup', async () => {
    const state = setup();
    let release;
    const cleanup = state.connection.writeCredential(() => new Promise(resolve => { release = resolve; }));
    await Promise.resolve();
    const checking = state.connection.verify();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.requests, 0);
    release(); await cleanup; await checking;
    assert.equal(state.requests, 1);
  });
  await check('collection session watch reacts to real Electron cookie changes', async () => {
    const state = setup(); await state.connection.verify();
    const cookies = state.connection.session.cookies;
    const setCookie = async details => {
      let listener;
      const changed = new Promise(resolve => {
        listener = (_event, cookie, _cause, removed) => {
          if (!removed && cookie.name === details.name && cookie.value === details.value) { cookies.removeListener('changed', listener); resolve(); }
        };
        cookies.on('changed', listener);
      });
      try { await cookies.set(details); await changed; }
      finally { cookies.removeListener('changed', listener); }
    };
    await setCookie({ url: 'https://canvas.example', name: '_normandy_session', value: 'synthetic-cookie-one', path: '/', secure: true, httpOnly: true });
    const initialListeners = cookies.listenerCount('changed');
    const watcher = await state.connection.watchSession(state.connection.capture(), new AbortController().signal);
    await setCookie({ url: 'https://canvas.example', name: '_csrf_token', value: 'synthetic-csrf-rotation', path: '/', secure: true });
    watcher.assertCurrent(); await watcher.check();
    const aborted = new Promise(resolve => watcher.signal.addEventListener('abort', resolve, { once: true }));
    await setCookie({ url: 'https://canvas.example', name: '_normandy_session', value: 'synthetic-cookie-two', path: '/', secure: true, httpOnly: true });
    await aborted;
    assert.equal(watcher.signal.aborted, true);
    assert.equal(cookies.listenerCount('changed'), initialListeners);
    watcher.dispose();
    const replacement = await state.connection.watchSession(state.connection.capture(), new AbortController().signal);
    const removed = new Promise(resolve => replacement.signal.addEventListener('abort', resolve, { once: true }));
    await cookies.remove('https://canvas.example', '_normandy_session');
    await removed;
    assert.equal(replacement.signal.aborted, true);
    state.connection.token = 'synthetic-token-mode';
    assert.equal(await state.connection.watchSession(state.connection.capture(), new AbortController().signal), null);
  });
  return passed;
});
