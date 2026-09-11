import crypto from 'node:crypto';
import { plainText, sourceUrl } from './content.js';
import { courseEvidence } from './course-evidence.js';
import { localDate, shiftDate, weekOf } from './dates.js';
import { buildStudyPlan, guideSources } from './study-plan.js';
export { plainText, sourceUrl } from './content.js';
export { localDate, shiftDate, weekOf } from './dates.js';
const dateOrNull = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const numberOrNull = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

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
    const evidence = courseEvidence(record, priorCourse, origin, now);
    for (const source of evidence.evidence) {
      if (source.stale) continue;
      const prior = priorCourse?.evidence?.find(old => old.id === source.id);
      if (!prior || ['body', 'title', 'startsAt', 'endsAt'].some(field => prior[field] !== source[field])) changes.push({ itemId: source.id, title: source.title, courseName: source.courseName, field: prior ? 'course-information' : 'new', sourceUrl: source.sourceUrl });
    }
    courses.push({ id: record.id, name: details?.name || priorCourse?.name || `Course ${record.id}`,
      code: details?.course_code || priorCourse?.code || `Course ${record.id}`,
      syllabus: details ? plainText(details.syllabus_body) : priorCourse?.syllabus || '',
      sourceUrl: `${origin}/courses/${record.id}`, coverage: record.coverage,
      announcements: evidence.evidence.filter(item => item.kind === 'announcement'),
      ...evidence,
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
  const guide = { ...snapshot, week, inWeek, upcoming, undated, mode: 'Factual guide', generatedAt: now };
  guide.studyPlan = buildStudyPlan(guide);
  return guide;
}

export function formatDate(value, timeZone) {
  if (!value) return 'Not supplied';
  return new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
const md = value => String(value ?? '').replace(/[\\`*_{}\[\]<>|#]/g, '\\$&').replace(/\r?\n/g, ' ');

export function renderMarkdown(guide) {
  const lines = ['# Weekly Plan', '', `**${guide.week.start} to ${guide.week.end}**`, '', `${guide.mode} · Updated ${formatDate(guide.generatedAt, guide.timeZone)} (${guide.timeZone})`, '',
    'Generated sections are refreshed by Canvas Weekly. Check off preparation tasks in the app; keep your own notes in Student Notes.md.', ''];
  const plan = guide.studyPlan || buildStudyPlan(guide);
  const sources = new Map(guideSources(guide).map(source => [source.id, source]));
  lines.push('## Your study plan', '', plan.summary, '', plan.note, '');
  const refined = plan.tasks.filter(task => task.ai).length;
  if (guide.priorities?.length) lines.push(`ChatGPT refined ${refined} preparation task${refined === 1 ? '' : 's'}. Other tasks use basic prompts. Required/optional labels are AI interpretations with source quotes to check.`, '');
  let day, reviewCourse;
  for (const task of [...plan.tasks.filter(task => !task.unscheduled), ...(plan.reviewGroups || []).flatMap(group => group.tasks)]) {
    if (task.unscheduled) {
      if (day !== null) { lines.push('## Timing to confirm', '', plan.reviewNote, ''); day = null; }
      if (reviewCourse !== task.courseId) { reviewCourse = task.courseId; lines.push(`### ${md(task.courseName)}`, ''); }
    } else if (day !== task.suggestedDate) { day = task.suggestedDate; lines.push(`### Suggested start: ${day}`, ''); }
    const source = sources.get(task.sourceId);
    lines.push(`- [${task.done ? 'x' : ' '}] **${md(task.title)}** (${md(task.courseName)})${task.ai ? ' - AI suggestion' : ''}`, '', md(task.reason), '');
    if (task.changedSinceDone) lines.push('Source or task changed since you checked it off. Review it again.', '');
    if (task.dueAt) lines.push(`Recorded due time: ${formatDate(task.dueAt, guide.timeZone)}`, '');
    if (task.closesAt) lines.push(`Available until: ${formatDate(task.closesAt, guide.timeZone)}`, '');
    for (const step of task.steps) {
      if (typeof step === 'string') lines.push(`- ${md(step)}`);
      else {
        lines.push(`- ${step.conditional ? 'After confirming applicability: ' : ''}${step.kind === 'suggested' ? 'Suggested' : `${step.kind === 'required' ? 'Required' : 'Optional'} (AI interpretation)`}: ${md(step.text)}`);
        if (step.quote) lines.push('', `  Source quote: ${md(step.quote)}`, '');
      }
    }
    for (const check of task.checks || []) lines.push('', `${md(check.title)}: ${md(check.detail)}`);
    if (source) lines.push('', `[Source](<${source.sourceUrl}>)`);
    lines.push('');
  }
  lines.push('## Double-check before relying on this plan', '');
  for (const check of plan.checks) {
    const source = sources.get(check.sourceId);
    lines.push(`- **${md(check.title)}:** ${md(check.detail)}${source ? ` [Source](<${source.sourceUrl}>)` : ''}`);
  }
  if (!plan.checks.length) lines.push('No specific gaps were identified in the collected records. Course announcements and unpublished requirements can still change.');
  lines.push('');
  if (guide.priorities?.length && !guide.studyPlan) {
    lines.push('## Suggested focus', '', 'AI suggestions based on collected evidence; these do not change course requirements.', '');
    for (const priority of guide.priorities) {
      const source = [...guide.items, ...guide.courses.flatMap(course => course.evidence || [])].find(item => item.id === priority.sourceId);
      lines.push(`- **${md(priority.action)}** — ${md(priority.reason)}${source ? ` [${md(source.title)}](<${source.sourceUrl}>)` : ''}`);
    }
    lines.push('');
  }
  if (guide.planningNote) lines.push(`AI suggestions unavailable: ${md(guide.planningNote)}`, '');
  lines.push('## This week and overdue', '');
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
  if (!guide.changes.length) lines.push('No changes detected in the collected information.', '');
  for (const change of guide.changes) {
    const value = change.field === 'new' ? 'Newly observed' : ['instructions', 'course-information'].includes(change.field) ? 'Source content changed — review the source' : `${change.field}: ${md(change.before ?? 'Not supplied')} → ${md(change.after ?? 'Not supplied')}`;
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
    lines.push(`### ${md(course.name)}`, '', `[Course source](<${course.sourceUrl}>)`, '');
    for (const coverage of course.coverage) lines.push(`- ${md(coverage.source)}: ${coverage.status}${coverage.message ? ` — ${md(coverage.message)}` : ''}`);
    for (const source of course.evidence || []) {
      lines.push('', `#### ${md(source.title)}`, '', `${md(source.kind)}${source.stale ? ' — Last known information; recheck source' : ''}${source.author ? ` · ${md(source.author)}` : ''}`, '');
      if (source.postedAt) lines.push(`Posted: ${formatDate(source.postedAt, guide.timeZone)}`, '');
      if (source.startsAt) lines.push(`Starts: ${formatDate(source.startsAt, guide.timeZone)}; ends: ${formatDate(source.endsAt, guide.timeZone)}${source.location ? `; location: ${md(source.location)}` : ''}`, '');
      for (const paragraph of source.body.split(/\n+/)) if (paragraph.trim()) lines.push(md(paragraph), '');
      if (!source.body) lines.push('Content was not supplied by Canvas.', '');
      lines.push(`[Source](<${source.sourceUrl}>)`, '');
    }
    lines.push('', 'Linked and file references:', '');
    for (const reference of course.references) lines.push(`- [${md(reference.title)}](<${reference.sourceUrl}>) — ${md(reference.status)}${reference.stale ? '; last known reference' : ''}`);
    lines.push('');
  }
  lines.push('## Needs confirmation', '', 'Compare course messages and announcements with assignment dates: an instructor may have announced an exception before updating Canvas. Message text is preserved as evidence and never silently replaces a structured deadline. Linked documents, message attachments, external tools and unavailable page bodies may contain additional requirements. Review source coverage for partial or failed reads.', '', 'Canvas remains the source of record. Viewing this guide does not complete coursework.', '');
  return lines.join('\n');
}

export function contentHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
