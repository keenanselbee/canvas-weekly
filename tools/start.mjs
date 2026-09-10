import { spawn } from 'node:child_process';
import electron from 'electron';
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
// Electron is the visible desktop app, not a hidden background helper.
const child = spawn(electron, ['.'], { cwd: new URL('..', import.meta.url), env: environment, stdio: 'inherit', windowsHide: false });
child.on('exit', code => process.exit(code ?? 1));
child.on('error', error => { console.error(error.message); process.exit(1); });
