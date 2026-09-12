import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await fs.mkdtemp(path.join(root, '.codex-temp/display-'));
const executablePath = path.join(root, 'dist/preview/win-unpacked/Canvas Weekly.exe');
const failures = [];
const observations = [];
const scales = process.argv.length > 2 ? process.argv.slice(2).map(Number) : [1, 1.25, 1.5, 2];
assert.ok(scales.every(scale => [1, 1.25, 1.5, 2].includes(scale)), 'Supported display scales: 1, 1.25, 1.5, 2');
for (const scale of scales) {
  const environment = { ...process.env, CANVAS_WEEKLY_TEST: '1', CANVAS_WEEKLY_TEST_PROFILE: path.join(scratch, `profile-${scale}`) };
  delete environment.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath, args: [`--force-device-scale-factor=${scale}`], env: environment });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setTitle('Canvas Weekly - display check');
      window.showInactive();
    });
    await page.getByRole('heading', { name: 'This week', exact: true }).waitFor();
    const initial = await page.evaluate(() => window.canvasWeekly.getState());
    const nativeDark = await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors);
    assert.equal(initial.appearance.source, 'system');
    assert.equal(initial.appearance.dark, nativeDark);
    console.log(JSON.stringify({ scale, systemDark: nativeDark }));
    for (const zoom of [1, 2]) {
      await app.evaluate(({ BrowserWindow }, zoom) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.setSize(zoom === 1 ? 800 : 1140, zoom === 1 ? 600 : 820);
        window.webContents.setZoomFactor(zoom);
      }, zoom);
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => window.canvasWeekly.setTheme(theme), theme);
        await page.locator(`html[data-theme="${theme}"]`).waitFor();
        for (const name of ['This week', 'Courses', 'Settings', 'Data & privacy']) {
          await page.getByRole('button', { name, exact: true }).click();
          await page.getByRole('heading', { name, exact: true }).waitFor();
          const result = await page.evaluate(() => ({
            ratio: devicePixelRatio,
            width: innerWidth,
            height: innerHeight,
            overflowing: ['html', '.sidebar', 'main'].filter(selector => {
              const element = document.querySelector(selector);
              return element.scrollWidth > element.clientWidth + 1;
            }),
          }));
          assert.ok(Math.abs(result.ratio - scale * zoom) < 0.02, 'Requested rendering scale must actually apply');
          observations.push({ scale, zoom, theme, page: name, ...result });
          if (result.overflowing.length) failures.push({ scale, zoom, theme, page: name, ...result });
        }
        // Electron's capture uses the complete client area at the actual zoom.
        // Playwright screenshot clipping can use CSS coordinates at non-unit zoom.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const capture = await app.evaluate(async ({ BrowserWindow }) => {
          const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage();
          return { png: image.toPNG().toString('base64'), size: image.getSize() };
        });
        await fs.writeFile(path.join(scratch, `privacy-${scale}-${zoom}-${theme}.png`), Buffer.from(capture.png, 'base64'));
        console.log(JSON.stringify({ scale, zoom, theme, page: await page.locator('h1').textContent(), capture: capture.size }));
      }
    }
  } finally { await app.close(); }
}
console.log(JSON.stringify({ screenshots: scratch, failures }, null, 2));
await fs.writeFile(path.join(scratch, 'observations.json'), JSON.stringify(observations, null, 2));
assert.equal(failures.length, 0, 'Content must fit horizontally at tested display scales and zoom levels');
