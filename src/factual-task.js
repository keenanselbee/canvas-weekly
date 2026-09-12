// Use collected records only. Never infer requirements from titles or shorten a
// long instruction by dropping conditions, exceptions or surrounding paragraphs.
export function factualTask(item) {
  const facts = [`Submission status: ${item.status === 'not-submitted' ? 'Not submitted' : item.status === 'submitted' ? 'Submitted' : 'Unknown; confirm in Canvas'}${item.stale ? ' (last-known)' : ''}.`];
  if (item.points != null) facts.push(`Points: ${item.points} (not necessarily course weight).`);
  if (item.quizId && item.questionCount != null) facts.push(`Questions: ${item.questionCount}${item.quizDetailsStale ? ' (last-known)' : ''}.`);
  const needs = [];
  if (item.stale) needs.push('this last-known record');
  if (!item.dueAt || item.dueDateStale) needs.push('the current deadline');
  if (item.availabilityStale) needs.push('opening and closing dates');
  if (!item.instructions || item.instructionsStale) needs.push('the current instructions');
  if (item.quizDetailsStale) needs.push('quiz settings');
  if (item.status === 'unknown') needs.push('submission status');
  const instructions = typeof item.instructions === 'string' ? item.instructions.trim() : '';
  const sources = instructions ? [{ sourceId: item.id, title: 'Posted instructions',
    text: instructions.length <= 1200 ? instructions : '',
    note: instructions.length > 1200 ? 'The instructions are lengthy. Read the full text in Source details; no shortened requirements were inferred.' : 'Complete collected instruction text; linked or embedded materials may add requirements.',
    stale: Boolean(item.stale || item.instructionsStale), observedAt: item.instructionsObservedAt || null }] : [];
  return { facts, needs, sources };
}

export function factualMaterials(course) {
  const available = (course.evidence || []).filter(source => ['page', 'syllabus', 'website'].includes(source.kind) && source.body);
  return { sources: available.slice(0, 6).map(source => ({ sourceId: source.id, title: source.title,
    text: source.body.trim().length <= 1200 ? source.body.trim() : '',
    note: 'Collected course material. Confirm which topics apply this week; this is not an assigned-reading determination.',
    stale: Boolean(source.stale), observedAt: source.observedAt || null })),
    sourceIds: available.map(source => source.id), more: Math.max(0, available.length - 6) };
}
