; KK Go 桌面版 — Inno Setup 安装脚本 (6.7+)
; 与手机端同属一套「KK Go」品牌；内核版本可自由指定/升级（见 build.config.json / build.ps1 -DshVer）
; 特性：中文向导、自定义目录（默认用户目录，无需管理员）、开机自启选项、
;       卸载清理快捷方式与自启项，但保留 %USERPROFILE%\.dsh 用户数据。

#define MyAppName "KK Go"
#define MyAppVersion "3.1.5"
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
; ★ 安装包本身也必须显示官方鲸鱼图标，否则 Edge 下载下来看到的是 Inno 默认图标
SetupIconFile=..\app\whale.ico
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
; 关闭 Inno 自带的 RestartManager：它检测到 dsh 的 node.exe 占用 runtime\node.exe 时
; 无法自动关闭，会在静默安装下直接 Abort（exit=5），导致覆盖升级失败、exe 仍是旧版。
; 我们改在 PrepareToInstall 里用自己的脚本精确结束本产品进程（见 [Code]）。
CloseApplications=no
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
Source: "..\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "dsh_test_launch.log,service.log,desktop.log,desktop.log.*,dump-config-web.yml,dump-kkgo.yml,.kkgo\*,desktop.pid"
; 升级前停进程脚本：dontcopy=只打包进安装器、不装到目标目录，安装早期即可 ExtractTemporaryFile 执行
Source: "..\app\tools\stop-before-upgrade.ps1"; Flags: dontcopy

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
{ 安装开始前先停掉"正在运行的旧 KK Go"，否则旧 exe 被占用，Inno 无法替换，
  用户以为升级成功、实际双击的还是旧版（症状：升级后依旧 authentication required）。
  对两个来源都尝试：① 已注册的安装目录；② 旧版本常见的默认目录。
  --shutdown 会同时结束托盘进程和其 node 服务树，彻底释放 exe 句柄。 }
procedure StopRunningKKGo;
var
  R: Integer;
begin
  // 注意：InitializeSetup 阶段 {app} 常量尚未初始化，绝不能 ExpandConstant('{app}...')，
  // 否则抛 "an attempt was made to expand the app constant before it was initialized"，安装中止。
  // 只按固定进程名结束本产品进程（含其 node 服务子进程树），不碰其他软件。
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM "{#MyAppExeName}" /T', '', SW_HIDE, ewWaitUntilTerminated, R);
  Sleep(800);
end;

function InitializeSetup: Boolean;
begin
  Result := True;
  StopRunningKKGo;
end;

{ 关键：PrepareToInstall 阶段安装目录常量已初始化。在这里用 PowerShell 脚本精确结束
  "命令行里含本安装目录"的 dsh node.exe 服务进程——它们持有 runtime\node.exe
  的句柄，不杀掉会导致覆盖升级时 exe 无法替换 / RestartManager Abort（exit=5）。
  脚本只杀 KK Go 托盘 + 指向本目录的 node.exe，绝不误伤机器上其他 node 程序。 }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  R: Integer;
  Script: String;
  Cmd: String;
begin
  Result := '';
  NeedsRestart := False;
  try
    ExtractTemporaryFile('stop-before-upgrade.ps1');
    Script := ExpandConstant('{tmp}\stop-before-upgrade.ps1');
    Cmd := '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + Script + '" -InstallDir "' + ExpandConstant('{app}') + '"';
    if Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Cmd, '', SW_HIDE, ewWaitUntilTerminated, R) then
      Log('PrepareToInstall: stop-before-upgrade exit=' + IntToStr(R));
  except
    Log('PrepareToInstall: stop script failed (non-fatal)');
  end;
  Sleep(600);
end;

{ 安装结束后刷新桌面/任务栏的图标缓存，解决"桌面快捷方式仍显示旧图标"的问题。
  用系统自带 ie4uinit.exe（Win10/11 内置），不依赖任何第三方工具。 }
procedure RefreshIconCache;
var R: Integer;
begin
  Exec(ExpandConstant('{sys}\ie4uinit.exe'), '-show', '', SW_HIDE, ewWaitUntilTerminated, R);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    RefreshIconCache;
end;

{ 卸载时清理 HKCU Run 启动项（Icons 的 userstartup 一般由卸载器自动清理，这里兜底） }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    RegDeleteValue(HKEY_CURRENT_USER, 'Software\Microsoft\Windows\CurrentVersion\Run', '{#MyAppName}');
end;
