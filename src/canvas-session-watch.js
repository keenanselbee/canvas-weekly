import { createHash } from 'node:crypto';

const cookieName = '_normandy_session';
const changed = () => new DOMException('Canvas browser session changed. Reconnect before refreshing your guide.', 'AbortError');
const unavailable = () => new Error('Canvas browser session could not be verified. Reconnect before refreshing your guide.');

// Watches the stock Canvas session cookie without changing it. This detects
// local cookie replacement, not a server-side identity change with the same
// cookie. Institutional cookie names/rotation policies still need validation.
export async function watchCanvasSession({ cookies, origin, signal }) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || !(signal instanceof AbortSignal)
    || typeof cookies?.get !== 'function' || typeof cookies?.on !== 'function' || typeof cookies?.removeListener !== 'function') throw unavailable();
  signal.throwIfAborted();
  const controller = new AbortController();
  const lifetime = AbortSignal.any([signal, controller.signal]);
  const applies = cookie => {
    const domain = cookie?.domain?.replace(/^\./, '').toLowerCase();
    return cookie?.name === cookieName && domain && (url.hostname === domain || (cookie.hostOnly === false && url.hostname.endsWith('.' + domain)));
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
    timer = setTimeout(() => controller.abort(unavailable()), 10000);
    try {
      // All applicable same-name cookies are returned, including path shadows.
      const list = await Promise.race([cookies.get({ url: origin + '/api/graphql', name: cookieName }), aborted]);
      assertCurrent();
      if (!Array.isArray(list) || list.length !== 1) throw unavailable();
      const cookie = list[0];
      if (!applies(cookie) || cookie.path !== '/' || cookie.secure !== true || cookie.httpOnly !== true
        || typeof cookie.value !== 'string' || !cookie.value || cookie.value.length > 16384
        || !(cookie.session === true || (cookie.session === false && Number.isFinite(cookie.expirationDate) && cookie.expirationDate > Date.now() / 1000))) throw unavailable();
      const digest = createHash('sha256').update(JSON.stringify([cookie.value, cookie.domain, cookie.path, cookie.hostOnly])).digest('hex');
      if (fingerprint !== undefined && fingerprint !== digest) throw changed();
      fingerprint = digest;
      expiration = cookie.session ? null : cookie.expirationDate;
    } catch (error) {
      controller.abort(lifetime.aborted ? lifetime.reason : error?.name === 'AbortError' ? changed() : unavailable());
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
