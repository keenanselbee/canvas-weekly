import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CanvasAudit } from '../src/canvas-audit.js';
import { CanvasClient } from '../src/canvas-client.js';

test('collector records durable request intent and response without tokens, cursor or content', async () => {
  await fs.mkdir('.codex-temp', { recursive: true });
  const directory = await fs.mkdtemp(path.resolve('.codex-temp/canvas-audit-'));
  const journal = new CanvasAudit(directory);
  const read = async () => (await Promise.all((await fs.readdir(journal.directory)).map(file => fs.readFile(path.join(journal.directory, file), 'utf8')))).join('');
  try {
    let calls = 0;
    const client = new CanvasClient({ origin: 'https://canvas.example', token: 'private-token', audit: event => journal.write(event), fetcher: async address => {
      const entries = (await read()).trim().split('\n').map(line => JSON.parse(line));
      assert.equal(entries.at(-1).event, 'request', 'Request intent must reach disk before network access');
      const url = new URL(address); url.searchParams.set('page', 'private-cursor');
      return new Response(JSON.stringify([{ body: 'private-course-content' }]), { headers: {
        'content-type': 'application/json', ...(calls++ === 0 ? { link: `<${url}>; rel="next"` } : {}),
      } });
    } });
    await client.read('files', { courseId: 1 }, true);
    const raw = await read();
    const events = raw.trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(events.map(entry => entry.event), ['request', 'response', 'request', 'response']);
    assert.equal(events[0].requestId, events[1].requestId);
    assert.notEqual(events[0].requestId, events[2].requestId);
    assert.equal(events[2].paginated, true);
    assert.doesNotMatch(raw, /private-token|private-cursor|private-course-content|Authorization/);
  } finally {
    assert.equal(path.dirname(directory), path.resolve('.codex-temp'));
    await fs.rm(directory, { recursive: true });
  }
});

test('audit failure prevents a request and failed response logging cancels its body', async () => {
  let calls = 0;
  const unavailable = new CanvasClient({ origin: 'https://canvas.example', audit: async () => { throw new Error('Audit unavailable'); }, fetcher: async () => { calls++; } });
  await assert.rejects(unavailable.read('profile'), /Audit unavailable/);
  assert.equal(calls, 0);
  let cancelled = false;
  const partial = new CanvasClient({ origin: 'https://canvas.example', audit: async event => { if (event.event === 'response') throw new Error('Disk full'); }, fetcher: async () => ({ status: 200, body: { cancel: async () => { cancelled = true; } } }) });
  await assert.rejects(partial.read('profile'), /Disk full/);
  assert.equal(cancelled, true);
});

test('network failure is recorded separately without serializing sensitive exception text', async () => {
  const events = [];
  const client = new CanvasClient({ origin: 'https://canvas.example', audit: async event => events.push(event), fetcher: async () => { throw new Error('private-network-detail'); } });
  await assert.rejects(client.read('profile'), /private-network-detail/);
  assert.deepEqual(events.map(event => event.event), ['request', 'network-error']);
  assert.equal(events[0].preservesUnread, false);
  assert.doesNotMatch(JSON.stringify(events), /private-network-detail/);
});

test('history persistence failure prevents transmission even when the low-level audit succeeds', async () => {
  await fs.mkdir('.codex-temp', { recursive: true });
  const directory = await fs.mkdtemp(path.resolve('.codex-temp/history-audit-'));
  const journal = new CanvasAudit(directory);
  journal.onEvent = async () => { throw new Error('History unavailable'); };
  let calls = 0;
  const client = new CanvasClient({ origin: 'https://canvas.example', audit: event => journal.write(event), fetcher: async () => { calls++; } });
  await assert.rejects(client.read('profile'), /History unavailable/);
  assert.equal(calls, 0);
});
