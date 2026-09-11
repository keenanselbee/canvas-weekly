import fs from 'node:fs/promises';
import path from 'node:path';

// Only collector metadata is accepted. Never persist headers, query strings,
// response bodies, exception messages or authentication-window URLs.
export class CanvasAudit {
  constructor(directory) {
    this.directory = path.join(directory, 'canvas-audit');
    this.pending = Promise.resolve();
  }
  async write(event) {
    const record = {
      version: 1, at: new Date().toISOString(), requestId: event.requestId,
      event: event.event, operation: event.operation, method: event.method ?? 'GET',
      origin: event.origin, path: event.path,
      paginated: Boolean(event.paginated), preservesUnread: Boolean(event.preservesUnread),
      ...(Number.isInteger(event.status) ? { status: event.status } : {}),
      ...(event.method === 'POST' ? { bodyHash: event.bodyHash } : {}),
    };
    const metadata = record.method === 'POST' && record.path === '/api/graphql'
      && ['metadataassignments', 'metadatasubmissions'].includes(record.operation) && /^[a-f0-9]{64}$/.test(record.bodyHash);
    if (!/^[a-f0-9-]{36}$/.test(record.requestId)
      || !(metadata ? ['request', 'response', 'network-error', 'body-read', 'read-error'] : ['request', 'response', 'network-error']).includes(record.event)
      || !/^[a-z]+$/.test(record.operation)
      || !/^https:\/\/[^/?#@]+$/.test(record.origin)
      || !(metadata || (record.method === 'GET' && /^\/api\/v1\/[a-z0-9/_]+$/.test(record.path)))) throw new Error('Invalid Canvas audit metadata.');
    const task = this.pending.catch(() => {}).then(async () => {
      await fs.mkdir(this.directory, { recursive: true });
      const file = await fs.open(path.join(this.directory, `${record.at.slice(0, 10)}.jsonl`), 'a');
      try { await file.writeFile(JSON.stringify(record) + '\n'); await file.sync(); }
      finally { await file.close(); }
    });
    this.pending = task;
    try { await task; }
    catch { throw new Error('Canvas request audit could not be saved. Collection stopped for this source. Check local storage and try again.'); }
  }
}
