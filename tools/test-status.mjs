import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

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
  console.log('Connection panel checks passed: both themes, unknown/reported usage, disclosure focus, settings navigation, small window. Synthetic state only.');
} finally { await application.close(); }
