import crypto from 'node:crypto';
import { plainText, sourceUrl } from './content.js';
import { courseEvidence } from './course-evidence.js';
import { localDate, shiftDate, weekOf } from './dates.js';
import { buildStudyPlan, guideSources } from './study-plan.js';
import { METADATA_NOTICE } from './canvas-metadata.js';
import { weeklyMarkdown } from './weekly-view.js';
import { factualOverview, courseCountText } from './factual-overview.js';
export { plainText, sourceUrl } from './content.js';
export { localDate, shiftDate, weekOf } from './dates.js';
const dateOrNull = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const numberOrNull = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

function normalizeItems(record, origin, now) {
  const metadata = record.sources.metadata;
  const courseName = metadata?.course.code || record.sources.course?.course_code || metadata?.course.name || record.sources.course?.name || `Course ${record.id}`;
  const entries = new Map();
  const submissions = new Map((metadata?.submissions || []).map(item => [item.assignmentId, item]));
  const assignments = metadata ? metadata.assignments.map(item => ({ id: item.id, name: item.name, due_at: submissions.get(item.id)?.cachedDueDate,
    points_possible: item.points, submission_types: item.submissionTypes,
    is_quiz_assignment: item.submissionTypes.includes('online_quiz'), submission: { workflow_state: submissions.get(item.id)?.state } })) : record.sources.assignments || [];
  for (const assignment of assignments) {
    if (!/^\d+$/.test(String(assignment.id))) continue;
    const submission = assignment.submission || {};
    entries.set(String(assignment.id), {
      id: `${record.id}:assignment:${assignment.id}`, courseId: record.id, courseName,
      assignmentId: String(assignment.id), quizId: assignment.quiz_id ? String(assignment.quiz_id) : null,
      title: String(assignment.name || 'Untitled assignment'), type: assignment.is_quiz_assignment || assignment.quiz_id ? 'quiz' : 'assignment',
      dueAt: dateOrNull(assignment.due_at), closesAt: dateOrNull(assignment.lock_at), opensAt: dateOrNull(assignment.unlock_at),
      points: numberOrNull(assignment.points_possible), instructions: plainText(assignment.description),
      instructionsObservedAt: typeof assignment.description === 'string' ? now : null, instructionsStale: false,
      dueDateObservedAt: metadata && !assignment.due_at ? null : now,
      availabilityObservedAt: metadata ? null : now, availabilityStale: Boolean(metadata),
      ...(metadata ? { metadataOnly: true, dueDateStale: !assignment.due_at,
        dueDateState: !submissions.has(String(assignment.id)) ? 'missing' : assignment.due_at ? 'stored' : 'empty' } : {}),
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
      instructionsObservedAt: typeof quiz.description === 'string' ? now : null, instructionsStale: false,
      sourceUrl: sourceUrl(quiz.html_url, origin, `/courses/${record.id}/quizzes/${quiz.id}`), observedAt: now, stale: false,
    };
    Object.assign(item, { quizId: String(quiz.id), questionCount: numberOrNull(quiz.question_count), timeLimitMinutes: numberOrNull(quiz.time_limit), allowedAttempts: numberOrNull(quiz.allowed_attempts), quizDetailsObservedAt: now, quizDetailsStale: false });
    if (!item.instructions) {
      item.instructions = plainText(quiz.description);
      item.instructionsObservedAt = typeof quiz.description === 'string' ? now : null;
      item.instructionsStale = false;
    }
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
      if (!prior || ['body', 'title', 'startsAt', 'endsAt', 'author'].some(field => prior[field] !== source[field])
        || ['authorUnverified', 'authorRoleUnverified'].some(field => Boolean(prior[field]) !== Boolean(source[field]))) changes.push({ itemId: source.id, title: source.title, courseName: source.courseName, field: prior ? 'course-information' : 'new', sourceUrl: source.sourceUrl });
    }
    courses.push({ id: record.id, name: record.sources.metadata?.course.name || details?.name || priorCourse?.name || `Course ${record.id}`,
      code: record.sources.metadata?.course.code || details?.course_code || priorCourse?.code || `Course ${record.id}`,
      syllabus: record.sources.syllabus?.text || (details ? plainText(details.syllabus_body) : priorCourse?.syllabus || ''),
      sourceUrl: `${origin}/courses/${record.id}`, coverage: record.coverage,
      announcements: evidence.evidence.filter(item => item.kind === 'announcement'),
      ...evidence,
    });
    const current = normalizeItems(record, origin, now);
    const priorItems = previous?.items.filter(item => item.courseId === record.id) || [];
    const assigned = new Set();
    for (const item of current) {
      const prior = priorItems.find(old => old.id === item.id || (item.quizId && old.quizId === item.quizId)
        || (item.assignmentId && old.assignmentId === item.assignmentId));
      if (prior) {
        assigned.add(prior.id);
        if (item.metadataOnly) {
          // Fresh dates/status never certify an older instruction body or quiz
          // configuration. Carry the original observation time across repeats.
          item.id = prior.id;
          Object.assign(item, { opensAt: prior.opensAt || null, closesAt: prior.closesAt || null,
            availabilityObservedAt: Object.hasOwn(prior, 'availabilityObservedAt') ? prior.availabilityObservedAt : prior.observedAt || null });
          if (item.dueDateStale) Object.assign(item, { dueAt: prior.dueAt || null,
            dueDateObservedAt: Object.hasOwn(prior, 'dueDateObservedAt') ? prior.dueDateObservedAt : prior.observedAt || null });
          if (prior.instructions && !item.instructionsObservedAt) Object.assign(item, { instructions: prior.instructions, instructionsStale: true,
            instructionsObservedAt: Object.hasOwn(prior, 'instructionsObservedAt') ? prior.instructionsObservedAt : prior.observedAt || null });
          if (item.type === 'quiz' && prior.quizId && !item.quizDetailsObservedAt) Object.assign(item, { quizId: prior.quizId,
            questionCount: prior.questionCount, timeLimitMinutes: prior.timeLimitMinutes, allowedAttempts: prior.allowedAttempts,
            quizDetailsStale: true, quizDetailsObservedAt: Object.hasOwn(prior, 'quizDetailsObservedAt') ? prior.quizDetailsObservedAt : prior.observedAt || null });
        }
        if (prior.assignmentId && !record.sources.assignments && !record.sources.metadata) {
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
  const guide = { ...snapshot, week, inWeek, upcoming, undated, mode: 'Factual reference', generatedAt: now };
  guide.studyPlan = buildStudyPlan(guide);
  return guide;
}

export function formatDate(value, timeZone) {
  if (!value) return 'Not supplied';
  return new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
const md = value => String(value ?? '').replace(/[\\`*_{}\[\]<>|#]/g, '\\$&').replace(/\r?\n/g, ' ');

export function renderMarkdown(guide) {
  const lines = [guide.aiGuide ? '# Weekly Plan' : '# Course reference', '', `**${guide.week.start} to ${guide.week.end}**`, '', `${guide.aiGuide ? 'AI weekly guide' : 'Factual reference'} · Collected ${formatDate(guide.generatedAt, guide.timeZone)} (${guide.timeZone})`, '', METADATA_NOTICE, '',
    'Generated sections are refreshed by Canvas Weekly. Check off preparation tasks in the app; keep your own notes in Student Notes.md.', ''];
  const plan = guide.studyPlan || buildStudyPlan(guide);
  const referenceChecks = !guide.aiGuide && guide.priorities?.length ? buildStudyPlan({ ...guide, priorities: [] }).checks : plan.checks;
  const sources = new Map(guideSources(guide).map(source => [source.id, source]));
  lines.push(...weeklyMarkdown(guide));
  if (!guide.aiGuide) {
    const overview = factualOverview(guide);
    lines.push('## Recorded course work', '', overview.summary, '', overview.note, '');
    for (const course of overview.courses) {
      lines.push(`### ${md(course.name)}`, '', courseCountText(course.counts), '',
        `${course.counts.unknown} with unknown submission status; ${course.counts.stale} with last-known or unrefreshed fields.`, '',
        `Collected texts: ${course.sourceTexts}; coverage gaps: ${course.coverageGaps}; uncollected links: ${course.uncollectedLinks}.`, '');
      if (course.next) {
        const item = course.next;
        lines.push(`Earliest recorded outstanding deadline in this window: **${formatDate(item.dueAt, guide.timeZone)}** — [${md(item.title)}](<${item.sourceUrl}>).${item.stale || item.dueDateStale ? ' Last-known date; recheck.' : ''}`, '');
        if (item.sharedDeadlineCount > 1) lines.push(`${item.sharedDeadlineCount} outstanding items share this recorded due time. See the detailed records for each item.`, '');
      } else lines.push('No outstanding dated item in this window was collected. Check undated work, course materials and coverage gaps.', '');
    }
  }
  lines.push('## Double-check before relying on this plan', '');
  for (const check of referenceChecks) {
    const source = sources.get(check.sourceId);
    lines.push(`- **${md(check.title)}:** ${md(check.detail)}${source ? ` [Source](<${source.sourceUrl}>)` : ''}`);
  }
  if (!referenceChecks.length) lines.push('No specific gaps were identified in the collected records. Course announcements and unpublished requirements can still change.');
  lines.push('');
  if (!guide.aiGuide) {
    const marked = plan.tasks.filter(task => task.done || task.changedSinceDone);
    if (marked.length) {
      lines.push('## Local preparation record', '', 'These are your local checkmarks, not Canvas submissions. They do not remove recorded deadlines.', '');
      for (const task of marked) {
        const source = sources.get(task.sourceId);
        lines.push(`- [${task.done ? 'x' : ' '}] ${md(source?.title || task.courseName)}${task.changedSinceDone ? ' — changed since you checked it off; review again' : ' — preparation marked done'}${source ? ` [Source](<${source.sourceUrl}>)` : ''}`);
      }
      lines.push('');
    }
  }
  lines.push('## This week and overdue', '');
  const itemLines = item => [
    `### ${md(item.title)}`, '', `**${md(item.courseName)}** · ${md(item.type)} · ${item.stale ? 'Last known information — needs recheck' : item.metadataOnly ? 'Assignment metadata refreshed; instructions not rechecked' : 'Observed in Canvas'}`, '',
    `- Due: ${formatDate(item.dueAt, guide.timeZone)}`,
    `- Available until: ${formatDate(item.closesAt, guide.timeZone)}`,
    ...(item.metadataOnly ? [`- Deadline source: ${item.dueDateStale ? 'Stored student deadline unavailable; any displayed due date is last-known and needs confirmation' : 'Canvas stored student deadline'}. Observed ${formatDate(item.dueDateObservedAt, guide.timeZone)}.`] : []),
    ...(item.availabilityStale ? [`- Availability dates were not refreshed. Any displayed opening or closing dates are last-known, observed ${formatDate(item.availabilityObservedAt, guide.timeZone)}. Confirm the current window.`] : []),
    `- Submission status: ${md(item.status)}${item.status === 'unknown' ? ' — check Canvas' : ''}`,
    `- Points: ${item.points ?? 'Not supplied'} (not necessarily course weight)`,
    ...(item.quizId ? [`- Questions: ${item.questionCount ?? 'Not supplied'}; time limit: ${item.timeLimitMinutes == null || item.timeLimitMinutes === 0 ? 'None supplied' : `${item.timeLimitMinutes} minutes`}; allowed attempts: ${item.allowedAttempts === -1 ? 'Unlimited' : item.allowedAttempts ?? 'Not supplied'}`] : []),
    ...(item.instructionsStale ? [`- Instructions are last-known information, observed ${formatDate(item.instructionsObservedAt, guide.timeZone)}. Recheck the current instructions.`] : []),
    ...(item.quizDetailsStale ? [`- Quiz details are last-known information, observed ${formatDate(item.quizDetailsObservedAt, guide.timeZone)}. Recheck the current quiz information without starting or resuming it.`] : []),
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
      if (source.authorRoleUnverified && !source.authorUnverified) lines.push('Sender name supplied by Canvas; course role not verified.', '');
      if (source.coverageNote) lines.push(md(source.coverageNote), '');
      if (source.recovered) lines.push(`Recovered from an older saved guide${source.recoveredFromGuideAt ? ` collected ${formatDate(source.recoveredFromGuideAt, guide.timeZone)}` : ''}. Original source observation time is unavailable.`, '');
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
