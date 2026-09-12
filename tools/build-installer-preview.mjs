import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('The installer preview requires Windows x64.');
if (process.argv.length > 2) throw new Error('The installer preview has no command-line options.');
const compiler = path.join(root, '.codex-temp/inno/compiler/ISCC.exe');
await fs.access(compiler).catch(() => { throw new Error('Missing portable Inno Setup 7.1.0 x64 compiler. See docs/installer-experience.md.'); });
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A numeric release version is required.');
execFileSync(compiler, ['/Qp', `/DAppVersion=${version}`,
  `/O${path.join(root, 'dist/installer-prototype')}`, path.join(root, 'build/installer-preview.iss')],
{ cwd: root, stdio: 'inherit', windowsHide: true, shell: false });
console.log('UI-only preview: dist/installer-prototype/Canvas-Weekly-Setup-Preview.exe (does not install the app).');
