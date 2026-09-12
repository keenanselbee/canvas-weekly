import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { writeInstallerPayloadList } from './installer-payload.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This check requires Windows x64.');
if (process.argv.slice(2).some(arg => arg !== '--payload')) throw new Error('Only --payload is supported.');
const fullPayload = process.argv.includes('--payload');
const scratch = await fs.mkdtemp(path.join(root, '.codex-temp/setup-lifecycle-'));
const install = path.join(scratch, 'install');
const profile = path.join(scratch, 'saved-settings');
// Keep the identity short: Inno hashes long AppIds in uninstall registry keys.
const setupId = `cw.fixture.${randomUUID()}`;
const registryKey = path.win32.join('HKCU', 'Software', 'Microsoft', 'Windows', 'CurrentVersion', 'Uninstall', `${setupId}_is1`);
const legacyKey = path.win32.join('HKCU', 'Software', 'Microsoft', 'Windows', 'CurrentVersion', 'Uninstall', `${setupId}-legacy`);
const compiler = path.join(root, '.codex-temp/inno/compiler/ISCC.exe');
const options = { cwd: root, windowsHide: true, shell: false, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 };
assert.equal(spawnSync('reg.exe', ['query', registryKey], options).status, 1, 'A test must never reuse an existing registration');
assert.equal(spawnSync('reg.exe', ['query', legacyKey], options).status, 1);
const payload = fullPayload ? path.join(root, 'dist/inno-candidate/win-unpacked') : path.join(scratch, 'payload');
if (!fullPayload) {
  await fs.mkdir(payload);
  await fs.writeFile(path.join(payload, 'Canvas Weekly.exe'), 'fixture application version one');
  await fs.mkdir(path.join(payload, 'resources'));
  await fs.writeFile(path.join(payload, 'resources/content.txt'), 'application resource');
}
await fs.access(path.join(payload, 'Canvas Weekly.exe'));
await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'settings.json'), '{"fixture":"preserve me"}');
const versions = fullPayload ? ['0.1.0'] : ['0.1.0', '0.1.1', '0.0.9'];
const executables = new Map();
const payloadList = path.join(scratch, 'payload.iss');
await writeInstallerPayloadList(payload, payloadList);
for (const version of versions) {
  execFileSync(compiler, ['/Qp', `/DAppVersion=${version}`, `/DPayloadDir=${payload}`, `/DPayloadList=${payloadList}`, `/DSetupId=${setupId}`,
    `/DLegacyId=${setupId}-legacy`, '/DFixtureBuild=1', `/O${scratch}`, path.join(root, 'build/windows-setup.iss')],
  { ...options, timeout: 300000 });
  executables.set(version, path.join(scratch, `Canvas-Weekly-${version}-x64-Setup.exe`));
}
function run(version, name, extra = []) {
  const log = path.join(scratch, `${name}.log`);
  const result = spawnSync(executables.get(version), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/SP-', '/NORESTART',
    `/DIR=${install}`, `/LOG=${log}`, ...extra], { ...options, timeout: 120000 });
  assert.ifError(result.error);
  return result.status;
}
async function hash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function assertPreserved() {
  assert.equal(await fs.readFile(path.join(profile, 'settings.json'), 'utf8'), '{"fixture":"preserve me"}');
  assert.equal(await fs.readFile(path.join(install, 'my-study-guide.md'), 'utf8'), 'student-owned guide');
}
try {
  // Incomplete synthetic legacy metadata must not authorize a migration.
  execFileSync('reg.exe', ['add', legacyKey, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', 'Canvas Weekly fixture', '/f'], options);
  assert.equal(run('0.1.0', 'legacy-block'), 1);
  assert.match(await fs.readFile(path.join(scratch, 'legacy-block.log'), 'utf8'), /legacy-registration-invalid/);
  await assert.rejects(fs.access(install), { code: 'ENOENT' });
  execFileSync('reg.exe', ['delete', legacyKey, '/f'], options);
  assert.equal(run('0.1.0', 'first-install'), 0);
  const registration = execFileSync('reg.exe', ['query', registryKey], options);
  assert.ok(registration.includes(install), 'Native registration must point to the isolated installation');
  assert.match(await fs.readFile(path.join(scratch, 'first-install.log'), 'utf8'), /admin=0/);
  let checked = 0;
  for (const file of await fs.readdir(payload, { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue;
    const original = path.join(file.parentPath, file.name);
    assert.equal(await hash(path.join(install, path.relative(payload, original))), await hash(original));
    checked++;
  }
  await fs.writeFile(path.join(install, 'my-study-guide.md'), 'student-owned guide');
  if (fullPayload) {
    const { _electron: electron } = await import('playwright');
    const appProfile = path.join(scratch, 'app-profile');
    const environment = { ...process.env, CANVAS_WEEKLY_TEST: '1', CANVAS_WEEKLY_TEST_PROFILE: appProfile };
    delete environment.ELECTRON_RUN_AS_NODE;
    const application = await electron.launch({ executablePath: path.join(install, 'Canvas Weekly.exe'), env: environment });
    try {
      const actual = await application.evaluate(({ app, nativeTheme }) => ({
        packaged: app.isPackaged, profile: app.getPath('userData'), dark: nativeTheme.shouldUseDarkColors }));
      assert.equal(actual.packaged, true);
      assert.equal(actual.profile, appProfile);
      const page = await application.firstWindow();
      const state = await page.evaluate(() => window.canvasWeekly.getState());
      assert.equal(state.canvas.connected, false);
      assert.equal(state.ai.connected, false);
      assert.equal(state.ai.runtime.source, 'bundled');
      assert.equal(state.guide, null);
      assert.equal(state.appearance.source, 'system');
      assert.equal(state.appearance.dark, actual.dark);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      for (const theme of ['dark', 'light', 'system']) {
        await page.getByLabel('Theme', { exact: true }).selectOption(theme);
        const expected = theme === 'dark' ? 'assets/mark-dark.svg' : 'assets/mark.svg';
        await page.waitForFunction(expected => {
          const image = document.querySelector('.brand-icon');
          return image.getAttribute('src') === expected && image.complete && image.naturalWidth > 0;
        }, expected);
      }
    } finally { await application.close(); }
  }
  if (!fullPayload) {
    await fs.unlink(path.join(install, 'Canvas Weekly.exe'));
    assert.equal(run('0.1.0', 'reinstall-missing-file'), 0);
    assert.equal(await fs.readFile(path.join(install, 'Canvas Weekly.exe'), 'utf8'), 'fixture application version one');
    await assertPreserved();
    assert.equal(run('0.1.1', 'upgrade'), 0);
    assert.ok([1, 7].includes(run('0.0.9', 'downgrade')), 'Downgrade must abort navigation or fail the pre-install guard');
    assert.match(execFileSync('reg.exe', ['query', registryKey, '/v', 'DisplayVersion'], options), /0\.1\.1/);
    const redirect = path.join(scratch, 'must-not-relocate');
    assert.equal(run('0.1.1', 'relocate', [`/DIR=${redirect}`]), 0);
    await assert.rejects(fs.access(redirect), { code: 'ENOENT' });
    assert.ok(execFileSync('reg.exe', ['query', registryKey, '/v', 'InstallLocation'], options).includes(install));
    await assertPreserved();
  }
  const uninstall = path.join(install, '.setup/unins000.exe');
  const result = spawnSync(uninstall, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], options);
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  await assertPreserved();
  await assert.rejects(fs.access(path.join(install, 'Canvas Weekly.exe')), { code: 'ENOENT' });
  assert.equal(spawnSync('reg.exe', ['query', registryKey], options).status, 1);
  if (!fullPayload) {
    const locationKey = path.win32.join('HKCU', 'Software', `${setupId}-legacy`);
    const legacyExecutable = path.join(install, 'Uninstall Canvas Weekly.exe');
    const legacyBackup = path.join(install, '.setup/legacy-uninstaller.bin');
    const legacyCommand = `"${legacyExecutable}" /currentuser`;
    const setValue = (key, name, value) => execFileSync('reg.exe', ['add', key, '/v', name, '/t', 'REG_SZ', '/d', value, '/f'], options);
    assert.equal(spawnSync('reg.exe', ['query', locationKey], options).status, 1);
    try {
      await fs.writeFile(path.join(install, 'Canvas Weekly.exe'), 'old application');
      await fs.writeFile(legacyExecutable, 'earlier uninstaller must never execute');
      setValue(legacyKey, 'DisplayName', 'Canvas Weekly 0.1.0');
      setValue(legacyKey, 'DisplayVersion', '0.1.0');
      setValue(legacyKey, 'UninstallString', legacyCommand + ' /unexpected');
      setValue(locationKey, 'InstallLocation', install);
      assert.equal(run('0.1.0', 'legacy-command-rejected'), 1);
      assert.equal(await fs.readFile(legacyExecutable, 'utf8'), 'earlier uninstaller must never execute');
      setValue(legacyKey, 'UninstallString', legacyCommand);
      assert.ok([1, 7].includes(run('0.0.9', 'legacy-downgrade')));
      assert.equal(await fs.readFile(legacyExecutable, 'utf8'), 'earlier uninstaller must never execute');
      const junctionTarget = path.join(scratch, 'junction-target');
      await fs.mkdir(junctionTarget);
      const junction = path.join(install, '.setup');
      await fs.symlink(junctionTarget, junction, 'junction');
      try {
        assert.equal(run('0.1.0', 'legacy-junction-rejected'), 7);
        assert.equal(await fs.readFile(legacyExecutable, 'utf8'), 'earlier uninstaller must never execute');
      } finally { await fs.rmdir(junction); }
      assert.equal(run('0.1.0', 'legacy-rollback', ['/FAILAFTERBACKUP=1']), 7);
      assert.match(await fs.readFile(path.join(scratch, 'legacy-rollback.log'), 'utf8'), /legacy-uninstaller-restored/);
      assert.equal(await fs.readFile(legacyExecutable, 'utf8'), 'earlier uninstaller must never execute');
      assert.equal(await fs.readFile(path.join(install, 'Canvas Weekly.exe'), 'utf8'), 'old application');
      assert.equal(spawnSync('reg.exe', ['query', registryKey], options).status, 1);
      assert.equal(spawnSync('reg.exe', ['query', legacyKey], options).status, 0);
      await assertPreserved();
      assert.notEqual(run('0.1.0', 'legacy-copy-rollback', ['/FAILCOPY=1']), 0);
      assert.equal(await fs.readFile(legacyExecutable, 'utf8'), 'earlier uninstaller must never execute');
      assert.equal(await fs.readFile(path.join(install, 'Canvas Weekly.exe'), 'utf8'), 'old application');
      assert.equal(spawnSync('reg.exe', ['query', registryKey], options).status, 1);
      assert.equal(spawnSync('reg.exe', ['query', legacyKey], options).status, 0);
      await assertPreserved();
      assert.equal(run('0.1.0', 'legacy-migration'), 0);
      assert.match(await fs.readFile(path.join(scratch, 'legacy-migration.log'), 'utf8'), /legacy-migration-complete/);
      await assert.rejects(fs.access(legacyExecutable), { code: 'ENOENT' });
      await assert.rejects(fs.access(legacyBackup), { code: 'ENOENT' });
      assert.equal(spawnSync('reg.exe', ['query', legacyKey], options).status, 1);
      assert.equal(spawnSync('reg.exe', ['query', locationKey], options).status, 1);
      await assertPreserved();
      const migratedUninstall = spawnSync(path.join(install, '.setup/unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], options);
      assert.equal(migratedUninstall.status, 0);
      assert.equal(spawnSync('reg.exe', ['query', registryKey], options).status, 1);
      await assertPreserved();
    } finally {
      if (spawnSync('reg.exe', ['query', locationKey], options).status === 0) execFileSync('reg.exe', ['delete', locationKey, '/f'], options);
    }
  }
  console.log(JSON.stringify({ fullPayload, filesVerified: checked, installed: true, uninstalled: true,
    preservedGuideAndSettings: true, scratch }, null, 2));
} finally {
  if (spawnSync('reg.exe', ['query', legacyKey], options).status === 0) execFileSync('reg.exe', ['delete', legacyKey, '/f'], options);
  {
    // Only this run's unique registration and exact repository fixture may be cleaned up.
    const state = spawnSync('reg.exe', ['query', registryKey, '/v', 'InstallLocation'], options);
    if (state.status === 0 && state.stdout.includes(install)) {
      const result = spawnSync(path.join(install, '.setup/unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], options);
      if (result.status !== 0) console.error(`Fixture cleanup needs review: ${scratch}`);
    }
  }
}
