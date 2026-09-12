import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This build currently requires Windows x64.');
if (process.argv.slice(2).some(value => !['--dir', '--preview'].includes(value))) throw new Error('Only --dir and --preview are supported; publishing is disabled.');
const environment = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  ELECTRON_BUILDER_CACHE: path.join(root, '.codex-temp', 'builder-cache'),
  ELECTRON_CACHE: path.join(root, '.codex-temp', 'electron-cache') };
delete environment.ELECTRON_RUN_AS_NODE;
for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD']) delete environment[name];
await fs.mkdir(environment.ELECTRON_BUILDER_CACHE, { recursive: true });
const child = spawn(process.execPath, [path.join(root, 'node_modules/electron-builder/out/cli/cli.js'),
  '--config', 'electron-builder.json', '--win', '--x64', '--publish', 'never',
  ...(process.argv.includes('--preview') ? ['--config.directories.output=dist/preview'] : []),
  ...(process.argv.includes('--dir') ? ['--dir'] : [])],
{ cwd: root, env: environment, stdio: 'inherit', windowsHide: true, shell: false });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
