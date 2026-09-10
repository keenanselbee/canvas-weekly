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
  assert.ok(state.outputDirectory.endsWith('Canvas Weekly'));
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await assert.rejects(page.evaluate(() => window.canvasWeekly.setTheme('invalid')));
  await page.screenshot({ path: '.codex-temp/visual/settings.png' });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 600));
  await page.screenshot({ path: '.codex-temp/visual/settings-small.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  console.log('Desktop checks passed: navigation, preview, themes, settings, renderer isolation, minimum width.');
} finally { await application.close(); }
