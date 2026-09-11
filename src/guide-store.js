import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicJson } from './settings.js';
import { contentHash, renderMarkdown } from './guide.js';
import { buildStudyPlan } from './study-plan.js';

export class GuideStore {
  constructor(directory) { this.directory = directory; }
  accountKey(origin, userId) {
    return contentHash(`${origin}|${userId}`).slice(0, 24);
  }
  async load(origin, userId) {
    try {
      const result = JSON.parse(await fs.readFile(path.join(this.directory, this.accountKey(origin, userId), 'state.json'), 'utf8'));
      if (result.schemaVersion !== 1 || !Array.isArray(result.items) || !Array.isArray(result.courses)) throw new Error('Unrecognized course state format.');
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
    guide = { ...guide, studyPlan: buildStudyPlan(guide, await this.loadProgress(guide.origin, userId)) };
    const weekDirectory = path.join(outputDirectory, guide.week.start);
    const destination = path.join(weekDirectory, 'Weekly Plan.md');
    await fs.mkdir(weekDirectory, { recursive: true });
    let oldText;
    try { oldText = await fs.readFile(destination, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const markerFile = path.join(weekDirectory, '.canvas-weekly.json');
    const owner = this.accountKey(guide.origin, userId);
    let marker;
    try { marker = JSON.parse(await fs.readFile(markerFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (marker && marker.owner !== owner) throw new Error('This week folder belongs to another Canvas account. Choose a different output folder.');
    if (oldText !== undefined && (!marker || marker.hash !== contentHash(oldText))) throw new Error('Weekly Plan.md has manual edits or was created elsewhere. Preserve it under another name before updating.');
    signal?.throwIfAborted();
    const text = renderMarkdown(guide);
    if (text === oldText) {
      const saved = { ...guide, outputPath: destination };
      await atomicJson(path.join(this.directory, owner, 'state.json'), saved);
      return saved;
    }
    const temporary = path.join(weekDirectory, `.weekly-${crypto.randomUUID()}.tmp`);
    let replaced = false;
    try {
      try { await fs.writeFile(path.join(weekDirectory, 'Student Notes.md'), '# Student Notes\n\nYour notes are preserved when the weekly guide updates.\n', { flag: 'wx' }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      await fs.writeFile(temporary, text, { flag: 'wx' });
      if (oldText !== undefined) {
        const revisions = path.join(weekDirectory, 'Revisions');
        await fs.mkdir(revisions, { recursive: true });
        await fs.writeFile(path.join(revisions, `${Date.now()}-${crypto.randomUUID()}.md`), oldText, { flag: 'wx' });
      }
      signal?.throwIfAborted();
      let latest;
      try { latest = await fs.readFile(destination, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (latest !== oldText) throw new Error('The guide changed while exporting. Your edits have been preserved; try again.');
      await fs.rename(temporary, destination);
      replaced = true;
      await atomicJson(markerFile, { owner, hash: contentHash(text) });
      const saved = { ...guide, outputPath: destination };
      await atomicJson(path.join(this.directory, owner, 'state.json'), saved);
      return saved;
    } catch (error) {
      if (replaced && await fs.readFile(destination, 'utf8') === text) {
        if (oldText !== undefined) { await fs.writeFile(temporary, oldText); await fs.rename(temporary, destination); }
        else await fs.rm(destination, { force: true });
        if (marker) await atomicJson(markerFile, marker); else await fs.rm(markerFile, { force: true });
      }
      throw error;
    } finally { await fs.rm(temporary, { force: true }); }
  }
}
