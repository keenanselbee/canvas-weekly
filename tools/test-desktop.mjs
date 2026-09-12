import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

await fs.mkdir('.codex-temp/visual', { recursive: true });
const environment = { ...process.env, CANVAS_WEEKLY_TEST: '1' };
delete environment.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: ['.'], env: environment });
try {
  const page = await application.firstWindow();
  await page.getByRole('heading', { name: 'This week', exact: true }).waitFor();
  await page.evaluate(() => window.canvasWeekly.disconnectCanvas());
  await page.reload();
  await page.getByRole('button', { name: 'Preview an example' }).click();
  await page.getByRole('heading', { name: 'Focus first' }).waitFor();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => window.canvasWeekly.setTheme(theme), theme);
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    await page.screenshot({ path: `.codex-temp/visual/week-${theme}.png` });
  }
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Theme').selectOption('system');
  await page.waitForFunction(async () => (await window.canvasWeekly.getState()).settings.theme === 'system');
  const state = await page.evaluate(() => window.canvasWeekly.getState());
  assert.equal(state.settings.theme, 'system');
  assert.equal(state.appearance.source, 'system');
  assert.ok(path.isAbsolute(state.outputDirectory));
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.getByRole('button', { name: 'Forget Canvas login', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Forget ChatGPT login', exact: true }).count(), 0);
  // Unusable saved credentials must still be removable, even while disconnected.
  const testProfile = await application.evaluate(({ app }) => app.getPath('userData'));
  await fs.writeFile(path.join(testProfile, 'canvas-session.encrypted.json'), 'synthetic-unreadable-login');
  const planner = path.join(testProfile, 'planner');
  await fs.mkdir(planner, { recursive: true });
  await fs.writeFile(path.join(planner, 'remembered-login.json'), '{}');
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Forget ChatGPT login', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Forget Canvas login', exact: true }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(button => button.textContent === 'Forget Canvas login'));
  await fs.rm(path.join(planner, 'remembered-login.json'));
  await assert.rejects(page.evaluate(() => window.canvasWeekly.setTheme('invalid')));
  for (const [label, key] of [['Remember Canvas on this computer', 'rememberCanvas'], ['Remember ChatGPT on this computer', 'rememberChatGPT']]) {
    await page.getByRole('checkbox', { name: label, exact: true }).uncheck();
    await page.waitForFunction(async key => (await window.canvasWeekly.getState()).settings[key] === false, key);
    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForFunction(label => document.querySelector(`input[aria-label="${label}"]`)?.checked === false, label);
    assert.equal(await page.getByRole('checkbox', { name: label, exact: true }).isChecked(), false, label);
    await page.getByRole('checkbox', { name: label, exact: true }).check();
    await page.waitForFunction(async key => (await window.canvasWeekly.getState()).settings[key] === true, key);
  }
  await assert.rejects(page.evaluate(() => window.canvasWeekly.setRememberCanvas('false')), /whether to remember/);
  await assert.rejects(page.evaluate(() => window.canvasWeekly.setRememberChatGPT(null)), /whether to remember/);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => window.canvasWeekly.setTheme(theme), theme);
    await page.locator('#canvas-settings').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.codex-temp/visual/remember-${theme}.png` });
  }
  await page.getByLabel('Academic timezone').selectOption('America/New_York');
  await page.getByRole('button', { name: 'Save timezone', exact: true }).click();
  await page.waitForFunction(async () => (await window.canvasWeekly.getState()).settings.timeZone === 'America/New_York');
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  assert.equal(await page.getByLabel('Academic timezone').inputValue(), 'America/New_York');
  await assert.rejects(page.evaluate(() => window.canvasWeekly.setTimeZone('Invalid/Zone')), /valid academic timezone/);
  assert.equal((await page.evaluate(() => window.canvasWeekly.getState())).settings.timeZone, 'America/New_York');
  await page.getByLabel('Academic timezone').selectOption('America/Vancouver');
  await page.getByRole('button', { name: 'Save timezone', exact: true }).click();
  await page.waitForFunction(async () => (await window.canvasWeekly.getState()).settings.timeZone === 'America/Vancouver');
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => window.canvasWeekly.setTheme(theme), theme);
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    await page.getByLabel('Academic timezone').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.codex-temp/visual/timezone-${theme}.png` });
  }
  await page.screenshot({ path: '.codex-temp/visual/settings.png' });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 600));
  await page.getByRole('checkbox', { name: 'Remember ChatGPT on this computer', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.codex-temp/visual/remember-small.png' });
  await page.getByLabel('Academic timezone').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.codex-temp/visual/settings-small.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  console.log('Desktop checks passed: navigation, preview, themes, timezone save/reload and invalid input, settings, renderer isolation, minimum width.');
} finally { await application.close(); }
