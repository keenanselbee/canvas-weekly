import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { atomicJson } from './settings.js';

// A separate local history, never a Canvas progress baseline. Persist intent
// before transmission, including failed runs where no guide is produced.
export class CollectionHistory {
  constructor(directory) { this.directory = directory; this.entries = []; this.pending = Promise.resolve(); }
  accountFile(origin, userId) {
    const key = createHash('sha256').update(JSON.stringify([origin, userId])).digest('hex');
    return path.join(this.directory, `${key}.json`);
  }
  async load(origin, userId) {
    const file = this.accountFile(origin, userId);
    let entries;
    try {
      entries = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!Array.isArray(entries) || entries.some(run => !run || typeof run.id !== 'string'
        || !Number.isFinite(Date.parse(run.startedAt)) || !['running', 'interrupted', 'completed', 'failed', 'cancelled'].includes(run.status)
        || !Array.isArray(run.courses) || !Array.isArray(run.requests)
        || run.courses.some(course => !course || !/^[1-9]\d{0,31}$/.test(course.courseId) || typeof course.name !== 'string'
          || !['limited', 'expanded'].includes(course.requested) || !['limited', 'expanded'].includes(course.effective))
        || run.requests.some(request => !request || typeof request.id !== 'string' || typeof request.operation !== 'string'
          || typeof request.effect !== 'string' || !['requested', 'response', 'received', 'failed'].includes(request.outcome)
          || [request.courseId, request.itemId].some(id => id != null && (typeof id !== 'string' || !/^[1-9]\d{0,31}$/.test(id)))))) throw new Error();
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Collection history could not be read. Existing history is preserved.');
      entries = [];
    }
    this.entries = entries;
    this.file = file;
    // A run still recorded as running after restart may have reached Canvas.
    // Do not label it cancelled or imply that nothing was accessed.
    let recovered = false;
    for (const run of this.entries) if (run.status === 'running') { run.status = 'interrupted'; recovered = true; }
    if (recovered) await this.save();
    return structuredClone(this.entries);
  }
  async save() {
    const task = this.pending.then(() => atomicJson(this.file, this.entries));
    this.pending = task.catch(() => {});
    try { await task; } catch { throw new Error('Collection history could not be saved. Collection stopped.'); }
  }
  async begin(origin, userId, courses) {
    await this.load(origin, userId);
    const run = { id: randomUUID(), startedAt: new Date().toISOString(), status: 'running', courses: structuredClone(courses), requests: [] };
    this.entries.unshift(run);
    await this.save();
    return run.id;
  }
  async record(id, event) {
    const run = this.entries.find(entry => entry.id === id);
    if (!run || run.status !== 'running') throw new Error('Collection history is not ready.');
    let request = run.requests.find(entry => entry.id === event.requestId);
    if (event.event === 'request') {
      if (request) throw new Error('Duplicate collection request.');
      request = { id: event.requestId, at: new Date().toISOString(), operation: event.operation,
        courseId: event.courseId || null, itemId: event.itemId || null,
        outcome: 'requested', effect: 'No view-based effect identified in the admitted request. Server access activity may still be recorded.' };
      run.requests.push(request);
    } else {
      if (!request) throw new Error('Collection request intent is missing.');
      if (event.event === 'response') { request.outcome = 'response'; request.httpStatus = event.status; }
      else if (event.event === 'body-read') request.outcome = 'received';
      else if (['network-error', 'read-error'].includes(event.event)) request.outcome = 'failed';
    }
    await this.save();
  }
  async finish(id, status, changes = null) {
    if (!['completed', 'failed', 'cancelled'].includes(status)) throw new Error('Invalid collection result.');
    const run = this.entries.find(entry => entry.id === id);
    if (!run) throw new Error('Collection history is missing.');
    run.status = status; run.finishedAt = new Date().toISOString();
    if (Number.isSafeInteger(changes) && changes >= 0) run.changes = changes;
    await this.save();
  }
}
