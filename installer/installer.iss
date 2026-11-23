; KK Go 桌面版 — Inno Setup 安装脚本 (6.7+)
; 与手机端同属一套「KK Go」品牌；内核版本可自由指定/升级（见 build.config.json / build.ps1 -DshVer）
; 特性：中文向导、自定义目录（默认用户目录，无需管理员）、开机自启选项、
;       卸载清理快捷方式与自启项，但保留 %USERPROFILE%\.dsh 用户数据。

#define MyAppName "KK Go"
#define MyAppVersion "3.1.0"
#define MyAppPublisher "KK Go"
#define MyAppExeName "KK Go.exe"
#define MyAppId "{7B4E2C91-3F6A-4D28-9E15-A8C3B07D6F42}"

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
OutputBaseFilename=KKGo-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; 无需管理员：安装到用户目录，只写 HKCU
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0
DisableProgramGroupPage=yes
LicenseFile=
; 卸載/升級時自動嘗試關閉正在運行的 KK Go（配合 UninstallRun 的 --shutdown 雙保險）
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "cn"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "快捷方式:"
Name: "startupicon"; Description: "开机自动启动（托盘常驻）"; GroupDescription: "快捷方式:"
; 防火墙放行：内置 runtime\node.exe 监听的 127.0.0.1 端口在部分机器上会被
; 本机防火墙/安全软件静默丢包（已用对照实验证实是按程序路径拦截），
; 结果是"服务在跑、界面打不开"。加一条 Inbound-Allow 规则即可根治，
; 需要管理员权限 —— 安装器本身是 lowest 权限，所以这一步由自提权的 PowerShell 完成。
Name: "firewallrule"; Description: "允许 KK Go 的本地服务通过 Windows 防火墙（需要管理员权限，会弹出一次 UAC 确认）"; GroupDescription: "防火墙:"

[Files]
; 整个 app 目录（含内置 node、dsh 内核、WebView2 DLL、运行时、文档）
; 排除构建期残留的测试日志（内含明文会话 token，绝不能进安装包）
Source: "..\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "dsh_test_launch.log,service.log,desktop.log,desktop.log.*,dump-config-web.yml,dump-kkgo.yml"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\whale.ico"
Name: "{group}\停止服务"; Filename: "{app}\{#MyAppExeName}"; Parameters: "stop"; IconFilename: "{app}\whale.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\whale.ico"; Tasks: desktopicon
; 开机自启：写 HKCU Run，指向 --startup 静默模式
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--startup"; IconFilename: "{app}\whale.ico"; Tasks: startupicon

[Run]
; 安装完成启动一次（可选）
Filename: "{app}\{#MyAppExeName}"; Description: "立即运行 {#MyAppName}"; Flags: nowait postinstall skipifsilent unchecked
; 防火墙放行：装完就把内置运行时的放行规则加上，避免首次启动界面打不开。
; 脚本自己会提权（一次 UAC）；已经存在规则时直接跳过，不再打扰用户。
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\tools\add-firewall-rule.ps1"""; Flags: runhidden waituntilterminated; Tasks: firewallrule
; 若安装阶段没能加成功（用户取消 UAC / 机器策略拦截），启动器在首次开窗时会
; 再次探测端口并弹窗征询修复，两条路都堵不住才让用户手动处理。

[UninstallRun]
; 卸载前必须先关掉正在运行的 KK Go 及其 dsh 服务进程。
; dsh 服务是独立的 node.exe 子进程，会一直持有 <安装目录>\runtime\node.exe 的
; 文件句柄；不先杀掉它，Inno 就删不掉这个 93MB 的核心文件，卸载变成"卸载一半"。
; --shutdown 会杀掉「托盘主进程 + 服务进程树」，比 Inno 自带的 CloseApplications 更彻底。
Filename: "{app}\{#MyAppExeName}"; Parameters: "--shutdown"; Flags: runhidden waituntilterminated; RunOnceId: "StopKKGoBeforeUninstall"

[UninstallDelete]
; 只删程序自身产生的临时文件；用户数据 %USERPROFILE%\.dsh 刻意保留
Type: files; Name: "{app}\desktop.pid"
Type: files; Name: "{app}\service.log"
Type: filesandordirs; Name: "{app}\dsh\node_modules\@deepseek-ai\dsh-plugin-suite.dshpatch.tmp.js"

[Messages]
cn.WelcomeLabel1=欢迎安装 [name] 桌面版
cn.WelcomeLabel2=将把 [name] 安装到您的计算机。内置 Node 运行时与可自由升级的 dsh 内核，无需任何开发环境。

[Code]
{ 卸载时清理 HKCU Run 启动项（Icons 的 userstartup 一般由卸载器自动清理，这里兜底） }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    RegDeleteValue(HKEY_CURRENT_USER, 'Software\Microsoft\Windows\CurrentVersion\Run', '{#MyAppName}');
end;
