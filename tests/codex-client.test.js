import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { CodexClient, planningEvidence } from '../src/codex-client.js';

function fakeServer(overrides = {}) {
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
          child.stdout.write(JSON.stringify({ method: 'item/completed', params: { threadId: 'thread1', item: { type: 'agentMessage', text: JSON.stringify({ priorities: [{ sourceId: 'one', action: 'Read the notes', reason: 'Prepare before the deadline' }] }) } } }) + '\n');
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
    assert.equal((await client.plan({ items: [{ id: 'one' }] }))[0].sourceId, 'one');
    client.receive({ id: 987, method: 'item/commandExecution/requestApproval', params: {} });
    assert.ok(server.requests.find(item => item.id === 987).error);
    const turn = server.requests.find(item => item.method === 'turn/start');
    assert.equal(turn.params.sandboxPolicy.networkAccess, false);
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
