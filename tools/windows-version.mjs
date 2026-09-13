import fs from 'node:fs/promises';
import path from 'node:path';

export async function readWindowsVersion(root) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const version = manifest.version;
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.[0-9]\.[0-9]$/.test(version)) {
    throw new Error('Use MAJOR.MINOR.PATCH with single-digit MINOR and PATCH in package.json.');
  }
  if (lock.version !== version || lock.packages?.['']?.version !== version) {
    throw new Error('package-lock.json version metadata must match package.json.');
  }
  return version;
}

export async function assertInstallerVersionAvailable(root, version) {
  // These are the three existing build destinations. A completed installer is
  // preserved even when another engine or preview destination is requested.
  for (const directory of ['dist', 'dist/preview', 'dist/inno-candidate']) {
    const installer = path.join(root, directory, `Canvas-Weekly-${version}-x64-Setup.exe`);
    try { await fs.lstat(installer); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error(`Version ${version} already has an installer at ${installer}. Reuse that artifact or choose the next release version; existing installers are never overwritten.`);
  }
}
