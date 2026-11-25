param([Parameter(Mandatory=$true)][string]$InstallDir)

# Stop KK Go processes before in-place upgrade.
# ASCII-only comments: Windows PowerShell 5.1 reads script files as ANSI (GBK on
# this machine), so non-ASCII comments can break parsing on some systems.

$ErrorActionPreference = "SilentlyContinue"

# 1) All KK Go desktop processes belong to this product. Kill them all.
$kk = Get-Process -Name "KK Go" -ErrorAction SilentlyContinue
if ($kk) {
    foreach ($p in $kk) {
        try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch { }
    }
}

# 2) Node processes: only kill the ones whose command line references THIS install dir.
#    The user may have unrelated Node projects running; never touch those.
$needle = $InstallDir.TrimEnd('\')
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'"
foreach ($p in $procs) {
    $cl = $p.CommandLine
    if ($cl -and $cl.IndexOf($needle, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch { }
    }
}

exit 0
