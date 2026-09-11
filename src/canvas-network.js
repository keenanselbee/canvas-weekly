import { blockedAssessmentUrl, permittedRead } from './canvas-client.js';

export class CanvasNetwork {
  constructor({ origin, loginContentsId, fetcher }) {
    this.origin = origin;
    this.loginContentsId = loginContentsId;
    this.fetcher = fetcher;
    this.pending = new Map();
  }
  async fetch(address, init) {
    if (init?.method !== 'GET' || init.redirect !== 'manual' || !permittedRead(address, this.origin())) {
      throw new Error('This Canvas network request is not permitted.');
    }
    const url = new URL(address).href;
    this.pending.set(url, (this.pending.get(url) || 0) + 1);
    try { return await this.fetcher(url, init); }
    finally {
      const remaining = this.pending.get(url) - 1;
      if (remaining) this.pending.set(url, remaining);
      else this.pending.delete(url);
    }
  }
  allows(details) {
    try {
      const url = new URL(details.url);
      if (url.protocol !== 'https:' || url.username || url.password || blockedAssessmentUrl(url.href)) return false;
      // A browser page cannot borrow a pending main-process API request.
      if (!details.webContentsId && details.method === 'GET' && this.pending.has(url.href)
        && permittedRead(url.href, this.origin())) return true;
      const loginId = this.loginContentsId();
      if (!loginId || details.webContentsId !== loginId) return false;
      // External identity-provider traffic is available only to the human login
      // window. Its institutional authentication flow is not a collector crawl.
      if (url.origin !== this.origin()) return true;
      if (/^\/login(?:\/|$)/.test(url.pathname)) return ['GET', 'POST'].includes(details.method);
      if (details.method !== 'GET') return false;
      if (details.resourceType === 'mainFrame') return ['/', '/dashboard'].includes(url.pathname);
      // Dashboard APIs, arbitrary HTML reads, beacons and module progress calls
      // are denied, including requests disguised as image/script resources.
      return ['stylesheet', 'script', 'image', 'font'].includes(details.resourceType)
        && /^\/(dist\/|images\/|fonts\/|javascripts\/|stylesheets\/|favicon\.ico$)/.test(url.pathname);
    } catch { return false; }
  }
}
