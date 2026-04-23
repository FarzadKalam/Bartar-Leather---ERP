[CmdletBinding()]
param(
    [string]$ServerHost = $(if ($env:SERVER_HOST) { $env:SERVER_HOST } else { "212.23.201.161" }),
    [int]$ServerPort = $(if ($env:SERVER_PORT) { [int]$env:SERVER_PORT } else { 22 }),
    [string]$ServerUser = $(if ($env:SERVER_USER) { $env:SERVER_USER } else { "deploy" }),
    [string]$DeployPath = $(if ($env:DEPLOY_PATH) { $env:DEPLOY_PATH } else { "/var/www/erp-mehrbanoo" }),
    [string]$RemoteArchive = "",
    [string]$IdentityFile = $env:SERVER_SSH_KEY_PATH,
    [int]$KeepReleases = 5,
    [switch]$SkipInstall,
    [switch]$SkipTypecheck,
    [switch]$SkipBuild,
    [switch]$SkipUpload,
    [switch]$SkipHostKeyScan
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ArchivePath = Join-Path ([System.IO.Path]::GetTempPath()) "erp-mehrbanoo-dist.tar.gz"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

function Invoke-External {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [string[]]$Arguments = @()
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        $joinedArguments = if ($Arguments.Count -gt 0) {
            $Arguments -join " "
        } else {
            ""
        }
        throw "Command failed: $FilePath $joinedArguments"
    }
}

function Quote-Posix {
    param([string]$Value)

    if ($null -eq $Value) {
        return "''"
    }

    return "'" + ($Value -replace "'", "'\''") + "'"
}

function Ensure-KnownHost {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ServerHostName,

        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    $sshDirectory = Join-Path $HOME ".ssh"
    $knownHostsPath = Join-Path $sshDirectory "known_hosts"
    $hostEntry = if ($Port -eq 22) { $ServerHostName } else { "[$ServerHostName]:$Port" }

    if (-not (Test-Path $sshDirectory)) {
        New-Item -ItemType Directory -Path $sshDirectory | Out-Null
    }

    if (-not (Test-Path $knownHostsPath)) {
        New-Item -ItemType File -Path $knownHostsPath | Out-Null
    }

    & ssh-keygen -F $hostEntry -f $knownHostsPath | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Known host entry already exists for $hostEntry."
        return
    }

    Write-Step "Adding SSH host key for $hostEntry"
    $scanOutput = & ssh-keyscan -p $Port $ServerHostName 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($scanOutput | Out-String))) {
        throw "Unable to fetch host key from $ServerHostName on port $Port."
    }

    Add-Content -Path $knownHostsPath -Value $scanOutput
}

function Get-PlatformCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Primary,

        [string]$WindowsCmd = ''
    )

    if ($WindowsCmd -and $env:OS -eq 'Windows_NT' -and (Get-Command $WindowsCmd -ErrorAction SilentlyContinue)) {
        return $WindowsCmd
    }

    return $Primary
}

function Test-NodePackageBinary {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PackageName,

        [Parameter(Mandatory = $true)]
        [string]$RelativeBinaryPath
    )

    $packagePath = Join-Path $ProjectRoot "node_modules\$PackageName"
    if (-not (Test-Path $packagePath)) {
        return $false
    }

    $binaryPath = Join-Path $packagePath $RelativeBinaryPath
    return (Test-Path $binaryPath)
}

function Assert-LocalBuildPrerequisites {
    param(
        [switch]$NeedsTypecheck,
        [switch]$NeedsBuild
    )

    if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
        throw "node_modules was not found. Run npm ci first or remove -SkipInstall."
    }

    $missingPackages = New-Object System.Collections.Generic.List[string]

    if ($NeedsTypecheck -and -not (Test-NodePackageBinary -PackageName "typescript" -RelativeBinaryPath "bin/tsc")) {
        $missingPackages.Add("typescript")
    }

    if ($NeedsBuild -and -not (Test-NodePackageBinary -PackageName "vite" -RelativeBinaryPath "bin/vite.js")) {
        $missingPackages.Add("vite")
    }

    if ($missingPackages.Count -gt 0) {
        $packages = $missingPackages -join ", "
        throw "Local dependencies are missing or incomplete for: $packages. Run npm ci first or remove -SkipInstall."
    }
}

if ([string]::IsNullOrWhiteSpace($ServerHost)) {
    throw "ServerHost is required. Pass -ServerHost or set SERVER_HOST."
}

if ([string]::IsNullOrWhiteSpace($ServerUser)) {
    throw "ServerUser is required. Pass -ServerUser or set SERVER_USER."
}

if ([string]::IsNullOrWhiteSpace($RemoteArchive)) {
    $RemoteArchive = "/home/$ServerUser/erp-mehrbanoo-dist.tar.gz"
}

$npmCommand = Get-PlatformCommand -Primary "npm" -WindowsCmd "npm.cmd"
$npxCommand = Get-PlatformCommand -Primary "npx" -WindowsCmd "npx.cmd"

Require-Command $npmCommand
Require-Command "tar"
Require-Command "ssh"
Require-Command "scp"

if (-not $SkipTypecheck) {
    Require-Command $npxCommand
}

if (-not $SkipHostKeyScan) {
    Require-Command "ssh-keyscan"
    Require-Command "ssh-keygen"
}

$sshCommonArgs = @("-p", $ServerPort.ToString())
$scpCommonArgs = @("-P", $ServerPort.ToString())

if (-not [string]::IsNullOrWhiteSpace($IdentityFile)) {
    if (-not (Test-Path $IdentityFile)) {
        throw "Identity file not found: $IdentityFile"
    }

    $resolvedIdentityFile = (Resolve-Path $IdentityFile).Path
    $sshCommonArgs += @("-i", $resolvedIdentityFile)
    $scpCommonArgs += @("-i", $resolvedIdentityFile)
}

$target = "$ServerUser@$ServerHost"

$remoteScript = @'
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/var/www/erp-mehrbanoo}"
ARCHIVE="${REMOTE_ARCHIVE:-$HOME/erp-mehrbanoo-dist.tar.gz}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
TS="$(date +%Y%m%d%H%M%S)"

mkdir -p "$DEPLOY_PATH/releases"
RELEASE_DIR="$DEPLOY_PATH/releases/$TS"
mkdir -p "$RELEASE_DIR"

tar -xzf "$ARCHIVE" -C "$RELEASE_DIR"
rm -f "$ARCHIVE"
ln -sfn "$RELEASE_DIR" "$DEPLOY_PATH/current"

if [ -d "$DEPLOY_PATH/releases" ]; then
  ls -1dt "$DEPLOY_PATH/releases"/* 2>/dev/null | tail -n +"$((KEEP_RELEASES + 1))" | xargs -r rm -rf
fi

if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl reload nginx || true
fi

echo "Deployed $RELEASE_DIR"
'@

$remoteCommand = @(
    "DEPLOY_PATH=$(Quote-Posix $DeployPath)",
    "REMOTE_ARCHIVE=$(Quote-Posix $RemoteArchive)",
    "KEEP_RELEASES=$(Quote-Posix $KeepReleases.ToString())",
    "bash -s"
) -join " "

Push-Location $ProjectRoot
try {
    if ($SkipInstall -and ((-not $SkipTypecheck) -or (-not $SkipBuild))) {
        Assert-LocalBuildPrerequisites -NeedsTypecheck:(-not $SkipTypecheck) -NeedsBuild:(-not $SkipBuild)
    }

    if (-not $SkipInstall) {
        Write-Step "Installing dependencies with npm ci"
        Invoke-External -FilePath $npmCommand -Arguments @("ci")
    }

    if (-not $SkipTypecheck) {
        Write-Step "Running TypeScript typecheck"
        Invoke-External -FilePath $npxCommand -Arguments @("tsc", "--noEmit")
    }

    if (-not $SkipBuild) {
        Write-Step "Building production dist"
        Invoke-External -FilePath $npmCommand -Arguments @("run", "build")
    }

    if (-not (Test-Path "dist")) {
        throw "dist directory was not found. Build must succeed before deploy."
    }

    if (-not $SkipHostKeyScan) {
        Ensure-KnownHost -ServerHostName $ServerHost -Port $ServerPort
    }

    Write-Step "Packing dist into archive"
    if (Test-Path $ArchivePath) {
        Remove-Item $ArchivePath -Force
    }
    Invoke-External -FilePath "tar" -Arguments @("-czf", $ArchivePath, "-C", "dist", ".")

    if (-not $SkipUpload) {
        Write-Step "Uploading archive to $target"
        Invoke-External -FilePath "scp" -Arguments ($scpCommonArgs + @($ArchivePath, "${target}:$RemoteArchive"))
    }

    Write-Step "Activating new release on server"
    $remoteScript | & ssh @sshCommonArgs $target $remoteCommand
    if ($LASTEXITCODE -ne 0) {
        throw "Remote activation failed."
    }

    Write-Host ""
    Write-Host "Deployment completed successfully." -ForegroundColor Green
}
finally {
    Pop-Location

    if (Test-Path $ArchivePath) {
        Remove-Item $ArchivePath -Force -ErrorAction SilentlyContinue
    }
}
