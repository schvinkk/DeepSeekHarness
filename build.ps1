# KK Go 桌面版 — 一键打包脚本 (PowerShell)
# 与手机端 dsh-Go 同属一套「KK Go」品牌；内核版本可自由指定/升级，不再与手机端硬绑定。
# 用法:
#   默认:              powershell -ExecutionPolicy Bypass -File .\build.ps1
#   指定内核版本:      powershell -ExecutionPolicy Bypass -File .\build.ps1 -DshVer 0.2.3-rc.1
#   指定应用版本:      powershell -ExecutionPolicy Bypass -File .\build.ps1 -Version 3.1.0
#   指定 Node 版本:     powershell -ExecutionPolicy Bypass -File .\build.ps1 -NodeVer v24.22.1
# 版本解析优先级: 命令行参数 > 环境变量(DSH_VER / NODE_VER / APP_VERSION) > build.config.json > 脚本默认值
# 依赖:  本机可访问网络; 已安装 Node.js(用于图标生成); 首次运行会自动下载
#        便携 Node 运行时与 Inno Setup 编译器(下载到 .\downloads\)
param(
    [string]$Version,
    [string]$DshVer,
    [string]$NodeVer
)
$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$APP  = Join-Path $ROOT "app"
$ICON = Join-Path $ROOT "icon"
$DIST = Join-Path $ROOT "dist"
$DL   = Join-Path $ROOT "downloads"

# ---------- 版本解析: 参数 > 环境变量 > build.config.json > 默认值 ----------
$cfg = @{ version = "3.0.0"; dshVer = "0.2.2-rc.5"; nodeVer = "v24.22.1" }
$cfgPath = Join-Path $ROOT "build.config.json"
if (Test-Path $cfgPath) {
    # 显式用 UTF-8 读取：PowerShell 5.1 的 Get-Content -Raw 默认按 ANSI(GBK) 解码，
    # 会把 UTF-8 中文读成乱码并破坏 JSON 结构，必须指定编码。
    try { $cfg = [System.IO.File]::ReadAllText($cfgPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json }
    catch { Write-Host "    WARN: 读取 build.config.json 失败，回退默认值" -ForegroundColor Yellow }
}
$VERSION = $Version
if (-not $VERSION) { $VERSION = $env:APP_VERSION }
if (-not $VERSION) { $VERSION = $cfg.version }
if (-not $VERSION) { $VERSION = "3.0.0" }

$DSH_VER = $DshVer
if (-not $DSH_VER) { $DSH_VER = $env:DSH_VER }
if (-not $DSH_VER) { $DSH_VER = $cfg.dshVer }
if (-not $DSH_VER) { $DSH_VER = "0.2.2-rc.5" }

$NODE_VER = $NodeVer
if (-not $NODE_VER) { $NODE_VER = $env:NODE_VER }
if (-not $NODE_VER) { $NODE_VER = $cfg.nodeVer }
if (-not $NODE_VER) { $NODE_VER = "v24.22.1" }

Write-Host "    KK Go 构建配置: 应用=$VERSION  内核=$DSH_VER  Node=$NODE_VER" -ForegroundColor DarkGray

# 源 dsh 安装目录: 优先用下载目录里该版本对应的副本，避免依赖构建机全局 npm 版本
$DSH_SRC = Join-Path $DL "dsh-$DSH_VER\node_modules\@deepseek-ai\dsh"

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

# 读取可能被其他进程持有的文件（dsh 服务会长期持有 service.log 的写句柄）。
# File.ReadAllText 默认 FileShare.Read，遇到持有写句柄的进程会抛 IOException 共享冲突。
function Read-SharedText($path) {
    try {
        $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        try {
            $sr = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::UTF8)
            try { return $sr.ReadToEnd() } finally { $sr.Dispose() }
        } finally { if ($fs) { $fs.Dispose() } }
    } catch { return "" }
}

# ---------- 1. Icon ----------
# 主路径：Pillow 从官方 DeepSeek Harness 图标源生成正确的 7 尺寸 ICO（纯官方像素，
#         之前手绘的"简约鲸鱼"小尺寸下形似 QQ、辨识度差，已弃用为主路径）。
# 兜底：  Pillow / 官方源不可用时回退到零依赖手绘（scripts\make-icon.cjs），保证 build 不中断。
Step "1/8 Generate whale icon (official source, Pillow preferred)"
$env:NODE_PATH = Join-Path $DSH_SRC "node_modules"
$iconSrc = Join-Path $ROOT "icon\official-whale-512.png"
$iconOk = $false
if (Test-Path $iconSrc) {
    foreach ($py in @("python", "py", "python3")) {
        $cmd = Get-Command $py -ErrorAction SilentlyContinue
        if (-not $cmd) { continue }
        & $cmd.Source (Join-Path $ROOT "scripts\make-icon-from-official.py") 2>&1
        $icoPath = Join-Path $ROOT "icon\whale.ico"
        # Pillow 产物是 7 尺寸正确缩放（~59KB）；手绘兜底约 3KB。用体积区分是否官方生成成功。
        if ($LASTEXITCODE -eq 0 -and (Test-Path $icoPath) -and ((Get-Item $icoPath).Length -ge 10000)) {
            Write-Host "    Official whale ICO via $py ($((Get-Item $icoPath).Length) bytes)" -ForegroundColor DarkGray
            $iconOk = $true; break
        }
    }
}
if (-not $iconOk) {
    Write-Host "    Falling back to hand-drawn icon" -ForegroundColor Yellow
    & node (Join-Path $ROOT "scripts\make-icon.cjs")
    if ($LASTEXITCODE -ne 0) { throw "Icon generation failed" }
}

# ---------- 2. Portable Node Runtime ----------
Step "2/8 Prepare Node runtime $NODE_VER"
New-Item -ItemType Directory -Force -Path $DL | Out-Null
$nodeZip = Join-Path $DL "node-$NODE_VER-win-x64.zip"
$nodePart = "$nodeZip.part"
$nodeUrlFast = "https://cdn.npmmirror.com/binaries/node/$NODE_VER/node-$NODE_VER-win-x64.zip"
$nodeUrlOrig = "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-win-x64.zip"
$nodeExpect = 37748064
if (-not (Test-Path $nodeZip) -or (Get-Item $nodeZip).Length -ne $nodeExpect) {
    foreach ($u in @($nodeUrlFast, $nodeUrlOrig)) {
        curl.exe -sSL --retry 3 --retry-delay 2 -o $nodePart $u
        if ((Test-Path $nodePart) -and (Get-Item $nodePart).Length -ge $nodeExpect) { break }
    }
    if (-not (Test-Path $nodePart) -or (Get-Item $nodePart).Length -ne $nodeExpect) {
        throw "Node runtime download incomplete"
    }
    Move-Item $nodePart $nodeZip -Force
}
$nodeDir = Join-Path $DL "node-extract\node-$NODE_VER-win-x64"
if (-not (Test-Path (Join-Path $nodeDir "node.exe"))) {
    Expand-Archive -Path $nodeZip -DestinationPath (Join-Path $DL "node-extract") -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $APP "runtime") | Out-Null
Copy-Item (Join-Path $nodeDir "node.exe") (Join-Path $APP "runtime\node.exe") -Force
Copy-Item (Join-Path $nodeDir "LICENSE") (Join-Path $APP "runtime\LICENSE") -Force
# runtime 目录只允许有 node.exe 和 LICENSE。多出来的可执行文件一律清掉 ——
# 排查过程留下的探针副本（曾经有个改名复制的 node.exe）会被原样打进安装包，
# 白白多背几十 MB，用户机器上还多一个不知所谓的 exe。
Get-ChildItem (Join-Path $APP "runtime") -File | Where-Object {
    $_.Name -notin @("node.exe", "LICENSE")
} | ForEach-Object {
    Write-Host "    Removed stray file from app\runtime: $($_.Name)"
    Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
}

# 运行时辅助脚本（防火墙放行等）：安装器在安装末尾调用它，一次 UAC 搞定，
# 免得用户首次启动时界面加载不出来却不知道原因。
$toolsSrc = Join-Path $ROOT "runtime\tools"
if (Test-Path $toolsSrc) {
    $toolsDst = Join-Path $APP "tools"
    if (Test-Path $toolsDst) { Remove-Item $toolsDst -Recurse -Force }
    Copy-Item $toolsSrc $toolsDst -Recurse -Force
    # .ps1 必须带 UTF-8 BOM：Windows PowerShell 5.1 对没有 BOM 的脚本按 ANSI(GBK) 解析，
    # 脚本里的中文会变乱码并直接把语法解析坏掉（"字符串缺少终止符"），
    # 安装时表现为防火墙放行静默失败 —— 这类坑必须在打包前拦下。
    # 编辑器很容易悄悄丢掉 BOM，所以这里不报错、直接归一化后再复核。
    foreach ($ps1 in (Get-ChildItem $toolsDst -Filter *.ps1 -Recurse -File)) {
        $pb = [System.IO.File]::ReadAllBytes($ps1.FullName)
        $hasBom = ($pb.Length -ge 3 -and $pb[0] -eq 0xEF -and $pb[1] -eq 0xBB -and $pb[2] -eq 0xBF)
        if (-not $hasBom) {
            $txt = [System.Text.Encoding]::UTF8.GetString($pb)
            $txt = $txt -replace "`r`n", "`n"
            $txt = $txt -replace "`n", "`r`n"
            $enc = New-Object System.Text.UTF8Encoding($true)
            [System.IO.File]::WriteAllText($ps1.FullName, $txt, $enc)
            Write-Host "    Normalized to UTF-8 BOM + CRLF: $($ps1.Name)"
        }
        $pb2 = [System.IO.File]::ReadAllBytes($ps1.FullName)
        if ($pb2.Length -lt 3 -or $pb2[0] -ne 0xEF -or $pb2[1] -ne 0xBB -or $pb2[2] -ne 0xBF) {
            throw "PowerShell script is not UTF-8 with BOM after normalization: $($ps1.FullName)"
        }
    }
    Write-Host "    Runtime helper scripts: $toolsDst"
}

# ---------- 3. Full dsh package ----------
Step "3/8 Fetch DSH core $DSH_VER and copy package (with all dependencies)"
# 按指定版本安装 dsh 内核；版本由参数/配置决定，可自由升级，不与任何端硬绑定。
$coreDir = Join-Path $DL "dsh-$DSH_VER"
if (-not (Test-Path (Join-Path $DSH_SRC "package.json"))) {
    New-Item -ItemType Directory -Force -Path $coreDir | Out-Null
    & npm install --prefix $coreDir "@deepseek-ai/dsh@$DSH_VER" --registry=https://registry.npmmirror.com --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "Failed to install DSH core $DSH_VER" }
}
$installedVer = (Get-Content (Join-Path $DSH_SRC "package.json") -Raw | ConvertFrom-Json).version
if ($installedVer -ne $DSH_VER) {
    throw "DSH core version mismatch: expected $DSH_VER, got $installedVer"
}
Write-Host "    DSH core pinned to $installedVer"
# 3a) 主包本体 -> app\dsh（提供 lib\bin.js 启动入口 + package.json）
robocopy $DSH_SRC (Join-Path $APP "dsh") /E /R:1 /W:1 /NFL /NDL /NP /XF *.map /XD node_modules .cache .git | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Failed to copy dsh main package (robocopy $LASTEXITCODE)" }
# 3b) 全量依赖（官方插件套件）-> app\dsh\node_modules
#     launcher 用 NODE_PATH=app\dsh\node_modules 解析；缺这一步 dsh 启动即模块找不到。
$nodeModulesSrc = Join-Path $coreDir "node_modules"
robocopy $nodeModulesSrc (Join-Path $APP "dsh\node_modules") /E /R:1 /W:1 /NFL /NDL /NP /XF *.map /XD darwin-arm64 darwin-x64 win32-arm64 linux-x64 linux-arm64 .cache .git | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Failed to copy dsh dependencies (robocopy $LASTEXITCODE)" }

# ---------- 3.5 Plugin Suite ----------
# dsh 内核自带官方插件套件（dsh-plugin-manager、dsh-plugin-market 等），
# 无需也不应注入虚构包；只戳版本号，绝不注入不存在的依赖（那是启动崩溃的来源）。
Step "4/8 Verify built-in plugin suite shipped with dsh $DSH_VER"
$pluginRoot = Join-Path $APP "dsh\node_modules\@deepseek-ai"
$builtinPlugins = @(
  "dsh-plugin-manager", "dsh-plugin-market", "dsh-plugin-recommendations",
  "dsh-client-ui-plugin-manager", "dsh-client-ui-plugin-market",
  "dsh-host-plugin-inventory", "dsh-plugin-market-index",
  "cordis-plugin-loader", "cordis-plugin-include", "cordis-plugin-timer"
)
$found = 0
foreach ($p in $builtinPlugins) { if (Test-Path (Join-Path $pluginRoot $p)) { $found++ } }
Write-Host "    Built-in plugins present: $found / $($builtinPlugins.Count)"
if ($found -lt 5) {
  throw "dsh core plugin suite looks incomplete (only $found found); refuse to ship a broken build"
}

$appPkg = Join-Path $APP "dsh\package.json"
$appManifest = Get-Content $appPkg -Raw | ConvertFrom-Json
$manifestChanged = $false
if ($appManifest.version -ne $VERSION) {
    $appManifest.version = $VERSION
    $manifestChanged = $true
    Write-Host "    Stamped app version to $VERSION"
}
# 清理历史遗留的虚构依赖，避免旧安装包升级后仍带崩溃源。
if ($appManifest.dependencies.PSObject.Properties.Name -contains "@deepseek-ai/dsh-plugin-suite") {
    $appManifest.dependencies.PSObject.Properties.Remove("@deepseek-ai/dsh-plugin-suite")
    $manifestChanged = $true
    Write-Host "    Removed stale fictional dependency dsh-plugin-suite"
}
# ---- KK Go 品牌包必须登记为「安装域依赖」----
# dsh 的运行时解析器只认两类包：安装域（app/dsh/package.json 里声明的依赖）和
# profile 域（profile 自己的 node_modules）。自定义品牌包若不落进其中任一类，
# ESM 解析会直接 ERR_MODULE_NOT_FOUND，服务端只打印一行 warning 就跳过，
# 结果是「装得上、启得动，但界面品牌没换」——构建期完全看不出来。
$brandPkg = Join-Path $ROOT "runtime\kkgo-brand\package.json"
if (-not (Test-Path $brandPkg)) { throw "Missing KK Go brand plugin source: $brandPkg" }
$brandName = (Get-Content $brandPkg -Raw | ConvertFrom-Json).name
$brandVersion = (Get-Content $brandPkg -Raw | ConvertFrom-Json).version
if ($appManifest.dependencies.PSObject.Properties.Name -notcontains $brandName) {
    $appManifest.dependencies | Add-Member -NotePropertyName $brandName -NotePropertyValue $brandVersion
    $manifestChanged = $true
    Write-Host "    Registered brand plugin as installation dependency: $brandName@$brandVersion"
}
if ($manifestChanged) {
    $json = $appManifest | ConvertTo-Json -Depth 20
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($appPkg, $json, $utf8NoBom)
}

# ---------- 3.6 Runtime self-heal patch ----------
Step "5/8 Patch dsh runtime (content.some crash self-heal)"
# patch-runtime.js 自带目标发现 + 语法自检 + 幂等 + 失败回滚；无条件调用，由脚本内部决定打不打。
& node (Join-Path $ROOT "patch-runtime.js")
if ($LASTEXITCODE -ne 0) { Write-Host "    WARN: runtime patch script exited $LASTEXITCODE (non-fatal by design)" }

# ---------- 4. Desktop Launcher + Native Client Window ----------
Step "6/8 Prepare WebView2 SDK and compile launcher"
# 清理历史遗留的旧品牌 exe，避免与新编译的 KK Go.exe 一起打进安装包
foreach ($legacy in @("DeepSeek Harness.exe", "KK Go.exe")) {
    $legacyExe = Join-Path $APP $legacy
    if (Test-Path $legacyExe) { Remove-Item $legacyExe -Force; Write-Host "    Removed legacy exe: $legacy" }
}
Copy-Item (Join-Path $ICON "whale.ico") (Join-Path $APP "whale.ico") -Force
$wvDlls = @("Microsoft.Web.WebView2.Core.dll","Microsoft.Web.WebView2.WinForms.dll","WebView2Loader.dll")
if (-not ($wvDlls | Where-Object { Test-Path (Join-Path $APP $_) } | Select-Object -First 1)) {
    $wvIdx = (curl.exe -sL "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/index.json") | ConvertFrom-Json
    $wvVer = $wvIdx.versions | Where-Object { $_ -notmatch "-" } | Select-Object -Last 1
    $wvNupkg = Join-Path $DL "webview2-$wvVer.nupkg"
    if (-not (Test-Path $wvNupkg)) {
        curl.exe -sL -o $wvNupkg "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$wvVer/microsoft.web.webview2.$wvVer.nupkg"
    }
    $wvEx = Join-Path $DL "webview2-extract"
    Copy-Item $wvNupkg "$wvEx.zip" -Force
    Expand-Archive "$wvEx.zip" $wvEx -Force
    Copy-Item (Join-Path $wvEx "lib\net462\Microsoft.Web.WebView2.Core.dll") $APP -Force
    Copy-Item (Join-Path $wvEx "lib\net462\Microsoft.Web.WebView2.WinForms.dll") $APP -Force
    Copy-Item (Join-Path $wvEx "runtimes\win-x64\native\WebView2Loader.dll") $APP -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $APP "profiles") | Out-Null
if (-not (Test-Path (Join-Path $APP "profiles\web\package.json"))) {
    New-Item -ItemType Directory -Force -Path (Join-Path $APP "profiles\web") | Out-Null
    Set-Content -Path (Join-Path $APP "profiles\web\package.json") -Value '{"name":"dsh-profile-web","private":true,"dependencies":{},"dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app"]}}}' -Encoding utf8
}
# ---------- 4.0 版本注入：把本次构建的真实版本写进桌面壳 Launcher.cs ----------
# 壳 exe 的「关于 KK Go」「检查更新」显示的是 Launcher.cs 里编译期常量 AppVersion /
# KernelVersion。若只改 build.config.json 而不把版本号注入进 .cs 再编译，就会出现
# "内核 3.1.5、关于却显示 3.1.3" 的漂移（3.1.3 时代踩过：exe 是旧版编的、之后没重编）。
# 这里用正则把两个字面量替换为 $VERSION / $DSH_VER，保证壳显示 = 实际安装版本。
$launcherCs = Join-Path $ROOT "scripts\Launcher.cs"
$launcherText = [System.IO.File]::ReadAllText($launcherCs, [System.Text.Encoding]::UTF8)
$before = $launcherText
$launcherText = [regex]::Replace($launcherText,
    '(?<=AppVersion = ")[0-9][0-9.]*', $VERSION)
$launcherText = [regex]::Replace($launcherText,
    '(?<=KernelVersion = ")[0-9A-Za-z.\-rc]+', $DSH_VER)
[System.IO.File]::WriteAllText($launcherCs, $launcherText, (New-Object System.Text.UTF8Encoding $false))
if ($launcherText -ne $before) {
    Write-Host "    版本注入: AppVersion=$VERSION  KernelVersion=$DSH_VER (写入 Launcher.cs)" -ForegroundColor DarkGray
} else {
    Write-Host "    版本注入: Launcher.cs 已是 AppVersion=$VERSION / KernelVersion=$DSH_VER，无需改动" -ForegroundColor DarkGray
}
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $csc /nologo /target:winexe /optimize+ /platform:x64 /codepage:65001 `
    "/win32manifest:$ROOT\scripts\app.manifest" `
    "/win32icon:$ICON\whale.ico" "/out:$APP\KK Go.exe" `
    /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll `
    "/r:$APP\Microsoft.Web.WebView2.Core.dll" "/r:$APP\Microsoft.Web.WebView2.WinForms.dll" `
    (Join-Path $ROOT "scripts\Launcher.cs") (Join-Path $ROOT "scripts\DshClient.cs") (Join-Path $ROOT "scripts\NativeLauncher.cs")
if ($LASTEXITCODE -ne 0) { throw "Launcher compile failed" }

# ---------- 4.1 Manifest + 真实启动闸门（防止 SxS 致命错误混进安装包） ----------
# 背景：曾因 app.manifest 被写成 base64 文本，csc 把垃圾原样嵌成 manifest 资源，
# Windows SxS 解析器读到非法 XML → 拒绝激活进程 → 用户看到"并行配置不正确"。
# 仅靠"文件存在"这类校验完全测不出来，必须校验 exe 内嵌 manifest 并真实启动一次。
Step "6.5/8 Verify embedded manifest and real process launch"

$launcherExe = Join-Path $APP "KK Go.exe"
$launcherBytes = [System.IO.File]::ReadAllBytes($launcherExe)
$launcherText = [System.Text.Encoding]::UTF8.GetString($launcherBytes)
$xmlStart = $launcherText.IndexOf('<?xml')
$xmlEnd = $launcherText.IndexOf('</assembly>')
if ($xmlStart -lt 0 -or $xmlEnd -le $xmlStart) {
    throw "Embedded manifest is not valid XML (start=$xmlStart end=$xmlEnd). The manifest file must be raw UTF-8 XML, NOT base64."
}
$manifestXml = $launcherText.Substring($xmlStart, $xmlEnd - $xmlStart + 11)
try {
    $parsed = [xml]$manifestXml
    $identity = $parsed.assembly.assemblyIdentity
    Write-Host "    Embedded manifest OK: name=$($identity.name) version=$($identity.version) arch=$($identity.processorArchitecture)"
    if ($identity.processorArchitecture -ne "amd64") {
        throw "Embedded manifest processorArchitecture must be amd64 (matches /platform:x64), got '$($identity.processorArchitecture)'"
    }
} catch {
    throw "Embedded manifest failed to parse as XML: $($_.Exception.Message)"
}

# 真实启动：用独立端口 + 静默模式跑一次，确认进程能起来且 dsh 服务真的 listen。
# 判定依据是 dsh 打印出带 token 的访问地址（dsh web: http://127.0.0.1:<port>/?token=...），
# 该行只有在 web server 完成 listen 后才会输出。
$smokePort = 18987
$smokeExe = Join-Path $APP "KK Go.exe"
$smokeLog = Join-Path $APP "service.log"
if (Test-Path $smokeLog) { Remove-Item $smokeLog -Force }
$env:DSH_NO_OPEN = "1"
$env:DSH_PORT = "$smokePort"
$smokeProc = $null
try {
    $smokeProc = Start-Process -FilePath $smokeExe -ArgumentList "--startup" -PassThru -ErrorAction Stop
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        if ($smokeProc.HasExited) {
            throw "Smoke launch failed: process exited with code $($smokeProc.ExitCode). Check Application event log for SideBySide errors."
        }
        if (Test-Path $smokeLog) {
            # 必须用 FileShare.ReadWrite：dsh 服务进程会长期持有 service.log 的写句柄，
            # 用 ReadAllText（默认 FileShare.Read）会抛 IOException 共享冲突。
            $content = Read-SharedText $smokeLog
            if ($content -match 'dsh web:\s*http://127\.0\.0\.1:\d+/\?token=') { $ready = $true; break }
        }
    }
    if (-not $ready) {
        $diag = ""
        # 日志/PID 已挪到安装目录 .kkgo（不再固定 %USERPROFILE%\.dsh）
        $desktopLog = Join-Path $APP ".kkgo\desktop.log"
        if (Test-Path $desktopLog) {
            $diag = "`n--- desktop.log (tail) ---`n" + ((Get-Content $desktopLog -Tail 25) -join "`n")
        }
        $svc = ""
        if (Test-Path $smokeLog) {
            $svc = "`n--- service.log (tail) ---`n" + ((Read-SharedText $smokeLog) -split "`r?`n" | Select-Object -Last 25) -join "`n"
        }
        throw "Smoke launch failed: dsh service did not report a listening URL within 60s. See $smokeLog$diag$svc"
    }
    Write-Host "    Smoke launch OK: PID=$($smokeProc.Id), dsh service listening"
} finally {
    if ($smokeProc -and -not $smokeProc.HasExited) {
        try { & $smokeExe stop 2>&1 | Out-Null } catch { }
        try { Stop-Process -Id $smokeProc.Id -Force -ErrorAction SilentlyContinue } catch { }
    }
    Remove-Item Env:\DSH_NO_OPEN -ErrorAction SilentlyContinue
    Remove-Item Env:\DSH_PORT -ErrorAction SilentlyContinue
    # service.log 里含明文会话 token，绝不能留在 app 目录里被打包
    Start-Sleep -Milliseconds 500
    Remove-Item $smokeLog -Force -ErrorAction SilentlyContinue
}

# ---------- 5. Inno Setup Compiler ----------
# 5.1 先签 app\KK Go.exe，让 Inno 打包进安装包里的是「已签名」的启动器
# （外层安装包 exe 在 Inno 出包后再签，见 8.5 步）。
# 签名失败不阻断出包；自签证书在本机可验证通过，跨机彻底消除 SmartScreen 需商业 OV/EV。
# 注意：powershell -File 模式下不能用 -CertFile 等命名参数（会被当位置参数），
# 直接调默认自签流程即可（sign.ps1 默认自动发现 app\KK Go.exe + dist\*.exe）。
$signScript = Join-Path $ROOT "sign.ps1"
$preSignExe = Join-Path $APP "KK Go.exe"
if ((Test-Path $preSignExe) -and (Test-Path $signScript)) {
    try {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $signScript 2>&1 | Out-Null
        Write-Host "    app\KK Go.exe signed before packaging" -ForegroundColor DarkGray
    } catch {
        Write-Host "    WARN: app exe 签名失败（非致命）: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Step "7/8 Prepare Inno Setup compiler"
$innoDir = Join-Path $DL "inno"
if (-not (Test-Path (Join-Path $innoDir "ISCC.exe"))) {
    $innoExe = Join-Path $DL "innosetup-6.7.3.exe"
    if (-not (Test-Path $innoExe)) {
        curl.exe -L -o $innoExe "https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-6.7.3.exe"
    }
    New-Item -ItemType Directory -Force -Path $innoDir | Out-Null
    # /CURRENTUSER: 规避系统 Temp 为 NTFS 重解析点时 Inno 的 Error 448（无法遍历不受信任装入点）
    Start-Process -FilePath $innoExe -ArgumentList "/VERYSILENT","/SUPPRESSMSGBOXES","/CURRENTUSER","/PORTABLE=1","/DIR=`"$innoDir`"","/NORESTART" -Wait
    # 中文语言包：raw.githubusercontent.com 国内不可达，改用 GitHub Contents API（可达）。
    New-Item -ItemType Directory -Force -Path (Join-Path $innoDir "Languages") | Out-Null
    foreach ($f in @("ChineseSimplified.isl","ChineseTraditional.isl")) {
        $langPath = Join-Path $innoDir "Languages\$f"
        if (-not (Test-Path $langPath)) {
            try {
                $langApi = "https://api.github.com/repos/jrsoftware/issrc/contents/Files/Languages/$f"
                $langMeta = Invoke-RestMethod -Uri $langApi -Headers @{"User-Agent"="dsh-go-build"}
                [System.IO.File]::WriteAllBytes($langPath, [System.Convert]::FromBase64String($langMeta.content))
                Write-Host "    OK: fetched $f"
            } catch {
                Write-Host "    WARN: cannot fetch $f - $($_.Exception.Message)"
            }
        }
    }
}

# ---------- 5.5 KK Go 品牌层 ----------
# 目的：把 web 界面侧边栏的上游 "deepseek HARNESS" 品牌换成 KK Go 自有标识。
# 机制：dsh 的 client-ui 插件通过 package.json 的 exports["./client"] 下发到前端，
# 再用 profile 的 --patch 覆盖层接管 sidebar.brand.mark / sidebar.brand.name 两个插槽，
# 同时禁用上游的 ui-brand-official，避免两套字样并存。
Step "5.5/8 Install KK Go brand layer (plugin + profile overlay)"

$brandSrc = Join-Path $ROOT "runtime\kkgo-brand"
$brandDst = Join-Path $APP "dsh\node_modules\@deepseek-ai\dsh-client-ui-brand-kkgo"
if (-not (Test-Path (Join-Path $brandSrc "package.json"))) { throw "Missing KK Go brand plugin source: $brandSrc" }
if (Test-Path $brandDst) { Remove-Item $brandDst -Recurse -Force }
Copy-Item $brandSrc $brandDst -Recurse -Force
New-Item -ItemType Directory -Force -Path (Join-Path $APP "profiles") | Out-Null
Copy-Item (Join-Path $ROOT "runtime\profiles\kkgo.patch.yml") (Join-Path $APP "profiles\kkgo.patch.yml") -Force
Write-Host "    Brand plugin installed: $brandDst"

# 页面标题：上游 index.html 里写死 <title>DeepSeek Harness</title>，
# 这是浏览器标签页 / 任务栏 / 窗口标题里用户唯一能看到的一行字，必须一起换掉。
$indexHtml = Join-Path $APP "dsh\node_modules\@deepseek-ai\dsh-web-frontend\dist\index.html"
if (Test-Path $indexHtml) {
    $htmlText = [System.IO.File]::ReadAllText($indexHtml)
    $newHtml = $htmlText -replace '<title>DeepSeek Harness</title>', '<title>KK Go</title>'
    $newHtml = $newHtml -replace '(<meta name="apple-mobile-web-app-title" content=")[^"]*(")', '${1}KK Go${2}'
    if ($newHtml -ne $htmlText) {
        $utf8NoBom2 = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($indexHtml, $newHtml, $utf8NoBom2)
        Write-Host "    Rebranded frontend title -> KK Go"
    } else {
        Write-Host "    Frontend title already branded"
    }
} else {
    throw "Frontend entry HTML not found: $indexHtml"
}

# 闸门 A（配置层）：用 dsh 自己的 --dump-config 验证覆盖层真的生效。
# 覆盖层一旦失效（例如 --patch 参数顺序写错、或插件没被正确铺开），
# 界面就会退回上游品牌字样 —— 这类问题在安装后极难发现，必须在构建期拦下。
$env:NODE_PATH = Join-Path $APP "dsh\node_modules"
$brandDump = & (Join-Path $APP "runtime\node.exe") (Join-Path $APP "dsh\lib\bin.js") --profile web `
    --patch (Join-Path $APP "profiles\kkgo.patch.yml") --dump-config 2>&1
if ($LASTEXITCODE -ne 0) { throw "Brand overlay dump-config failed: $brandDump" }
$brandDumpText = ($brandDump | Out-String)
if ($brandDumpText -notmatch "ui-brand-kkgo") {
    throw "Brand overlay did not take effect: 'ui-brand-kkgo' not found in the composed profile tree."
}
if ($brandDumpText -notmatch "(?s)ui-brand-official.{0,200}?disabled:\s*true") {
    throw "Brand overlay did not disable 'ui-brand-official': both brands would be rendered."
}
Write-Host "    Brand overlay OK: ui-brand-kkgo active, ui-brand-official disabled"

# 闸门 B（运行时层）：--dump-config 只看配置树、根本不 import 插件，
# 所以它挡不住「包解析不到」和「浏览器半边 exports 未定义」这两类真故障。
# 这一闸门真起服务、盯 activation 失败、再抓真正下发给前端的 HTML 来断言。
$pythonExe = $null
foreach ($cand in @("python", "python3", "py")) {
    $found = Get-Command $cand -ErrorAction SilentlyContinue
    if ($found) { $pythonExe = $found.Source; break }
}
if (-not $pythonExe) { throw "python not found; the KK Go brand runtime gate cannot run." }
$brandGatePort = 19851
& $pythonExe (Join-Path $ROOT "scripts\verify_brand.py") $APP $brandGatePort
if ($LASTEXITCODE -ne 0) {
    throw "KK Go brand runtime gate failed — refusing to ship a build whose brand never reaches the UI."
}


# ---------- 6. Compile Installer ----------
Step "8/8 Compile installer (may take a few minutes)"
# 打包前清掉构建期产生的诊断文件：
# service.log / desktop.log 含明文会话 token，dump-*.yml 是排查用的配置快照，
# 两者都不该出现在用户机器上。
foreach ($junk in @("service.log", "desktop.log", "desktop.log.1", "dsh_test_launch.log",
                    "dump-config-web.yml", "dump-kkgo.yml")) {
    $jp = Join-Path $APP $junk
    if (Test-Path $jp) { Remove-Item $jp -Force -ErrorAction SilentlyContinue }
}
# "KK Go Data" 是**运行时**生成的用户数据（.credentials.yaml 里的 secret、
# .anonymous-user-id、profiles/storages 会话状态）。它绝不能随安装包分发给
# 别的用户 —— 否则别人装完就继承构建机上的凭证/身份。构建期一律清掉。
$runtimeData = Join-Path $APP "KK Go Data"
if (Test-Path $runtimeData) { Remove-Item $runtimeData -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path $DIST | Out-Null
Push-Location (Join-Path $ROOT "installer")
try {
    # Inno Setup 6 只在文件带 UTF-8 BOM 时才按 UTF-8 解析；无 BOM 会退回 ANSI(GBK)，
    # 于是 installer.iss 里的中文会把引号/参数解析冲掉，报 "Error on line 58" 这类
    # 语义完全对不上号的语法错误。编辑器重写文件时很容易悄悄丢掉 BOM，
    # 所以这里每次编译前都强制归一化为 UTF-8 BOM + CRLF。
    $issPath = Join-Path $ROOT "installer\installer.iss"
    $issBytes = [System.IO.File]::ReadAllBytes($issPath)
    $hasBom = ($issBytes.Length -ge 3 -and $issBytes[0] -eq 0xEF -and $issBytes[1] -eq 0xBB -and $issBytes[2] -eq 0xBF)
    if (-not $hasBom) {
        $issText = [System.Text.Encoding]::UTF8.GetString($issBytes)
        $issText = $issText -replace "`r`n", "`n"
        $issText = $issText -replace "`n", "`r`n"
        $enc = New-Object System.Text.UTF8Encoding($true)
        [System.IO.File]::WriteAllText($issPath, $issText, $enc)
        Write-Host "    installer.iss: re-encoded to UTF-8 BOM + CRLF (BOM was missing)"
    }
    & (Join-Path $innoDir "ISCC.exe") "installer.iss" 2>&1 | Tee-Object -FilePath ".\build_run_inno.log"
    $innoExit = $LASTEXITCODE
    if ($innoExit -ne 0) {
        # ISCC 的真实错误信息在输出流里，直接把关键行打出来，否则只会看到
        # "Installer compile failed" 这种没有信息量的外层异常。
        Write-Host "    --- ISCC diagnostics ---" -ForegroundColor Red
        Get-Content ".\build_run_inno.log" -ErrorAction SilentlyContinue |
            Where-Object { $_ -match "Error on line|Compiler error|Expected|Parameter .* can only" } |
            Select-Object -First 10 | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
        throw "Installer compile failed (see build_run_inno.log for details)"
    }
} finally { Pop-Location }
Get-ChildItem $DIST | Select-Object Name, @{n="SizeMB";e={[math]::Round($_.Length/1MB,1)}}

# ---------- 8.5 代码签名（非致命） ----------
# 给 app\KK Go.exe 与 dist 安装包签名，降低 SmartScreen 拦截。
# 证书准备/签名失败不阻断出包：未签名包仍可正常安装，只是首次安装可能被提示"未知发布者"。
# ⚠ 用默认目标发现（sign.ps1 自己扫 app\KK Go.exe + dist\*.exe）。
# 不要在这里传 -Targets：`powershell -File` 下数组参数按位置绑定，会被误塞进
# sign.ps1 的第一个参数 $CertFile，触发"商业 PFX"分支报"不是有效的 PFX"。
Step "8.5/8 Sign installer (non-fatal; self-signed by default)"
if (Test-Path $signScript) {
    try {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $signScript
    } catch {
        Write-Host "    WARN: 签名步骤失败，出包不阻断（安装包未签名仍可安装）: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host "`nDone! KK Go installer located at: $DIST" -ForegroundColor Green
