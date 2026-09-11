import { randomUUID } from 'node:crypto';

export const COLLECTION_ISSUE = 'Canvas refresh is paused for a safety repair. Canvas page and permission reads can update module progress. Your saved guide and local checklists remain available; check current deadlines in Canvas yourself.';

const id = value => {
  if (!/^\d+$/.test(String(value))) throw new Error('Invalid Canvas identifier.');
  return String(value);
};

const operations = {
  profile: () => ['/api/v1/users/self/profile', {}],
  courses: () => ['/api/v1/courses', { enrollment_type: 'student', enrollment_state: 'active', 'include[]': 'term' }],
  course: args => [`/api/v1/courses/${id(args.courseId)}`, { 'include[]': 'syllabus_body' }],
  // The names-only serializer returns before file/module lock evaluation.
  files: args => [`/api/v1/courses/${id(args.courseId)}/files`, { 'only[]': 'names' }],
  groups: args => [`/api/v1/courses/${id(args.courseId)}/assignment_groups`, {}],
  announcements: args => ['/api/v1/announcements', { 'context_codes[]': `course_${id(args.courseId)}`, start_date: '1970-01-01', active_only: 'true' }],
  conversations: args => ['/api/v1/conversations', { 'filter[]': `course_${id(args.courseId)}` }],
  conversation: args => [`/api/v1/conversations/${id(args.conversationId)}`, { auto_mark_as_read: 'false' }],
  calendar: args => ['/api/v1/calendar_events', { 'context_codes[]': `course_${id(args.courseId)}`, all_events: 'true', type: 'event' }],
};

export function requestUrl(origin, operation, args = {}) {
  if (!Object.hasOwn(operations, operation)) throw new Error('This Canvas operation is not permitted.');
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Invalid Canvas origin.');
  const [route, parameters] = operations[operation](args);
  const url = new URL(route, base);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  url.searchParams.set('per_page', '100');
  return url;
}

export function validateNextPage(value, initial) {
  const next = new URL(value, initial);
  if (next.origin !== initial.origin || next.pathname !== initial.pathname || next.username || next.password || next.hash) {
    throw new Error('Canvas returned an unsafe pagination link.');
  }
  const fixed = search => [...search].filter(([key]) => !['page', 'per_page'].includes(key)).sort().map(pair => JSON.stringify(pair)).join('|');
  if (fixed(next.searchParams) !== fixed(initial.searchParams)) throw new Error('Canvas pagination changed a protected request parameter.');
  if (next.searchParams.getAll('page').length > 1 || next.searchParams.getAll('per_page').length > 1) throw new Error('Invalid pagination parameters.');
  // Canvas may use an opaque page cursor; it stays a query value, never a route.
  return next;
}

export function permittedRead(value, origin) {
  try {
    const url = new URL(value);
    const context = url.searchParams.get('context_codes[]') || url.searchParams.get('filter[]') || '';
    const args = {
      courseId: url.pathname.match(/^\/api\/v1\/courses\/(\d+)(?:\/|$)/)?.[1] || context.match(/^course_(\d+)$/)?.[1],
      conversationId: url.pathname.match(/^\/api\/v1\/conversations\/(\d+)$/)?.[1],
    };
    const count = url.searchParams.get('per_page');
    if (count !== null && (!/^\d+$/.test(count) || Number(count) < 1 || Number(count) > 100)) return false;
    for (const operation of Object.keys(operations)) {
      try { validateNextPage(url.href, requestUrl(origin, operation, args)); return true; }
      catch { /* This URL must exactly match one of the remaining operations. */ }
    }
  } catch { /* Invalid URL. */ }
  return false;
}

export function blockedAssessmentUrl(value) {
  try {
    const url = new URL(value);
    const route = decodeURIComponent(url.pathname).toLowerCase();
    return /\/(take|resume|submit|submissions|quiz_submissions|questions|quiz_questions|external_tools|external_tool_retrieve|assessment_questions|moderate)(\/|$)/.test(route)
      || /\/modules\/items\//.test(route)
      || /\/courses\/\d+\/modules(\/|$)/.test(route)
      || /\/(quizzes|assignments)\/\d+\/(edit|preview|history|retake|start)(\/|$)/.test(route);
  } catch { return true; }
}

// File previews/downloads can satisfy Canvas module view requirements. This is
// separate from reference links: a student may deliberately open the original.
export function blockedCanvasFileRead(value) {
  try {
    const route = decodeURIComponent(new URL(value).pathname).toLowerCase();
    return /%|\\/.test(route)
      || /^\/(?:api\/v1\/)?(?:(?:courses|users|groups|accounts)\/\d+\/)?files\/\d+(?:[/.]|$)/.test(route)
      || /^\/(?:courses|users|groups|accounts)\/\d+\/file_contents(?:\/|$)/.test(route);
  } catch { return true; }
}

export class CanvasClient {
  get collectionIssue() {
    return COLLECTION_ISSUE;
  }
  constructor({ origin, fetcher, token, signal, onProgress = () => {}, audit = async () => {} }) {
    this.origin = new URL(origin).origin;
    this.fetcher = fetcher;
    this.token = token;
    this.signal = signal;
    this.onProgress = onProgress;
    this.audit = audit;
  }
  async read(operation, args = {}, list = false) {
    const initial = requestUrl(this.origin, operation, args);
    let next = initial;
    const results = [];
    const visited = new Set();
    let totalBytes = 0;
    while (next) {
      this.signal?.throwIfAborted();
      if (visited.has(next.href) || visited.size >= 500) throw new Error('Canvas pagination did not finish. Existing data has been preserved.');
      visited.add(next.href);
      let response;
      for (let attempt = 0; attempt < 3; attempt++) {
        const evidence = { requestId: randomUUID(), operation, origin: next.origin, path: next.pathname,
          paginated: next.searchParams.has('page'), preservesUnread: operation === 'conversation' };
        await this.audit({ ...evidence, event: 'request' });
        this.signal?.throwIfAborted();
        try {
          response = await this.fetcher(next.href, {
            method: 'GET', redirect: 'manual', credentials: this.token ? 'omit' : 'include',
            headers: { Accept: 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
            signal: this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
          });
        } catch (error) {
          await this.audit({ ...evidence, event: 'network-error' });
          throw error;
        }
        try { await this.audit({ ...evidence, event: 'response', status: response.status }); }
        catch (error) { await response.body?.cancel(); throw error; }
        if (response.status !== 429 || attempt === 2) break;
        const delay = Math.min(10000, Math.max(1000, Number(response.headers.get('retry-after')) * 1000 || 2000 * (attempt + 1)));
        await response.body?.cancel();
        await new Promise((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(this.signal.reason); };
          const timer = setTimeout(() => { this.signal?.removeEventListener('abort', abort); resolve(); }, delay);
          this.signal?.addEventListener('abort', abort, { once: true });
          if (this.signal?.aborted) abort();
        });
      }
      if (response.status === 401) throw new Error('Canvas login expired. Reconnect Canvas and try again.');
      if (response.status === 403) throw new Error('Canvas does not permit access to this information.');
      if (response.status >= 300 && response.status < 400) throw new Error('Canvas redirected this read. Reconnect or use an institution-issued API token.');
      if (!response.ok) throw new Error(`Canvas could not provide this information (HTTP ${response.status}).`);
      if (!(response.headers.get('content-type') || '').includes('json')) throw new Error('Canvas returned a sign-in page instead of course data. Reconnect Canvas.');
      const reader = response.body.getReader();
      const chunks = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        totalBytes += value.length;
        if (length > 8 * 1024 * 1024 || totalBytes > 16 * 1024 * 1024) { await reader.cancel(); throw new Error('Canvas response exceeded the supported size.'); }
        chunks.push(value);
      }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^while\(1\);/, '')); }
      catch { throw new Error('Canvas returned unreadable course data.'); }
      if (!list) return data;
      if (!Array.isArray(data)) throw new Error('Canvas returned an unexpected list format.');
      results.push(...data);
      if (results.length > 10000) throw new Error('Canvas listing exceeded the supported size.');
      const link = response.headers.get('link') || '';
      const match = link.match(/<([^>]+)>\s*;\s*rel="next"/);
      next = match ? validateNextPage(match[1], initial) : null;
    }
    return results;
  }
  async collect() {
    this.signal?.throwIfAborted();
    // No Canvas reads until the replacement collector's complete authorization
    // and serialization paths have been reviewed, including indirect lock reads.
    throw new Error(this.collectionIssue);
  }
}
