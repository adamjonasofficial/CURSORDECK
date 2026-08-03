#Requires -Version 5.1
<#
.SYNOPSIS
  Enable CursorDeck autostart via HKCU Run (Start with Windows).
#>
param(
  [string]$InstallRoot = "",
  [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $InstallRoot) {
  $InstallRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$vbs = Join-Path $InstallRoot "Start CursorDeck.vbs"
if (-not (Test-Path $vbs)) {
  throw "Start CursorDeck.vbs not found at: $vbs"
}

$cmd = 'wscript.exe //nologo "' + $vbs + '"'
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
New-Item -Path $runKey -Force | Out-Null
Set-ItemProperty -Path $runKey -Name "CursorDeck" -Value $cmd -Type String

if (-not $Quiet) {
  Write-Host "Autostart enabled: $cmd"
}
