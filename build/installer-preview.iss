; UI-only preview. No payload, registry writes, shortcuts, process launches or uninstall actions.
#ifndef PreviewTheme
  #define PreviewTheme "dynamic"
#endif
#ifndef AppVersion
  #error AppVersion must be supplied by the build script.
#endif

[Setup]
AppId=app.canvasweekly.installer-preview
AppName=Canvas Weekly Setup Preview
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\Canvas Weekly
OutputBaseFilename=Canvas-Weekly-Setup-Preview
PrivilegesRequired=lowest
WizardStyle=modern {#PreviewTheme}
WizardSizePercent=110
WizardImageFile=branding\installer-sidebar.bmp
WizardImageFileDynamicDark=branding\installer-sidebar.bmp
WizardSmallImageFile=branding\installer-mark.png
WizardSmallImageFileDynamicDark=branding\installer-mark.png
SetupIconFile=branding\icon.ico
CreateAppDir=no
CreateUninstallRegKey=no
Uninstallable=no
CloseApplications=no
RestartApplications=no
UsePreviousAppDir=no
UsePreviousLanguage=no
UsePreviousPrivileges=no
DisableWelcomePage=no
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
DisableFinishedPage=yes

[Messages]
WelcomeLabel1=Canvas Weekly
WelcomeLabel2=Your week, simplified.%n%nPreview the new setup appearance and installation discovery.%n%nThis preview cannot install, update or remove the app. Your guides and account settings are not accessed.

[Code]
const
  LegacyId = '90cf4922-b422-5f2f-8ec7-212561447131';

var
  CopiesPage: TInputOptionWizardPage;
  SummaryPage: TOutputMsgWizardPage;
  Copies: array of String;
  CopyCount: Integer;

procedure FindCopy(RootKey: Integer; Scope: String);
var
  Key, Name, Version, Location: String;
begin
  Key := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\' + LegacyId;
  if not RegQueryStringValue(RootKey, Key, 'DisplayName', Name) then exit;
  if (Name <> 'Canvas Weekly') and (Pos('Canvas Weekly ', Name) <> 1) then exit;
  if not RegQueryStringValue(RootKey, Key, 'DisplayVersion', Version) then
    Version := 'Version unavailable';
  { NSIS stores the installation directory separately from its uninstall entry.
    Display this value only. Never execute UninstallString from the registry. }
  if not RegQueryStringValue(RootKey, 'Software\' + LegacyId, 'InstallLocation', Location) then
    Location := 'Location unavailable';
  SetArrayLength(Copies, CopyCount + 1);
  Copies[CopyCount] := Scope + ' - ' + Version + #13#10 + Location;
  CopiesPage.Add(Scope + ' - ' + Version);
  CopyCount := CopyCount + 1;
end;

procedure InitializeWizard;
begin
  CopiesPage := CreateInputOptionPage(wpWelcome, 'Manage Canvas Weekly',
    'Choose which installation you want to manage.',
    'Registered installations on this computer (preview only):', True, False);
  FindCopy(HKCU64, 'Only me');
  FindCopy(HKLM64, 'All users');
  if CopyCount = 1 then CopiesPage.SelectedValueIndex := 0;
  if CopyCount > 1 then CopiesPage.SelectedValueIndex := -1;
  SummaryPage := CreateOutputMsgPage(CopiesPage.ID, 'Setup preview',
    'Appearance and discovery only', '');
  Log('CW_PREVIEW dark=' + IntToStr(Ord(IsDarkInstallMode)) +
    ' windowsDark=' + IntToStr(Ord(IsWinDark)) +
    ' highContrast=' + IntToStr(Ord(HighContrastActive)) +
    ' copies=' + IntToStr(CopyCount));
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PageID = CopiesPage.ID) and (CopyCount = 0);
end;

procedure CurPageChanged(CurPageID: Integer);
var
  Summary: String;
begin
  if CurPageID <> SummaryPage.ID then begin
    WizardForm.NextButton.Caption := SetupMessage(msgButtonNext);
    exit;
  end;
  if (CopyCount > 0) and (CopiesPage.SelectedValueIndex >= 0) then
    Summary := Copies[CopiesPage.SelectedValueIndex] + #13#10#13#10 +
      'The finished installer will offer Update or Reinstall and Uninstall for this copy.'
  else
    Summary := 'No registered Canvas Weekly installation was found.' + #13#10#13#10 +
      'The finished installer will default to Only me and let you choose a destination.';
  SummaryPage.MsgLabel.Caption := Summary + #13#10#13#10 +
    'Installation and removal are not available in this preview. Migration and data-preservation checks are still in progress.' + #13#10#13#10 +
    'Windows appearance is detected when this preview opens.';
  WizardForm.NextButton.Caption := 'Close preview';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = CopiesPage.ID) and (CopyCount > 1) and
    (CopiesPage.SelectedValueIndex < 0) then begin
    if not WizardSilent then
      MsgBox('Choose an installation to preview its options.', mbInformation, MB_OK);
    Result := False;
  end;
  if CurPageID = SummaryPage.ID then begin
    Result := False;
    if not WizardSilent then WizardForm.Close;
  end;
end;

procedure CancelButtonClick(CurPageID: Integer; var Cancel, Confirm: Boolean);
begin
  Cancel := True;
  Confirm := False;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  { Defense in depth for silent mode or future changes to page navigation. }
  Result := 'This appearance preview cannot install or remove Canvas Weekly.';
end;
