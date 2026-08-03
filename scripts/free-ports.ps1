param(
  [int[]]$Ports = @(3847)
)

foreach ($port in $Ports) {
  $ids = @(
    Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
  )
  foreach ($procId in $ids) {
    if (-not $procId -or $procId -eq 0) { continue }
    try {
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Write-Host "  freed port $port (PID $procId)"
    } catch {
      # ignore races / already exited
    }
  }
}
