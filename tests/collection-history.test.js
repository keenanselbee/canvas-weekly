import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CollectionHistory } from '../src/collection-history.js';
import { readingSelection, validateReadingPreferences } from '../src/reading-policy.js';

test('reading permission stays account scoped and cannot enable unreviewed reads', () => {
  const courseReading = [{ origin: 'https://canvas.example.edu', userId: '1', courseIds: ['9'], version: 1 }];
  validateReadingPreferences(courseReading);
  assert.deepEqual(readingSelection({ courseReading }, courseReading[0].origin, '1', ['9']), [{ courseId: '9', requested: 'expanded', effective: 'limited' }]);
  assert.equal(readingSelection({ courseReading }, courseReading[0].origin, '2', ['9'])[0].requested, 'limited');
  assert.throws(() => validateReadingPreferences([{ ...courseReading[0], courseIds: ['../take'] }]));
  assert.throws(() => validateReadingPreferences([{ ...courseReading[0], version: 2 }]));
});

test('history retains transmitted intent across failures, restarts and account switches without secrets', async () => {
  await fs.mkdir('.codex-temp', { recursive: true });
  const directory = await fs.mkdtemp(path.resolve('.codex-temp/history-'));
  const history = new CollectionHistory(directory);
  const origin = 'https://canvas.example.edu';
  const courses = [{ courseId: '9', name: 'Course', requested: 'expanded', effective: 'limited' }];
  const id = await history.begin(origin, '1', courses);
  await history.record(id, { event: 'request', requestId: 'request1', operation: 'metadataownsubmission', courseId: '9', itemId: '10', headers: { Authorization: 'synthetic-secret' }, body: 'private body' });
  const restarted = new CollectionHistory(directory);
  const runs = await restarted.load(origin, '1');
  assert.equal(runs[0].status, 'interrupted');
  assert.equal(runs[0].requests[0].outcome, 'requested');
  assert.equal(JSON.stringify(runs).includes('synthetic-secret'), false);
  assert.equal(JSON.stringify(runs).includes('private body'), false);
  assert.deepEqual(await restarted.load(origin, '2'), []);
  assert.equal((await restarted.load(origin, '1')).length, 1);
  const second = await restarted.begin(origin, '1', courses);
  await restarted.record(second, { event: 'request', requestId: 'request2', operation: 'profile' });
  await restarted.record(second, { event: 'network-error', requestId: 'request2' });
  await restarted.finish(second, 'cancelled');
  assert.equal((await new CollectionHistory(directory).load(origin, '1'))[0].requests[0].outcome, 'failed');
});

test('history storage failure rejects recording and cannot authorize transmission', async () => {
  await fs.mkdir('.codex-temp', { recursive: true });
  const directory = await fs.mkdtemp(path.resolve('.codex-temp/history-failure-'));
  const history = new CollectionHistory(directory);
  const id = await history.begin('https://canvas.example.edu', '1', []);
  await fs.mkdir(path.join(directory, 'occupied'));
  history.file = path.join(directory, 'occupied');
  await assert.rejects(history.record(id, { event: 'request', requestId: '1', operation: 'profile' }), /history could not be saved/);
});

test('zero-request failures retain only reviewed session diagnostics across restart', async () => {
  await fs.mkdir('.codex-temp', { recursive: true });
  const directory = await fs.mkdtemp(path.resolve('.codex-temp/history-diagnostic-'));
  const history = new CollectionHistory(directory);
  const origin = 'https://canvas.example.edu';
  const id = await history.begin(origin, '1', []);
  await history.finish(id, 'failed', null, 'CW_SESSION_MISSING');
  const [restored] = await new CollectionHistory(directory).load(origin, '1');
  assert.deepEqual(restored.failure, { code: 'CW_SESSION_MISSING', reason: 'The expected Canvas session cookie is missing.' });
  assert.equal(restored.requests.length, 0);
  const next = await history.begin(origin, '1', []);
  await history.finish(next, 'failed', null, 'CW_SESSION_private-cookie-value');
  assert.equal((await new CollectionHistory(directory).load(origin, '1'))[0].failure, undefined);
  const raw = await fs.readFile(history.file, 'utf8');
  assert.equal(raw.includes('private-cookie-value'), false);
  const entries = JSON.parse(raw);
  entries[1].failure.reason = 'untrusted message';
  await fs.writeFile(history.file, JSON.stringify(entries));
  await assert.rejects(new CollectionHistory(directory).load(origin, '1'), /could not be read/);
});
