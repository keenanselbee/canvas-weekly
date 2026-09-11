import { createHash, randomUUID } from 'node:crypto';
import { metadataRequest, permittedMetadataBody, parseMetadataPage } from './canvas-metadata.js';
import { ownSubmissionRequest, parseOwnSubmission } from './canvas-own-submission.js';
import { permittedEnrollmentScopeBody } from './canvas-enrollment-scope.js';
import { canvasResponseIdentity } from './canvas-identity.js';

const pageLimit = 2 * 1024 * 1024;
const collectionLimit = 16 * 1024 * 1024;

function untilAborted(task, signal, discard = () => {}) {
  return new Promise((resolve, reject) => {
    let stopped = false;
    const abort = () => { stopped = true; signal.removeEventListener('abort', abort); reject(new DOMException('Metadata read cancelled.', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    Promise.resolve(task).then(value => {
      signal.removeEventListener('abort', abort);
      if (stopped) discard(value);
      else resolve(value);
    }, error => {
      signal.removeEventListener('abort', abort);
      if (!stopped) reject(error);
    });
  });
}

function discardResponse(response) {
  try { response?.body?.cancel().catch(() => {}); } catch { /* Already closed or locked. */ }
}

const accountScopeUnavailable = 'Canvas account permissions could not be confirmed. Collection stopped.';

function requireEmptyAccountPage(data, headers, origin) {
  if (!Array.isArray(data) || data.length) throw new Error(accountScopeUnavailable);
  const links = headers.get('link');
  if (links === null) return;
  if (!links.length || links.length > 8192) throw new Error(accountScopeUnavailable);
  const seen = new Set();
  for (const part of links.split(',')) {
    const match = part.match(/^\s*<([^<>]+)>;\s*rel="(first|current|last)"\s*$/);
    if (!match || seen.has(match[2])) throw new Error(accountScopeUnavailable);
    seen.add(match[2]);
    let url;
    try { url = new URL(match[1]); } catch { throw new Error(accountScopeUnavailable); }
    if (url.origin !== origin || url.pathname !== '/api/v1/accounts' || url.username || url.password || url.hash
      || url.searchParams.size !== 2 || url.searchParams.getAll('page').length !== 1
      || !['1', 'first'].includes(url.searchParams.get('page')) || url.searchParams.get('per_page') !== '1') throw new Error(accountScopeUnavailable);
  }
}

// CanvasConnection creates this transport only inside its guarded metadata run.
// The production refresh hold remains in force before any transport is created.
// Create one instance per course collection using a verified account binding.
export class CanvasMetadataTransport {
  #assignmentIds = new Set();
  #origin;
  #courseId;
  #studentId;
  #globalUserId;
  #identityRejected = false;
  #accountScopeRejected = false;
  #connectionSignal;
  #authentication;
  #fetcher;
  #audit;
  #pending = null;
  #busy = false;
  #bytes = 0;
  #requests = 0;

  constructor({ origin, courseId, studentId, globalUserId, connectionSignal, authentication, fetcher, audit }) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid Canvas metadata origin.');
    metadataRequest('assignments', courseId, studentId);
    if (typeof globalUserId !== 'string' || !/^[1-9]\d{0,31}$/.test(globalUserId)) throw new Error('A verified global Canvas account identity is required.');
    if (!(connectionSignal instanceof AbortSignal) || typeof authentication !== 'function' || typeof fetcher !== 'function' || typeof audit !== 'function') throw new Error('A bound connection, authentication, transport and audit are required.');
    this.#origin = url.origin;
    this.#courseId = courseId;
    this.#studentId = studentId;
    this.#globalUserId = globalUserId;
    this.#connectionSignal = connectionSignal;
    this.#authentication = authentication;
    this.#fetcher = fetcher;
    this.#audit = audit;
  }

  // Install only on the same isolated Electron session used by fetcher. Admit
  // one main-process request with exactly these upload bytes; no files or blobs.
  allows(details) {
    const pending = this.#pending;
    if (!pending || this.#identityRejected || this.#accountScopeRejected || pending.admitted !== null || pending.signal.aborted
      || details.url !== pending.url || details.method !== pending.method
      || (details.webContentsId !== undefined && details.webContentsId !== 0) || details.webContents || details.frame
      || !Number.isSafeInteger(details.id) || details.id < 0) return false;
    if (pending.method === 'GET') {
      if (details.uploadData !== undefined && (!Array.isArray(details.uploadData) || details.uploadData.length)) return false;
      pending.admitted = details.id;
      return true;
    }
    if (!Array.isArray(details.uploadData) || !details.uploadData.length || details.uploadData.length > 16) return false;
    let offset = 0;
    for (const part of details.uploadData) {
      if (!part || Object.hasOwn(part, 'file') || Object.hasOwn(part, 'blobUUID') || !Buffer.isBuffer(part.bytes)
        || part.bytes.length > pending.body.length - offset
        || !part.bytes.equals(pending.body.subarray(offset, offset + part.bytes.length))) return false;
      offset += part.bytes.length;
    }
    if (offset !== pending.body.length) return false;
    pending.admitted = details.id;
    return true;
  }

  async request(value, signal) {
    let body;
    try { body = JSON.stringify(value); } catch { /* Reject unserializable inputs. */ }
    if (!(permittedMetadataBody(body, this.#courseId, this.#studentId) || permittedEnrollmentScopeBody(body, this.#courseId, this.#studentId))
      || Buffer.byteLength(body) > 8192) throw new Error('This Canvas metadata request is not permitted.');
    const envelope = JSON.parse(body);
    const operation = { CanvasWeeklyAssignments: 'metadataassignments', CanvasWeeklySubmissionStates: 'metadatasubmissions', CanvasWeeklyEnrollmentScope: 'metadataenrollments' }[envelope.operationName];
    return this.#read({ method: 'POST', path: '/api/graphql', operation, body, paginated: envelope.variables.after !== null }, signal);
  }

  // Only validated assignment pages read by this transport can extend the direct
  // submission scope. Arbitrary IDs from a renderer or saved guide are rejected.
  async readAssignmentPage(after = null, signal) {
    const value = await this.request(metadataRequest('assignments', this.#courseId, this.#studentId, after), signal);
    const page = parseMetadataPage(value, 'assignments', this.#courseId);
    for (const assignment of page.nodes) this.#assignmentIds.add(assignment.id);
    return page;
  }

  async readOwnSubmission(assignmentId, signal) {
    if (!this.#assignmentIds.has(assignmentId)) throw new Error('Read this assignment from the selected course before checking its submission.');
    const body = JSON.stringify(ownSubmissionRequest(assignmentId, this.#studentId));
    const value = await this.#read({ method: 'POST', path: '/api/graphql', operation: 'metadataownsubmission', body, paginated: false }, signal);
    return parseOwnSubmission(value, assignmentId);
  }

  // Negative membership evidence only, not authorization to read course data.
  // Never enumerate accounts or accept a caller-supplied URL or pagination link.
  checkAccountMembership(signal) {
    return this.#read({ method: 'GET', path: '/api/v1/accounts', query: '?per_page=1', operation: 'accountscope', paginated: false }, signal);
  }

  async #read({ method, path, query = '', operation, body, paginated }, signal) {
    if (this.#identityRejected) throw new Error('Reconnect Canvas before reading metadata.');
    if (this.#accountScopeRejected) throw new Error(accountScopeUnavailable);
    if (this.#busy) throw new Error('A Canvas metadata read is already running.');
    if (this.#requests >= 200 || this.#bytes >= collectionLimit) throw new Error('Canvas metadata exceeded the collection limit.');
    const timeout = new AbortController();
    const combined = AbortSignal.any([this.#connectionSignal, timeout.signal, ...(signal ? [signal] : [])]);
    const cancelled = () => new DOMException(timeout.signal.aborted ? 'Canvas metadata read timed out.' : 'Canvas metadata read cancelled.', timeout.signal.aborted ? 'TimeoutError' : 'AbortError');
    if (combined.aborted) throw cancelled();
    const timer = setTimeout(() => timeout.abort(), 30000);
    timer.unref?.();
    this.#busy = true;
    const evidence = { requestId: randomUUID(), operation,
      origin: this.#origin, path, method, paginated,
      ...(body === undefined ? {} : { bodyHash: createHash('sha256').update(body).digest('hex') }) };
    let intent = false;
    let response;
    let reader;
    let auditFailed = false;
    const write = async event => {
      try { await this.#audit({ ...evidence, ...event }); }
      catch { auditFailed = true; throw new Error('Canvas metadata audit could not be saved. Collection stopped.'); }
    };
    const stopReader = () => { reader?.cancel().catch(() => {}); };
    combined.addEventListener('abort', stopReader, { once: true });
    try {
      let auth;
      try { auth = await untilAborted(this.#authentication(), combined); }
      catch { if (combined.aborted) throw cancelled(); throw new Error('Reconnect Canvas before reading metadata.'); }
      if (combined.aborted) throw cancelled();
      if (!auth || !['session', 'token'].includes(auth.kind) || typeof auth.value !== 'string'
        || !auth.value.length || auth.value.length > 4096 || /[^\x21-\x7e]/.test(auth.value)) throw new Error('Reconnect Canvas before reading metadata.');
      const headers = { Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        ...(auth.kind === 'token' ? { Authorization: `Bearer ${auth.value}` } : method === 'POST' ? { 'X-CSRF-Token': auth.value } : {}) };
      await write({ event: 'request' });
      intent = true;
      if (combined.aborted) throw cancelled();
      this.#requests++;
      const pending = { url: this.#origin + path + query, method, body: body === undefined ? null : Buffer.from(body), admitted: null, signal: combined };
      this.#pending = pending;
      response = await untilAborted(this.#fetcher(pending.url, { method, ...(body === undefined ? {} : { body }), headers,
        credentials: auth.kind === 'session' ? 'include' : 'omit', redirect: 'manual', signal: combined }), combined, discardResponse);
      this.#pending = null;
      if (combined.aborted) throw cancelled();
      if (pending.admitted === null) throw new Error('Canvas metadata interception was not confirmed.');
      await write({ event: 'response', status: response.status });
      if (response.status === 401) throw new Error('Canvas login expired. Reconnect Canvas.');
      if (response.status === 403) throw new Error('This Canvas connection cannot read metadata. No broader permissions were requested.');
      if (response.status >= 300 && response.status < 400) throw new Error('Canvas redirected the metadata read. The redirect was not followed.');
      if (response.status !== 200) throw new Error('Canvas could not provide metadata. Try again later.');
      try { canvasResponseIdentity(response.headers, this.#globalUserId); }
      catch { this.#identityRejected = true; throw new Error('Reconnect Canvas before reading metadata.'); }
      const contentType = response.headers.get('content-type') || '';
      if (!/^application\/(json|graphql-response\+json)(?:\s*;\s*charset\s*=\s*"?utf-8"?)?$/i.test(contentType)) throw new Error('Canvas returned an unsupported metadata response.');
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > pageLimit)) throw new Error('Canvas metadata exceeded the response limit.');
      reader = response.body.getReader();
      if (combined.aborted) throw cancelled();
      const chunks = [];
      let bytes = 0;
      while (true) {
        const { done, value: chunk } = await untilAborted(reader.read(), combined);
        if (combined.aborted) throw cancelled();
        if (done) break;
        bytes += chunk.byteLength;
        this.#bytes += chunk.byteLength;
        if (bytes > pageLimit || this.#bytes > collectionLimit) throw new Error('Canvas metadata exceeded the response limit.');
        chunks.push(chunk);
      }
      let data;
      try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)).replace(/^while\(1\);/, '')); }
      catch { throw new Error('Canvas returned unreadable metadata.'); }
      if (operation === 'accountscope') requireEmptyAccountPage(data, response.headers, this.#origin);
      await write({ event: 'body-read' });
      if (combined.aborted) throw cancelled();
      // GraphQL errors and fields are validated by the operation's collector.
      return operation === 'accountscope' ? Object.freeze({ studentId: this.#studentId, globalUserId: this.#globalUserId, accountMembership: 'none' }) : data;
    } catch (error) {
      if (operation === 'accountscope') this.#accountScopeRejected = true;
      if (intent && !auditFailed) await write({ event: response ? 'read-error' : 'network-error' });
      if (auditFailed) throw new Error('Canvas metadata audit could not be saved. Collection stopped.');
      if (combined.aborted) throw cancelled();
      // Only errors created here are suitable for display. Transport/auth errors
      // can contain URLs, headers, credentials or institution response bodies.
      const known = [accountScopeUnavailable, 'Reconnect Canvas before reading metadata.', 'Canvas metadata interception was not confirmed.',
        'Canvas login expired. Reconnect Canvas.', 'This Canvas connection cannot read metadata. No broader permissions were requested.',
        'Canvas redirected the metadata read. The redirect was not followed.', 'Canvas could not provide metadata. Try again later.',
        'Canvas returned an unsupported metadata response.', 'Canvas metadata exceeded the response limit.', 'Canvas returned unreadable metadata.'];
      throw new Error(known.includes(error?.message) ? error.message : 'Canvas metadata could not be read. Previous information must be preserved.');
    } finally {
      this.#pending = null;
      clearTimeout(timer);
      combined.removeEventListener('abort', stopReader);
      if (reader) {
        try { reader.cancel().catch(() => {}); reader.releaseLock(); } catch { /* Do not replace the original failure. */ }
      } else discardResponse(response);
      this.#busy = false;
    }
  }
}
