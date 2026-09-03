[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string] $CorePath,
    [string] $Proxy = "http://127.0.0.1:7897",
    [switch] $NoProxy,
    [switch] $Fast,
    [switch] $ReleaseBuild,
    [ValidateRange(1, 1024)]
    [double] $MinimumFreeSpaceGB = 8
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Set-ProcessEnvironment {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,
        [AllowNull()]
        [string] $Value
    )

    [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
}

function Get-FileSha256 {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    # Use .NET directly so read-only hashing still runs during -WhatIf. This
    # lets fast mode reject a stale Core before any packaging action starts.
    $stream = [IO.File]::OpenRead($Path)
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $hashBytes = $sha256.ComputeHash($stream)
        return ($hashBytes | ForEach-Object { $_.ToString("x2") }) -join ""
    } finally {
        $sha256.Dispose()
        $stream.Dispose()
    }
}

function Get-NewestCoreBuildInput {
    param(
        [Parameter(Mandatory = $true)]
        [string] $CoreRoot
    )

    $rootInputs = @(
        "Cargo.toml",
        "Cargo.lock",
        "rust-toolchain.toml",
        "rustfmt.toml"
    ) | ForEach-Object { Join-Path $CoreRoot $_ } | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }

    $crateInputs = Get-ChildItem -LiteralPath (Join-Path $CoreRoot "crates") -Recurse -File |
        Where-Object {
            $_.Extension -in @(".rs", ".toml", ".sql", ".svg", ".png", ".jpg", ".jpeg", ".webp") -or
            $_.Name -eq "build.rs"
        }

    @($rootInputs | ForEach-Object { Get-Item -LiteralPath $_ }) + @($crateInputs) |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
}

function Test-ProxyEndpoint {
    param(
        [Parameter(Mandatory = $true)]
        [Uri] $Uri
    )

    $port = if ($Uri.IsDefaultPort) {
        if ($Uri.Scheme -eq "https") { 443 } else { 80 }
    } else {
        $Uri.Port
    }

    $client = [Net.Sockets.TcpClient]::new()
    try {
        $connectTask = $client.ConnectAsync($Uri.DnsSafeHost, $port)
        return $connectTask.Wait(800) -and $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string] $FilePath,
        [Parameter(Mandatory = $true)]
        [string[]] $ArgumentList
    )

    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "命令执行失败（退出代码 $LASTEXITCODE）：$FilePath $($ArgumentList -join ' ')"
    }
}

function Assert-BuildDriveFreeSpace {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path,
        [Parameter(Mandatory = $true)]
        [double] $MinimumGB
    )

    # Electron 的 renderer、win-unpacked 和 NSIS 安装包会在构建期间同时占用空间。
    # 在执行 Vite 前失败可以避免长时间编译后才收到不直观的 ENOSPC 错误。
    $driveRoot = [IO.Path]::GetPathRoot((Resolve-Path -LiteralPath $Path).Path)
    $drive = [IO.DriveInfo]::new($driveRoot)
    $freeGB = $drive.AvailableFreeSpace / 1GB
    if ($freeGB -lt $MinimumGB) {
        throw "构建盘 $driveRoot 可用空间不足：当前 $([math]::Round($freeGB, 2)) GB，至少需要 $MinimumGB GB。请释放空间后重试。"
    }

    Write-Host "构建盘可用空间：$([math]::Round($freeGB, 2)) GB（最低要求 $MinimumGB GB）" -ForegroundColor DarkGray
}

function Find-RepositoryRoot {
    # 构建脚本按用途归档后目录层级可能继续变化，因此从脚本位置向上识别
    # 同时包含 PC 与 Core 源码的仓库根目录，不依赖调用者当前工作目录。
    $candidate = Get-Item -LiteralPath $PSScriptRoot
    while ($null -ne $candidate) {
        $aipc = Join-Path $candidate.FullName "LianLiaoAIPC"
        $core = Join-Path $candidate.FullName "LianLiaoAICore"
        if ((Test-Path -LiteralPath $aipc -PathType Container) -and
            (Test-Path -LiteralPath $core -PathType Container)) {
            return $candidate.FullName
        }
        $candidate = $candidate.Parent
    }

    throw "无法从脚本目录定位 AI_lianliao 仓库根目录：$PSScriptRoot"
}

$repoRoot = Find-RepositoryRoot
$aipcRoot = Join-Path $repoRoot "LianLiaoAIPC"
$coreRoot = Join-Path $repoRoot "LianLiaoAICore"
$corePathWasProvided = -not [string]::IsNullOrWhiteSpace($CorePath)
if ($ReleaseBuild -and $Fast) {
    throw "正式发布模式不能使用 -Fast。"
}
if ($ReleaseBuild -and $corePathWasProvided) {
    throw "正式发布模式不能使用 -CorePath；Core 必须来自 aioncore-release-lock.json 锁定的 GitHub Release。"
}
if (-not $ReleaseBuild -and [string]::IsNullOrWhiteSpace($CorePath)) {
    $CorePath = Join-Path $coreRoot "target\x86_64-pc-windows-msvc\release\aioncore.exe"
}

if (-not (Test-Path -LiteralPath $aipcRoot -PathType Container)) {
    throw "未找到 LianLiaoAIPC 目录：$aipcRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $aipcRoot "package.json") -PathType Leaf)) {
    throw "LianLiaoAIPC 缺少 package.json：$aipcRoot"
}
if (-not $ReleaseBuild -and ($Fast -or $corePathWasProvided) -and -not (Test-Path -LiteralPath $CorePath -PathType Leaf)) {
    throw "未找到本地 Core，请先构建 LianLiaoAICore：$CorePath"
}

if (-not $ReleaseBuild) {
    $CorePath = [IO.Path]::GetFullPath($CorePath)
}
$bunCommand = Get-Command bun -CommandType Application -ErrorAction SilentlyContinue
if (-not $bunCommand) {
    throw "未找到 bun。请先安装 Bun，并重新打开 PowerShell。"
}
$cargoExecutable = $null
if (-not $ReleaseBuild -and -not $Fast -and -not $corePathWasProvided) {
    $cargoCommand = Get-Command cargo -CommandType Application -ErrorAction SilentlyContinue
    if ($cargoCommand) {
        $cargoExecutable = $cargoCommand.Source
    } else {
        $userCargo = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".cargo\bin\cargo.exe"
        if (Test-Path -LiteralPath $userCargo -PathType Leaf) {
            $cargoExecutable = $userCargo
        }
    }
    if (-not $cargoExecutable) {
        throw "未找到 cargo。完整构建需要先增量编译 LianLiaoAICore，请安装 Rust 工具链并重新打开 PowerShell。"
    }
}
if (-not (Test-Path -LiteralPath (Join-Path $aipcRoot "node_modules") -PathType Container)) {
    throw "LianLiaoAIPC 依赖尚未安装。请先在该目录执行：bun install --frozen-lockfile"
}

Assert-BuildDriveFreeSpace -Path $aipcRoot -MinimumGB $MinimumFreeSpaceGB

$bundledRoot = Join-Path $aipcRoot "resources\bundled-aioncore\win32-x64"
$bundledCore = Join-Path $bundledRoot "aioncore.exe"
$managedResources = Join-Path $bundledRoot "managed-resources"
$managedManifest = Join-Path $managedResources "manifest.json"
$packageJson = Get-Content -LiteralPath (Join-Path $aipcRoot "package.json") -Raw | ConvertFrom-Json
$installerPath = Join-Path $aipcRoot "out\LianLiaoAIPC-$($packageJson.version)-win-x64.exe"
$unpackedCore = Join-Path $aipcRoot "out\win-unpacked\resources\bundled-aioncore\win32-x64\aioncore.exe"

$environmentNames = @(
    "LIANLIAO_AICORE_LOCAL_BINARY",
    "LIANLIAO_AICORE_VERIFY",
    "LIANLIAO_RELEASE_BUILD",
    "LIANLIAO_AICORE_TRUST_PREPARED",
    "AIONUI_BACKEND_ARCH",
    "AIONUI_BACKEND_RUN_ID",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy"
)
$originalEnvironment = @{}
foreach ($name in $environmentNames) {
    $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

try {
    if (-not $ReleaseBuild -and -not $Fast -and -not $corePathWasProvided) {
        if (-not $PSCmdlet.ShouldProcess($coreRoot, "增量编译 Windows x64 Release Core")) {
            return
        }

        Write-Host "正在增量编译本地 Core（Release / x86_64-pc-windows-msvc）..." -ForegroundColor Cyan
        Push-Location $coreRoot
        try {
            Invoke-NativeCommand $cargoExecutable @(
                "build",
                "--locked",
                "--release",
                "--target",
                "x86_64-pc-windows-msvc",
                "-p",
                "aionui-app"
            )
        } finally {
            Pop-Location
        }

        if (-not (Test-Path -LiteralPath $CorePath -PathType Leaf)) {
            throw "Core 编译完成后仍未找到输出文件：$CorePath"
        }
    }

    Set-ProcessEnvironment "AIONUI_BACKEND_ARCH" "x64"
    Set-ProcessEnvironment "AIONUI_BACKEND_RUN_ID" $null
    Set-ProcessEnvironment "LIANLIAO_RELEASE_BUILD" $null

    if ($ReleaseBuild) {
        Set-ProcessEnvironment "LIANLIAO_RELEASE_BUILD" "1"
        Set-ProcessEnvironment "LIANLIAO_AICORE_LOCAL_BINARY" $null
        Set-ProcessEnvironment "LIANLIAO_AICORE_VERIFY" "1"
        Set-ProcessEnvironment "LIANLIAO_AICORE_TRUST_PREPARED" $null
        Write-Host "正式发布构建：将下载并校验锁定 Release Core，重新准备托管资源，然后生成 Windows x64 安装包。" -ForegroundColor Cyan
    } elseif ($Fast) {
        if (-not (Test-Path -LiteralPath $bundledCore -PathType Leaf)) {
            throw "快速构建缺少已准备的 Core，请先运行完整构建脚本：$bundledCore"
        }
        if (-not (Test-Path -LiteralPath $managedManifest -PathType Leaf)) {
            throw "快速构建缺少托管资源，请先运行完整构建脚本：$managedResources"
        }

        if (-not $corePathWasProvided) {
            $newestCoreInput = Get-NewestCoreBuildInput -CoreRoot $coreRoot
            $coreBinary = Get-Item -LiteralPath $CorePath
            if ($null -ne $newestCoreInput -and $newestCoreInput.LastWriteTimeUtc -gt $coreBinary.LastWriteTimeUtc) {
                throw "Core 源码或资源晚于本地二进制（最新：$($newestCoreInput.FullName)）。请先运行 tools\build\windows\build_lianliao_aipc_windows.ps1 完整构建。"
            }
        }

        $sourceCoreSha256 = Get-FileSha256 $CorePath
        $bundledCoreSha256 = Get-FileSha256 $bundledCore
        if ($sourceCoreSha256 -ne $bundledCoreSha256) {
            throw "Core 已发生变化，不能复用旧资源。请运行 tools\build\windows\build_lianliao_aipc_windows.ps1 完整构建。"
        }

        Set-ProcessEnvironment "LIANLIAO_AICORE_LOCAL_BINARY" $null
        Set-ProcessEnvironment "LIANLIAO_AICORE_VERIFY" $null
        Set-ProcessEnvironment "LIANLIAO_AICORE_TRUST_PREPARED" "1"
        Write-Host "快速构建：Core SHA256 一致，将复用 bundled-aioncore 和增量 Vite 输出。" -ForegroundColor Cyan
        Write-Warning "快速构建使用低压缩安装包，仅用于本地开发验证，不要直接用于正式发布。"
    } else {
        Set-ProcessEnvironment "LIANLIAO_AICORE_LOCAL_BINARY" $CorePath
        Set-ProcessEnvironment "LIANLIAO_AICORE_VERIFY" "1"
        Set-ProcessEnvironment "LIANLIAO_AICORE_TRUST_PREPARED" $null
        Write-Host "完整构建：将重新注入本地 Core；已验证的托管资源会自动复用，否则重新准备，然后生成 Windows x64 安装包。" -ForegroundColor Cyan
    }

    if ($NoProxy) {
        foreach ($name in @("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy")) {
            Set-ProcessEnvironment $name $null
        }
        Write-Host "本次构建不使用 HTTP 代理。" -ForegroundColor DarkGray
    } elseif (-not [string]::IsNullOrWhiteSpace($Proxy)) {
        $proxyUri = [Uri] $Proxy
        if (Test-ProxyEndpoint $proxyUri) {
            foreach ($name in @("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy")) {
                Set-ProcessEnvironment $name $Proxy
            }
            Write-Host "本次构建使用代理：$Proxy" -ForegroundColor DarkGray
        } else {
            Write-Warning "代理 $Proxy 当前不可连接，将保留调用前的网络环境继续构建。需要强制直连时传入 -NoProxy。"
        }
    }

    $operation = if ($ReleaseBuild) {
        "使用锁定 Release Core 构建 Windows x64 正式安装包"
    } elseif ($Fast) {
        "复用现有 Core 资源快速构建 Windows x64 UI"
    } else {
        "注入本地 Core 并构建 Windows x64 UI"
    }
    if (-not $PSCmdlet.ShouldProcess($aipcRoot, $operation)) {
        return
    }

    Push-Location $aipcRoot
    try {
        Invoke-NativeCommand $bunCommand.Source @("run", "build-win:x64")
    } finally {
        Pop-Location
    }

    if (-not (Test-Path -LiteralPath $bundledCore -PathType Leaf)) {
        throw "构建后缺少 bundled Core：$bundledCore"
    }
    if (-not (Test-Path -LiteralPath $unpackedCore -PathType Leaf)) {
        throw "构建后缺少解包目录中的 Core：$unpackedCore"
    }
    if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
        throw "构建后缺少 Windows 安装包：$installerPath"
    }

    $bundledCoreSha256 = Get-FileSha256 $bundledCore
    $unpackedCoreSha256 = Get-FileSha256 $unpackedCore
    if ($bundledCoreSha256 -ne $unpackedCoreSha256) {
        throw "Core SHA256 校验失败：bundled-aioncore 与 win-unpacked 中的文件不一致。"
    }

    if ($ReleaseBuild) {
        $releaseLock = Get-Content -LiteralPath (Join-Path $aipcRoot "aioncore-release-lock.json") -Raw | ConvertFrom-Json
        $preparedManifest = Get-Content -LiteralPath (Join-Path $bundledRoot "manifest.json") -Raw | ConvertFrom-Json
        $lockedAsset = $releaseLock.assets.'win32-x64'
        if ($preparedManifest.sourceType -ne "locked-release" -or
            $preparedManifest.version -ne $releaseLock.version -or
            $preparedManifest.source.repository -ne $releaseLock.repository -or
            $preparedManifest.source.releaseTag -ne $releaseLock.releaseTag -or
            $preparedManifest.source.assetName -ne $lockedAsset.name -or
            $preparedManifest.source.expectedSha256 -ne $lockedAsset.sha256 -or
            $preparedManifest.source.actualSha256 -ne $lockedAsset.sha256 -or
            $preparedManifest.binarySha256 -ne $bundledCoreSha256) {
            throw "正式发布 Core 清单与 aioncore-release-lock.json 或实际二进制不一致。"
        }
        $sourceCoreSha256 = $bundledCoreSha256
    } else {
        $sourceCoreSha256 = Get-FileSha256 $CorePath
        if ($sourceCoreSha256 -ne $bundledCoreSha256) {
            throw "Core SHA256 校验失败：源码、bundled-aioncore 与 win-unpacked 中的文件不一致。"
        }
    }

    $installer = Get-Item -LiteralPath $installerPath
    Write-Host ""
    Write-Host "Windows x64 构建完成" -ForegroundColor Green
    Write-Host "安装包：$installerPath"
    Write-Host "大小：$([math]::Round($installer.Length / 1MB, 2)) MB"
    Write-Host "SHA256：$(Get-FileSha256 $installerPath)"
    Write-Host "Core SHA256：$sourceCoreSha256"
} finally {
    foreach ($name in $environmentNames) {
        Set-ProcessEnvironment $name $originalEnvironment[$name]
    }
}
