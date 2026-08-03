#Requires -Version 5.1
<#
.SYNOPSIS
  Fast, non-interactive post-install from CursorDeck Setup.
  Never calls bats that end with "pause" (would hang the installer forever).
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$InstallRoot,
  [string]$CursorHooks = "0",
  [string]$SdPlugin = "0"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$logDir = Join-Path $InstallRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "post-install.log"

function Write-Log([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format "o"), $Message
  try { Add-Content -Path $log -Value $line -Encoding UTF8 } catch {}
  Write-Host $line
}

Write-Log "post-install start root=$InstallRoot hooks=$CursorHooks plugin=$SdPlugin"

function Invoke-PnpmQuiet([string[]]$PnpmArgs) {
  Push-Location $InstallRoot
  try {
    $outLog = Join-Path $logDir "post-install-pnpm-out.log"
    $errLog = Join-Path $logDir "post-install-pnpm-err.log"
    $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
    if ($pnpm) {
      $argLine = ($PnpmArgs | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join ' '
      $p = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "pnpm $argLine") `
        -WorkingDirectory $InstallRoot -WindowStyle Hidden -Wait -PassThru `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog
      return $p.ExitCode
    }
    $argLine = (@("--yes", "pnpm@9.15.0") + $PnpmArgs | ForEach-Object {
      if ($_ -match '\s') { '"' + $_ + '"' } else { $_ }
    }) -join ' '
    $p = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "npx $argLine") `
      -WorkingDirectory $InstallRoot -WindowStyle Hidden -Wait -PassThru `
      -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    return $p.ExitCode
  } finally {
    Pop-Location
  }
}

# --- Stream Deck plugin: robocopy only (prebuilt in payload) ---
if ($SdPlugin -eq "1") {
  Write-Log "Installing Stream Deck plugin (copy only)..."
  $src = Join-Path $InstallRoot "apps\streamdeck-plugin\com.cursorstreamdeck.bridge.sdPlugin"
  $pluginsDir = Join-Path $env:APPDATA "Elgato\StreamDeck\Plugins"
  $dest = Join-Path $pluginsDir "com.cursorstreamdeck.bridge.sdPlugin"

  if (-not (Test-Path (Join-Path $src "bin\plugin.js"))) {
    Write-Log "SKIP plugin: prebuilt bin/plugin.js missing at $src"
  } elseif (-not (Test-Path $pluginsDir)) {
    Write-Log "SKIP plugin: Stream Deck Plugins folder missing ($pluginsDir). Start Elgato Stream Deck once, then run install-plugin.bat."
  } else {
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    & robocopy $src $dest /E /IS /IT /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    $rc = $LASTEXITCODE
    if ($rc -ge 8) {
      Write-Log "plugin robocopy failed code $rc"
    } else {
      Write-Log "plugin installed -> $dest"
    }
  }
}

# --- Cursor hooks / keybindings ---
if ($CursorHooks -eq "1") {
  Write-Log "Installing Cursor hooks / keybindings..."
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Log "SKIP hooks: Node.js not in PATH"
  } else {
    # Prefer compiled setup if present; else pnpm setup:cursor (may take ~30s, no pause)
    $setupJs = Join-Path $InstallRoot "setup\dist\install.js"
    $setupTs = Join-Path $InstallRoot "setup\src\install.ts"
    $code = -1
    if (Test-Path $setupJs) {
      Write-Log "running node setup/dist/install.js"
      $p = Start-Process -FilePath "node" -ArgumentList @($setupJs) `
        -WorkingDirectory $InstallRoot -WindowStyle Hidden -Wait -PassThru `
        -RedirectStandardOutput (Join-Path $logDir "setup-out.log") `
        -RedirectStandardError (Join-Path $logDir "setup-err.log")
      $code = $p.ExitCode
    } else {
      Write-Log "running pnpm setup:cursor"
      $code = Invoke-PnpmQuiet @("setup:cursor")
    }
    Write-Log "hooks setup exit $code"
  }
}

Write-Log "post-install done"
exit 0
