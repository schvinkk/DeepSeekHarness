# KK Go — 为内置 Node 运行时添加本机防火墙放行规则
#
# 背景（已用对照实验证实）：
#   内置 runtime\node.exe 监听的 127.0.0.1 端口在部分机器上会被本机防火墙/安全软件
#   静默丢包 —— 服务端已经在跑并打印了带 token 的访问地址，但界面永远加载不出来，
#   用户看到的现象是"装上了却打不开"。
#   拦截是按【程序路径】生效的：给同一个 exe 路径加一条 Inbound-Allow 规则后，
#   连接立刻恢复（0.01s）；而把它改名成别的文件名照样被拦。
#
# 本脚本由安装器在安装末尾调用（一次 UAC），也可由用户手动运行。
# 已经存在同路径的放行规则时直接退出，不会重复提权。
#
# 退出码：0 成功 / 2 找不到 node.exe / 3 用户取消 UAC 或提权失败

$ErrorActionPreference = 'Stop'

$displayName = 'KK Go 内置运行时'
$appRoot = Split-Path -Parent $PSScriptRoot
$nodeExe = Join-Path $appRoot 'runtime\node.exe'

if (-not (Test-Path -LiteralPath $nodeExe)) {
    Write-Host "kkgo: 内置 node.exe 不存在: $nodeExe"
    exit 2
}

function Test-RuleExists {
    param([string]$Program, [string]$Name)
    # 规则里存的是绝对路径，比较前先归一化（大小写不敏感、去掉结尾分隔符），
    # 否则同一个文件写成不同形式的路径就会漏判，导致每次运行都重复提权。
    $want = $Program.TrimEnd('\')
    try {
        foreach ($r in Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue) {
            if ($r.Enabled -ne 'True' -or $r.Action -ne 'Allow') { continue }
            $app = $r | Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue
            if ($app -and $app.Program -and
                $app.Program.TrimEnd('\').Equals($want, [System.StringComparison]::OrdinalIgnoreCase)) {
                return $true
            }
        }
    } catch { }
    return $false
}

if (Test-RuleExists -Program $nodeExe -Name $displayName) {
    Write-Host "kkgo: 放行规则已存在，跳过"
    exit 0
}

$inner = @"
`$ErrorActionPreference = 'Stop'
New-NetFirewallRule -DisplayName '$displayName' -Direction Inbound -Program '$nodeExe' -Action Allow -Profile Any | Out-Null
"@

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)

if ($isAdmin) {
    Invoke-Expression $inner
    Write-Host "kkgo: 放行规则已添加"
    exit 0
}

# 需要提权：把真正的加规则动作写进临时脚本，再用 runas 动词拉起，
# 避免 Start-Process -Command 的多层引号在带空格的路径上被解析坏。
$tmp = Join-Path $env:TEMP ('kkgo-fw-' + [guid]::NewGuid().ToString('N') + '.ps1')
try {
    Set-Content -LiteralPath $tmp -Value $inner -Encoding UTF8
    $proc = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -PassThru `
        -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', $tmp)
    # 必须给提权一个上限：UAC 弹窗没人点时，Start-Process -Wait 会一直挂着，
    # 而安装器那边的 [Run] 是 waituntilterminated —— 会把整个安装流程无限期卡住。
    Wait-Process -Id $proc.Id -Timeout 180 -ErrorAction Stop
} catch {
    Write-Host "kkgo: 提权失败、用户取消或等待 UAC 超时: $($_.Exception.Message)"
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    exit 3
}
Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue

if (Test-RuleExists -Program $nodeExe -Name $displayName) {
    Write-Host "kkgo: 放行规则已添加"
    exit 0
}
Write-Host "kkgo: 提权后仍未检测到规则"
exit 3
