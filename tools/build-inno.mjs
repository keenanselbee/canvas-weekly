import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { listPackage, extractFile } from '@electron/asar';
import { writeInstallerPayloadList } from './installer-payload.mjs';
import { readWindowsVersion, assertInstallerVersionAvailable } from './windows-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This build requires Windows x64.');
if (process.argv.length > 2) throw new Error('The candidate build has no command-line options.');
const version = await readWindowsVersion(root);
await assertInstallerVersionAvailable(root, version);
const compiler = path.join(root, '.codex-temp/inno/compiler/ISCC.exe');
await fs.access(compiler).catch(() => { throw new Error('Prepare the portable Inno Setup compiler described in docs/installer-experience.md.'); });
const environment = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  ELECTRON_BUILDER_CACHE: path.join(root, '.codex-temp/builder-cache'),
  ELECTRON_CACHE: path.join(root, '.codex-temp/electron-cache') };
for (const name of ['ELECTRON_RUN_AS_NODE', 'CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD']) delete environment[name];
const options = { cwd: root, env: environment, windowsHide: true, stdio: 'inherit', shell: false };
execFileSync(process.execPath, [path.join(root, 'node_modules/electron-builder/out/cli/cli.js'),
  '--config', 'electron-builder.json', '--config.directories.output=dist/inno-candidate',
  '--win', '--x64', '--dir', '--publish', 'never'], options);
const payload = path.join(root, 'dist/inno-candidate/win-unpacked');
const archive = path.join(payload, 'resources/app.asar');
const names = listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, ''));
if (names.some(name => !['src', 'node_modules', 'package.json'].includes(name.split('/')[0]) ||
  /(^|\/)(\.local|\.codex-temp|\.git|auth\.json|settings\.json|study-progress\.json)(\/|$)/i.test(name))) {
  throw new Error('Unexpected or private state found in the application archive.');
}
for (const file of await fs.readdir(path.join(root, 'src'), { recursive: true, withFileTypes: true })) {
  if (!file.isFile()) continue;
  const absolute = path.join(file.parentPath, file.name);
  if (!extractFile(archive, path.relative(root, absolute)).equals(await fs.readFile(absolute))) {
    throw new Error(`Packaged application source is stale: ${file.name}`);
  }
}
const payloadList = path.join(root, '.codex-temp/inno/candidate-payload.iss');
await writeInstallerPayloadList(payload, payloadList);
execFileSync(compiler, ['/Qp', `/DAppVersion=${version}`, `/DPayloadDir=${payload}`, `/DPayloadList=${payloadList}`,
  `/O${path.join(root, 'dist/inno-candidate')}`, path.join(root, 'build/windows-setup.iss')], options);
console.log('Candidate built in dist/inno-candidate. Includes guarded NSIS migration; production packaging is unchanged.');
