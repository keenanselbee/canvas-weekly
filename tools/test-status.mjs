import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { buildGuide } from '../src/guide.js';

await fs.mkdir('.codex-temp/visual', { recursive: true });
const environment = { ...process.env, CANVAS_WEEKLY_TEST: '1' };
delete environment.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: ['.'], env: environment });
try {
  const page = await application.firstWindow();
  await page.getByRole('heading', { name: 'This week', exact: true }).waitFor();
  const state = await page.evaluate(() => window.canvasWeekly.getState());
  const send = async value => application.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.send('state:changed', value), value);
  state.canvas = { connected: true, collectionIssue: 'Synthetic collection pause.' };
  state.ai = { connected: true, available: true };
  state.settings.aiEnabled = false;
  state.guide = null;
  state.run = { busy: false, message: '' };
  for (const theme of ['light', 'dark']) {
    state.appearance.dark = theme === 'dark';
    await send(state);
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    assert.equal(await page.locator('#connection-status').textContent(), 'Connected');
    assert.equal(await page.locator('#suggestions-status').textContent(), 'Off');
    assert.equal(await page.locator('#ai-token-count').textContent(), '—');
    assert.equal(await page.locator('#canvas-collection-status').isVisible(), true);
    await page.locator('.sidebar-bottom').screenshot({ path: `.codex-temp/visual/connections-${theme}.png` });
    await page.locator('#connection-settings').hover();
    await page.locator('.sidebar-bottom').screenshot({ path: `.codex-temp/visual/connections-hover-${theme}.png` });
    await page.locator('h1').hover();
  }
  state.ai.usage = { status: 'completed', tokens: { totalTokens: 1500, inputTokens: 1200, cachedInputTokens: 800, outputTokens: 300, reasoningOutputTokens: 100 } };
  await send(state);
  await page.waitForFunction(() => document.querySelector('#ai-token-count').textContent.includes('1'));
  await page.locator('.ai-usage summary').click();
  assert.equal(await page.locator('#ai-usage-breakdown').isVisible(), true);
  await page.locator('.ai-usage summary').focus();
  state.ai.usage.tokens.totalTokens = 2500;
  state.ai.usage.tokens.inputTokens = 2200;
  await send(state);
  await page.waitForFunction(() => document.querySelector('#ai-token-count').textContent.includes('2'));
  assert.equal(await page.locator('.ai-usage').getAttribute('open'), '');
  assert.equal(await page.evaluate(() => document.activeElement.matches('.ai-usage summary')), true);
  for (const theme of ['light', 'dark']) {
    state.appearance.dark = theme === 'dark';
    await send(state);
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    await page.locator('.sidebar-bottom').screenshot({ path: `.codex-temp/visual/connections-usage-${theme}.png` });
  }
  await page.getByRole('button', { name: 'Manage connections in Settings' }).click();
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 600));
  state.canvas = { connected: false };
  state.ai = { connected: false, connecting: true, usage: { status: 'failed', tokens: null } };
  state.settings.aiEnabled = true;
  await send(state);
  await page.waitForFunction(() => document.querySelector('#ai-status').textContent.includes('Signing'));
  assert.equal(await page.locator('#canvas-collection-status').isVisible(), false);
  assert.equal(await page.locator('#ai-usage-scope').textContent().then(text => text.includes('not reported')), true);
  assert.equal(await page.evaluate(() => document.querySelector('.sidebar').scrollWidth > document.querySelector('.sidebar').clientWidth), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '.codex-temp/visual/connections-small.png' });
  state.ai.connecting = false;
  await send(state);
  await page.waitForFunction(() => document.querySelector('#ai-status').textContent === 'Not connected');
  for (const [service, action] of [['Canvas', 'Sign in to Canvas'], ['ChatGPT', 'Connect ChatGPT']]) {
    await page.getByRole('button', { name: 'This week', exact: true }).click();
    const status = page.getByRole('button', { name: `${service}: Not connected. Open connection settings`, exact: true });
    if (service === 'Canvas') await status.click();
    else { await status.focus(); await status.press('Enter'); }
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.textContent), action);
    assert.equal(await page.getByRole('button', { name: action, exact: true }).evaluate(element => {
      const bounds = element.getBoundingClientRect(); return bounds.top >= 0 && bounds.bottom <= innerHeight;
    }), true);
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1, 'Status navigation must not start authentication');
  }
  for (const [runtime, available, title] of [
    [{ detected: true, source: 'bundled', path: 'C:/Canvas Weekly/codex.exe' }, false, 'Codex detected'],
    [{ detected: true, source: 'manual', path: 'C:/My tools/codex.exe' }, true, 'Codex ready'],
    [{ detected: false, source: 'automatic', path: null }, false, 'Codex not detected'],
  ]) {
    state.ai = { connected: false, available, runtime };
    await send(state);
    const options = page.locator('details').filter({ has: page.getByText('ChatGPT connection options', { exact: true }) });
    await options.locator('summary').click();
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
    if (runtime.source === 'manual') assert.ok((await options.textContent()).includes('manual selection'));
    if (!runtime.detected) assert.ok((await options.textContent()).includes('Choose codex.exe manually'));
    await options.scrollIntoViewIfNeeded();
    await options.screenshot({ path: `.codex-temp/visual/runtime-${runtime.source}.png` });
  }
  await page.getByRole('button', { name: 'Data & privacy', exact: true }).click();
  await page.getByRole('heading', { name: 'Data & privacy', exact: true }).waitFor();
  for (const enabled of [false, true, false]) {
    state.settings.aiEnabled = enabled;
    await send(state);
    await page.waitForFunction(enabled => document.querySelector('#privacy-sharing-status')?.textContent === `Study suggestions: ${enabled ? 'On - ChatGPT sign-in needed' : 'Off'}`, enabled);
  }
  assert.equal(await page.getByRole('button', { name: 'View source coverage', exact: true }).isDisabled(), true);
  for (const [width, height] of [[1140, 900], [800, 600]]) {
    await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), [width, height]);
    for (const theme of ['light', 'dark']) {
      state.appearance.dark = theme === 'dark'; await send(state);
      await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.querySelector('main').scrollWidth > document.querySelector('main').clientWidth), false);
      await page.locator('h1').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `.codex-temp/visual/privacy-${width}-${theme}.png` });
    }
  }
  await page.getByText('How collection is protected', { exact: true }).click();
  assert.ok((await page.locator('.privacy-details').textContent()).includes('past progress stayed unchanged'));
  state.guide = buildGuide({ observedAt: '2026-09-11T12:00:00Z', timeZone: 'America/Vancouver', origin: 'https://canvas.example.edu', courses: [], items: [], changes: [] });
  await send(state);
  await page.getByRole('button', { name: 'Data & privacy', exact: true }).click();
  await page.getByRole('button', { name: 'View source coverage', exact: true }).click();
  await page.getByRole('heading', { name: 'Source coverage', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'source-coverage');
  await page.getByRole('button', { name: 'Data & privacy', exact: true }).click();
  await page.getByRole('button', { name: 'Manage saved logins', exact: true }).click();
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  state.canvas = { connected: true };
  state.settings.lastGuideAccount = { origin: state.settings.canvasBaseUrl, userId: '1' };
  state.courses = [{ id: '9', name: 'Example course' }];
  state.reading = { available: false, hold: 'Additional material reads are pending safety validation.', courses: [{ courseId: '9', requested: 'expanded', effective: 'limited' }] };
  state.collectionHistory = [{ id: 'synthetic-run', startedAt: '2026-09-11T12:00:00Z', status: 'failed', courses: [{ courseId: '9', name: 'Example course', requested: 'expanded', effective: 'limited' }],
    requests: [{ id: 'synthetic-request', operation: 'metadataownsubmission', courseId: '9', itemId: '10', outcome: 'failed', effect: 'No view-based effect identified in the admitted request.' }] }];
  await send(state);
  await page.getByRole('heading', { name: 'Course reading', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Data & privacy', exact: true }).click();
  const history = page.locator('#collection-history');
  await history.locator('summary').click();
  assert.ok((await history.textContent()).includes('final server-side effect is unknown'));
  assert.ok((await history.textContent()).includes('limited reading (expanded requested; pending validation)'));
  await history.screenshot({ path: '.codex-temp/visual/collection-history.png' });
  console.log('Connection, privacy and history checks passed: themes, usage, setup navigation, runtime detection, live sharing, privacy links, reading controls, unknown request effects and small window. Synthetic state only.');
} finally { await application.close(); }
