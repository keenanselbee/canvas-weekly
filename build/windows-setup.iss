#ifndef AppVersion
  #error AppVersion is required.
#endif
#ifndef PayloadDir
  #error PayloadDir is required.
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

#ifndef FixtureBuild
[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; Flags: unchecked

[Icons]
Name: "{autoprograms}\Canvas Weekly"; Filename: "{app}\Canvas Weekly.exe"; AppUserModelID: "app.canvasweekly.desktop"
Name: "{autodesktop}\Canvas Weekly"; Filename: "{app}\Canvas Weekly.exe"; Tasks: desktopicon; AppUserModelID: "app.canvasweekly.desktop"
#endif

[Messages]
WelcomeLabel1=Canvas Weekly
WelcomeLabel2=Your week, simplified.%n%nBring your courses into one weekly study plan.%n%nSetup installs the app. Canvas and ChatGPT connections happen inside Canvas Weekly.
FinishedLabel=Canvas Weekly is installed.%n%nOpen it from the Start menu when you are ready.

[Code]
const
  CurrentKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#SetupId}_is1';
  LegacyKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#LegacyId}';

var
  MaintenancePage: TInputOptionWizardPage;
  SeparatePage: TInputOptionWizardPage;
  ExistingPath, ExistingVersion, ExistingUninstaller: String;
  ExistingCopy, OtherCopy, IsDowngrade, UninstallCompleted: Boolean;
  ScopeRoot: Integer;

function SamePath(Left, Right: String): Boolean;
begin
  Result := CompareText(RemoveBackslashUnlessRoot(ExpandFileName(Left)),
    RemoveBackslashUnlessRoot(ExpandFileName(Right))) = 0;
end;

function SafeDestination(Value: String): Boolean;
var
  Normalized: String;
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
end;

function InitializeSetup: Boolean;
var
  Version, OfferedVersion: Int64;
  OtherRoot: Integer;
begin
  Result := False;
  if IsAdminInstallMode then begin
    ScopeRoot := HKLM64;
    OtherRoot := HKCU64;
  end else begin
    ScopeRoot := HKCU64;
    OtherRoot := HKLM64;
  end;
  { Legacy cleanup must be implemented and tested before this candidate replaces
    NSIS. Do not run the old recursive uninstaller or create a second registration. }
  if RegKeyExists(ScopeRoot, LegacyKey) then begin
    SuppressibleMsgBox('This copy uses the earlier Canvas Weekly installer. Automatic migration is not ready yet. Use the existing installer for this copy.',
      mbInformation, MB_OK, IDOK);
    Log('CW_SETUP legacy-migration-blocked');
    exit;
  end;
  OtherCopy := RegKeyExists(OtherRoot, CurrentKey) or RegKeyExists(OtherRoot, LegacyKey);
  ExistingCopy := RegKeyExists(ScopeRoot, CurrentKey);
  if ExistingCopy then begin
    if not RegQueryStringValue(ScopeRoot, CurrentKey, 'InstallLocation', ExistingPath) or
      not RegQueryStringValue(ScopeRoot, CurrentKey, 'DisplayVersion', ExistingVersion) or
      not RegQueryStringValue(ScopeRoot, CurrentKey, 'UninstallString', ExistingUninstaller) then begin
      SuppressibleMsgBox('The installation registration is incomplete. Setup cannot safely manage this copy.', mbError, MB_OK, IDOK);
      exit;
    end;
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
  if not FileExists(Executable) then exit;
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
end;
