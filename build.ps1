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

# ---------- 1. 图标 ----------
Step "1/6 生成鲸鱼图标 (需要本机 node + sharp)"
$env:NODE_PATH = Join-Path $DSH_SRC "node_modules"
& node (Join-Path $ROOT "scripts\make-icon.cjs")
if ($LASTEXITCODE -ne 0) { throw "图标生成失败" }

# ---------- 2. 便携 Node 运行时 ----------
Step "2/6 准备 Node 运行时 $NODE_VER"
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

# ---------- 3. dsh 完整包 ----------
Step "3/6 复制 dsh 包 (含全部依赖)"
robocopy $DSH_SRC (Join-Path $APP "dsh") /E /R:1 /W:1 /NFL /NDL /NP /XF *.map /XD darwin-arm64 darwin-x64 win32-arm64 linux-x64 linux-arm64 .cache .git | Out-Null

# ---------- 4. 桌面启动器 + 原生客户端窗口 ----------
Step "4/7 准备 WebView2 SDK 并编译启动器"
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
    "# dsh web profile template — 首次启动由 dsh 自动初始化/或由启动器复制" | Out-File (Join-Path $APP "profiles\web\package.json") -Encoding utf8
}
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $csc /nologo /target:winexe /optimize+ /platform:x64 /codepage:65001 `
    "/win32manifest:$ROOT\scripts\app.manifest" `
    "/win32icon:$ICON\whale.ico" "/out:$APP\DeepSeek Harness.exe" `
    /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll `
    "/r:$APP\Microsoft.Web.WebView2.Core.dll" "/r:$APP\Microsoft.Web.WebView2.WinForms.dll" `
    (Join-Path $ROOT "scripts\Launcher.cs") (Join-Path $ROOT "scripts\DshClient.cs")
if ($LASTEXITCODE -ne 0) { throw "启动器编译失败" }

# ---------- 5. Inno Setup 编译器 ----------
Step "5/7 准备 Inno Setup 编译器"
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

# ---------- 6. 编译安装包 ----------
Step "6/7 编译安装包 (压缩约需几分钟)"
New-Item -ItemType Directory -Force -Path $DIST | Out-Null
Push-Location (Join-Path $ROOT "installer")
try {
    & (Join-Path $innoDir "ISCC.exe") "installer.iss"
    if ($LASTEXITCODE -ne 0) { throw "安装包编译失败" }
} finally { Pop-Location }
Get-ChildItem $DIST | Select-Object Name, @{n="SizeMB";e={[math]::Round($_.Length/1MB,1)}}
Write-Host "`n完成! 安装包位于: $DIST" -ForegroundColor Green
