import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readWindowsVersion, assertInstallerVersionAvailable } from '../tools/windows-version.mjs';

async function fixture(t, version = '0.1.1') {
  await fs.mkdir('.codex-temp', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.codex-temp/version-test-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve('.codex-temp'));
    await fs.rm(root, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version }));
  await fs.writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ version, packages: { '': { version } } }));
  return root;
}

test('Windows version uses package.json and rejects mismatched lock metadata or unsupported version forms', async t => {
  const root = await fixture(t);
  assert.equal(await readWindowsVersion(root), '0.1.1');
  for (const version of ['0.10.0', '0.1.10', '01.1.0', '1.1.0-beta', null]) {
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version }));
    await assert.rejects(readWindowsVersion(root), /single-digit/);
  }
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '11.1.1' }));
  await assert.rejects(readWindowsVersion(root), /must match/);
  await fs.writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ version: '11.1.1', packages: { '': { version: '11.1.1' } } }));
  assert.equal(await readWindowsVersion(root), '11.1.1');
});

test('existing installers in every build destination block version reuse without changing files', async t => {
  const root = await fixture(t);
  await assertInstallerVersionAvailable(root, '0.1.1');
  for (const directory of ['dist', 'dist/preview', 'dist/inno-candidate']) {
    const target = path.join(root, directory);
    await fs.mkdir(target, { recursive: true });
    const installer = path.join(target, 'Canvas-Weekly-0.1.1-x64-Setup.exe');
    await fs.writeFile(installer, 'preserve this artifact');
    await assert.rejects(assertInstallerVersionAvailable(root, '0.1.1'), /already has an installer/);
    await assertInstallerVersionAvailable(root, '0.1.2');
    assert.equal(await fs.readFile(installer, 'utf8'), 'preserve this artifact');
    await fs.unlink(installer);
  }
});
