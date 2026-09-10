import crypto from 'node:crypto';
import { blockedAssessmentUrl } from './canvas-client.js';

export function localDate(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}
export function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function weekOf(value, timeZone) {
  const today = localDate(value, timeZone);
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  const start = shiftDate(today, -(day + 6) % 7);
  return { start, end: shiftDate(start, 6), today };
}
export function plainText(value = '') {
  return String(value ?? '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|li|h[1-6]|tr)>|<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (match, code) => {
      const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    }).replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_match, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[name])
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
}
const dateOrNull = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const numberOrNull = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function sourceUrl(value, origin, fallback) {
  try {
    const url = new URL(value || fallback, origin);
    if (url.protocol !== 'https:' || url.username || url.password || blockedAssessmentUrl(url.href)) return new URL(fallback, origin).href;
    // Public source references must never include token-bearing download parameters.
    for (const key of [...url.searchParams.keys()]) if (/token|secret|signature|verifier|key|auth/i.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch { return new URL(fallback, origin).href; }
}

function normalizeItems(record, origin, now) {
  const courseName = record.sources.course?.course_code || record.sources.course?.name || `Course ${record.id}`;
  const entries = new Map();
  for (const assignment of record.sources.assignments || []) {
    if (!/^\d+$/.test(String(assignment.id))) continue;
    const submission = assignment.submission || {};
    entries.set(String(assignment.id), {
      id: `${record.id}:assignment:${assignment.id}`, courseId: record.id, courseName,
      assignmentId: String(assignment.id), quizId: assignment.quiz_id ? String(assignment.quiz_id) : null,
      title: String(assignment.name || 'Untitled assignment'), type: assignment.is_quiz_assignment || assignment.quiz_id ? 'quiz' : 'assignment',
      dueAt: dateOrNull(assignment.due_at), closesAt: dateOrNull(assignment.lock_at), opensAt: dateOrNull(assignment.unlock_at),
      points: numberOrNull(assignment.points_possible), instructions: plainText(assignment.description),
      submissionTypes: Array.isArray(assignment.submission_types) ? assignment.submission_types.map(String) : [],
      status: ['submitted', 'graded', 'pending_review'].includes(submission.workflow_state) ? 'submitted' : submission.workflow_state === 'unsubmitted' ? 'not-submitted' : 'unknown',
      sourceUrl: sourceUrl(assignment.html_url, origin, `/courses/${record.id}/assignments/${assignment.id}`),
      observedAt: now, stale: false,
    });
  }
  for (const quiz of record.sources.quizzes || []) {
    if (!/^\d+$/.test(String(quiz.id))) continue;
    const assignment = entries.get(String(quiz.assignment_id)) || [...entries.values()].find(entry => entry.quizId === String(quiz.id));
    const item = assignment || {
      id: `${record.id}:quiz:${quiz.id}`, courseId: record.id, courseName, assignmentId: quiz.assignment_id ? String(quiz.assignment_id) : null,
      title: String(quiz.title || 'Untitled quiz'), type: 'quiz', dueAt: dateOrNull(quiz.due_at), closesAt: dateOrNull(quiz.lock_at), opensAt: dateOrNull(quiz.unlock_at),
      points: numberOrNull(quiz.points_possible), instructions: plainText(quiz.description), submissionTypes: ['online_quiz'], status: 'unknown',
      sourceUrl: sourceUrl(quiz.html_url, origin, `/courses/${record.id}/quizzes/${quiz.id}`), observedAt: now, stale: false,
    };
    Object.assign(item, { quizId: String(quiz.id), questionCount: numberOrNull(quiz.question_count), timeLimitMinutes: numberOrNull(quiz.time_limit), allowedAttempts: numberOrNull(quiz.allowed_attempts) });
    if (!item.instructions) item.instructions = plainText(quiz.description);
    if (!assignment) entries.set(`quiz:${quiz.id}`, item);
  }
  return [...entries.values()];
}

export function reconcile(records, previous, { origin, now, timeZone }) {
  const courses = [];
  const items = [];
  const changes = [];
  for (const record of records) {
    const priorCourse = previous?.courses.find(course => course.id === record.id);
    const details = record.sources.course;
    courses.push({ id: record.id, name: details?.name || priorCourse?.name || `Course ${record.id}`,
      code: details?.course_code || priorCourse?.code || `Course ${record.id}`,
      syllabus: details ? plainText(details.syllabus_body) : priorCourse?.syllabus || '',
      sourceUrl: `${origin}/courses/${record.id}`, coverage: record.coverage,
      announcements: (record.sources.announcements || priorCourse?.announcements || []).map(item => ({ id: String(item.id), title: item.title, body: plainText(item.message ?? item.body), sourceUrl: sourceUrl(item.html_url || item.sourceUrl, origin, `/courses/${record.id}/announcements`), postedAt: item.posted_at || item.postedAt })),
      references: (record.sources.files || []).map(item => ({ title: item.display_name || item.filename, sourceUrl: `${origin}/courses/${record.id}/files/${item.id}`, status: 'File contents not yet collected' })),
    });
    const current = normalizeItems(record, origin, now);
    const priorItems = previous?.items.filter(item => item.courseId === record.id) || [];
    const assigned = new Set();
    for (const item of current) {
      const prior = priorItems.find(old => old.id === item.id || (item.quizId && old.quizId === item.quizId));
      if (prior) {
        assigned.add(prior.id);
        if (prior.assignmentId && !record.sources.assignments) {
          // Quiz defaults cannot overwrite a previously observed student-specific assignment override.
          Object.assign(item, { id: prior.id, assignmentId: prior.assignmentId, dueAt: prior.dueAt, closesAt: prior.closesAt, opensAt: prior.opensAt, status: prior.status, stale: true });
        }
        for (const field of ['title', 'dueAt', 'closesAt', 'instructions', 'status']) {
          if (prior[field] !== item[field]) changes.push({ itemId: item.id, title: item.title, courseName: item.courseName, field, before: prior[field], after: item[field], sourceUrl: item.sourceUrl });
        }
      } else changes.push({ itemId: item.id, title: item.title, courseName: item.courseName, field: 'new', sourceUrl: item.sourceUrl });
      items.push(item);
    }
    for (const prior of priorItems) if (!assigned.has(prior.id)) items.push({ ...prior, stale: true });
  }
  return { schemaVersion: 1, observedAt: now, origin, timeZone, courses, items, changes };
}

export function buildGuide(snapshot, now = snapshot.observedAt) {
  const week = weekOf(now, snapshot.timeZone);
  const horizon = shiftDate(week.today, 21);
  const relevant = snapshot.items.filter(item => item.status !== 'submitted' && (!item.dueAt || localDate(item.dueAt, snapshot.timeZone) <= horizon));
  relevant.sort((a, b) => (a.dueAt || '9999').localeCompare(b.dueAt || '9999') || a.title.localeCompare(b.title));
  const inWeek = relevant.filter(item => item.dueAt && localDate(item.dueAt, snapshot.timeZone) <= week.end);
  const upcoming = relevant.filter(item => item.dueAt && localDate(item.dueAt, snapshot.timeZone) > week.end);
  const undated = relevant.filter(item => !item.dueAt);
  return { ...snapshot, week, inWeek, upcoming, undated, mode: 'Factual guide', generatedAt: now };
}

export function formatDate(value, timeZone) {
  if (!value) return 'Not supplied';
  return new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
const md = value => String(value ?? '').replace(/[\\`*_{}\[\]<>|#]/g, '\\$&').replace(/\r?\n/g, ' ');

export function renderMarkdown(guide) {
  const lines = ['# Weekly Plan', '', `**${guide.week.start} to ${guide.week.end}**`, '', `${guide.mode} · Updated ${formatDate(guide.generatedAt, guide.timeZone)} (${guide.timeZone})`, '',
    'Generated sections are refreshed by Canvas Weekly. Keep your own notes in Student Notes.md.', '', '## This week and overdue', ''];
  const itemLines = item => [
    `### ${md(item.title)}`, '', `**${md(item.courseName)}** · ${md(item.type)} · ${item.stale ? 'Last known information — needs recheck' : 'Observed in Canvas'}`, '',
    `- Due: ${formatDate(item.dueAt, guide.timeZone)}`,
    `- Available until: ${formatDate(item.closesAt, guide.timeZone)}`,
    `- Submission status: ${md(item.status)}${item.status === 'unknown' ? ' — check Canvas' : ''}`,
    `- Points: ${item.points ?? 'Not supplied'} (not necessarily course weight)`,
    ...(item.quizId ? [`- Questions: ${item.questionCount ?? 'Not supplied'}; time limit: ${item.timeLimitMinutes == null || item.timeLimitMinutes === 0 ? 'None supplied' : `${item.timeLimitMinutes} minutes`}; allowed attempts: ${item.allowedAttempts === -1 ? 'Unlimited' : item.allowedAttempts ?? 'Not supplied'}`] : []),
    `- [Open source](<${item.sourceUrl}>)`, '', ...(item.instructions ? [md(item.instructions), ''] : ['Instructions not supplied in the collected metadata.', '']),
  ];
  if (!guide.inWeek.length) lines.push('No outstanding dated items were identified for this week in the collected information.', '');
  for (const item of guide.inWeek) lines.push(...itemLines(item));
  lines.push('## Changes since last refresh', '');
  if (!guide.changes.length) lines.push('No changes detected in the collected assignment metadata.', '');
  for (const change of guide.changes) {
    const value = change.field === 'new' ? 'Newly observed' : change.field === 'instructions' ? 'Instructions changed — review the source' : `${change.field}: ${md(change.before ?? 'Not supplied')} → ${md(change.after ?? 'Not supplied')}`;
    lines.push(`- **${md(change.courseName)} — ${md(change.title)}:** ${value}. [Source](<${change.sourceUrl}>)`);
  }
  lines.push('', '## Looking ahead', '');
  if (!guide.upcoming.length) lines.push('No additional dated items identified in the next 21 days.', '');
  for (const item of guide.upcoming) lines.push(...itemLines(item));
  lines.push('## Undated work', '');
  if (!guide.undated.length) lines.push('No undated outstanding items identified.', '');
  for (const item of guide.undated) lines.push(...itemLines(item));
  lines.push('## Course information and coverage', '');
  for (const course of guide.courses) {
    lines.push(`### ${md(course.name)}`, '', `[Course source](<${course.sourceUrl}>)`, '', course.syllabus ? md(course.syllabus) : 'Syllabus text not collected.', '');
    for (const coverage of course.coverage) lines.push(`- ${md(coverage.source)}: ${coverage.status}${coverage.message ? ` — ${md(coverage.message)}` : ''}`);
    lines.push('', 'Announcements:', '');
    for (const announcement of course.announcements) lines.push(`- **${md(announcement.title)}:** ${md(announcement.body)} [Source](<${announcement.sourceUrl}>)`);
    lines.push('', 'File references (contents not yet collected):', '');
    for (const reference of course.references) lines.push(`- [${md(reference.title)}](<${reference.sourceUrl}>)`);
    lines.push('');
  }
  lines.push('## Needs confirmation', '', 'Module/page/file listings and Inbox conversation summaries do not establish their full contents. Linked documents and message details may contain additional requirements. This factual guide does not infer requirements from uncollected sources.', '', 'Canvas remains the source of record. Viewing this guide does not complete coursework.', '');
  return lines.join('\n');
}

export function contentHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
