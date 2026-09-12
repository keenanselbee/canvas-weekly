import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

// Native radio regression fixture only: no registry, installation or elevation.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(root, '.codex-temp/builder-cache');
const compiler = (await fs.readdir(cache, { recursive: true, withFileTypes: true }))
  .find(entry => entry.isFile() && entry.name === 'makensis.exe' && !entry.parentPath.endsWith('Bin'));
assert.ok(compiler, 'Build the Windows installer first to populate the NSIS cache');
const scratch = await fs.mkdtemp(path.join(root, '.codex-temp/installer-mode-'));
const run = promisify(execFile);
for (const fixed of [false, true]) {
  const name = fixed ? 'fixed' : 'baseline';
  // Copy the production hook verbatim; simulate only the earlier registry result
  // and privilege predicate, so this fixture can never request actual elevation.
  await fs.copyFile(path.join(root, 'build/installer.nsh'), path.join(scratch, 'hook.nsh'));
  const script = `
!include nsDialogs.nsh
Name "Canvas Weekly radio regression fixture"
OutFile "${name}.exe"
RequestExecutionLevel user
ShowInstDetails nevershow
Page custom CheckRadios
Var installMode
Var allRadio
Var currentRadio
!define UAC_IsAdmin '0 = 1'
!macro setInstallModePerUser
  StrCpy $installMode CurrentUser
!macroend
!include hook.nsh
Function CheckRadios
  ShowWindow $HWNDPARENT 0
  StrCpy $installMode all
  ${fixed ? '!insertmacro customInstallMode' : ''}
  nsDialogs::Create 1018
  Pop $0
  \${NSD_CreateRadioButton} 10u 30u 280u 20u "All users"
  Pop $allRadio
  EnableWindow $allRadio 0
  \${NSD_CreateRadioButton} 10u 50u 280u 20u "Only me"
  Pop $currentRadio
  \${If} $installMode == all
    SendMessage $allRadio \${BM_SETCHECK} \${BST_CHECKED} 0
  \${Else}
    SendMessage $currentRadio \${BM_SETCHECK} \${BST_CHECKED} 0
  \${EndIf}
  ; Reproduce the user clicking the available per-user radio.
  SendMessage $currentRadio \${BM_CLICK} 0 0
  SendMessage $allRadio \${BM_GETCHECK} 0 0 $1
  SendMessage $currentRadio \${BM_GETCHECK} 0 0 $2
  FileOpen $0 "$EXEDIR\\${name}.txt" w
  FileWrite $0 "$1,$2"
  FileClose $0
  Quit
FunctionEnd
Section
  Abort
SectionEnd
`;
  await fs.writeFile(path.join(scratch, `${name}.nsi`), script);
  await run(path.join(compiler.parentPath, compiler.name), ['/V2', `${name}.nsi`], { cwd: scratch, windowsHide: true, timeout: 30000 });
  await run(path.join(scratch, `${name}.exe`), [], { cwd: scratch, windowsHide: true, timeout: 15000 });
  const result = await fs.readFile(path.join(scratch, `${name}.txt`), 'utf8');
  assert.equal(result, fixed ? '0,1' : '1,1', `${name}: unexpected native radio selection`);
}
console.log('Native radio regression passed: baseline keeps both checked; production hook clears the disabled all-users default. No installation or UAC request ran.');
