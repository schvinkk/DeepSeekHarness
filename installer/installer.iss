; DeepSeek Harness 桌面版 — Inno Setup 安装脚本 (6.7+)
; 配套 build.ps1 v3.0.0 / 内核 @deepseek-ai/dsh 0.2.2-rc.5
; 特性：中文向导、自定义目录（默认用户目录，无需管理员）、开机自启选项、
;       卸载清理快捷方式与自启项，但保留 %USERPROFILE%\.dsh 用户数据。

#define MyAppName "DeepSeek Harness"
#define MyAppVersion "3.0.0"
#define MyAppPublisher "DeepSeek Harness"
#define MyAppExeName "DeepSeek Harness.exe"
#define MyAppId "{8F4A2C10-3D5E-4B7A-9C21-DEEPSEEKHARN3D}"

[Setup]
AppId={{#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={userpf}\{#MyAppName}
DefaultGroupName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName} {#MyAppVersion}
OutputDir=..\dist
OutputBaseFilename=DeepSeekHarness-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; 无需管理员：安装到用户目录，只写 HKCU
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0
DisableProgramGroupPage=yes
LicenseFile=

[Languages]
Name: "cn"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "快捷方式:"
Name: "startupicon"; Description: "开机自动启动（托盘常驻）"; GroupDescription: "快捷方式:"

[Files]
; 整个 app 目录（含内置 node、dsh 内核、WebView2 DLL、运行时、文档）
Source: "..\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\whale.ico"
Name: "{group}\停止服务"; Filename: "{app}\{#MyAppExeName}"; Parameters: "stop"; IconFilename: "{app}\whale.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\whale.ico"; Tasks: desktopicon
; 开机自启：写 HKCU Run，指向 --startup 静默模式
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--startup"; IconFilename: "{app}\whale.ico"; Tasks: startupicon

[Run]
; 安装完成启动一次（可选）
Filename: "{app}\{#MyAppExeName}"; Description: "立即运行 {#MyAppName}"; Flags: nowait postinstall skipifsilent unchecked

[UninstallDelete]
; 只删程序自身产生的临时文件；用户数据 %USERPROFILE%\.dsh 刻意保留
Type: files; Name: "{app}\desktop.pid"
Type: filesandordirs; Name: "{app}\dsh\node_modules\@deepseek-ai\dsh-plugin-suite.dshpatch.tmp.js"

[Messages]
cn.WelcomeLabel1=欢迎安装 [name] 桌面版
cn.WelcomeLabel2=将把 [name] 安装到您的计算机。内置 Node 运行时与 dsh 0.2.2-rc.5 内核，无需任何开发环境。

[Code]
{ 卸载时清理 HKCU Run 启动项（Icons 的 userstartup 一般由卸载器自动清理，这里兜底） }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    RegDeleteValue(HKEY_CURRENT_USER, 'Software\Microsoft\Windows\CurrentVersion\Run', '{#MyAppName}');
end;
