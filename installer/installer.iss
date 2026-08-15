; DeepSeek Harness 桌面版 — 安装脚本 (Inno Setup 6.7+)
; 编译: ISCC.exe installer.iss   (工作目录 = 本文件所在目录)

#define MyAppName "DeepSeek Harness"
#define MyAppNameCN "DeepSeek Harness 桌面版"
#define MyAppVersion "1.95.27"
#define MyAppPublisher "DeepSeek AI"
#define MyAppExeName "DeepSeek Harness.exe"

[Setup]
AppId={{B7A3E9F1-4C2D-4E8A-9B5C-3F1A7D6E8C42}}
AppName={#MyAppNameCN}
AppVersion={#MyAppVersion}
AppVerName={#MyAppNameCN} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\DeepSeek Harness
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableDirPage=no
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
MinVersion=10.0
OutputDir=..\dist
OutputBaseFilename=DeepSeekHarness-Setup-{#MyAppVersion}
SetupIconFile=..\icon\whale.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppNameCN}
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes
WizardStyle=modern
CloseApplications=yes
AppMutex=DeepSeekHarnessLauncher
WizardImageBackColor=clWhite

[Languages]
Name: "chinesesimp"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "autostart"; Description: "开机自动启动 DeepSeek Harness 服务（后台常驻，打开即用，可在托盘随时关闭）"; GroupDescription: "其他选项:"; Flags: unchecked

[Registry]
; 开机自启（写入当前用户的启动项，卸载时自动删除）
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "DeepSeekHarness"; ValueData: """{app}\{#MyAppExeName}"" --startup"; Flags: uninsdeletevalue; Tasks: autostart

[Files]
Source: "..\app\DeepSeek Harness.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\app\Microsoft.Web.WebView2.Core.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\app\Microsoft.Web.WebView2.WinForms.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\app\WebView2Loader.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\app\runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\app\profiles\*"; DestDir: "{app}\profiles"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\app\dsh\*"; DestDir: "{app}\dsh"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\app\docs\*"; DestDir: "{app}\docs"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\icon\whale.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppNameCN}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\whale.ico"
Name: "{autoprograms}\停止 {#MyAppNameCN}"; Filename: "{app}\{#MyAppExeName}"; Parameters: "stop"; IconFilename: "{app}\whale.ico"
Name: "{autodesktop}\{#MyAppNameCN}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\whale.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppNameCN}}"; Flags: nowait postinstall skipifsilent
