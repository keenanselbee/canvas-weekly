import { courseEvidence } from './course-evidence.js';
import { buildGuide } from './guide.js';

// Refresh only explicitly connected website sources. Canvas records retain
// their original timestamps, field flags and values throughout this operation.
export function refreshWebsiteEvidence(saved, results, now = new Date().toISOString()) {
  if (!results.length || results.some(site => !saved.courses.some(course => course.id === site.courseId))) throw new Error('Choose connected websites belonging to the saved courses.');
  if (!results.some(site => site.pages.length)) throw new Error('No course website material could be refreshed. Your previous guide is preserved; check website connections in Courses.');
  const changes = [...saved.changes];
  const courses = saved.courses.map(course => {
    const sites = results.filter(site => site.courseId === course.id);
    if (!sites.length) return course;
    const ids = new Set(sites.map(site => site.siteId));
    const refreshedSource = source => source.kind === 'website' && ids.has(source.siteId);
    const previousSources = (course.evidence || []).filter(refreshedSource);
    const oldPages = new Set(previousSources.map(source => source.sourceUrl));
    const coverage = [
      ...course.coverage.filter(entry => !sites.some(site => entry.source === `website:${site.siteId}` || entry.source.startsWith(`website:${site.siteId}:`))),
      ...sites.flatMap(site => site.coverage),
    ];
    const updated = courseEvidence({ id: course.id, sources: { websites: sites }, coverage },
      { ...course, evidence: previousSources, references: (course.references || []).filter(reference => oldPages.has(reference.foundOn)) }, saved.origin, now);
    for (const source of updated.evidence) {
      if (source.stale) continue;
      const previous = previousSources.find(item => item.id === source.id);
      if (!previous || ['body', 'title', 'coverageNote'].some(field => previous[field] !== source[field]) || Boolean(previous.partial) !== Boolean(source.partial)) {
        const existing = changes.findIndex(change => change.itemId === source.id);
        if (existing >= 0) changes.splice(existing, 1);
        changes.push({ itemId: source.id, courseName: source.courseName, title: source.title, field: previous ? 'course-information' : 'new', sourceUrl: source.sourceUrl });
      }
    }
    const evidence = [...(course.evidence || []).filter(source => !refreshedSource(source)), ...updated.evidence];
    const collected = new Set(updated.evidence.filter(source => !source.stale).map(source => source.sourceUrl));
    const references = new Map((course.references || []).filter(reference => !oldPages.has(reference.foundOn) && !collected.has(reference.sourceUrl)).map(reference => [reference.sourceUrl, reference]));
    for (const reference of updated.references) references.set(reference.sourceUrl, reference);
    return { ...course, coverage, evidence, references: [...references.values()] };
  });
  const next = { ...saved, courses, changes, priorities: [], websiteRefreshedAt: now };
  delete next.aiGuide; delete next.planningCoverage; delete next.planningNote;
  const guide = buildGuide(next, now);
  guide.generatedAt = saved.generatedAt;
  return guide;
}
