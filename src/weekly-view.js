import { factualTask } from './factual-task.js';

// Shared presentation for the renderer and document exports; no Node or network.
export function weeklyView(guide) {
  if (!guide.aiGuide) return null;
  const sources = new Map([...guide.items, ...guide.courses.flatMap(course => [
    { id: `course:${course.id}`, title: course.name, sourceUrl: course.sourceUrl }, ...(course.evidence || []),
  ])].map(source => [source.id, source]));
  const cite = ids => ids.map(id => ({ id, title: sources.get(id)?.title || 'Source unavailable', url: sources.get(id)?.sourceUrl || null }));
  const date = value => new Intl.DateTimeFormat('en-CA', { timeZone: guide.timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  return {
    generatedAt: guide.aiGuide.generatedAt,
    note: 'AI interpretation of saved course information. Check source quotes and uncertainties. Suggested study days are not course deadlines; preparation checkmarks stay on this device.',
    overview: guide.aiGuide.overview.map(entry => ({ ...entry, citations: cite(entry.sourceIds) })),
    courses: guide.aiGuide.courses.map(course => ({ ...course,
      name: guide.courses.find(item => item.id === course.courseId)?.code || guide.courses.find(item => item.id === course.courseId)?.name || course.courseId,
      tasks: course.tasks.map(task => {
        const source = sources.get(task.sourceId);
        const local = guide.studyPlan?.tasks.find(item => item.sourceId === task.sourceId);
        const checks = [...task.checks];
        const recorded = [];
        if (source?.status) {
          const facts = factualTask(source);
          recorded.push(...facts.facts);
          if (facts.needs.length) checks.push(`Confirm ${facts.needs.join(', ')}.`);
          recorded.push(source.dueAt ? `${source.stale || source.dueDateStale ? 'Last-known due' : 'Recorded due'}: ${date(source.dueAt)}.` : 'Deadline not supplied.');
          if (source.closesAt) recorded.push(`${source.stale || source.availabilityStale ? 'Last-known closing time' : 'Recorded closing time'}: ${date(source.closesAt)}.`);
        }
        if (source?.stale) checks.push('This source is last-known; check the current version.');
        if (source?.partial) checks.push(source.coverageNote || 'Only part of this source was collected.');
        if (source?.authorUnverified || source?.authorRoleUnverified) checks.push('Confirm the message sender and their course role before treating it as instructor guidance.');
        return { ...task, citations: cite([task.sourceId]), recorded, checks: [...new Set(checks)],
          localId: local?.id || null, done: Boolean(local?.done), changedSinceDone: Boolean(local?.changedSinceDone) };
      }),
    })),
    questions: guide.aiGuide.questions.map(entry => ({ ...entry, citations: cite(entry.sourceIds) })),
  };
}

export function weeklyMarkdown(guide) {
  const view = weeklyView(guide);
  if (!view) return [];
  const md = value => String(value ?? '').replace(/[\\`*_{}\[\]<>|#]/g, '\\$&').replace(/\r?\n/g, ' ');
  const links = citations => citations.filter(source => source.url).map(source => `[${md(source.title)}](<${source.url}>)`).join(' · ');
  const lines = ['## Your AI weekly guide', '', view.note, '', `AI generated: ${md(view.generatedAt)}. Collection timestamp remains above.`, ''];
  for (const entry of view.overview) lines.push(`- ${md(entry.text)} ${links(entry.citations)}`, '');
  for (const course of view.courses) {
    lines.push(`### ${md(course.name)}`, '', md(course.focus), '');
    for (const task of course.tasks) {
      lines.push(`- [${task.done ? 'x' : ' '}] **${md(task.action)}**`, '', md(task.reason), '');
      if (task.suggestedDate) lines.push(`Suggested study day: ${task.suggestedDate}.`, '');
      for (const fact of task.recorded) lines.push(md(fact), '');
      if (task.changedSinceDone) lines.push('Changed since you checked it off; review again.', '');
      for (const step of task.steps) {
        lines.push(`- ${step.kind === 'suggested' ? 'Suggested preparation' : `${step.kind} (AI interpretation)`}: ${md(step.text)}`);
        if (step.quote) lines.push('', `> Source quote: ${md(step.quote)}`, '');
      }
      for (const check of task.checks) lines.push('', `Needs checking: ${md(check)}`);
      lines.push('', links(task.citations), '');
    }
  }
  lines.push('### Questions to double-check', '');
  for (const entry of view.questions) lines.push(`- ${md(entry.text)} ${links(entry.citations)}`, '');
  if (!view.questions.length) lines.push('No additional questions were supplied by AI. Review the source coverage below.', '');
  return lines;
}
