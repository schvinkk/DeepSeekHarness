# DeepSeek Harness 桌面版 — 一键打包脚本 (PowerShell) v2.95.27
# 用法:  powershell -ExecutionPolicy Bypass -File .\build.ps1
# 依赖:  本机可访问网络; 已安装 Node.js(用于图标生成); 首次运行会自动下载
#        便携 Node 运行时与 Inno Setup 编译器(下载到 .\downloads\)
# 版本:  2.95.27 - Enhanced with 15 plugins
$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$APP  = Join-Path $ROOT "app"
$ICON = Join-Path $ROOT "icon"
$DIST = Join-Path $ROOT "dist"
$DL   = Join-Path $ROOT "downloads"
$VERSION = "2.95.27"

# 源 dsh 安装目录(全局 npm 安装位置, 按需修改)
$DSH_SRC = "C:\Users\skevin\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh"
# Node 运行时版本(与 dsh 原生模块编译所用的 ABI 一致)
$NODE_VER = "v26.7.0"

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

# ---------- 1. Icon ----------
Step "1/6 Generate whale icon (requires node + sharp)"
$env:NODE_PATH = Join-Path $DSH_SRC "node_modules"
& node (Join-Path $ROOT "scripts\make-icon.cjs")
if ($LASTEXITCODE -ne 0) { throw "Icon generation failed" }

# ---------- 2. Portable Node Runtime ----------
Step "2/6 Prepare Node runtime $NODE_VER"
New-Item -ItemType Directory -Force -Path $DL | Out-Null
$nodeZip = Join-Path $DL "node-$NODE_VER-win-x64.zip"
if (-not (Test-Path $nodeZip)) {
    curl.exe -L -o $nodeZip "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-win-x64.zip"
}
$nodeDir = Join-Path $DL "node-extract\node-$NODE_VER-win-x64"
if (-not (Test-Path (Join-Path $nodeDir "node.exe"))) {
    Expand-Archive -Path $nodeZip -DestinationPath (Join-Path $DL "node-extract") -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $APP "runtime") | Out-Null
Copy-Item (Join-Path $nodeDir "node.exe") (Join-Path $APP "runtime\node.exe") -Force
Copy-Item (Join-Path $nodeDir "LICENSE") (Join-Path $APP "runtime\LICENSE") -Force

# ---------- 3. Full dsh package ----------
Step "3/6 Copy dsh package (with all dependencies)"
robocopy $DSH_SRC (Join-Path $APP "dsh") /E /R:1 /W:1 /NFL /NDL /NP /XF *.map /XD darwin-arm64 darwin-x64 win32-arm64 linux-x64 linux-arm64 .cache .git | Out-Null

# ---------- 3.5 Plugin Suite ----------
Step "3.5/6 Install Plugin Suite (15 plugins) into dsh node_modules"
$pluginSuite = Join-Path $ROOT "plugins\dsh-plugin-suite"
$pluginDest = Join-Path $APP "dsh\node_modules\@deepseek-ai\dsh-plugin-suite"
New-Item -ItemType Directory -Force -Path (Split-Path $pluginDest -Parent) | Out-Null
if (Test-Path $pluginDest) { Remove-Item $pluginDest -Recurse -Force }
Copy-Item $pluginSuite $pluginDest -Recurse -Force
Write-Host "    Plugin suite copied to: $pluginDest"

# Declare the plugin in the app manifest so the module fallback links it too,
# and stamp the desktop version so every shipped manifest reads 2.95.27.
$appPkg = Join-Path $APP "dsh\package.json"
$appManifest = Get-Content $appPkg -Raw | ConvertFrom-Json
$manifestChanged = $false
if (-not $appManifest.dependencies."@deepseek-ai/dsh-plugin-suite") {
    $appManifest.dependencies | Add-Member -NotePropertyName "@deepseek-ai/dsh-plugin-suite" -NotePropertyValue "^2.95.27" -Force
    $manifestChanged = $true
    Write-Host "    Added @deepseek-ai/dsh-plugin-suite to app dependencies"
}
if ($appManifest.version -ne $VERSION) {
    $appManifest.version = $VERSION
    $manifestChanged = $true
    Write-Host "    Stamped app version to $VERSION"
}
if ($manifestChanged) {
    $json = $appManifest | ConvertTo-Json -Depth 20
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($appPkg, $json, $utf8NoBom)
}

# ---------- 3.6 Runtime patch (fix content.some crash) ----------
Step "3.6/7 Patch dsh-client-runtime (content.some crash fix)"
$clientJs = Join-Path $APP "dsh\node_modules\@deepseek-ai\dsh-client-runtime\lib\client.js"
if (Test-Path $clientJs) {
    & node (Join-Path $ROOT "patch-runtime.js")
}

# ---------- 4. Desktop Launcher + Native Client Window ----------
Step "4/7 Prepare WebView2 SDK and compile launcher"
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
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $csc /nologo /target:winexe /optimize+ /platform:x64 /codepage:65001 `
    "/win32manifest:$ROOT\scripts\app.manifest" `
    "/win32icon:$ICON\whale.ico" "/out:$APP\DeepSeek Harness.exe" `
    /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll `
    "/r:$APP\Microsoft.Web.WebView2.Core.dll" "/r:$APP\Microsoft.Web.WebView2.WinForms.dll" `
    (Join-Path $ROOT "scripts\Launcher.cs") (Join-Path $ROOT "scripts\DshClient.cs")
if ($LASTEXITCODE -ne 0) { throw "Launcher compile failed" }

# ---------- 5. Inno Setup Compiler ----------
Step "5/7 Prepare Inno Setup compiler"
$innoDir = Join-Path $DL "inno"
if (-not (Test-Path (Join-Path $innoDir "ISCC.exe"))) {
    $innoExe = Join-Path $DL "innosetup-6.7.3.exe"
    if (-not (Test-Path $innoExe)) {
        curl.exe -L -o $innoExe "https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-6.7.3.exe"
    }
    New-Item -ItemType Directory -Force -Path $innoDir | Out-Null
    Start-Process -FilePath $innoExe -ArgumentList "/VERYSILENT","/SUPPRESSMSGBOXES","/PORTABLE=1","/DIR=`"$innoDir`"","/NORESTART" -Wait
    foreach ($f in @("ChineseSimplified.isl","ChineseTraditional.isl")) {
        if (-not (Test-Path (Join-Path $innoDir "Languages\$f"))) {
            curl.exe -sL -o (Join-Path $innoDir "Languages\$f") "https://raw.githubusercontent.com/jrsoftware/issrc/refs/heads/main/Files/Languages/$f"
        }
    }
}

# ---------- 6. Compile Installer ----------
Step "6/7 Compile installer (may take a few minutes)"
New-Item -ItemType Directory -Force -Path $DIST | Out-Null
Push-Location (Join-Path $ROOT "installer")
try {
    & (Join-Path $innoDir "ISCC.exe") "installer.iss"
    if ($LASTEXITCODE -ne 0) { throw "Installer compile failed" }
} finally { Pop-Location }
Get-ChildItem $DIST | Select-Object Name, @{n="SizeMB";e={[math]::Round($_.Length/1MB,1)}}
Write-Host "`nDone! Installer located at: $DIST" -ForegroundColor Green
