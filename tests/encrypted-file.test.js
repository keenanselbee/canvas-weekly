import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { EncryptedFile } from '../src/encrypted-file.js';

test('encrypted writes round-trip before replacing saved data and sanitize failures', async () => {
  const directory = await fs.mkdtemp(path.resolve('.codex-temp/encrypted-'));
  const sealed = new Map();
  const secrets = { encrypt: text => { const key = crypto.randomUUID(); sealed.set(key, text); return Buffer.from(key); }, decrypt: buffer => sealed.get(buffer.toString()) };
  const store = new EncryptedFile(path.join(directory, 'login.json'), secrets);
  try {
    assert.equal(await store.read(), null);
    await store.write({ password: 'private-fixture' });
    const before = await fs.readFile(store.file);
    assert.equal(before.includes('private-fixture'), false);
    assert.deepEqual(await store.read(), { password: 'private-fixture' });
    secrets.encrypt = () => { throw Error('private-system-detail'); };
    await assert.rejects(store.write({ password: 'new' }), error => !error.message.includes('private-system-detail'));
    assert.deepEqual(await fs.readFile(store.file), before);
    secrets.decrypt = () => { throw Error('private-key-detail'); };
    await assert.rejects(store.read(), error => !error.message.includes('private-key-detail'));
    await store.remove(); assert.equal(await store.read(), null);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
