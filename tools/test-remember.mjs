import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

await fs.mkdir('.codex-temp', { recursive: true });
const directory = await fs.mkdtemp(path.resolve('.codex-temp/remember-'));
async function run(stage) {
  const env = { ...process.env, CANVAS_REMEMBER_TEST_DATA: directory, CANVAS_REMEMBER_TEST_STAGE: stage };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({ args: ['tools/fixtures/remember-app.mjs'], env });
  try { assert.equal(await application.evaluate(() => globalThis.rememberResults), stage); }
  finally { await application.close(); }
}
try { await run('save'); await run('restore'); }
catch (error) { try { await run('cleanup'); } catch { console.error('Synthetic credential cleanup needs a retry for ' + directory); } throw error; }
console.log('Remember-login checks passed: Windows-encrypted Canvas session/token, cold restart, expiry, forgetting, memory-only Canvas and Codex, OS credential-store restart, legacy encryption. Synthetic credentials only.');
