import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import fs from 'node:fs/promises';
import { CodexClient, planningEvidence, resolveCodexRuntime } from '../src/codex-client.js';

test('runtime detection distinguishes bundled, PATH, manual and missing files without launching', async () => {
  const directory = await fs.mkdtemp(path.resolve('.codex-temp/runtime-'));
  try {
    const bundled = path.join(directory, 'bundled.exe');
    const automatic = path.join(directory, process.platform === 'win32' ? 'codex.exe' : 'codex');
    await fs.writeFile(bundled, 'fixture'); await fs.writeFile(automatic, 'fixture');
    assert.deepEqual(resolveCodexRuntime('codex', { bundled, searchPath: directory }), { path: bundled, source: 'bundled', detected: true });
    assert.deepEqual(resolveCodexRuntime('codex', { bundled: null, searchPath: directory }), { path: automatic, source: 'path', detected: true });
    assert.deepEqual(resolveCodexRuntime(bundled), { path: bundled, source: 'manual', detected: true });
    assert.equal(resolveCodexRuntime(directory).detected, false, 'A directory is not an executable');
    assert.deepEqual(resolveCodexRuntime('codex', { bundled: null, searchPath: '' }), { path: null, source: 'automatic', detected: false });
    const client = new CodexClient({ executable: bundled, directory, spawnProcess: () => { throw Error('Detection must not launch'); } });
    assert.equal(client.runtime.detected, true);
    assert.equal(client.state.available, false, 'File detection is not a successful handshake');
    await fs.unlink(bundled);
    assert.equal(client.runtime.detected, false, 'Removed manual files are no longer detected');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

function fakeServer(overrides = {}, notifications = []) {
  const requests = [];
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => child.emit('exit', 0);
  child.stdin.on('data', data => {
    for (const line of data.toString().trim().split('\n')) {
      const message = JSON.parse(line); requests.push(message);
      if (message.id === undefined || !message.method) continue;
      const result = overrides[message.method] || ({ initialize: {}, 'account/read': { account: { type: 'chatgpt' } }, 'thread/start': { thread: { id: 'thread1' } }, 'turn/start': { turn: { id: 'turn1' } }, 'account/login/start': { authUrl: 'https://auth.openai.com/authorize?example=true' } })[message.method] || {};
      queueMicrotask(() => {
        child.stdout.write(JSON.stringify({ id: message.id, result }) + '\n');
        if (message.method === 'turn/start') {
          for (const notification of notifications) child.stdout.write(JSON.stringify(notification) + '\n');
          child.stdout.write(JSON.stringify({ method: 'item/completed', params: { threadId: 'thread1', item: { type: 'agentMessage', text: JSON.stringify({ priorities: [{ sourceId: 'one', action: 'Read the notes', reason: 'Prepare before the deadline', suggestedDate: '2026-09-10', checks: [], steps: [{ text: 'Review the notes.', kind: 'suggested', quote: '' }] }] }) } } }) + '\n');
          child.stdout.write(JSON.stringify({ method: 'turn/completed', params: { threadId: 'thread1', turn: { id: 'turn1', status: 'completed' } } }) + '\n');
        }
      });
    }
  });
  return { child, requests };
}

test('Codex transport handles login and structured planning without granting tools', async () => {
  const server = fakeServer();
  const client = new CodexClient({ directory: path.resolve('.codex-temp/codex-test'), spawnProcess: (_command, args, options) => {
    assert.equal(options.shell, false);
    assert.ok(args.includes('shell_tool'));
    assert.equal(options.env.OPENAI_API_KEY, undefined);
    return server.child;
  } });
  try {
    await client.start();
    assert.equal(client.state.connected, true);
    assert.ok((await client.login()).startsWith('https://auth.openai.com/'));
    assert.equal((await client.plan({ week: { today: '2026-09-10', end: '2026-09-13' }, timeZone: 'UTC', items: [{ id: 'one' }] }))[0].sourceId, 'one');
    client.receive({ id: 987, method: 'item/commandExecution/requestApproval', params: {} });
    assert.ok(server.requests.find(item => item.id === 987).error);
    const turn = server.requests.find(item => item.method === 'turn/start');
    assert.equal(turn.params.sandboxPolicy.networkAccess, false);
  } finally { client.close(); }
});

const usageEvent = (total, threadId = 'thread1') => ({ method: 'thread/tokenUsage/updated', params: { threadId, turnId: 'turn1', tokenUsage: { total } } });
const tokenCounts = { totalTokens: 1500, inputTokens: 1200, cachedInputTokens: 800, outputTokens: 300, reasoningOutputTokens: 100 };
const planningInput = { week: { today: '2026-09-10', end: '2026-09-13' }, timeZone: 'UTC', items: [{ id: 'one' }] };

test('planning usage uses cumulative reported totals and ignores unrelated, duplicate and invalid updates', async () => {
  const server = fakeServer({}, [usageEvent(tokenCounts), usageEvent(tokenCounts),
    usageEvent({ ...tokenCounts, totalTokens: 9000 }, 'another-thread'),
    usageEvent({ ...tokenCounts, totalTokens: -1 }), usageEvent({ ...tokenCounts, inputTokens: '1200' }),
    usageEvent({ ...tokenCounts, cachedInputTokens: 1300 }), usageEvent({ ...tokenCounts, totalTokens: 1400 }),
    usageEvent({ ...tokenCounts, outputTokens: Number.MAX_SAFE_INTEGER + 1 })]);
  const client = new CodexClient({ directory: path.resolve('.codex-temp/codex-test'), spawnProcess: () => server.child });
  try {
    await client.plan(planningInput);
    assert.deepEqual(client.state.usage, { status: 'completed', tokens: tokenCounts });
    client.receive(usageEvent({ ...tokenCounts, totalTokens: 9000 }));
    assert.equal(client.state.usage.tokens.totalTokens, 1500, 'finished run ignores late events');
    await client.logout();
    assert.equal(client.state.usage, undefined, 'disconnect clears account-scoped usage');
  } finally { client.close(); }
});

test('failed planning retains reported usage and missing usage is not reported as zero', async () => {
  for (const notifications of [[], [usageEvent(tokenCounts)]]) {
    const server = fakeServer({}, notifications);
    const client = new CodexClient({ directory: path.resolve('.codex-temp/codex-test'), spawnProcess: () => server.child });
    try {
      await assert.rejects(client.plan({ ...planningInput, items: [{ id: 'different' }] }));
      assert.deepEqual(client.state.usage, { status: 'failed', tokens: notifications.length ? tokenCounts : null });
      await client.plan(planningInput);
      assert.equal(client.state.usage.status, 'completed');
      assert.equal(client.state.usage.tokens?.totalTokens ?? null, notifications.length ? 1500 : null);
    } finally { client.close(); }
  }
});

test('cancelled planning retains its last reported usage as interrupted', async () => {
  const server = fakeServer({}, [usageEvent(tokenCounts)]);
  const client = new CodexClient({ directory: path.resolve('.codex-temp/codex-test'), spawnProcess: () => server.child });
  const controller = new AbortController();
  client.on('state', state => { if (state.usage?.status === 'running' && state.usage.tokens) controller.abort(); });
  try {
    await assert.rejects(client.plan(planningInput, controller.signal), { name: 'AbortError' });
    assert.deepEqual(client.state.usage, { status: 'interrupted', tokens: tokenCounts });
  } finally { client.close(); }
});

test('unexpected login hosts and unknown planning references are rejected', async () => {
  const server = fakeServer({ 'account/login/start': { authUrl: 'https://evil.example/login' } });
  const client = new CodexClient({ directory: path.resolve('.codex-temp/codex-test'), spawnProcess: () => server.child });
  try {
    await assert.rejects(client.login(), /unexpected sign-in/);
    await assert.rejects(client.plan({ items: [{ id: 'different' }] }), /valid course references/);
  } finally { client.close(); }
});

test('planner evidence excludes credentials and bounds source text', () => {
  const evidence = planningEvidence({ week: {}, timeZone: 'UTC', inWeek: [{ id: 'one', instructions: 'x'.repeat(10000), token: 'secret' }], upcoming: [], undated: [] });
  assert.equal(evidence.items[0].instructions.length, 3000);
  assert.equal(evidence.items[0].token, undefined);
});
