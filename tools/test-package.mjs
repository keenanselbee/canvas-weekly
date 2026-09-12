import { _electron as electron } from 'playwright';
import { listPackage, extractFile } from '@electron/asar';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { word, pdf } from './document-fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = path.join(root, 'dist', 'win-unpacked');
const archive = path.join(packaged, 'resources', 'app.asar');
const names = listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, ''));
assert.ok(names.every(name => ['src', 'node_modules', 'package.json'].includes(name.split('/')[0])), 'Only application sources and production modules belong in the archive');
assert.ok(!names.some(name => /(^|\/)(\.local|\.codex-temp|\.git|auth\.json|settings\.json|study-progress\.json)(\/|$)/i.test(name)), 'Private state must not be packaged');
for (const name of ['playwright', 'electron-builder', '@electron/asar']) assert.ok(!names.includes(`node_modules/${name}/package.json`), `${name} must stay development-only`);
const manifest = JSON.parse(extractFile(archive, 'package.json'));
assert.equal(manifest.name, 'canvas-weekly');
for (const file of await fs.readdir(path.join(root, 'src'), { recursive: true, withFileTypes: true })) {
  if (!file.isFile()) continue;
  const absolute = path.join(file.parentPath, file.name);
  const relative = path.relative(root, absolute).replaceAll('\\', '/');
  assert.deepEqual(extractFile(archive, path.normalize(relative)), await fs.readFile(absolute), `Packaged source is stale: ${relative}`);
}
const binary = 'node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe';
assert.ok(names.includes(binary), 'The matching Codex platform package must be included');
assert.ok((await fs.stat(path.join(packaged, 'resources', 'app.asar.unpacked', binary))).size > 1000000);
const scratch = path.join(root, '.codex-temp');
await fs.mkdir(scratch, { recursive: true });
const profile = await fs.mkdtemp(path.join(scratch, 'package-test-'));
assert.equal(path.dirname(profile), scratch);
const sevenZip = (await fs.readdir(path.join(scratch, 'builder-cache'), { recursive: true, withFileTypes: true })).find(file => file.isFile() && file.name === '7za.exe');
assert.ok(sevenZip, 'Build the installer first to provide the cached archive verifier');
const installer = path.join(root, 'dist', `Canvas-Weekly-${manifest.version}-x64-Setup.exe`);
const payload = path.join(profile, 'payload');
await promisify(execFile)(path.join(sevenZip.parentPath, sevenZip.name), ['x', installer, 'resources\\app.asar', `resources\\app.asar.unpacked\\${binary.replaceAll('/', '\\')}`, 'Canvas Weekly.exe', `-o${payload}`, '-y'], { windowsHide: true, maxBuffer: 1024 * 1024 });
async function hash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
for (const relative of ['resources/app.asar', `resources/app.asar.unpacked/${binary}`, 'Canvas Weekly.exe']) {
  assert.equal(await hash(path.join(payload, relative)), await hash(path.join(packaged, relative)), `Installer payload differs from tested application: ${relative}`);
}
const environment = { ...process.env, CANVAS_WEEKLY_TEST: '1', CANVAS_WEEKLY_TEST_PROFILE: profile };
delete environment.ELECTRON_RUN_AS_NODE;
const executablePath = path.join(packaged, 'Canvas Weekly.exe');
let application = await electron.launch({ executablePath, env: environment });
try {
  const actual = await application.evaluate(({ app }) => ({ packaged: app.isPackaged, profile: app.getPath('userData'), name: app.getName() }));
  assert.equal(actual.packaged, true);
  assert.equal(actual.profile, profile);
  const page = await application.firstWindow();
  await page.getByRole('heading', { name: 'Know what to focus on. Keep the details close.' }).waitFor();
  const state = await page.evaluate(() => window.canvasWeekly.getState());
  assert.equal(state.canvas.connected, false);
  assert.equal(state.ai.connected, false);
  assert.equal(state.ai.runtime.detected, true);
  assert.equal(state.ai.runtime.source, 'bundled');
  assert.equal(state.ai.available, false, 'Runtime detection must not launch it');
  assert.equal(state.guide, null);
  assert.equal(state.canvas.collectionIssue, null);
  assert.match(state.canvas.collectionNotice, /Course messages, syllabus text and rubric criteria are checked when available/);
  assert.match(state.canvas.collectionNotice, /Assignment instructions and other materials remain incomplete/);
  await assert.rejects(page.evaluate(() => window.canvasWeekly.updateGuide()), /Connect Canvas/);
  assert.equal(state.settings.lastGuideAccount, null);
  assert.equal(state.settings.outputDirectory, null);
  assert.equal(state.settings.aiEnabled, false);
  assert.equal(state.reading.available, false, 'Pending expanded reading must not become active in the package');
  assert.deepEqual(state.settings.courseReading, []);
  assert.deepEqual(state.collectionHistory, []);
  assert.equal(state.canvas.canForget, false);
  assert.equal(state.ai.canForget, false);
  await page.getByRole('button', { name: 'Data & privacy', exact: true }).click();
  await page.getByRole('heading', { name: 'Data & privacy', exact: true }).waitFor();
  assert.match(await page.locator('#privacy-sharing-status').textContent(), /Study suggestions: Off/);
  assert.match(await page.locator('main').textContent(), /rubric criterion text/);
  assert.match(await page.locator('#collection-history').textContent(), /No collection runs recorded/);
  await page.getByRole('button', { name: 'Manage saved logins', exact: true }).click();
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Forget Canvas login', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Forget ChatGPT login', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'This week', exact: true }).click();
  for (const [type, bytes] of [['pdf', pdf()], ['docx', await word('Supplementary reading is optional.')]]) {
    const content = await application.evaluate(async ({ app }, { type, bytes }) => {
      const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/src/document-reader.js');
      return require('./document-reader.js').readDocument(Buffer.from(bytes), type);
    }, { type, bytes: [...bytes] });
    assert.match(content.text, /Supplementary reading is optional/);
  }
  const desktop = await application.evaluate(({ app }) => app.getPath('desktop'));
  assert.equal(state.outputDirectory, path.join(desktop, 'Canvas Weekly'));
  const runtime = await application.evaluate(({ app }) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/src/codex-client.js');
    const { CodexClient } = require('./codex-client.js');
    return new CodexClient({ directory: app.getPath('userData') + '/planner' }).executable;
  });
  assert.equal(path.normalize(runtime), path.join(packaged, 'resources', 'app.asar.unpacked', binary));
  // Exercise the actual bundled binary through the app's named IPC. No account,
  // login, planning request or inherited API-key fallback is involved.
  const ai = await page.evaluate(() => window.canvasWeekly.checkChatGPT());
  assert.equal(ai.ai.available, true);
  assert.equal(ai.ai.connected, false);
  await application.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setTitle('Canvas Weekly — package check'); window.showInactive(); });
  await page.evaluate(() => window.canvasWeekly.setTheme('light'));
  await page.locator('html[data-theme="light"]').waitFor();
  await page.screenshot({ path: path.join(profile, 'first-run-light.png') });
  await page.evaluate(() => window.canvasWeekly.setTheme('dark'));
  await page.locator('html[data-theme="dark"]').waitFor();
  await page.screenshot({ path: path.join(profile, 'first-run-dark.png') });
  await application.close();
  application = await electron.launch({ executablePath, env: environment });
  const restarted = await application.firstWindow();
  await restarted.locator('html[data-theme="dark"]').waitFor();
  assert.equal((await restarted.evaluate(() => window.canvasWeekly.getState())).settings.theme, 'dark');
  console.log(JSON.stringify({ result: 'Packaged app passed: source inventory, no private state, matching installer payload, PDF/Word reader workers, fresh profile, privacy/history and safe defaults, contextual Forget controls, Desktop default, bundled Codex initialization, theme rendering and restart persistence.', profile, installerSHA256: await hash(installer) }));
} finally { await application.close(); }
