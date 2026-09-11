import fs from 'node:fs/promises';
import { atomicJson } from './settings.js';

// Secrets cross this boundary only in the main process, never in UI snapshots.
export class EncryptedFile {
  constructor(file, secrets) { this.file = file; this.secrets = secrets; }
  async write(value) {
    try {
      const text = JSON.stringify(value);
      const encrypted = await this.secrets.encrypt(text);
      if (await this.secrets.decrypt(encrypted) !== text) throw new Error();
      await atomicJson(this.file, { version: 1, encrypted: encrypted.toString('base64') });
    } catch { throw new Error('The login could not be saved with Windows encryption. Existing saved data has been preserved.'); }
  }
  async read() {
    try {
      const envelope = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (envelope.version !== 1 || typeof envelope.encrypted !== 'string') throw new Error();
      return JSON.parse(await this.secrets.decrypt(Buffer.from(envelope.encrypted, 'base64')));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new Error('The saved login could not be decrypted. Forget it and sign in again.');
    }
  }
  async remove() { await fs.rm(this.file, { force: true }); }
}
