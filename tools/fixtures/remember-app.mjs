import { app, safeStorage } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CanvasConnection } from '../../src/canvas-session.js';
import { CodexClient } from '../../src/codex-client.js';
import { SettingsStore } from '../../src/settings.js';
import { spawn } from 'node:child_process';

const directory = process.env.CANVAS_REMEMBER_TEST_DATA;
if (!directory || !path.isAbsolute(directory)) throw new Error('An isolated test profile is required.');
app.setPath('userData', directory);
globalThis.rememberResults = app.whenReady().then(async () => {
  const stage = process.env.CANVAS_REMEMBER_TEST_STAGE;
  const settings = new SettingsStore(directory);
  await settings.load();
  await settings.update({ canvasBaseUrl: 'https://canvas.example', selectedCourseIds: ['1'] });
  const profileResponse = async () => new Response(JSON.stringify({ id: 123, name: 'Synthetic student' }), {
    headers: { 'content-type': 'application/json', 'x-canvas-user-id': '123' },
  });
  const createCanvas = () => {
    const value = new CanvasConnection({ directory, settings, onChange: () => {} });
    value.session.fetch = profileResponse;
    return value;
  };
  const canvas = createCanvas();
  const secret = 'synthetic-session-private';
  const secrets = { encrypt: value => safeStorage.encryptString(value), decrypt: value => safeStorage.decryptString(value) };
  const planner = path.join(directory, 'planner');
  let phase = 'Canvas';
  const spawnProcess = (...args) => {
    const child = spawn(...args);
    child.stderr.on('data', bytes => { fs.appendFile(path.join(directory, 'synthetic-runtime.log'), bytes).catch(() => {}); });
    return child;
  };
  const codex = new CodexClient({ directory: planner, secrets, spawnProcess });
  try {
    if (stage === 'cleanup') { await canvas.disconnect(); await codex.logout(); return stage; }
    if (stage === 'save') {
      await canvas.session.cookies.set({ url: settings.value.canvasBaseUrl, name: '_normandy_session', value: secret, path: '/', secure: true, httpOnly: true });
      await canvas.verify();
      assert.equal((await fs.readFile(canvas.savedSession.file, 'utf8')).includes(secret), false);
      const sealed = await canvas.savedSession.read();
      assert.equal(sealed.cookies[0].value, secret);
      await canvas.session.clearStorageData(); // Simulate loss of session-only browser cookies at shutdown.
      await fs.mkdir(path.join(planner, 'codex-home'), { recursive: true });
      await fs.writeFile(codex.legacyAuth, 'synthetic-legacy-auth');
      await codex.protectLegacyLogin();
      assert.equal(await codex.legacyBackup.read(), 'synthetic-legacy-auth');
      await assert.rejects(fs.access(codex.legacyAuth), { code: 'ENOENT' });
      phase = 'save keyring'; await codex.start();
      await codex.request('account/login/start', { type: 'apiKey', apiKey: 'sk-synthetic-storage-test-not-a-real-key' });
      await codex.readAccount();
      assert.equal(codex.state.connected, true);
      await assert.rejects(fs.access(codex.legacyAuth), { code: 'ENOENT' });
      await assert.rejects(fs.access(codex.legacyBackup.file), { code: 'ENOENT' });
    } else {
      await canvas.restore();
      assert.equal(canvas.profile, null, 'Restored credentials alone must not claim connected');
      assert.equal((await canvas.session.cookies.get({ name: '_normandy_session' }))[0].value, secret);
      await canvas.verify();
      const watch = await canvas.watchSession(canvas.capture(), new AbortController().signal);
      watch.dispose();
      await canvas.disconnect();
      await assert.rejects(fs.access(canvas.savedSession.file), { code: 'ENOENT' });
      assert.equal((await canvas.session.cookies.get({})).length, 0);
      await canvas.connectToken('synthetic-api-token-private');
      assert.equal((await fs.readFile(canvas.file, 'utf8')).includes('synthetic-api-token-private'), false);
      await canvas.setRemember(false);
      canvas.session.fetch = profileResponse;
      assert.equal(canvas.session.isPersistent(), false);
      await canvas.connectToken('synthetic-memory-token-private');
      await assert.rejects(fs.access(canvas.file), { code: 'ENOENT' });
      await canvas.disconnect();
      await canvas.setRemember(true);
      await canvas.savedSession.write({ origin: settings.value.canvasBaseUrl, until: Date.now() - 1, cookies: [] });
      await canvas.restore();
      assert.equal((await canvas.session.cookies.get({})).length, 0);
      assert.match(canvas.status.error, /expired/);
      await assert.rejects(fs.access(canvas.savedSession.file), { code: 'ENOENT' });
      assert.equal(await codex.hasSavedLogin(), true);
      phase = 'restore keyring'; await codex.start();
      assert.equal(codex.state.connected, true, 'OS credential store must survive an app restart');
      await codex.logout();
      assert.equal(await codex.hasSavedLogin(), false);
      phase = 'memory-only sign-in';
      const temporary = new CodexClient({ directory: path.join(directory, 'ephemeral'), remember: false, secrets, spawnProcess });
      try {
        await temporary.start();
        await temporary.request('account/login/start', { type: 'apiKey', apiKey: 'sk-synthetic-memory-test-not-a-real-key' });
        await temporary.readAccount();
        assert.equal(temporary.state.connected, true);
      } finally { await temporary.stop(); }
      phase = 'memory-only restart';
      const restarted = new CodexClient({ directory: path.join(directory, 'ephemeral'), remember: false, secrets, spawnProcess });
      try { await restarted.start(); assert.equal(restarted.state.connected, false); }
      finally { await restarted.stop(); }
    }
    return stage;
  } catch (error) { throw new Error(`${stage}: ${phase}: ${error.message}`); }
  finally { await codex.stop(); }
});
