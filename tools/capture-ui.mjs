import fs from 'node:fs/promises';

// Capture the renderer surface directly, after a paint opportunity. Test zoom is
// controlled separately; avoid element clipping and background frame stalls.
export async function captureUI(application, destination) {
  const page = await application.firstWindow();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
  await page.evaluate(() => new Promise(resolve => {
    const fallback = setTimeout(resolve, 250);
    requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(fallback); resolve(); }));
  }));
  const bytes = await application.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const picture = await window.webContents.capturePage();
    return picture.toPNG().toString('base64');
  });
  await fs.writeFile(destination, Buffer.from(bytes, 'base64'));
}
