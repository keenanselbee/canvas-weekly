import test from 'node:test';
import assert from 'node:assert/strict';
import { CanvasNetwork } from '../src/canvas-network.js';
import { requestUrl, permittedRead } from '../src/canvas-client.js';

test('network admission requires exact reviewed paths and parameters', () => {
  const origin = 'https://canvas.example';
  for (const operation of ['profile', 'courses', 'course', 'files', 'groups', 'announcements', 'calendar']) {
    assert.equal(permittedRead(requestUrl(origin, operation, { courseId: 1, conversationId: 7 }), origin), true, operation);
  }
  for (const route of ['/api/v1/conversations?filter[]=course_1', '/api/v1/conversations/7?auto_mark_as_read=false', '/api/v1/courses/1/assignments?include[]=submission&override_assignment_dates=true', '/api/v1/courses/1/quizzes', '/api/v1/courses/1/pages?include[]=body', '/api/v1/courses/1/files', '/api/v1/courses/1/files?only[]=names&only[]=names', '/api/v1/conversations/7', '/api/v1/conversations/7?auto_mark_as_read=true', '/api/v1/courses/1/modules', '/api/v1/courses/1/assignments?include[]=submission', '/api/v1/users/self/profile?delete=true', '/api/v1/users/self/profile?per_page=1000']) {
    assert.equal(permittedRead(origin + route, origin), false, route);
  }
});

test('only the pending collector request is admitted outside human login', async () => {
  const origin = 'https://canvas.example';
  const url = requestUrl(origin, 'profile').href;
  const detail = { url, method: 'GET', resourceType: 'xhr' };
  const gate = new CanvasNetwork({ origin: () => origin, loginContentsId: () => null, fetcher: async () => {
    assert.equal(gate.allows(detail), true);
    assert.equal(gate.allows({ ...detail, webContentsId: 2 }), false);
    assert.equal(gate.allows({ ...detail, method: 'POST' }), false);
    assert.equal(gate.allows({ ...detail, url: origin + '/api/v1/conversations/7' }), false);
    throw new Error('Network failure');
  } });
  assert.equal(gate.allows(detail), false);
  await assert.rejects(gate.fetch(url, { method: 'GET', redirect: 'manual' }), /Network failure/);
  assert.equal(gate.allows(detail), false);
  await assert.rejects(gate.fetch(url, { method: 'POST', redirect: 'manual' }), /not permitted/);
  await assert.rejects(gate.fetch(url, { method: 'GET', redirect: 'follow' }), /not permitted/);
});

test('login permits authentication and assets but rejects Canvas APIs, writes and other windows', () => {
  const origin = 'https://canvas.example';
  let loginId = 9;
  const gate = new CanvasNetwork({ origin: () => origin, loginContentsId: () => loginId });
  const details = { method: 'GET', resourceType: 'mainFrame', webContentsId: 9 };
  assert.equal(gate.allows({ ...details, url: origin + '/login' }), true);
  assert.equal(gate.allows({ ...details, url: origin + '/login/saml', method: 'POST' }), true);
  assert.equal(gate.allows({ ...details, url: 'https://identity.example/sso', method: 'POST' }), true);
  for (const route of ['/files/2/download', '/courses/1/files/2/preview', '/api/v1/files/2/public_url', '/courses/1/file_contents/notes.pdf']) {
    assert.equal(gate.allows({ ...details, url: 'https://files.example' + route }), false, 'File-host navigation is not an identity-provider login');
  }
  assert.equal(gate.allows({ ...details, url: origin + '/dist/app.js', resourceType: 'script' }), true);
  for (const route of ['/api/v1/conversations/7', '/api/v1/users/self/profile', '/api/v1/courses/1/modules', '/courses/1/pages/read-me', '/logout']) {
    assert.equal(gate.allows({ ...details, url: origin + route, resourceType: 'image' }), false, route);
  }
  assert.equal(gate.allows({ ...details, url: origin + '/login', webContentsId: 10 }), false);
  loginId = null;
  assert.equal(gate.allows({ ...details, url: 'https://identity.example/sso', method: 'POST' }), false);
});
