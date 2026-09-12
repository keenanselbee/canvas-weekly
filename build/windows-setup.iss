#ifndef AppVersion
  #error AppVersion is required.
#endif
#ifndef PayloadDir
  #error PayloadDir is required.
#endif
#ifndef PayloadList
  #error PayloadList is required.
#endif
#ifndef SetupId
  #define SetupId "app.canvasweekly.desktop"
#endif
#ifndef LegacyId
  #define LegacyId "90cf4922-b422-5f2f-8ec7-212561447131"
#endif

[Setup]
AppId={#SetupId}
AppName=Canvas Weekly
AppVersion={#AppVersion}
AppPublisher=Canvas Weekly
DefaultDirName={autopf}\Canvas Weekly
DefaultGroupName=Canvas Weekly
OutputBaseFilename=Canvas-Weekly-{#AppVersion}-x64-Setup
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
#ifndef FixtureBuild
PrivilegesRequiredOverridesAllowed=dialog
#endif
UsePreviousPrivileges=no
WizardStyle=modern dynamic
WizardSizePercent=110
WizardImageFile=branding\installer-sidebar.bmp
WizardImageFileDynamicDark=branding\installer-sidebar.bmp
WizardSmallImageFile=branding\installer-mark.png
WizardSmallImageFileDynamicDark=branding\installer-mark.png
SetupIconFile=branding\icon.ico
UninstallDisplayIcon={app}\Canvas Weekly.exe
UninstallFilesDir={app}\.setup
DisableWelcomePage=no
DisableDirPage=no
DisableProgramGroupPage=yes
CloseApplications=no
RestartApplications=no
Compression=lzma2/fast
SolidCompression=yes

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
#ifdef FixtureBuild
Source: "{#PayloadDir}\intentionally-missing-fixture.bin"; DestDir: "{app}"; Flags: external; Check: InjectCopyFailure
#endif

#ifndef FixtureBuild
[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; Flags: unchecked; Check: not KeepLegacyDesktop

[Icons]
Name: "{autoprograms}\Canvas Weekly"; Filename: "{app}\Canvas Weekly.exe"; IconFilename: "{code:ShortcutIcon}"; AppUserModelID: "app.canvasweekly.desktop"
Name: "{autodesktop}\Canvas Weekly"; Filename: "{app}\Canvas Weekly.exe"; IconFilename: "{code:ShortcutIcon}"; Tasks: desktopicon; AppUserModelID: "app.canvasweekly.desktop"
Name: "{autodesktop}\Canvas Weekly"; Filename: "{app}\Canvas Weekly.exe"; IconFilename: "{code:ShortcutIcon}"; Check: KeepLegacyDesktop; AppUserModelID: "app.canvasweekly.desktop"
#endif

[Messages]
WelcomeLabel1=Canvas Weekly
WelcomeLabel2=Your week, simplified.%n%nBring your courses into one weekly study plan.%n%nSetup installs the app. Canvas and ChatGPT connections happen inside Canvas Weekly.
FinishedLabel=Canvas Weekly is installed.%n%nOpen it from the Start menu when you are ready.

[Code]
const
  CurrentKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#SetupId}_is1';
  LegacyKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#LegacyId}';
  LegacyLocationKey = 'Software\{#LegacyId}';

var
  MaintenancePage: TInputOptionWizardPage;
  SeparatePage: TInputOptionWizardPage;
  ExistingPath, ExistingVersion, ExistingUninstaller: String;
  ExistingCopy, OtherCopy, IsDowngrade, UninstallCompleted: Boolean;
  ScopeRoot: Integer;
  LegacyCopy, LegacyMoved, LegacyBackupReady, MigrationCommitted, CreatedBackupFolder: Boolean;
  LegacyExecutable, LegacyBackup, RollbackFolder: String;
  PayloadFiles, SavedFiles: TStringList;

function FileAttributes(Path: String): LongWord;
  external 'GetFileAttributesW@kernel32.dll stdcall';

function SamePath(Left, Right: String): Boolean;
begin
  Result := CompareText(RemoveBackslashUnlessRoot(ExpandFileName(Left)),
    RemoveBackslashUnlessRoot(ExpandFileName(Right))) = 0;
end;

function KeepLegacyDesktop: Boolean;
begin
  Result := LegacyCopy and FileExists(ExpandConstant('{autodesktop}\Canvas Weekly.lnk'));
end;

function ShortcutIcon(Param: String): String;
begin
  if IsWinDark and not HighContrastActive then
    Result := ExpandConstant('{app}\resources\icons\icon-dark.ico')
  else Result := ExpandConstant('{app}\resources\icons\icon.ico');
end;

#ifdef FixtureBuild
function InjectCopyFailure: Boolean;
begin
  Result := ExpandConstant('{param:FAILCOPY|0}') = '1';
end;
#endif

function SafeDestination(Value: String): Boolean;
var
  Normalized, Parent: String;
  Attributes: LongWord;
begin
  Result := False;
  if Length(Value) <= 3 then exit;
  Normalized := RemoveBackslashUnlessRoot(ExpandFileName(Value));
  Result := (Length(Value) > 3) and (Value[2] = ':') and (Value[3] = '\') and
    (Length(Normalized) > 3) and not SamePath(Normalized, ExpandConstant('{win}')) and
    not SamePath(Normalized, ExpandConstant('{sys}')) and
    not SamePath(Normalized, ExpandConstant('{commonpf}')) and
    not SamePath(Normalized, ExpandConstant('{localappdata}')) and
    not SamePath(Normalized, ExpandConstant('{userappdata}'));
  if not Result then exit;
  Parent := Normalized;
  while Length(Parent) > 3 do begin
    Attributes := FileAttributes(Parent);
    if (Attributes <> $FFFFFFFF) and ((Attributes and $400) <> 0) then begin
      Result := False;
      exit;
    end;
    Parent := RemoveBackslashUnlessRoot(ExtractFileDir(Parent));
  end;
end;

function InitializeSetup: Boolean;
var
  Version, OfferedVersion: Int64;
  OtherRoot: Integer;
  ExpectedCommand, Name: String;
begin
  Result := False;
  if IsAdminInstallMode then begin
    ScopeRoot := HKLM64;
    OtherRoot := HKCU64;
  end else begin
    ScopeRoot := HKCU64;
    OtherRoot := HKLM64;
  end;
  OtherCopy := RegKeyExists(OtherRoot, CurrentKey) or RegKeyExists(OtherRoot, LegacyKey);
  ExistingCopy := RegKeyExists(ScopeRoot, CurrentKey);
  LegacyCopy := RegKeyExists(ScopeRoot, LegacyKey);
  if LegacyCopy and ExistingCopy then begin
    SuppressibleMsgBox('Both installer registrations exist for this scope. Setup needs a registration review before continuing.', mbError, MB_OK, IDOK);
    exit;
  end;
  if LegacyCopy then begin
    if not RegQueryStringValue(ScopeRoot, LegacyKey, 'DisplayName', Name) or
      (Pos('Canvas Weekly', Name) <> 1) or
      not RegQueryStringValue(ScopeRoot, LegacyLocationKey, 'InstallLocation', ExistingPath) or
      not RegQueryStringValue(ScopeRoot, LegacyKey, 'DisplayVersion', ExistingVersion) or
      not RegQueryStringValue(ScopeRoot, LegacyKey, 'UninstallString', ExistingUninstaller) then begin
      Log('CW_SETUP legacy-registration-invalid');
      SuppressibleMsgBox('The earlier installation could not be verified. Setup will not change it.', mbError, MB_OK, IDOK);
      exit;
    end;
    LegacyExecutable := AddBackslash(ExistingPath) + 'Uninstall Canvas Weekly.exe';
    ExpectedCommand := '"' + LegacyExecutable + '"';
    if IsAdminInstallMode then ExpectedCommand := ExpectedCommand + ' /allusers'
    else ExpectedCommand := ExpectedCommand + ' /currentuser';
    LegacyBackup := AddBackslash(ExistingPath) + '.setup\legacy-uninstaller.bin';
    RollbackFolder := AddBackslash(ExistingPath) + '.setup\legacy-files';
    if (CompareText(Trim(ExistingUninstaller), ExpectedCommand) <> 0) or
      not FileExists(LegacyExecutable) or FileExists(LegacyBackup) or DirExists(RollbackFolder) then begin
      Log('CW_SETUP legacy-registration-invalid');
      SuppressibleMsgBox('The earlier uninstaller or an interrupted update needs review. Setup will not execute it or overwrite its backup.', mbError, MB_OK, IDOK);
      exit;
    end;
    ExistingCopy := True;
  end;
  if ExistingCopy and not LegacyCopy then begin
    if not RegQueryStringValue(ScopeRoot, CurrentKey, 'InstallLocation', ExistingPath) or
      not RegQueryStringValue(ScopeRoot, CurrentKey, 'DisplayVersion', ExistingVersion) or
      not RegQueryStringValue(ScopeRoot, CurrentKey, 'UninstallString', ExistingUninstaller) then begin
      SuppressibleMsgBox('The installation registration is incomplete. Setup cannot safely manage this copy.', mbError, MB_OK, IDOK);
      exit;
    end;
  end;
  if ExistingCopy then begin
    if not StrToVersion(ExistingVersion, Version) or not StrToVersion('{#AppVersion}', OfferedVersion) then begin
      SuppressibleMsgBox('The installed version could not be checked. Setup will not replace it.', mbError, MB_OK, IDOK);
      exit;
    end;
    if not SafeDestination(ExistingPath) then begin
      SuppressibleMsgBox('The registered installation folder is not a valid app folder. Setup cannot manage this copy.', mbError, MB_OK, IDOK);
      exit;
    end;
    IsDowngrade := ComparePackedVersion(Version, OfferedVersion) > 0;
    Log('CW_SETUP existing-version=' + ExistingVersion);
  end;
  if LegacyCopy and not SafeDestination(LegacyExecutable) then begin
    SuppressibleMsgBox('The earlier uninstaller must not be a symbolic link.', mbError, MB_OK, IDOK);
    exit;
  end;
  Result := True;
end;

procedure InitializeWizard;
var
  Action, Scope: String;
begin
  if IsAdminInstallMode then Scope := 'All users (administrator permission)' else Scope := 'Only me';
  if ExistingVersion = '{#AppVersion}' then Action := 'Reinstall this version' else Action := 'Update to {#AppVersion}';
  if IsDowngrade then Action := 'Keep the newer installed version';
  MaintenancePage := CreateInputOptionPage(wpWelcome, 'Manage Canvas Weekly',
    Scope + ' - installed version ' + ExistingVersion,
    ExistingPath + #13#10#13#10 + 'Choose an action. Guides and saved account settings are kept.', True, False);
  MaintenancePage.Add(Action);
  MaintenancePage.Add('Uninstall Canvas Weekly');
  MaintenancePage.SelectedValueIndex := 0;
  if LegacyCopy then begin
    MaintenancePage.CheckListBox.ItemEnabled[1] := False;
    MaintenancePage.SubCaptionLabel.Caption := Scope + ' - upgrade the earlier installer in this folder';
  end;
  if IsDowngrade then begin
    MaintenancePage.CheckListBox.ItemEnabled[0] := False;
    MaintenancePage.SelectedValueIndex := -1;
    MaintenancePage.SubCaptionLabel.Caption := 'A newer version is installed. Downgrades are blocked.';
  end;
  SeparatePage := CreateInputOptionPage(MaintenancePage.ID, 'Another installation exists',
    'This setup is for ' + Scope + '.',
    'Canvas Weekly is already registered in the other scope. Go back by cancelling and reopening setup to manage that copy, or explicitly choose a separate installation.', False, False);
  SeparatePage.Add('Install a separate copy in this scope');
  if ExistingCopy then WizardForm.DirEdit.Text := ExistingPath;
  Log('CW_SETUP dark=' + IntToStr(Ord(IsDarkInstallMode)) + ' admin=' + IntToStr(Ord(IsAdminInstallMode)));
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := ((PageID = MaintenancePage.ID) and not ExistingCopy) or
    ((PageID = SeparatePage.ID) and (ExistingCopy or not OtherCopy)) or
    ((PageID = wpSelectDir) and ExistingCopy);
end;

function ValidUninstaller(var Executable: String): Boolean;
var
  Parent, Name: String;
  Index: Integer;
begin
  Result := False;
  { Inno writes a quoted executable with no arguments. Accept only its generated
    filename in this registered copy's .setup folder. Never invoke a shell. }
  Executable := ExistingUninstaller;
  if (Length(Executable) < 3) or (Executable[1] <> '"') or
    (Executable[Length(Executable)] <> '"') then exit;
  Delete(Executable, Length(Executable), 1);
  Delete(Executable, 1, 1);
  if Pos('"', Executable) <> 0 then exit;
  Parent := AddBackslash(ExpandFileName(ExistingPath)) + '.setup\';
  if CompareText(ExtractFilePath(ExpandFileName(Executable)), Parent) <> 0 then exit;
  Name := Lowercase(ExtractFileName(Executable));
  if (Length(Name) <> 12) or (Copy(Name, 1, 5) <> 'unins') or (Copy(Name, 9, 4) <> '.exe') then exit;
  for Index := 6 to 8 do if (Name[Index] < '0') or (Name[Index] > '9') then exit;
  if not FileExists(Executable) or not SafeDestination(Executable) then exit;
  Result := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  ExitCode: Integer;
  Executable: String;
begin
  Result := True;
  if (CurPageID = MaintenancePage.ID) and (MaintenancePage.SelectedValueIndex < 0) then begin
    if not WizardSilent then MsgBox('Choose an action or cancel setup to keep the installed version.', mbInformation, MB_OK);
    Result := False;
  end;
  if (CurPageID = SeparatePage.ID) and not SeparatePage.Values[0] then Result := False;
  if (CurPageID = MaintenancePage.ID) and (MaintenancePage.SelectedValueIndex = 1) then begin
    Result := False;
    { Silent setup must never infer an uninstall action from a disabled update. }
    if WizardSilent then exit;
    if not ValidUninstaller(Executable) then begin
      MsgBox('The uninstaller could not be verified. Use Windows Installed apps to review this copy.', mbError, MB_OK);
      exit;
    end;
    if Exec(Executable, '', ExtractFilePath(Executable), SW_SHOW, ewWaitUntilTerminated, ExitCode) then begin
      UninstallCompleted := ExitCode = 0;
      if UninstallCompleted then WizardForm.Close;
    end;
  end;
end;

procedure CancelButtonClick(CurPageID: Integer; var Cancel, Confirm: Boolean);
begin
  if UninstallCompleted then Confirm := False;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Index: Integer;
  Destination, Backup: String;
begin
  Result := '';
  if not SafeDestination(WizardDirValue) then begin
    Result := 'Choose a dedicated local folder for Canvas Weekly.';
    exit;
  end;
  if IsDowngrade then Result := 'A newer Canvas Weekly version is installed. Downgrades are blocked.';
  if ExistingCopy and not SamePath(ExistingPath, WizardDirValue) then
    Result := 'An existing installation must be updated in its current folder.';
  if OtherCopy and not ExistingCopy and not SeparatePage.Values[0] then
    Result := 'Choose explicitly whether to install a separate copy.';
  if (Result <> '') or not LegacyCopy then exit;
  if LegacyMoved and not LegacyBackupReady then begin
    Result := 'The earlier backup did not finish. Close setup to restore the previous installation before trying again.';
    exit;
  end;
  if not SafeDestination(ExtractFileDir(LegacyBackup)) then begin
    Result := 'The installer metadata folder must not be a junction or symbolic link.';
    exit;
  end;
  if not LegacyMoved then begin
    CreatedBackupFolder := not DirExists(ExtractFileDir(LegacyBackup));
    if not ForceDirectories(ExtractFileDir(LegacyBackup)) or not RenameFile(LegacyExecutable, LegacyBackup) then begin
      Result := 'The earlier uninstaller could not be set aside. Close setup or other apps using this folder, then try again.';
      exit;
    end;
    LegacyMoved := True;
    Log('CW_SETUP legacy-uninstaller-set-aside');
    PayloadFiles := TStringList.Create;
    SavedFiles := TStringList.Create;
#include PayloadList
    for Index := 0 to PayloadFiles.Count - 1 do begin
      Destination := AddBackslash(ExistingPath) + PayloadFiles[Index];
      if not SafeDestination(Destination) then begin
        Result := 'An existing application file uses a linked location. Setup will not replace it.';
        exit;
      end;
      if FileExists(Destination) then begin
        Backup := AddBackslash(RollbackFolder) + PayloadFiles[Index];
        if not ForceDirectories(ExtractFileDir(Backup)) or not FileCopy(Destination, Backup, True) then begin
          Result := 'The current application files could not be backed up. Check free disk space and close the app, then try again.';
          exit;
        end;
        SavedFiles.Add(PayloadFiles[Index]);
      end;
    end;
    Log('CW_SETUP legacy-files-backed-up=' + IntToStr(SavedFiles.Count));
    LegacyBackupReady := True;
  end;
#ifdef FixtureBuild
  if ExpandConstant('{param:FAILAFTERBACKUP|0}') = '1' then
    Result := 'Fixture: stop after backing up the earlier uninstaller.';
#endif
end;

function FinishFileBackups(Restore: Boolean): Boolean;
var
  Index: Integer;
  Destination, Backup, Parent: String;
  Finished: Boolean;
begin
  Result := True;
  if SavedFiles = nil then exit;
  for Index := SavedFiles.Count - 1 downto 0 do begin
    Backup := AddBackslash(RollbackFolder) + SavedFiles[Index];
    Destination := AddBackslash(ExistingPath) + SavedFiles[Index];
    Finished := True;
    if Restore then
      Finished := SafeDestination(Destination) and ForceDirectories(ExtractFileDir(Destination)) and FileCopy(Backup, Destination, False);
    if Finished then Finished := DeleteFile(Backup);
    if not Finished then Result := False;
    Parent := ExtractFileDir(Backup);
    while Length(Parent) >= Length(RollbackFolder) do begin
      if not RemoveDir(Parent) then break;
      Parent := ExtractFileDir(Parent);
    end;
  end;
  RemoveDir(RollbackFolder);
end;

procedure DeinitializeSetup;
begin
  if LegacyMoved and not MigrationCommitted then begin
    if not FinishFileBackups(True) then
      SuppressibleMsgBox('Some application files could not be restored. Keep .setup\legacy-files in the installation folder for recovery.', mbError, MB_OK, IDOK);
    if RenameFile(LegacyBackup, LegacyExecutable) then
      Log('CW_SETUP legacy-uninstaller-restored')
    else
      SuppressibleMsgBox('Setup stopped and could not restore the earlier uninstaller. Its backup remains in the installation folder under .setup. Keep that backup for recovery.', mbError, MB_OK, IDOK);
  end;
  if CreatedBackupFolder and not MigrationCommitted then RemoveDir(ExtractFileDir(LegacyBackup));
  if PayloadFiles <> nil then PayloadFiles.Free;
  if SavedFiles <> nil then SavedFiles.Free;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  NewUninstall, NewQuietUninstall: String;
  Cleaned: Boolean;
begin
  if (CurStep <> ssPostInstall) or not LegacyMoved then exit;
  { The new engine has now installed its payload and uninstall registration.
    Never restore the recursive old uninstaller after a successful installation. }
  MigrationCommitted := True;
  Cleaned := RegQueryStringValue(ScopeRoot, CurrentKey, 'UninstallString', NewUninstall) and
    RegQueryStringValue(ScopeRoot, CurrentKey, 'QuietUninstallString', NewQuietUninstall);
  if Cleaned then begin
    { Redirect first, so a failed key removal leaves a safe duplicate entry. }
    Cleaned := RegWriteStringValue(ScopeRoot, LegacyKey, 'UninstallString', NewUninstall) and
      RegWriteStringValue(ScopeRoot, LegacyKey, 'QuietUninstallString', NewQuietUninstall);
    if Cleaned then
      Cleaned := RegDeleteKeyIncludingSubkeys(ScopeRoot, LegacyKey) and
        RegDeleteKeyIncludingSubkeys(ScopeRoot, LegacyLocationKey);
  end;
  if Cleaned then Cleaned := FinishFileBackups(False) and DeleteFile(LegacyBackup);
  if Cleaned then Log('CW_SETUP legacy-migration-complete')
  else begin
    Log('CW_SETUP legacy-cleanup-incomplete');
    SuppressibleMsgBox('Canvas Weekly is installed, but some earlier installer metadata could not be removed. Keep the .setup folder and review setup before installing again.', mbInformation, MB_OK, IDOK);
  end;
end;
