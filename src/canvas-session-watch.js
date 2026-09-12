import { createHash } from 'node:crypto';

// The additional name is evidenced by UBC's anonymous SAML login response.
// Do not infer authentication from an arbitrary cookie or enable this alias
// for other institutions without reviewing their session configuration.
export function sessionCookieNames(origin) {
  const names = ['_normandy_session'];
  if (origin === 'https://canvas.ubc.ca') names.push('canvas_session');
  return names;
}
const changed = () => new DOMException('Canvas browser session changed. Reconnect before refreshing your guide.', 'AbortError');
export const sessionIssues = Object.freeze({
  configuration: 'The session reader is unavailable.',
  lookup: 'The browser session could not be read.',
  timeout: 'Reading the browser session timed out.',
  missing: 'The expected Canvas session cookie is missing.',
  ambiguous: 'More than one matching Canvas session cookie was found.',
  scope: 'The Canvas session cookie has an unsupported domain or path.',
  flags: 'The Canvas session cookie has unsupported security flags.',
  value: 'The Canvas session cookie is empty or has an unsupported size.',
  expiry: 'The Canvas session cookie is expired or has unsupported expiry information.',
});
class SessionVerificationError extends Error {
  constructor(reason) {
    super(`Canvas browser session could not be verified. ${sessionIssues[reason]} Your previous guide is preserved. Reconnect Canvas; if this repeats, report CW_SESSION_${reason.toUpperCase()}.`);
    this.code = `CW_SESSION_${reason.toUpperCase()}`;
  }
}
const unavailable = (reason = 'lookup') => new SessionVerificationError(reason);

// Watches a reviewed Canvas session cookie without changing it. This detects
// local cookie replacement, not a server-side identity change with the same
// cookie. Institutional cookie names/rotation policies still need validation.
export async function watchCanvasSession({ cookies, origin, signal }) {
  const url = new URL(origin);
  const names = sessionCookieNames(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || !(signal instanceof AbortSignal)
    || typeof cookies?.get !== 'function' || typeof cookies?.on !== 'function' || typeof cookies?.removeListener !== 'function') throw unavailable('configuration');
  signal.throwIfAborted();
  const controller = new AbortController();
  const lifetime = AbortSignal.any([signal, controller.signal]);
  const applies = cookie => {
    const domain = cookie?.domain?.replace(/^\./, '').toLowerCase();
    return names.includes(cookie?.name) && domain && (url.hostname === domain || (cookie.hostOnly === false && url.hostname.endsWith('.' + domain)));
  };
  let expiration = null;
  let fingerprint;
  let stopped = false;
  let timer;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    cookies.removeListener('changed', onChanged);
    lifetime.removeEventListener('abort', stop);
  };
  // Abort even for same-value overwrites: a removal/change notification cannot
  // establish continuous identity. Ordinary rotation may require a new refresh.
  const onChanged = (_event, cookie) => { if (applies(cookie)) controller.abort(changed()); };
  cookies.on('changed', onChanged);
  lifetime.addEventListener('abort', stop, { once: true });
  const assertCurrent = () => {
    lifetime.throwIfAborted();
    if (stopped || (expiration !== null && expiration <= Date.now() / 1000)) {
      controller.abort(changed());
      lifetime.throwIfAborted();
    }
  };
  const read = async () => {
    assertCurrent();
    let rejectAbort;
    const aborted = new Promise((_resolve, reject) => { rejectAbort = () => reject(lifetime.reason); });
    lifetime.addEventListener('abort', rejectAbort, { once: true });
    timer = setTimeout(() => controller.abort(unavailable('timeout')), 10000);
    try {
      // Include all reviewed names and path shadows; never prefer one of two
      // possible session credentials. Other cookies do not establish identity.
      const list = await Promise.race([cookies.get({ url: origin + '/api/graphql' }), aborted]);
      assertCurrent();
      if (!Array.isArray(list)) throw unavailable('lookup');
      const matches = list.filter(cookie => names.includes(cookie?.name));
      if (!matches.length) throw unavailable('missing');
      if (matches.length !== 1) throw unavailable('ambiguous');
      const cookie = matches[0];
      if (!applies(cookie) || cookie.path !== '/') throw unavailable('scope');
      if (cookie.secure !== true || cookie.httpOnly !== true) throw unavailable('flags');
      if (typeof cookie.value !== 'string' || !cookie.value || cookie.value.length > 16384) throw unavailable('value');
      if (!(cookie.session === true || (cookie.session === false && Number.isFinite(cookie.expirationDate) && cookie.expirationDate > Date.now() / 1000))) throw unavailable('expiry');
      const digest = createHash('sha256').update(JSON.stringify([cookie.name, cookie.value, cookie.domain, cookie.path, cookie.hostOnly])).digest('hex');
      if (fingerprint !== undefined && fingerprint !== digest) throw changed();
      fingerprint = digest;
      expiration = cookie.session ? null : cookie.expirationDate;
    } catch (error) {
      controller.abort(lifetime.aborted ? lifetime.reason : error?.name === 'AbortError' ? changed()
        : error instanceof SessionVerificationError ? error : unavailable());
      lifetime.throwIfAborted();
    } finally {
      clearTimeout(timer);
      lifetime.removeEventListener('abort', rejectAbort);
    }
  };
  await read();
  return Object.freeze({ signal: lifetime, assertCurrent, check: read,
    dispose: () => { controller.abort(changed()); stop(); } });
}
