import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicJson } from './settings.js';
import { contentHash, renderMarkdown } from './guide.js';
import { buildStudyPlan } from './study-plan.js';
import { renderHtml } from './guide-html.js';
import { renderWord, wordInputHash } from './guide-word.js';
import { restoreLegacyEvidence } from './course-evidence.js';
import { renderEvidencePack } from './evidence-pack.js';

const sameBytes = (a, b) => a === undefined || b === undefined ? a === b : a.equals(b);

export class GuideStore {
  constructor(directory) { this.directory = directory; }
  accountKey(origin, userId) {
    return contentHash(`${origin}|${userId}`).slice(0, 24);
  }
  async load(origin, userId) {
    try {
      let result = JSON.parse(await fs.readFile(path.join(this.directory, this.accountKey(origin, userId), 'state.json'), 'utf8'));
      if (result.schemaVersion !== 1 || !Array.isArray(result.items) || !Array.isArray(result.courses)) throw new Error('Unrecognized course state format.');
      result = restoreLegacyEvidence(result);
      result.studyPlan = buildStudyPlan(result, await this.loadProgress(origin, userId));
      return result;
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async loadProgress(origin, userId) {
    try {
      const result = JSON.parse(await fs.readFile(path.join(this.directory, this.accountKey(origin, userId), 'study-progress.json'), 'utf8'));
      if (result.version !== 1 || !result.tasks || typeof result.tasks !== 'object' || Array.isArray(result.tasks)) throw new Error('Unrecognized study progress format.');
      return result.tasks;
    } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  async setTaskDone(origin, userId, taskId, done) {
    if (typeof taskId !== 'string' || typeof done !== 'boolean') throw new Error('Choose a study task and completion state.');
    const guide = await this.load(origin, userId);
    const task = guide?.studyPlan.tasks.find(task => task.id === taskId);
    if (!task) throw new Error('Choose a study task from your saved guide.');
    const progress = await this.loadProgress(origin, userId);
    progress[task.id] = { done, fingerprint: task.fingerprint, updatedAt: new Date().toISOString() };
    await atomicJson(path.join(this.directory, this.accountKey(origin, userId), 'study-progress.json'), { version: 1, tasks: progress });
    guide.studyPlan = buildStudyPlan(guide, progress);
    return guide;
  }
  async export(guide, outputDirectory, userId, signal) {
    guide = restoreLegacyEvidence(guide);
    guide = { ...guide, studyPlan: buildStudyPlan(guide, await this.loadProgress(guide.origin, userId)) };
    const weekDirectory = path.join(outputDirectory, guide.week.start);
    await fs.mkdir(weekDirectory, { recursive: true });
    const markerFile = path.join(weekDirectory, '.canvas-weekly.json');
    const owner = this.accountKey(guide.origin, userId);
    let marker;
    try { marker = JSON.parse(await fs.readFile(markerFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (marker && marker.owner !== owner) throw new Error('This week folder belongs to another Canvas account. Choose a different output folder.');
    const files = [
      { name: 'Weekly Plan.md', hashKey: 'hash', bytes: Buffer.from(renderMarkdown(guide)) },
      { name: 'Weekly Plan.html', hashKey: 'htmlHash', bytes: Buffer.from(renderHtml(guide)) },
      { name: 'Weekly Plan.docx', hashKey: 'wordHash' },
      { name: 'Course Information.md', hashKey: 'evidenceHash', bytes: Buffer.from(renderEvidencePack(guide)) },
    ];
    for (const file of files) {
      file.destination = path.join(weekDirectory, file.name);
      file.temporary = path.join(weekDirectory, `.weekly-${crypto.randomUUID()}.tmp`);
      try { file.oldBytes = await fs.readFile(file.destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (file.oldBytes !== undefined && (!marker || marker[file.hashKey] !== contentHash(file.oldBytes))) throw new Error(`${file.name} has manual edits or was created elsewhere. Preserve it under another name before updating.`);
    }
    signal?.throwIfAborted();
    const inputHash = wordInputHash(guide);
    // DOCX ZIP metadata varies per render. Reuse verified bytes for identical input.
    files[2].bytes = files[2].oldBytes !== undefined && marker?.wordInputHash === inputHash ? files[2].oldBytes : await renderWord(guide);
    const changed = files.filter(file => !sameBytes(file.bytes, file.oldBytes));
    signal?.throwIfAborted();
    let markerWritten = false;
    try {
      try { await fs.writeFile(path.join(weekDirectory, 'Student Notes.md'), '# Student Notes\n\nYour notes are preserved when the weekly guide updates.\n', { flag: 'wx' }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      const revision = `${Date.now()}-${crypto.randomUUID()}`;
      for (const file of changed) {
        await fs.writeFile(file.temporary, file.bytes, { flag: 'wx' });
        if (file.oldBytes !== undefined) {
          const revisions = path.join(weekDirectory, 'Revisions');
          await fs.mkdir(revisions, { recursive: true });
          await fs.writeFile(path.join(revisions, `${revision}-${file.name}`), file.oldBytes, { flag: 'wx' });
        }
      }
      signal?.throwIfAborted();
      for (const file of files) {
        let latest;
        try { latest = await fs.readFile(file.destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (!sameBytes(latest, file.oldBytes)) throw new Error('The guide changed while exporting. Your edits have been preserved; try again.');
      }
      for (const file of changed) {
        await fs.rename(file.temporary, file.destination);
        file.replaced = true;
      }
      if (changed.length) {
        await atomicJson(markerFile, { owner, wordInputHash: inputHash, ...Object.fromEntries(files.map(file => [file.hashKey, contentHash(file.bytes)])) });
        markerWritten = true;
      }
      const saved = { ...guide, outputPath: files[0].destination, documentPath: files[1].destination, wordPath: files[2].destination, evidencePath: files[3].destination };
      await atomicJson(path.join(this.directory, owner, 'state.json'), saved);
      return saved;
    } catch (error) {
      for (const file of changed.filter(file => file.replaced).reverse()) {
        if (!sameBytes(await fs.readFile(file.destination).catch(() => undefined), file.bytes)) continue;
        if (file.oldBytes !== undefined) { await fs.writeFile(file.temporary, file.oldBytes); await fs.rename(file.temporary, file.destination); }
        else await fs.rm(file.destination, { force: true });
      }
      if (markerWritten) { if (marker) await atomicJson(markerFile, marker); else await fs.rm(markerFile, { force: true }); }
      throw error;
    } finally { for (const file of changed) await fs.rm(file.temporary, { force: true }); }
  }
}
