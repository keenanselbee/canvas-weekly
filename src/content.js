import { parseFragment } from 'parse5';
import { blockedAssessmentUrl } from './canvas-client.js';

export function extractHtml(value = '') {
  const fragment = parseFragment(String(value ?? ''));
  const text = [];
  const links = [];
  const stack = [fragment];
  while (stack.length) {
    const entry = stack.pop();
    if (typeof entry === 'string') { text.push(entry); continue; }
    if (['script', 'style', 'template', 'noscript'].includes(entry.tagName)) continue;
    if (entry.nodeName === '#text') text.push(entry.value);
    if (entry.tagName === 'a') {
      const href = entry.attrs?.find(attribute => attribute.name === 'href')?.value;
      if (href) links.push(href);
    }
    if (/^(p|div|li|h[1-6]|tr|br|section|article|pre)$/.test(entry.tagName || '')) { text.push('\n'); stack.push('\n'); }
    if (entry.tagName === 'td' || entry.tagName === 'th') text.push(' | ');
    for (const child of [...(entry.childNodes || [])].reverse()) stack.push(child);
  }
  return { text: redactCredentials(text.join('').replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim()), links: [...new Set(links)] };
}

export function redactCredentials(value) {
  return String(value).replace(/(^|\n)([ \t]*(?:user(?:name)?|password|passphrase|login(?: name)?|api[ _-]?key|access[ _-]?token)\s*[:=]\s*)[^\n]+/gi, '$1$2[redacted; see original source]')
    .replace(/https:\/\/[^\s<>"']+/g, value => referenceUrl(value, 'https://invalid.example') || '[credential-bearing or unsafe link omitted]');
}

export function plainText(value) { return extractHtml(value).text; }

export function referenceUrl(value, origin) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, origin);
    if (url.protocol !== 'https:' || url.username || url.password || blockedAssessmentUrl(url.href)
      || /\/(logout|signout|delete|remove|edit)(\/|$)/i.test(decodeURIComponent(url.pathname))) return null;
    for (const key of [...url.searchParams.keys()]) if (/token|secret|signature|verifier|key|auth/i.test(key)) url.searchParams.delete(key);
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export function sourceUrl(value, origin, fallback) {
  return referenceUrl(value || fallback, origin) || new URL(fallback, origin).href;
}
