import { createHash } from 'node:crypto';
import { localDate, shiftDate } from './dates.js';

export function guideSources(guide) {
  return [...guide.items, ...guide.courses.flatMap(course => [
    { id: `course:${course.id}`, courseId: course.id, courseName: course.code || course.name, title: course.name, sourceUrl: course.sourceUrl },
    ...(course.evidence || []),
  ])];
}

export function buildStudyPlan(guide, progress = {}) {
  const tasks = [];
  const checks = [];
  const today = guide.week.today;
  const now = Date.parse(guide.generatedAt);
  let scheduledCount = 0;
  const items = [...guide.inWeek, ...guide.upcoming, ...guide.undated];
  const check = (sourceId, title, detail) => checks.push({ sourceId, title, detail });
  for (const item of items) {
    const closed = item.closesAt && Date.parse(item.closesAt) < now;
    const overdue = item.dueAt && Date.parse(item.dueAt) < now;
    const dates = [item.dueAt, item.closesAt].filter(Boolean).sort();
    const deadlineDay = dates[0] ? localDate(dates[0], guide.timeZone) : null;
    const latestStart = deadlineDay ? [shiftDate(deadlineDay, -2), guide.week.end].sort()[0] : guide.week.end;
    const availableDays = Math.max(1, Math.round((Date.parse(`${latestStart}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000) + 1);
    const verify = closed || overdue || item.stale || item.instructionsStale || item.quizDetailsStale || item.status === 'unknown' || !item.dueAt;
    const unscheduled = !item.dueAt && !item.closesAt;
    const task = {
      id: `${item.id}:prepare`, sourceId: item.id, courseId: item.courseId, courseName: item.courseName,
      title: `${verify ? 'Check the next step for' : 'Prepare for'} ${item.title}`,
      reason: closed ? 'The recorded availability window has ended. Check whether an exception applies before planning further work.'
        : overdue ? 'The recorded deadline has passed. Confirm submission status and any extension before planning further work.'
        : !item.dueAt ? 'No deadline was supplied. Confirm whether this item requires action and when.'
        : item.stale || item.instructionsStale || item.quizDetailsStale || item.status === 'unknown' ? 'The available record needs verification before you rely on it.'
        : 'Start preparation before the recorded deadline; use the source for the actual requirements.',
      suggestedDate: unscheduled ? null : verify ? today : shiftDate(today, scheduledCount % availableDays),
      dueAt: item.dueAt, closesAt: item.closesAt, ai: false, needsVerification: verify,
      unscheduled, checks: [],
      steps: verify ? ['Check the current instructions, availability and your submission status in Canvas.', 'Record any confirmed next step in your student notes.']
        : ['Read the instructions and linked course materials.', 'Work through the relevant notes or practice, then identify what you still need to understand.', 'Check the deliverable and submission instructions before completing the work yourself.'],
    };
    tasks.push(task);
    if (!unscheduled) scheduledCount++;
    const itemCheck = (title, detail) => (unscheduled ? task.checks : checks).push({ sourceId: item.id, title, detail });
    if (item.stale) itemCheck(`Recheck ${item.title}`, 'This is last-known information from an incomplete or failed collection.');
    if (item.instructionsStale) itemCheck(`Recheck instructions: ${item.title}`, 'These instructions came from an earlier collection and were not rechecked. Compare them with the current source before relying on them.');
    if (item.quizDetailsStale) itemCheck(`Recheck quiz details: ${item.title}`, 'Question counts, time limits and attempt allowances are last-known information. Confirm the current landing-page details without starting or resuming a quiz.');
    if (!item.dueAt) itemCheck(`Confirm timing: ${item.title}`, 'A missing deadline does not mean this work is optional. Confirm applicability and timing.');
    if (item.status === 'unknown') itemCheck(`Confirm status: ${item.title}`, 'Canvas did not supply a reliable submission status. A local checkmark is not proof of submission.');
    if (!item.instructions) itemCheck(`Find instructions: ${item.title}`, 'Instructions were not included in the collected metadata. Check the source and associated course materials.');
    if (item.closesAt && item.dueAt && item.closesAt < item.dueAt) itemCheck(`Check availability: ${item.title}`, 'The recorded closing time is earlier than the due time. Confirm the usable window.');
  }
  for (const course of guide.courses) {
    const courseId = `course:${course.id}`;
    const source = (course.evidence || []).find(source => ['page', 'syllabus', 'website'].includes(source.kind) && source.body && !source.stale);
    const reviewCount = tasks.filter(task => task.courseId === course.id && task.unscheduled).length;
    tasks.push({ id: `${courseId}:materials:${guide.week.start}`, sourceId: source?.id || courseId, courseId: course.id, courseName: course.code || course.name,
      title: `Check this week's materials for ${course.code || course.name}`, suggestedDate: today,
      reason: 'Reading, lecture preparation and lab work may matter even when Canvas lists no deadline this week.',
      steps: ['Review the posted course schedule and identify this week’s assigned topics.', 'Separate required reading from optional supplementary material; note anything that is unclear.',
        ...(reviewCount ? [`Review the ${reviewCount} item${reviewCount === 1 ? '' : 's'} under Timing to confirm for this course. Confirm what applies this week before scheduling the work.`] : [])],
      dueAt: null, closesAt: null, ai: false });
    const gaps = course.coverage.filter(source => source.status !== 'ok');
    if (gaps.length) check(courseId, `Incomplete coverage: ${course.code || course.name}`, gaps.map(source => `${source.source}: ${source.message || source.status}`).join(' '));
    if ((course.references || []).length) check(courseId, `Check linked materials: ${course.code || course.name}`, 'Linked sites or files are listed in the source details; their contents may not yet be collected. They can contain additional readings, schedules and requirements.');
    for (const source of course.evidence || []) {
      if (['message', 'announcement'].includes(source.kind) && /\b(due|deadline|extend|extension|postpon|reschedul|second try|retake)/i.test(source.title + ' ' + source.body)) {
        check(source.id, `Compare instructor update: ${source.title}`, 'This message may qualify an assignment date or offer an optional retry. Compare its exact wording with the assignment; the guide has not replaced the recorded deadline.');
      }
    }
  }
  const sourceMap = new Map(guideSources(guide).map(source => [source.id, source]));
  // AI may refine preparation; recorded deadlines and verification-first tasks
  // remain controlled by source data. Quotes are verified before export/storage.
  for (const priority of guide.priorities || []) {
    const source = sourceMap.get(priority.sourceId);
    if (!source) continue;
    let task = tasks.find(task => task.sourceId === priority.sourceId);
    for (const question of priority.checks || []) (task?.unscheduled ? task.checks : checks).push({ sourceId: priority.sourceId, title: `ChatGPT suggests checking: ${source.title}`, detail: question });
    if (source.stale) continue;
    const steps = priority.steps?.map(step => ({ ...step }));
    if (task?.needsVerification) {
      if (steps?.length) { task.steps.push(...steps.map(step => ({ ...step, conditional: true }))); task.ai = true; }
      continue;
    }
    if (!task) {
      task = { id: `${priority.sourceId}:ai-preparation`, sourceId: priority.sourceId, courseId: source.courseId, courseName: source.courseName, dueAt: null, closesAt: null, steps: [], suggestedDate: today };
      tasks.push(task);
    }
    Object.assign(task, { title: priority.action, reason: priority.reason, ai: true });
    if (priority.suggestedDate) task.suggestedDate = priority.suggestedDate;
    if (steps?.length) task.steps = steps;
  }
  for (const task of tasks) {
    const source = sourceMap.get(task.sourceId);
    const fingerprint = [task.title, task.steps, task.dueAt, task.closesAt, source?.instructions || source?.body || '', source?.stale || false];
    // Preserve existing task hashes unless a newly distinguished source gap
    // changes what the student needs to verify. Repeated refresh times do not.
    if (source?.instructionsStale || source?.quizDetailsStale) fingerprint.push(Boolean(source.instructionsStale), Boolean(source.quizDetailsStale));
    task.fingerprint = createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
    const saved = progress[task.id];
    task.done = saved?.done === true && saved.fingerprint === task.fingerprint;
    task.changedSinceDone = saved?.done === true && saved.fingerprint !== task.fingerprint;
  }
  tasks.sort((a, b) => (a.suggestedDate || '9999').localeCompare(b.suggestedDate || '9999') || (a.dueAt || a.closesAt || '9999').localeCompare(b.dueAt || b.closesAt || '9999'));
  const boundary = task => [task.dueAt, task.closesAt].filter(Boolean).sort()[0] || '9999';
  const focus = guide.courses.flatMap(course => {
    const available = tasks.filter(task => task.courseId === course.id && !task.done && !task.unscheduled);
    const dated = available.filter(task => task.dueAt || task.closesAt).sort((a, b) => boundary(a).localeCompare(boundary(b)));
    const task = dated[0] || available.find(task => task.ai) || available[0];
    if (!task) return [];
    const sharedDeadlineCount = task.dueAt ? items.filter(item => item.courseId === course.id && item.dueAt === task.dueAt).length : 0;
    return [{ taskId: task.id, sourceId: task.sourceId, courseId: course.id, courseName: task.courseName,
      title: !task.ai && task.id.startsWith('course:') ? "Review this week's materials" : task.title,
      reason: task.reason, suggestedDate: task.suggestedDate, dueAt: task.dueAt, closesAt: task.closesAt,
      sharedDeadlineCount, deadlineNote: sharedDeadlineCount > 1 ? `${sharedDeadlineCount} outstanding items share this recorded due time. Review their workload together.` : null }];
  }).sort((a, b) => boundary(a).localeCompare(boundary(b)));
  const reviewGroups = guide.courses.map(course => ({ courseId: course.id, courseName: course.code || course.name,
    tasks: tasks.filter(task => task.unscheduled && task.courseId === course.id) })).filter(group => group.tasks.length);
  return {
    summary: `${guide.inWeek.length} outstanding dated item${guide.inWeek.length === 1 ? '' : 's'} this week or overdue; ${guide.upcoming.length} coming up; ${guide.undated.length} without a supplied deadline.`,
    note: 'These are suggested starting days, not a timetable or new course deadlines. Adjust to your availability. Preparation checkmarks are local and never submit coursework.',
    reviewNote: 'Items with no recorded due or closing time are grouped for review. They may still require work this week; compare them with the current course schedule during your weekly materials check. A missing date does not mean optional work.',
    focus, focusNote: 'One starting point per course, chosen from unfinished preparation tasks. Use the full plan for the remaining work and adjust suggested days to your availability.',
    tasks, checks, reviewGroups,
  };
}
