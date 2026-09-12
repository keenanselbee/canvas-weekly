// Summarize recorded data without interpreting titles as requirements or
// treating local preparation checks as Canvas submissions.
export function factualOverview(guide) {
  const current = new Set(guide.inWeek.map(item => item.id));
  const upcoming = new Set(guide.upcoming.map(item => item.id));
  const courses = guide.courses.map(course => {
    const items = guide.items.filter(item => item.courseId === course.id);
    const outstanding = items.filter(item => item.status !== 'submitted');
    const dated = outstanding.filter(item => current.has(item.id) || upcoming.has(item.id))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.title.localeCompare(b.title));
    const first = dated[0];
    const next = first ? { ...first, sharedDeadlineCount: dated.filter(item => item.dueAt === first.dueAt).length } : null;
    return {
      id: course.id, name: course.name,
      counts: {
        total: items.length,
        current: outstanding.filter(item => current.has(item.id)).length,
        upcoming: outstanding.filter(item => upcoming.has(item.id)).length,
        undated: outstanding.filter(item => !item.dueAt).length,
        later: outstanding.filter(item => item.dueAt && !current.has(item.id) && !upcoming.has(item.id)).length,
        submitted: items.filter(item => item.status === 'submitted').length,
        unknown: outstanding.filter(item => item.status === 'unknown').length,
        stale: items.filter(item => item.stale || item.dueDateStale || item.instructionsStale || item.availabilityStale || item.quizDetailsStale).length,
      },
      next,
      coverageGaps: course.coverage.filter(source => source.status !== 'ok').length,
      sourceTexts: (course.evidence || []).filter(source => source.body).length,
      uncollectedLinks: (course.references || []).filter(source => source.status !== 'collected').length,
    };
  });
  return { courses,
    note: 'Counts describe collected assessments, not a complete workload. Unknown submission status is included with outstanding work. Undated items may be reference material; confirm whether action is required.',
    summary: `${guide.inWeek.length} this week or overdue; ${guide.upcoming.length} coming up within the 21-day lookahead; ${guide.undated.length} without a recorded deadline.`,
  };
}

export function courseCountText(counts) {
  return `${counts.current} this week or overdue · ${counts.upcoming} coming up · ${counts.undated} undated · ${counts.later} beyond the lookahead · ${counts.submitted} submitted`;
}
