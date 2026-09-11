import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicJson } from './settings.js';
import { SiteReader, siteScope, readHttps } from './site-reader.js';

const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
const accountKey = account => hash(`${account.origin}|${account.userId}`);
const siteId = (courseId, url) => hash(`${courseId}|${url}`);

export class CourseWebsites {
  constructor({ directory, secrets, transport = readHttps }) {
    this.directory = directory;
    this.secrets = secrets;
    this.transport = transport;
    this.sessionCredentials = new Map();
  }
  async load(account) {
    try {
      const value = JSON.parse(await fs.readFile(path.join(this.directory, `${accountKey(account)}.json`), 'utf8'));
      if (value.version !== 1 || !Array.isArray(value.sites) || value.sites.length > 20) throw new Error('Invalid website settings');
      for (const site of value.sites) {
        const scope = siteScope(site.url);
        if (scope.origin === account.origin || !/^\d+$/.test(site.courseId) || site.id !== siteId(site.courseId, scope.seed)) throw new Error('Invalid website scope');
      }
      return value.sites;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw new Error('Course website settings could not be loaded. Existing settings have been preserved.');
    }
  }
  async save(account, sites) { await atomicJson(path.join(this.directory, `${accountKey(account)}.json`), { version: 1, sites }); }
  async list(account) {
    return (await this.load(account)).map(site => ({ id: site.id, courseId: site.courseId, url: site.url,
      scope: siteScope(site.url).origin + siteScope(site.url).prefix, status: site.status,
      message: site.message, checkedAt: site.checkedAt, pageCount: site.pageCount || 0,
      needsPassword: site.status === 'needs-login' && typeof site.realm === 'string', hasCredentials: Boolean(site.encrypted),
      sessionOnly: this.sessionCredentials.has(`${accountKey(account)}:${site.id}`), remember: site.remember !== false }));
  }
  async add(account, courseId, value) {
    if (!/^\d+$/.test(courseId) || typeof value !== 'string' || value.length > 2048) throw new Error('Choose a course and its website address.');
    const scope = siteScope(value.trim());
    if (scope.origin === account.origin) throw new Error('Canvas pages use the Canvas connection. Choose the separate course website.');
    const sites = await this.load(account);
    const id = siteId(courseId, scope.seed);
    if (sites.some(site => site.id === id)) return id;
    if (sites.length >= 20 || sites.filter(site => site.courseId === courseId).length >= 5) throw new Error('Use up to five websites per course and twenty per account.');
    sites.push({ id, courseId, url: scope.seed, status: 'unchecked', message: 'Check this website before updating the guide.' });
    await this.save(account, sites);
    return id;
  }
  async remove(account, id) {
    const sites = await this.load(account);
    if (!sites.some(site => site.id === id)) throw new Error('Choose a connected course website.');
    await this.save(account, sites.filter(site => site.id !== id));
    this.sessionCredentials.delete(`${accountKey(account)}:${id}`);
  }
  async forgetLogin(account, id) {
    const sites = await this.load(account);
    const site = sites.find(site => site.id === id);
    if (!site) throw new Error('Choose a connected course website.');
    delete site.encrypted;
    site.authRejected = true; site.status = 'needs-login';
    site.message = 'Saved login forgotten. Enter the website login again when needed.';
    await this.save(account, sites);
    this.sessionCredentials.delete(`${accountKey(account)}:${id}`);
  }
  async credential(account, site) {
    if (site.authRejected) return null;
    const temporary = this.sessionCredentials.get(`${accountKey(account)}:${site.id}`);
    if (temporary) return temporary;
    if (!site.encrypted) return null;
    try {
      const value = JSON.parse(await this.secrets.decrypt(Buffer.from(site.encrypted, 'base64')));
      if (value.binding !== `${accountKey(account)}:${site.id}:${site.url}`) throw new Error('Credential scope changed');
      return value;
    } catch { throw new Error('Saved website login could not be restored. Enter it again.'); }
  }
  reader(account, site, credential, options = {}) {
    const redact = value => {
      for (const secret of [credential?.password, credential?.password && encodeURIComponent(credential.password)].filter(Boolean)) value = value.split(secret).join('[redacted]');
      return value;
    };
    const writeAudit = async (url, requestId, event, status) => {
      const record = { at: new Date().toISOString(), requestId, event, siteId: site.id, account: accountKey(account), method: 'GET', origin: url.origin, path: redact(url.pathname), ...(status ? { status } : {}) };
      const directory = path.join(this.directory, 'request-audit');
      try {
        await fs.mkdir(directory, { recursive: true });
        const file = await fs.open(path.join(directory, `${record.at.slice(0, 10)}.jsonl`), 'a');
        try { await file.writeFile(JSON.stringify(record) + '\n'); await file.sync(); } finally { await file.close(); }
      } catch { throw new Error('Website request audit could not be saved. Check local storage.'); }
    };
    return new SiteReader({ ...options, transport: async (url, init) => {
      const id = crypto.randomUUID();
      await writeAudit(url, id, 'request');
      let response;
      try { response = await this.transport(url, init); }
      catch { await writeAudit(url, id, 'network-error'); throw new Error('The course website could not be reached securely.'); }
      await writeAudit(url, id, 'response', response.status);
      return response;
    } });
  }
  async probe(account, id, login, signal) {
    const sites = await this.load(account);
    const site = sites.find(site => site.id === id);
    if (!site) throw new Error('Choose a connected course website.');
    let credential;
    if (login) {
      if (login.remember !== undefined && typeof login.remember !== 'boolean') throw new Error('Choose whether to remember the website login.');
      if (typeof site.realm !== 'string') throw new Error('Check this website first to identify its sign-in method.');
      if (typeof login.username !== 'string' || !login.username || login.username.length > 200 || /[:\r\n\0]/.test(login.username)
        || typeof login.password !== 'string' || !login.password || login.password.length > 1024 || /[\r\n\0]/.test(login.password)) throw new Error('Enter the course website username and password.');
      credential = { username: login.username, password: login.password, realm: site.realm, binding: `${accountKey(account)}:${site.id}:${site.url}` };
      site.remember = login.remember !== false;
      if (site.remember) {
        // Confirm encryption availability before transmitting remembered credentials.
        const encrypted = await this.secrets.encrypt(JSON.stringify(credential));
        credential.encrypted = encrypted.toString('base64');
      } else {
        delete site.encrypted;
        this.sessionCredentials.delete(`${accountKey(account)}:${site.id}`);
        await this.save(account, sites);
      }
    } else {
      try { credential = await this.credential(account, site); }
      catch {
        site.status = 'needs-login'; site.message = 'Saved login could not be restored. Enter the website login again.';
        await this.save(account, sites); return this.list(account);
      }
    }
    const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000);
    let result;
    try { result = await this.reader(account, site, credential, { signal: deadline }).page(site.url, siteScope(site.url), credential); }
    catch {
      signal?.throwIfAborted();
      result = { status: 'error', message: 'Website check failed. Check the address, network and local storage, then try again.' };
    }
    signal?.throwIfAborted();
    Object.assign(site, { status: result.status, realm: result.realm ?? site.realm, checkedAt: new Date().toISOString(), message: result.status === 'ok' ? 'Website connected. Readable pages will be included when you update the guide.' : result.message });
    if (result.status === 'needs-login' && credential) site.authRejected = true;
    if (login && ['ok', 'partial'].includes(result.status)) {
      site.encrypted = credential.encrypted; site.authRejected = false;
      if (!site.remember) this.sessionCredentials.set(`${accountKey(account)}:${site.id}`, credential);
      else this.sessionCredentials.delete(`${accountKey(account)}:${site.id}`);
    }
    await this.save(account, sites);
    return this.list(account);
  }
  async collect(account, courseIds, options = {}) {
    const sites = await this.load(account);
    const results = [];
    for (const site of sites.filter(site => courseIds.includes(site.courseId))) {
      options.signal?.throwIfAborted();
      let result;
      try {
        const credential = await this.credential(account, site);
        result = await this.reader(account, site, credential, options).collect(site, credential);
        // A remote site can echo a password in its page. Never persist that echo.
        if (credential?.password) {
          const secrets = [credential.password, encodeURIComponent(credential.password)];
          const containsSecret = value => secrets.some(secret => value.includes(secret));
          const scrub = value => secrets.reduce((text, secret) => text.split(secret).join('[redacted]'), value);
          const hidden = result.pages.some(page => containsSecret(page.sourceUrl));
          result.pages = result.pages.filter(page => !containsSecret(page.sourceUrl)).map(page => ({ ...page, title: scrub(page.title), body: scrub(page.body) }));
          result.references = result.references.filter(reference => !containsSecret(reference.sourceUrl) && !containsSecret(reference.foundOn));
          result.coverage = result.coverage.map(source => ({ ...source, source: scrub(source.source) }));
          if (hidden) result.coverage.push({ source: `website:${site.id}`, status: 'partial', message: 'A credential-bearing page address was omitted.' });
        }
      } catch {
        options.signal?.throwIfAborted();
        result = { pages: [], references: [], coverage: [{ source: `website:${site.id}`, status: 'error', message: 'Website access failed. Check its connection in Courses.' }] };
      }
      const gap = result.coverage.find(source => source.status !== 'ok');
      if (result.loginRealm !== undefined) site.realm = result.loginRealm;
      if (result.coverage.some(source => source.status === 'needs-login') && site.encrypted) site.authRejected = true;
      Object.assign(site, { status: gap?.status || 'ok', message: gap ? gap.message : `Read ${result.pages.length} course website pages.`, pageCount: result.pages.length, checkedAt: new Date().toISOString() });
      results.push({ siteId: site.id, courseId: site.courseId, ...result });
    }
    options.signal?.throwIfAborted();
    await this.save(account, sites);
    return results;
  }
}
