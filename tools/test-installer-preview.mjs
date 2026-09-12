import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This check requires Windows x64.');
const scratch = await fs.mkdtemp(path.join(root, '.codex-temp/installer-appearance-'));
const compiler = path.join(root, '.codex-temp/inno/compiler/ISCC.exe');
const script = path.join(root, 'build/installer-preview.iss');
const source = await fs.readFile(script, 'utf8');
// Keep this artifact a UI-only preview even if navigation changes later.
assert.deepEqual([...source.matchAll(/^\[([^\]]+)\]/gm)].map(match => match[1]), ['Setup', 'Messages', 'Code']);
assert.match(source, /^PrivilegesRequired=lowest$/m);
assert.match(source, /^CreateAppDir=no$/m);
assert.match(source, /^CreateUninstallRegKey=no$/m);
assert.match(source, /^Uninstallable=no$/m);
assert.doesNotMatch(source, /\b(?:Exec|ShellExec|RegWrite\w+|DeleteFile|DelTree)\s*\(/i);
const options = { cwd: root, windowsHide: true, shell: false, encoding: 'utf8', timeout: 60000 };
const registry = execFileSync('reg.exe', ['query',
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'AppsUseLightTheme'], options);
const lightSetting = /AppsUseLightTheme\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(registry);
assert.ok(lightSetting, 'Windows app appearance must be readable for this check');
const windowsDark = Number.parseInt(lightSetting[1], 16) === 0;
const registrationKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\app.canvasweekly.installer-preview_is1';
const registrationBefore = spawnSync('reg.exe', ['query', registrationKey], options);
const results = [];
for (const theme of ['dynamic', 'light', 'dark']) {
  const output = path.join(scratch, theme);
  execFileSync(compiler, ['/Qp', '/DAppVersion=0.1.0', `/DPreviewTheme=${theme}`, `/O${output}`, script], options);
  const executable = path.join(output, 'Canvas-Weekly-Setup-Preview.exe');
  for (const noStyle of theme === 'dynamic' ? [false, true] : [false]) {
    const log = path.join(output, noStyle ? 'unstyled.log' : 'appearance.log');
    const destination = path.join(output, 'must-not-install');
    const result = spawnSync(executable, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/SP-', '/NORESTART',
      `/DIR=${destination}`, `/LOG=${log}`, ...(noStyle ? ['/NOSTYLE'] : [])], options);
    assert.ifError(result.error);
    assert.equal(result.status, 1, 'UI-only preview must abort navigation before installation');
    const text = await fs.readFile(log, 'utf8');
    const state = /CW_PREVIEW dark=(\d) windowsDark=(\d) highContrast=(\d) copies=(\d+)/.exec(text);
    assert.ok(state, 'Native installer must report its actual theme state');
    const [, dark, detectedWindowsDark, highContrast, copies] = state.map(Number);
    assert.equal(Boolean(detectedWindowsDark), windowsDark);
    const expectedDark = !noStyle && !highContrast && (theme === 'dark' || (theme === 'dynamic' && windowsDark));
    assert.equal(Boolean(dark), expectedDark, `${theme}: installer theme must match the requested mode`);
    await assert.rejects(fs.access(destination), { code: 'ENOENT' });
    results.push({ theme, noStyle, dark: Boolean(dark), windowsDark, highContrast: Boolean(highContrast), copies, exitCode: result.status });
  }
}
const registrationAfter = spawnSync('reg.exe', ['query', registrationKey], options);
assert.equal(registrationAfter.status, registrationBefore.status);
assert.equal(registrationAfter.stdout, registrationBefore.stdout);
console.log(JSON.stringify({ results, scratch }, null, 2));
