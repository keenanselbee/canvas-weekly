// Stock Canvas session authentication for the isolated metadata candidate.
// This does not establish identity or authorize an operation. The caller must
// bind the cookie store and AbortSignal to a verified Canvas connection.
export async function canvasSessionAuthentication({ origin, cookies, signal, now = () => Date.now() }) {
  const fail = () => new Error('Canvas session verification is unavailable. Sign in to Canvas again.');
  const check = () => { if (signal.aborted) throw new DOMException('Canvas session verification cancelled.', 'AbortError'); };
  let url;
  try { url = new URL(origin); } catch { throw fail(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !(signal instanceof AbortSignal) || typeof cookies?.get !== 'function') throw fail();
  check();
  let matches;
  try { matches = await cookies.get({ url: url.origin + '/api/graphql', name: '_csrf_token' }); }
  catch { check(); throw fail(); }
  check();
  // Fail on duplicates instead of guessing which cookie the server will use.
  if (!Array.isArray(matches) || matches.length !== 1) throw fail();
  const cookie = matches[0];
  const domain = typeof cookie?.domain === 'string' ? cookie.domain.toLowerCase().replace(/^\./, '') : '';
  const host = url.hostname.toLowerCase();
  const current = now() / 1000;
  if (cookie?.name !== '_csrf_token' || !domain || (domain !== host && (cookie.hostOnly !== false || !host.endsWith('.' + domain)))
    || cookie.path !== '/' || cookie.secure !== true || !Number.isFinite(current)
    || (cookie.session !== true && (cookie.session !== false || !Number.isFinite(cookie.expirationDate) || cookie.expirationDate <= current))
    || typeof cookie.value !== 'string' || cookie.value.length > 264) throw fail();
  let value;
  try { value = decodeURIComponent(cookie.value); } catch { throw fail(); }
  // Canvas encodes a 32-byte mask plus a 32-byte masked secret as strict Base64.
  // Decode URL escaping once; never interpret '+' as form-encoded whitespace,
  // remask the secret, change a cookie, or try a CSRF bypass on failure.
  if (!/^[A-Za-z0-9+/]{86}==$/.test(value) || Buffer.from(value, 'base64').toString('base64') !== value) throw fail();
  check();
  return { kind: 'session', value };
}
