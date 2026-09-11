import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import crypto from 'node:crypto';
import { extractDocument, referenceUrl } from './content.js';
import { readDocument } from './document-reader.js';

const actionRoute = /(?:^|\/)(?:quiz(?:zes)?|assessments?|login|signin|logout|signout|admin|api|take|resume|submit|attempts?|delete|edit|launch|complete|mark|enroll|register)(?:[/.\-_]|$)/i;

export function siteScope(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a complete HTTPS course website address.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !referenceUrl(url.href, url.origin)) throw new Error('Use an HTTPS course address without credentials, query parameters or a fragment.');
  if (net.isIP(url.hostname.replace(/^\[|\]$/g, '')) || !url.hostname.includes('.') || url.hostname.endsWith('.') || /\.(localhost|local|internal)$/i.test(url.hostname)) throw new Error('Choose a public course website hostname.');
  if (/%(?:2f|5c|25)/i.test(url.pathname)) throw new Error('Encoded path separators are not supported.');
  const prefix = /\.[^/]+$/.test(url.pathname) ? url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1) : url.pathname.replace(/\/?$/, '/');
  const scope = { seed: url.href, origin: url.origin, prefix };
  if (!siteUrl(scope.seed, scope)) throw new Error('Choose a course document page, not a login, assessment or action route.');
  return scope;
}

export function siteUrl(value, scope) {
  try {
    const url = new URL(value, scope.seed);
    url.hash = '';
    const route = decodeURIComponent(url.pathname).toLowerCase();
    if (url.origin !== scope.origin || url.username || url.password || url.search || /%|\\/.test(route)
      || !(url.pathname.startsWith(scope.prefix) || url.pathname === scope.prefix.slice(0, -1))
      || !referenceUrl(url.href, scope.origin)
      || actionRoute.test(route)) return null;
    return url;
  } catch { return null; }
}

export function publicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 100 && b >= 64 && b <= 127)
      || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0 && c === 113));
  }
  // Only global IPv6 unicast, excluding documentation, transition and benchmark ranges.
  if (net.isIP(address) !== 6 || !/^[23][0-9a-f]{3}:/i.test(address) || /^(2002:|3fff:)/i.test(address)) return false;
  const [first, second] = address.split(':').map(part => parseInt(part || '0', 16));
  return !(first === 0x2001 && (second < 0x200 || second === 0xdb8));
}

export async function publicLookup(hostname, resolver = dns.lookup) {
  const addresses = await resolver(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(entry => !publicAddress(entry.address))) throw new Error('The course site resolves to a private or unsupported network address.');
  return addresses;
}

export async function readHttps(url, { authorization, signal, maxBytes = 2 * 1024 * 1024 } = {}) {
  const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
  deadline.throwIfAborted();
  let onAbort;
  const addresses = await Promise.race([publicLookup(url.hostname), new Promise((_, reject) => {
    onAbort = () => reject(new Error('Course site lookup timed out or was cancelled.'));
    deadline.addEventListener('abort', onAbort, { once: true });
  })]).finally(() => deadline.removeEventListener('abort', onAbort));
  deadline.throwIfAborted();
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'GET', agent: false, signal: deadline,
      headers: { Accept: 'text/html,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Accept-Encoding': 'identity', 'User-Agent': 'CanvasWeekly/0.1 (course document reader)', ...(authorization ? { Authorization: authorization } : {}) },
      // Pin this request to the addresses we checked; do not resolve again during connect.
      lookup: (_hostname, options, callback) => options.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family),
    }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          const error = new Error('The course page exceeds the document byte limit.');
          reject(error); request.destroy(error); return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks), bytes }));
    });
    request.on('error', error => reject(new Error(deadline.aborted ? 'Course site read timed out or was cancelled.' : 'The course site could not be reached securely.', { cause: error })));
    request.end();
  });
}

function basicRealm(response) {
  const challenge = String(response.headers['www-authenticate'] || '');
  const match = challenge.match(/^Basic\s+realm="([^"\r\n]{0,200})"(?:,\s*charset="UTF-8")?$/i);
  return match ? match[1] : null;
}

export class SiteReader {
  constructor({ transport = readHttps, signal, onProgress = () => {} } = {}) {
    this.transport = transport;
    this.signal = signal;
    this.onProgress = onProgress;
    this.bytes = 0;
    this.byteLimit = 12 * 1024 * 1024;
  }
  async request(url, authorization) {
    const maxBytes = Math.min(2 * 1024 * 1024, this.byteLimit - this.bytes);
    if (maxBytes <= 0) throw new Error('Course website byte limit reached.');
    let response;
    try { response = await this.transport(url, { signal: this.signal, authorization, maxBytes }); }
    catch (error) {
      // A failed/truncated response may already have consumed the allowance.
      this.bytes += maxBytes; throw error;
    }
    const bytes = response.bytes ?? Buffer.byteLength(response.body || '');
    this.bytes += bytes;
    if (bytes > maxBytes) throw new Error('Course website byte limit reached.');
    return response;
  }
  async page(value, scope, credential) {
    let url = siteUrl(value, scope);
    if (!url) throw new Error('The page is outside the configured course site or is not a supported document route.');
    for (let hop = 0; hop < 4; hop++) {
      this.signal?.throwIfAborted();
      let response = await this.request(url);
      if (response.status === 401) {
        const realm = basicRealm(response);
        if (realm === null) return { status: 'unsupported', url: url.href, message: 'This site needs a browser-based sign-in. Automatic collection is not supported yet.' };
        if (!credential || credential.realm !== realm) return { status: 'needs-login', url: url.href, realm, message: 'Connect this course website with its own username and password.' };
        const authorization = 'Basic ' + Buffer.from(`${credential.username}:${credential.password}`, 'utf8').toString('base64');
        response = await this.request(url, authorization);
        if (response.status === 401) return { status: 'needs-login', url: url.href, realm, message: 'The course website did not accept the saved login.' };
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        url = siteUrl(new URL(String(response.headers.location || ''), url).href, scope);
        if (!url) throw new Error('The course site redirected outside its permitted scope.');
        // Every redirected request starts without credentials and must challenge again.
        continue;
      }
      if (response.status !== 200) return { status: 'error', url: url.href, message: `Course website returned HTTP ${response.status}.` };
      const type = String(response.headers['content-type'] || '').toLowerCase();
      if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') return { status: 'unsupported', url: url.href, message: 'Compressed course page could not be read.' };
      const format = /^application\/pdf(?:;|$)/.test(type) ? 'pdf' : /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document(?:;|$)/.test(type) ? 'docx' : null;
      if (format) {
        const extracted = await readDocument(Buffer.from(response.body), format, this.signal);
        const content = extractDocument(extracted.text, true);
        return { ...content, links: extracted.links, status: 'partial', url: url.href, message: extracted.message };
      }
      if (!/^(text\/html|application\/xhtml\+xml|text\/plain)(;|$)/.test(type)) return { status: 'unsupported', url: url.href, message: 'This linked file type is not supported yet.' };
      const content = extractDocument(Buffer.isBuffer(response.body) ? response.body.toString('utf8') : response.body, type.startsWith('text/plain'));
      if (content.passwordForm) return { status: 'needs-login', url: url.href, message: 'This page contains a website sign-in form. Browser sign-in support is still pending.' };
      if (!content.text.trim()) return { status: 'unsupported', url: url.href, message: 'No readable course text was found. This page may require scripts or another tool.' };
      return { status: 'ok', url: url.href, ...content, bytes: response.bytes ?? Buffer.byteLength(response.body) };
    }
    throw new Error('The course site redirected too many times.');
  }
  async collect(site, credential) {
    const scope = siteScope(site.url);
    const queue = [{ url: scope.seed, depth: 0 }];
    const visited = new Set();
    const pages = [];
    const coverage = [];
    const references = new Map();
    let needsLogin = false;
    let loginRealm;
    const originalSignal = this.signal;
    const deadline = AbortSignal.timeout(120000);
    this.signal = originalSignal ? AbortSignal.any([originalSignal, deadline]) : deadline;
    while (queue.length && visited.size < 30 && this.bytes < this.byteLimit && !deadline.aborted) {
      originalSignal?.throwIfAborted();
      const next = queue.shift();
      if (visited.has(next.url)) continue;
      visited.add(next.url);
      this.onProgress(`Reading course website: ${scope.origin}`);
      try {
        const result = await this.page(next.url, scope, credential);
        coverage.push({ source: `website:${site.id}:${next.url}`, status: result.status, message: result.message, checkedAt: new Date().toISOString() });
        if (result.status === 'needs-login') { needsLogin = true; loginRealm = result.realm; break; }
        if (!['ok', 'partial'].includes(result.status) || !result.text) continue;
        visited.add(result.url);
        if (pages.some(page => page.sourceUrl === result.url)) continue;
        pages.push({ id: `${site.id}:${crypto.createHash('sha256').update(result.url).digest('hex').slice(0, 20)}`, title: result.title || new URL(result.url).pathname, body: result.text, sourceUrl: result.url, observedAt: new Date().toISOString() });
        for (const value of result.media || []) {
          const reference = referenceUrl(value, result.url);
          if (reference && !actionRoute.test(decodeURIComponent(new URL(reference).pathname))) references.set(reference, { title: reference, sourceUrl: reference, foundOn: result.url, status: 'Image or embedded media contents not collected' });
        }
        for (const value of result.links) {
          // Decide whether to fetch the original URL before redacting display links.
          // Stripping a signed query must never turn it into a different request.
          const candidate = siteUrl(value, { ...scope, seed: result.url });
          const reference = referenceUrl(value, result.url);
          if (!reference || actionRoute.test(decodeURIComponent(new URL(reference).pathname))) continue;
          references.set(reference, { title: reference, sourceUrl: reference, foundOn: result.url, status: 'Linked contents not collected' });
          const target = candidate;
          if (target && /(?:\/|\.html?|\.txt|\.pdf|\.docx)$/i.test(target.pathname) && !visited.has(target.href) && !queue.some(entry => entry.url === target.href) && next.depth < 2) queue.push({ url: target.href, depth: next.depth + 1 });
        }
      } catch (error) {
        originalSignal?.throwIfAborted();
        coverage.push({ source: `website:${site.id}:${next.url}`, status: deadline.aborted ? 'partial' : 'error', message: 'The page could not be read within the permitted connection and document limits.', checkedAt: new Date().toISOString() });
      }
    }
    if (queue.length && !needsLogin) coverage.push({ source: `website:${site.id}:limit`, status: 'partial', message: 'Course site read reached the page, time or byte limit.', checkedAt: new Date().toISOString() });
    for (const page of pages) references.delete(page.sourceUrl);
    return { pages, coverage, references: [...references.values()], loginRealm };
  }
}
