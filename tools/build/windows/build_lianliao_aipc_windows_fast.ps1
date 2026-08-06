[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string] $CorePath,
    [string] $Proxy = "http://127.0.0.1:7897",
    [switch] $NoProxy
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$mainScript = Join-Path $PSScriptRoot "build_lianliao_aipc_windows.ps1"
$parameters = @{
    Fast = $true
    Proxy = $Proxy
}
if (-not [string]::IsNullOrWhiteSpace($CorePath)) {
    $parameters["CorePath"] = $CorePath
}
if ($NoProxy) {
    $parameters["NoProxy"] = $true
}
if ($WhatIfPreference) {
    $parameters["WhatIf"] = $true
}

$startedAt = Get-Date
Write-Host "快速构建开始：$($startedAt.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor DarkGray

try {
    & $mainScript @parameters
} finally {
    # 计时放在 finally 中，确保 Core 校验、磁盘预检或实际打包失败时仍能
    # 得到诊断耗时；这里不捕获异常，原始失败状态会继续返回给调用者。
    $finishedAt = Get-Date
    $elapsed = $finishedAt - $startedAt
    $parts = @()
    $totalHours = [math]::Floor($elapsed.TotalHours)
    if ($totalHours -gt 0) {
        $parts += "$totalHours 小时"
    }
    if ($elapsed.Minutes -gt 0) {
        $parts += "$($elapsed.Minutes) 分"
    }
    $parts += "$($elapsed.Seconds) 秒"

    Write-Host "快速构建结束：$($finishedAt.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor DarkGray
    Write-Host "总耗时：$($parts -join ' ')" -ForegroundColor Cyan
}
