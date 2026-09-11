import test from 'node:test';
import assert from 'node:assert/strict';
import { courseSyllabusRequest, parseCourseSyllabus } from '../src/canvas-syllabus.js';
import { permittedMetadataBody } from '../src/canvas-metadata.js';

const value = syllabusBody => ({ data: { course: { _id: '1', syllabusBody } } });
const parse = response => parseCourseSyllabus(response, '1', 'https://canvas.example');

test('syllabus selection is fixed and cannot enter generic metadata admission', () => {
  const request = courseSyllabusRequest('1');
  assert.deepEqual(request.variables, { courseId: '1' });
  assert.ok(Object.isFrozen(request) && Object.isFrozen(request.variables));
  assert.equal(permittedMetadataBody(JSON.stringify(request), '1', '99'), false);
  assert.doesNotMatch(request.query, /description|lockInfo|assignment|module|submission/);
  for (const id of ['', '0', '../2', '1&as_user_id=2', 1]) assert.throws(() => courseSyllabusRequest(id));
});

test('syllabus parser retains readable text and safe references without raw HTML or credentials', () => {
  const syllabus = parse(value('<script>private-script</script><p>Read before class: a &lt; b.</p><p>Password: private-password</p><a href="/courses/1/files/2?verifier=private-token">Syllabus PDF</a><a href="https://student:private-password@course.example">Bad link</a><a href="/courses/1/quizzes/3/take">Start</a>'));
  assert.match(syllabus.text, /a < b/);
  assert.doesNotMatch(JSON.stringify(syllabus), /private-script|private-password|private-token|<script>|verifier/);
  assert.deepEqual(syllabus.links, ['https://canvas.example/courses/1/files/2']);
  assert.deepEqual(parse(value(null)), { text: null, links: [] });
  assert.deepEqual(parse(value('')), { text: '', links: [] });
  assert.deepEqual(parse(value('<a href="https://course.example"><img src="image.png"></a>')).links, ['https://course.example/']);
});

test('partial, malformed, foreign and oversized syllabus responses are rejected', () => {
  for (const input of [null, {}, value(undefined), value(5), value({}), value('x'.repeat(512 * 1024 + 1)),
    { data: { course: { _id: '2', syllabusBody: 'Foreign' } } },
    { ...value('Partial'), errors: [{ message: 'private-server-detail' }] }]) {
    assert.throws(() => parse(input), error => !error.message.includes('private-server-detail'));
  }
});
