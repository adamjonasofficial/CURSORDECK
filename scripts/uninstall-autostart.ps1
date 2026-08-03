#Requires -Version 5.1
<#
.SYNOPSIS
  Remove CursorDeck from HKCU Run (disable Start with Windows).
#>
param(
  [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
if (Test-Path $runKey) {
  $existing = Get-ItemProperty -Path $runKey -Name "CursorDeck" -ErrorAction SilentlyContinue
  if ($null -ne $existing) {
    Remove-ItemProperty -Path $runKey -Name "CursorDeck" -ErrorAction SilentlyContinue
    if (-not $Quiet) { Write-Host "Autostart removed (HKCU Run\CursorDeck)." }
  } else {
    if (-not $Quiet) { Write-Host "Autostart was not set." }
  }
}
