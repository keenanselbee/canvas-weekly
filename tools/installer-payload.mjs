import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeInstallerPayloadList(payload, output) {
  const lines = [];
  for (const entry of await fs.readdir(payload, { recursive: true, withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Installer payload must not contain links.');
    if (!entry.isFile()) continue;
    const relative = path.relative(payload, path.join(entry.parentPath, entry.name));
    if (relative.startsWith('..') || path.isAbsolute(relative) || /[\r\n]/.test(relative) || relative.split(path.sep)[0] === '.setup') {
      throw new Error('Invalid installer payload path.');
    }
    lines.push(`PayloadFiles.Add('${relative.replaceAll("'", "''")}');`);
  }
  if (!lines.length) throw new Error('The installer payload is empty.');
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, lines.sort().join('\n') + '\n');
}
