; CursorDeck — Inno Setup script
; Build with: build-installer.bat  (or ISCC.exe CursorDeck.iss)

#define MyAppName "CursorDeck"
#ifndef MyAppVersion
  #define MyAppVersion "0.9.0"
#endif
#define MyAppPublisher "CursorDeck"
#define MyAppURL "https://github.com/cursordeck/cursordeck"
#define MyAppExeName "Start CursorDeck.vbs"
#define PayloadDir "..\dist\payload"

[Setup]
AppId={{A8F3C2E1-9B47-4D6A-8E21-CURSORDECK0001}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={localappdata}\CursorDeck
DefaultGroupName=CursorDeck
DisableProgramGroupPage=yes
LicenseFile=..\LICENSE
OutputDir=..\dist
OutputBaseFilename=CursorDeck-Setup-{#MyAppVersion}
SetupIconFile=..\icon\tray.ico
UninstallDisplayIcon={app}\icon\tray.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=no
RestartApplications=no
InfoBeforeFile=
InfoAfterFile=

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "autostart"; Description: "Start CursorDeck with Windows (recommended)"; GroupDescription: "Startup:"; Flags: checkedonce
Name: "desktopicon"; Description: "Create a Desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked
Name: "cursorhooks"; Description: "Install Cursor IDE keybindings and hooks"; GroupDescription: "Integrations:"; Flags: checkedonce
Name: "sdplugin"; Description: "Install Elgato Stream Deck plugin"; GroupDescription: "Integrations:"; Flags: checkedonce

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\CursorDeck"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\icon\tray.ico"; Comment: "Start CursorDeck tray"
Name: "{group}\Open Web Pad"; Filename: "http://127.0.0.1:3847/"; Comment: "Open CursorDeck web pad"
Name: "{group}\Stop CursorDeck"; Filename: "{app}\stop.bat"; WorkingDir: "{app}"; IconFilename: "{app}\icon\tray.ico"
Name: "{group}\Setup Cursor hooks"; Filename: "{app}\setup.bat"; WorkingDir: "{app}"
Name: "{group}\Install Stream Deck plugin"; Filename: "{app}\install-plugin.bat"; WorkingDir: "{app}"
Name: "{group}\Uninstall CursorDeck"; Filename: "{uninstallexe}"
Name: "{autodesktop}\CursorDeck"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\icon\tray.ico"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "CursorDeck"; ValueData: "wscript.exe //nologo ""{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
; Post-install integrations (hooks / plugin)
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\post-install.ps1"" -InstallRoot ""{app}"" -CursorHooks {code:IsCursorHooks} -SdPlugin {code:IsSdPlugin}"; StatusMsg: "Finishing setup (hooks / plugin)…"; Flags: runhidden waituntilterminated
; Launch tray
Filename: "{app}\{#MyAppExeName}"; Description: "Launch CursorDeck now"; Flags: nowait postinstall skipifsilent shellexec

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\uninstall-autostart.ps1"""; RunOnceId: "RemoveAutostart"; Flags: runhidden waituntilterminated

[Code]
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  Result := True;
  { Require Node.js 20+ on PATH }
  if not Exec('cmd.exe', '/c node -e "process.exit(Number(process.versions.node.split(''.'')[0])>=20?0:2)"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    MsgBox('Node.js was not found.'#13#10#13#10'Install Node.js 20 LTS from https://nodejs.org/ then run this setup again.', mbError, MB_OK);
    Result := False;
    Exit;
  end;
  if ResultCode <> 0 then
  begin
    MsgBox('Node.js 20 or newer is required.'#13#10#13#10'Install / upgrade Node from https://nodejs.org/ then run this setup again.', mbError, MB_OK);
    Result := False;
  end;
end;

function IsCursorHooks(Param: String): String;
begin
  if WizardIsTaskSelected('cursorhooks') then
    Result := '1'
  else
    Result := '0';
end;

function IsSdPlugin(Param: String): String;
begin
  if WizardIsTaskSelected('sdplugin') then
    Result := '1'
  else
    Result := '0';
end;
