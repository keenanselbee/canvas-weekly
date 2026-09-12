import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.versions.electron) {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(createRequire(import.meta.url)('electron'), [fileURLToPath(import.meta.url)],
    { cwd: root, env: environment, windowsHide: true, stdio: 'inherit', shell: false });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = await import('electron');
  app.setPath('userData', path.join(root, '.codex-temp/branding-profile'));
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  app.whenReady().then(async () => {
  const output = path.join(root, 'build/branding');
  const previews = path.join(root, '.codex-temp/branding');
  const window = new BrowserWindow({ show: false, transparent: true, frame: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('data:') }));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try {
    await fs.mkdir(output, { recursive: true });
    await fs.mkdir(previews, { recursive: true });
    const mark = await fs.readFile(path.join(root, 'src/ui/assets/mark.svg'), 'utf8');
    const innerMark = mark.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const svg = (width, height, content) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`;
    async function render(source, width, height) {
      window.setContentSize(width, height);
      const content = source.replace(/<svg[^>]*>/, match => match.replace(/width="[^"]+"/, `width="${width}"`).replace(/height="[^"]+"/, `height="${height}"`));
      await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="margin:0;overflow:hidden">${content}</body></html>`));
      await window.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))');
      const image = await window.webContents.capturePage({ x: 0, y: 0, width, height });
      if (image.getSize().width !== width || image.getSize().height !== height) throw new Error('Unexpected branding render size');
      return image;
    }
    const frames = [];
    for (const size of [16, 20, 24, 32, 40, 48, 64, 128, 256]) frames.push({ size, png: (await render(mark, size, size)).toPNG() });
    const directory = Buffer.alloc(6 + frames.length * 16);
    directory.writeUInt16LE(1, 2); directory.writeUInt16LE(frames.length, 4);
    let offset = directory.length;
    frames.forEach(({ size, png }, index) => {
      const at = 6 + index * 16;
      directory[at] = size === 256 ? 0 : size; directory[at + 1] = directory[at];
      directory.writeUInt16LE(1, at + 4); directory.writeUInt16LE(32, at + 6);
      directory.writeUInt32LE(png.length, at + 8); directory.writeUInt32LE(offset, at + 12);
      offset += png.length;
    });
    await fs.writeFile(path.join(output, 'icon.ico'), Buffer.concat([directory, ...frames.map(frame => frame.png)]));
    await fs.writeFile(path.join(output, 'installer-mark.png'), frames.at(-1).png);
    await fs.writeFile(path.join(root, 'src/ui/assets/mark.png'), frames.at(-1).png);
    await fs.writeFile(path.join(previews, 'mark.png'), frames.at(-1).png);
    const sidebar = svg(164, 314, `<rect width="164" height="314" fill="#0b2545"/><g transform="translate(24 28) scale(.875)">${innerMark}</g><g fill="#fff" font-family="Segoe UI, sans-serif"><text x="24" y="124" font-size="23" font-weight="600">Canvas</text><text x="24" y="152" font-size="23" font-weight="600">Weekly</text><text x="24" y="184" fill="#c0cfdf" font-size="12">Your week, simplified.</text><path d="M24 224h116" stroke="#35516f"/><text x="24" y="251" font-size="12">Your courses.</text><text x="24" y="272" font-size="12">Your weekly plan.</text></g>`);
    const header = svg(150, 57, `<rect width="150" height="57" fill="#fff"/><path d="M0 55h150" stroke="#d4dde6"/><g transform="translate(104 8) scale(.625)">${innerMark}</g>`);
    for (const [name, source, width, height] of [['installer-sidebar', sidebar, 164, 314], ['installer-header', header, 150, 57]]) {
      const image = await render(source, width, height);
      await fs.writeFile(path.join(previews, `${name}.png`), image.toPNG());
      // NSIS expects a bottom-up, 24-bit Windows bitmap with padded BGR rows.
      const pixels = image.toBitmap();
      const stride = Math.ceil(width * 3 / 4) * 4;
      const bitmap = Buffer.alloc(54 + stride * height);
      bitmap.write('BM'); bitmap.writeUInt32LE(bitmap.length, 2); bitmap.writeUInt32LE(54, 10);
      bitmap.writeUInt32LE(40, 14); bitmap.writeInt32LE(width, 18); bitmap.writeInt32LE(height, 22);
      bitmap.writeUInt16LE(1, 26); bitmap.writeUInt16LE(24, 28); bitmap.writeUInt32LE(stride * height, 34);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const sourceAt = (y * width + x) * 4, destinationAt = 54 + (height - 1 - y) * stride + x * 3;
        pixels.copy(bitmap, destinationAt, sourceAt, sourceAt + 3);
      }
      await fs.writeFile(path.join(output, `${name}.bmp`), bitmap);
    }
    console.log('Branding generated from the shared SVG: multi-size Windows icon and NSIS artwork. Previews: .codex-temp/branding');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { window.destroy(); app.exit(process.exitCode ?? 0); }
  }).catch(error => { console.error(error.message); app.exit(1); });
}
