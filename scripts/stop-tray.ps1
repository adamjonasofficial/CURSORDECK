# Stop tray host + bridge processes
#Requires -Version 5.1
$ErrorActionPreference = "Continue"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogDir = Join-Path $Root "logs"

foreach ($f in @("tray.pid", "bridge.pid")) {
  $p = Join-Path $LogDir $f
  if (Test-Path $p) {
    $id = Get-Content $p -ErrorAction SilentlyContinue
    if ($id) {
      Stop-Process -Id ([int]$id) -Force -ErrorAction SilentlyContinue
      Write-Host "  stopped PID $id ($f)"
    }
    Remove-Item $p -Force -ErrorAction SilentlyContinue
  }
}

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -like "*tray-host.ps1*" } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "  stopped tray PID $($_.ProcessId)"
  }

Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and ($_.CommandLine -like "*apps\\bridge\\dist\\index.js*" -or $_.CommandLine -like "*apps/bridge/dist/index.js*") } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "  stopped bridge PID $($_.ProcessId)"
  }

& (Join-Path $PSScriptRoot "free-ports.ps1") -Ports @(3847) | Out-Null
Write-Host "[OK] Stopped."
