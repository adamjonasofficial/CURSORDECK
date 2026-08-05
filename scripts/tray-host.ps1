# CursorDeck - silent system-tray host (no console, no auto-browser)
#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogDir = Join-Path $Root "logs"
$LogFile = Join-Path $LogDir "tray.log"
$PidFile = Join-Path $LogDir "tray.pid"
$BridgePidFile = Join-Path $LogDir "bridge.pid"
$BridgeEntry = Join-Path $Root "apps\bridge\dist\index.js"
$WebIndex = Join-Path $Root "apps\web\dist\index.html"
$BrandIcon = Join-Path $Root "icon\tray.ico"
if (-not (Test-Path $BrandIcon)) { $BrandIcon = Join-Path $Root "icon\tray.png" }
if (-not (Test-Path $BrandIcon)) { $BrandIcon = Join-Path $Root "icon\icon.png" }
$BridgeUrl = "http://127.0.0.1:3847"
$HealthUrl = "$BridgeUrl/health"
$PadUrl = "$BridgeUrl/"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format "o"), $Message
  try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch {}
}

# Single instance
$script:Mutex = $null
$created = $false
try {
  $script:Mutex = New-Object System.Threading.Mutex($true, "Global\CursorDeckTray", [ref]$created)
} catch {
  $created = $false
}
if (-not $created) {
  Write-Log "Another tray instance is already running - exiting"
  exit 0
}

$script:BridgeProcess = $null
$script:Healthy = $false
$script:HealthFailStreak = 0
$script:Notify = $null
$script:LastBridgeRestartAt = [datetime]::MinValue

function Invoke-Pnpm([string[]]$PnpmArgs) {
  Write-Log ("pnpm " + ($PnpmArgs -join " "))
  $outLog = Join-Path $LogDir "pnpm-out.log"
  $errLog = Join-Path $LogDir "pnpm-err.log"
  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($pnpm) {
    $argLine = ($PnpmArgs | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join ' '
    $p = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "pnpm $argLine") `
      -WorkingDirectory $Root -WindowStyle Hidden -Wait -PassThru `
      -RedirectStandardOutput $outLog -RedirectStandardError $errLog
  } else {
    $argLine = (@("--yes", "pnpm@9.15.0") + $PnpmArgs | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join ' '
    $p = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "npx $argLine") `
      -WorkingDirectory $Root -WindowStyle Hidden -Wait -PassThru `
      -RedirectStandardOutput $outLog -RedirectStandardError $errLog
  }
  if ($p.ExitCode -ne 0) {
    throw "pnpm failed (exit $($p.ExitCode)). See logs\pnpm-err.log"
  }
}

function Ensure-Built {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js not found in PATH. Install Node 20+."
  }

  $sharedEntry = Join-Path $Root "packages\shared\dist\index.js"
  $sharedSrc = Join-Path $Root "packages\shared\src"
  $bridgeSrc = Join-Path $Root "apps\bridge\src"

  # Installer payload ships prebuilt dist and may omit TypeScript sources.
  # Prefer running what we have — only rebuild when sources exist and output is missing.
  $bridgeReady = Test-Path $BridgeEntry
  $sharedReady = Test-Path $sharedEntry
  $webReady = Test-Path $WebIndex

  if ($bridgeReady -and $sharedReady) {
    Write-Log "Using prebuilt bridge ($BridgeEntry)"
    if (-not $webReady) {
      Write-Log "Web pad dist missing (optional): $WebIndex"
    }
    return
  }

  if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Write-Log "Installing dependencies..."
    Invoke-Pnpm @("install")
  }

  if (-not $sharedReady) {
    if (-not (Test-Path $sharedSrc)) {
      throw "Shared build missing and no sources at packages\shared\src. Reinstall CursorDeck."
    }
    Write-Log "Building shared..."
    Invoke-Pnpm @("--filter", "@csd/shared", "build")
  }

  if (-not (Test-Path $BridgeEntry)) {
    if (-not (Test-Path $bridgeSrc)) {
      throw "Bridge build missing and no sources at apps\bridge\src. Reinstall CursorDeck."
    }
    Write-Log "Building bridge..."
    Invoke-Pnpm @("--filter", "@csd/bridge", "build")
  }

  if (-not (Test-Path $WebIndex)) {
    Write-Log "Building web pad..."
    try {
      Invoke-Pnpm @("--filter", "@csd/web", "build")
    } catch {
      Write-Log "Web pad build skipped: $_"
    }
  }

  if (-not (Test-Path $BridgeEntry)) {
    throw "Bridge build missing: $BridgeEntry"
  }
}

function Free-BridgePort {
  & (Join-Path $PSScriptRoot "free-ports.ps1") -Ports @(3847) | Out-Null
}

function Stop-Bridge {
  if ($script:BridgeProcess -and -not $script:BridgeProcess.HasExited) {
    try {
      Write-Log "Stopping bridge PID $($script:BridgeProcess.Id)"
      Stop-Process -Id $script:BridgeProcess.Id -Force -ErrorAction SilentlyContinue
    } catch {}
  }
  $script:BridgeProcess = $null
  if (Test-Path $BridgePidFile) { Remove-Item $BridgePidFile -Force -ErrorAction SilentlyContinue }
  Free-BridgePort
}

function Start-Bridge {
  Stop-Bridge
  Ensure-Built
  Free-BridgePort
  Write-Log "Starting bridge: node $BridgeEntry"
  $script:BridgeProcess = Start-Process -FilePath "node" `
    -ArgumentList @($BridgeEntry) `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput (Join-Path $LogDir "bridge-out.log") `
    -RedirectStandardError (Join-Path $LogDir "bridge-err.log")
  Set-Content -Path $BridgePidFile -Value $script:BridgeProcess.Id -Encoding ASCII
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 250
    try {
      $r = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 1
      if ($r.ok) {
        $script:Healthy = $true
        Write-Log "Bridge healthy on port $($r.port)"
        return
      }
    } catch {}
  }
  $script:Healthy = $false
  throw "Bridge did not become healthy at $HealthUrl"
}

function Update-TrayStatus {
  if (-not $script:Notify) { return }
  try {
    $r = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 1
    $script:Healthy = [bool]$r.ok
  } catch {
    $script:Healthy = $false
  }

  if ($script:Healthy) {
    $script:HealthFailStreak = 0
    $script:Notify.Text = "CursorDeck - OK"
  } else {
    $script:HealthFailStreak++
    $script:Notify.Text = "CursorDeck - OFFLINE"
    # Bridge often wedges under connection storms — auto-restart after a few misses
    $sinceRestart = (Get-Date) - $script:LastBridgeRestartAt
    if ($script:HealthFailStreak -ge 3 -and $sinceRestart.TotalSeconds -ge 20) {
      Write-Log "Bridge unhealthy x$($script:HealthFailStreak) - restarting"
      $script:LastBridgeRestartAt = Get-Date
      $script:HealthFailStreak = 0
      try {
        Start-Bridge
        Show-Balloon "CursorDeck" "Bridge restarted (was offline)." Info
      } catch {
        Write-Log "Auto-restart failed: $_"
        Show-Balloon "CursorDeck" "Bridge restart failed: $_" Error
      }
    }
  }
  # Keep brand icon — do not replace with SystemIcons
}

function Show-Balloon([string]$Title, [string]$Text, [System.Windows.Forms.ToolTipIcon]$Icon = "Info") {
  if (-not $script:Notify) { return }
  try {
    $script:Notify.BalloonTipTitle = $Title
    $script:Notify.BalloonTipText = $Text
    $script:Notify.BalloonTipIcon = $Icon
    $script:Notify.ShowBalloonTip(4000)
  } catch {}
}

function Quit-Host {
  Write-Log "Quit requested"
  Stop-Bridge
  if ($script:Notify) {
    $script:Notify.Visible = $false
    $script:Notify.Dispose()
  }
  if (Test-Path $PidFile) { Remove-Item $PidFile -Force -ErrorAction SilentlyContinue }
  if ($script:Mutex) {
    try { $script:Mutex.ReleaseMutex() } catch {}
    $script:Mutex.Dispose()
  }
  [System.Windows.Forms.Application]::Exit()
}

# --- UI ---
$script:Notify = New-Object System.Windows.Forms.NotifyIcon
$script:Notify.Text = "CursorDeck - starting..."
$script:BrandBitmap = $null
$script:BrandIconObj = $null
try {
  if (Test-Path $BrandIcon) {
    if ($BrandIcon.ToLower().EndsWith(".ico")) {
      $script:BrandIconObj = New-Object System.Drawing.Icon($BrandIcon, 32, 32)
      $script:Notify.Icon = $script:BrandIconObj
    } else {
      $script:BrandBitmap = New-Object System.Drawing.Bitmap $BrandIcon
      $tmp = [System.Drawing.Icon]::FromHandle($script:BrandBitmap.GetHicon())
      # Clone so the icon survives independently of the HICON handle
      $script:BrandIconObj = [System.Drawing.Icon]::new($tmp, 32, 32)
      $script:Notify.Icon = $script:BrandIconObj
      try { $tmp.Dispose() } catch {}
    }
    Write-Log "Tray brand icon loaded: $BrandIcon"
  } else {
    $script:Notify.Icon = [System.Drawing.SystemIcons]::Application
    Write-Log "Tray brand icon missing - using default"
  }
} catch {
  Write-Log "Tray icon load failed: $_"
  $script:Notify.Icon = [System.Drawing.SystemIcons]::Application
}
$script:Notify.Visible = $true

function Test-AutostartEnabled {
  try {
    $v = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "CursorDeck" -ErrorAction SilentlyContinue
    return ($null -ne $v -and -not [string]::IsNullOrWhiteSpace([string]$v.CursorDeck))
  } catch {
    return $false
  }
}

function Set-AutostartEnabled([bool]$Enable) {
  $install = Join-Path $PSScriptRoot "install-autostart.ps1"
  $uninstall = Join-Path $PSScriptRoot "uninstall-autostart.ps1"
  if ($Enable) {
    & $install -InstallRoot $Root -Quiet
  } else {
    & $uninstall -Quiet
  }
}

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miPad = $menu.Items.Add("Open Web Pad")
$miLogs = $menu.Items.Add("Open logs folder")
$miRestart = $menu.Items.Add("Restart bridge")
[void]$menu.Items.Add("-")
$miAutostart = New-Object System.Windows.Forms.ToolStripMenuItem
$miAutostart.Text = "Start with Windows"
$miAutostart.CheckOnClick = $true
$miAutostart.Checked = Test-AutostartEnabled
[void]$menu.Items.Add($miAutostart)
[void]$menu.Items.Add("-")
$miQuit = $menu.Items.Add("Quit")
$script:Notify.ContextMenuStrip = $menu

$miPad.add_Click({ Start-Process $PadUrl })
$miLogs.add_Click({ Start-Process explorer.exe $LogDir })
$miRestart.add_Click({
  try {
    Start-Bridge
    Update-TrayStatus
    Show-Balloon "CursorDeck" "Bridge restarted." Info
  } catch {
    Write-Log "Restart failed: $_"
    Show-Balloon "CursorDeck" "Restart failed: $_" Error
  }
})
$script:AutostartSyncing = $false
$miAutostart.add_CheckedChanged({
  if ($script:AutostartSyncing) { return }
  try {
    Set-AutostartEnabled $miAutostart.Checked
    Write-Log ("Autostart set to " + $miAutostart.Checked)
  } catch {
    Write-Log "Autostart toggle failed: $_"
    $script:AutostartSyncing = $true
    try { $miAutostart.Checked = Test-AutostartEnabled } finally { $script:AutostartSyncing = $false }
    Show-Balloon "CursorDeck" "Could not update Start with Windows: $_" Error
  }
})
$miQuit.add_Click({ Quit-Host })

$script:Notify.add_DoubleClick({ Start-Process $PadUrl })

Set-Content -Path $PidFile -Value $PID -Encoding ASCII

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.add_Tick({ Update-TrayStatus })
$timer.Start()

try {
  Write-Log "Tray host starting (PID $PID)"
  Start-Bridge
  Update-TrayStatus
  Show-Balloon "CursorDeck" "Running in tray. Bridge: $BridgeUrl" Info
  [System.Windows.Forms.Application]::Run()
} catch {
  Write-Log "Fatal: $_"
  Show-Balloon "CursorDeck" "Failed to start: $_" Error
  Start-Sleep -Seconds 5
  Quit-Host
  exit 1
}
