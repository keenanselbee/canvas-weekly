import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

await fs.mkdir('.codex-temp', { recursive: true });
const directory = await fs.mkdtemp(path.resolve('.codex-temp/connection-'));
const environment = { ...process.env, CANVAS_CONNECTION_TEST_DATA: directory };
delete environment.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: ['tools/fixtures/connection-app.mjs'], env: environment });
try {
  const passed = await application.evaluate(() => globalThis.connectionFixtureResults);
  assert.equal(passed.length, 8);
  console.log('Connection checks passed: late profile success/failure, verification replacement, account/scope binding, client cancellation, queued credential removal and invalid identity rejection. Synthetic responses only.');
  console.log('Fixture profile: ' + directory);
} finally { await application.close(); }
