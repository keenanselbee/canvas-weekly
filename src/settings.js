import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const defaults = {
  schemaVersion: 1,
  theme: 'system',
  outputDirectory: null,
  canvasBaseUrl: 'https://canvas.ubc.ca',
  timeZone: 'America/Vancouver',
  selectedCourseIds: [],
};

export function validateSettings(value) {
  if (!value || value.schemaVersion !== 1) throw new Error('Unsupported settings version.');
  if (!['system', 'light', 'dark'].includes(value.theme)) throw new Error('Choose System, Light, or Dark.');
  if (value.outputDirectory !== null && (typeof value.outputDirectory !== 'string' || !path.isAbsolute(value.outputDirectory))) {
    throw new Error('Choose an absolute output folder.');
  }
  const origin = new URL(value.canvasBaseUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Enter the Canvas HTTPS address without a page path.');
  }
  new Intl.DateTimeFormat('en', { timeZone: value.timeZone }).format();
  if (!Array.isArray(value.selectedCourseIds) || !value.selectedCourseIds.every(id => /^\d+$/.test(id))) {
    throw new Error('Invalid course selection.');
  }
  return value;
}

export async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export class SettingsStore {
  constructor(directory) {
    this.file = path.join(directory, 'settings.json');
    this.value = structuredClone(defaults);
    this.pending = Promise.resolve();
  }
  async load() {
    try {
      this.value = validateSettings(JSON.parse(await fs.readFile(this.file, 'utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Settings could not be loaded. Your existing settings have been preserved.', { cause: error });
    }
    return this.value;
  }
  async update(patch) {
    const operation = this.pending.then(async () => {
      const next = validateSettings({ ...this.value, ...patch });
      await atomicJson(this.file, next);
      this.value = next;
      return next;
    });
    this.pending = operation.catch(() => {});
    return operation;
  }
}
