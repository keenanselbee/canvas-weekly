import { extractHtml, plainText, sourceUrl, referenceUrl, redactCredentials } from './content.js';
const timestamp = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

// Early saved guides stored plain syllabus/announcement text without evidence.
// Recover it locally, without treating an old snapshot as a fresh source read.
export function restoreLegacyEvidence(guide) {
  return { ...guide, courses: guide.courses.map(course => {
    if (Array.isArray(course.evidence)) return course;
    const evidence = [];
    const base = `${guide.origin}/courses/${course.id}`;
    const add = (kind, id, title, body, url, extra = {}) => {
      if (typeof body !== 'string' || !body.trim()) return;
      const target = referenceUrl(url, base);
      if (!target) return;
      evidence.push({ id: `${course.id}:${kind}:${id}`, courseId: course.id,
        courseName: course.code || course.name, kind, title: redactCredentials(String(title)),
        body: redactCredentials(body), sourceUrl: target, stale: true, observedAt: null,
        recovered: true, recoveredFromGuideAt: timestamp(guide.observedAt), ...extra });
    };
    add('syllabus', course.id, 'Course syllabus', course.syllabus, base + '/assignments/syllabus');
    for (const announcement of course.announcements || []) {
      if (!/^\d+$/.test(String(announcement.id))) continue;
      if (evidence.some(source => source.id === `${course.id}:announcement:${announcement.id}`)) continue;
      add('announcement', announcement.id, announcement.title || 'Course announcement', announcement.body,
        referenceUrl(announcement.sourceUrl, base) || base + '/announcements', { postedAt: timestamp(announcement.postedAt) });
    }
    return { ...course, evidence, coverage: [...course.coverage, ...(evidence.length ? [{
      source: 'saved course information', status: 'partial',
      message: 'Recovered from an older saved guide, not refreshed. Original source observation times are unavailable; recheck the current sources.',
    }] : [])] };
  }) };
}

export function courseEvidence(record, previous, origin, now) {
  const courseName = record.sources.metadata?.course.code || record.sources.metadata?.course.name || record.sources.course?.course_code || previous?.code || `Course ${record.id}`;
  const current = [];
  const references = new Map();
  const base = `${origin}/courses/${record.id}`;
  const add = (kind, id, title, html, url, extra = {}) => {
    const content = extractHtml(html);
    for (const link of content.links) {
      const target = referenceUrl(link, url || base);
      if (target) references.set(target, { title: target, sourceUrl: target, foundOn: url || base, status: 'Linked contents not collected' });
    }
    current.push({ id: `${record.id}:${kind}:${id}`, courseId: record.id, courseName, kind, title: String(title || kind),
      body: content.text, sourceUrl: url || base, observedAt: now, stale: false, ...extra });
  };
  if (record.sources.syllabus) {
    const url = base + '/assignments/syllabus';
    if (record.sources.syllabus.text) add('syllabus', record.id, 'Course syllabus', '', url, { body: record.sources.syllabus.text });
    for (const link of record.sources.syllabus.links) {
      const target = referenceUrl(link, url);
      if (target) references.set(target, { title: target, sourceUrl: target, foundOn: url, status: 'Linked contents not collected' });
    }
  } else if (!record.sources.syllabus && record.sources.course) add('syllabus', record.id, 'Course syllabus', record.sources.course.syllabus_body, base + '/assignments/syllabus');
  for (const page of record.sources.pages || []) {
    if (typeof page.body === 'string' && !page.locked_for_user) add('page', page.page_id, page.title, page.body, sourceUrl(page.html_url, origin, base + (page.url ? `/pages/${encodeURIComponent(page.url)}` : '/pages')));
  }
  for (const announcement of record.sources.announcements || []) add('announcement', announcement.id, announcement.title, announcement.message,
    sourceUrl(announcement.html_url, origin, base + '/announcements'), { postedAt: timestamp(announcement.posted_at) });
  for (const event of record.sources.calendar || []) {
    if (event.workflow_state === 'deleted') continue;
    add('event', event.id, event.title, event.description, sourceUrl(event.html_url, origin, base),
      { startsAt: timestamp(event.start_at), endsAt: timestamp(event.end_at), location: String(event.location_name || ''), allDay: Boolean(event.all_day) });
  }
  for (const module of record.sources.modules || []) {
    const detail = record.sources.moduleItems?.find(entry => entry.id === String(module.id));
    const title = String(module.name || 'Module');
    const body = (detail?.data || []).map(item => {
      const rule = item.completion_requirement;
      const requirement = rule && ({ must_view: 'View this item in Canvas', must_submit: 'Submit the work', must_contribute: 'Contribute in Canvas', must_mark_done: 'Mark done in Canvas', min_score: `Earn at least ${rule.min_score ?? 'the required'} points` })[rule.type];
      return `${item.title} (${item.type})${requirement ? `; ${requirement}` : ''}${item.content_details?.locked_for_user ? '; locked' : ''}`;
    }).join('\n');
    add('module', module.id, title, '', base + '/modules', {
      body, state: module.state || 'unknown', prerequisiteModuleIds: module.prerequisite_module_ids || [],
      sequential: Boolean(module.require_sequential_progress), detailsAvailable: Boolean(detail),
    });
    for (const item of detail?.data || []) {
      if (item.type !== 'ExternalUrl') continue;
      const target = referenceUrl(item.external_url, base);
      if (target) references.set(target, { title: String(item.title), sourceUrl: target, foundOn: base + '/modules', status: 'Linked contents not collected' });
    }
  }
  for (const entry of record.sources.conversation || []) {
    const conversation = entry.data;
    for (const message of conversation.messages || []) {
      if (message.generated) continue;
      const author = conversation.participants?.find(person => String(person.id) === String(message.author_id));
      // Store only the message author, never the whole participant/recipient roster.
      add('message', `${entry.id}:${message.id}`, conversation.subject, '', `${origin}/conversations`, {
        body: redactCredentials(message.body || ''), author: String(author?.name || 'Author not supplied'), authorUnverified: !author?.name, postedAt: timestamp(message.created_at),
      });
    }
  }
  for (const group of record.sources.groups || []) add('grading', group.id, group.name, '', base + '/assignments', {
    body: `Assignment group weight: ${typeof group.group_weight === 'number' ? group.group_weight + '%' : 'not supplied'}. ${record.sources.course?.apply_assignment_group_weights ? 'Weighted groups enabled.' : 'Whether group weights apply is not confirmed.'}`,
  });
  for (const assignment of record.sources.assignments || []) {
    if (assignment.rubric?.length) add('rubric', assignment.id, `${assignment.name}: rubric`, '', sourceUrl(assignment.html_url, origin, base + `/assignments/${assignment.id}`), {
      body: assignment.rubric.map(criterion => `${plainText(criterion.description)}: ${plainText(criterion.long_description)} (${criterion.points ?? 'unspecified'} points)`).join('\n'),
    });
    for (const link of extractHtml(assignment.description).links) {
      const target = referenceUrl(link, base + `/assignments/${assignment.id}`);
      if (target) references.set(target, { title: target, sourceUrl: target, foundOn: base + `/assignments/${assignment.id}`, status: 'Linked contents not collected' });
    }
  }
  for (const file of record.sources.files || []) {
    const url = base + `/files/${file.id}`;
    references.set(url, { title: String(file.display_name || file.filename || 'Course file'), sourceUrl: url, foundOn: base + '/files', status: file.locked_for_user ? 'File is locked' : 'Contents not collected: Canvas file views and downloads can update module progress. Check the original yourself.' });
  }
  for (const website of record.sources.websites || []) {
    for (const page of website.pages) add('website', page.id, page.title, '', page.sourceUrl, {
      body: page.body, siteId: website.siteId, observedAt: page.observedAt,
    });
    for (const reference of website.references) references.set(reference.sourceUrl, reference);
    for (const page of website.pages) references.delete(page.sourceUrl);
  }
  const seen = new Set(current.map(source => source.id));
  for (const source of previous?.evidence || []) {
    if (!seen.has(source.id)) current.push({ ...source, stale: true });
    else if (source.kind === 'module') {
      const fresh = current.find(item => item.id === source.id);
      if (!fresh.detailsAvailable) Object.assign(fresh, { body: source.body, stale: true });
    }
  }
  const collected = new Set(current.filter(source => !source.stale).map(source => source.sourceUrl));
  for (const reference of previous?.references || []) if (!references.has(reference.sourceUrl) && !collected.has(reference.sourceUrl)) references.set(reference.sourceUrl, { ...reference, stale: true });
  return { evidence: current, references: [...references.values()] };
}
