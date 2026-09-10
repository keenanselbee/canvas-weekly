import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SettingsStore, defaults, validateSettings } from '../src/settings.js';

test('settings preserve saved appearance and serialize overlapping updates', async () => {
  const directory = await fs.mkdtemp(path.resolve('.codex-temp/settings-'));
  try {
    const store = new SettingsStore(directory);
    await store.load();
    await Promise.all([store.update({ theme: 'dark' }), store.update({ timeZone: 'UTC' })]);
    const reopened = await new SettingsStore(directory).load();
    assert.equal(reopened.theme, 'dark');
    assert.equal(reopened.timeZone, 'UTC');
    await assert.rejects(store.update({ theme: 'unknown' }));
    assert.equal((await new SettingsStore(directory).load()).theme, 'dark');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('settings reject credential-bearing origins and relative output paths', () => {
  for (const canvasBaseUrl of ['http://canvas.example', 'https://user:secret@canvas.example', 'https://canvas.example/courses']) {
    assert.throws(() => validateSettings({ ...defaults, canvasBaseUrl }));
  }
  assert.throws(() => validateSettings({ ...defaults, outputDirectory: '../outside' }));
});

await fs.mkdir('.codex-temp', { recursive: true });
