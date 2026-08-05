#Requires -Version 5.1
<#
.SYNOPSIS
  Stage CursorDeck runtime payload for Inno Setup into dist/payload
#>
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$OutDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $OutDir) {
  $OutDir = Join-Path $RepoRoot "dist\payload"
}

$Version = "0.9.0"
try {
  $pkg = Get-Content (Join-Path $RepoRoot "package.json") -Raw | ConvertFrom-Json
  if ($pkg.version) { $Version = [string]$pkg.version }
} catch {}

Write-Host "==> Staging CursorDeck $Version -> $OutDir"

if (Test-Path $OutDir) {
  Remove-Item -Recurse -Force $OutDir
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Invoke-Robo([string]$Src, [string]$Dest, [string[]]$ExtraArgs = @()) {
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  $args = @($Src, $Dest, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np") + $ExtraArgs
  & robocopy @args | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $Src -> $Dest (code $LASTEXITCODE)" }
}

function Copy-Tree([string]$Rel, [string]$DestRel = $null) {
  $src = Join-Path $RepoRoot $Rel
  if (-not (Test-Path $src)) {
    Write-Warning "Missing: $Rel"
    return
  }
  $dest = Join-Path $OutDir $(if ($DestRel) { $DestRel } else { $Rel })
  if ((Get-Item $src).PSIsContainer) {
    Write-Host "  dir  $Rel"
    Invoke-Robo $src $dest @("/XD", "node_modules", ".git", "logs", "dist", ".turbo", ".cursor")
  } else {
    Write-Host "  file $Rel"
    New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
    Copy-Item -Force $src $dest
  }
}

# Root launchers / docs
$rootFiles = @(
  "package.json",
  "pnpm-lock.yaml",
  "LICENSE",
  "README.md",
  "start.bat",
  "stop.bat",
  "setup.bat",
  "install-plugin.bat",
  "verify.bat",
  "regenerate-icons.bat",
  "Start CursorDeck.vbs",
  "appearance.example.json"
)
foreach ($f in $rootFiles) {
  $p = Join-Path $RepoRoot $f
  if (Test-Path $p) { Copy-Item -Force $p (Join-Path $OutDir $f) }
}

# Slim workspace: bridge + web + shared + setup (no streamdeck-plugin package install)
@"
packages:
  - "apps/bridge"
  - "apps/web"
  - "packages/*"
  - "setup"
"@ | Set-Content -Path (Join-Path $OutDir "pnpm-workspace.yaml") -Encoding UTF8

# Source trees (without node_modules)
Copy-Tree "apps\bridge\src"
Copy-Tree "apps\bridge\package.json" "apps\bridge\package.json"
Copy-Tree "apps\bridge\tsconfig.json" "apps\bridge\tsconfig.json"
Copy-Tree "apps\web\src"
Copy-Tree "apps\web\public"
Copy-Tree "apps\web\index.html" "apps\web\index.html"
Copy-Tree "apps\web\package.json" "apps\web\package.json"
Copy-Tree "apps\web\tsconfig.json" "apps\web\tsconfig.json"
Copy-Tree "apps\web\vite.config.ts" "apps\web\vite.config.ts"
Copy-Tree "packages\shared"
Copy-Tree "setup"
Copy-Tree "hooks"
Copy-Tree "scripts"
Copy-Tree "icon"
Copy-Tree "docs"

# Prebuilt Stream Deck plugin only (no plugin node_modules / lucide)
$pluginSrc = Join-Path $RepoRoot "apps\streamdeck-plugin\com.cursorstreamdeck.bridge.sdPlugin"
$pluginDest = Join-Path $OutDir "apps\streamdeck-plugin\com.cursorstreamdeck.bridge.sdPlugin"
if (-not (Test-Path (Join-Path $pluginSrc "bin\plugin.js"))) {
  throw "Plugin bin/plugin.js missing - run pnpm plugin:build first"
}
Write-Host "  plugin com.cursorstreamdeck.bridge.sdPlugin"
Invoke-Robo $pluginSrc $pluginDest @("/XD", "logs")
Copy-Item -Force (Join-Path $RepoRoot "apps\streamdeck-plugin\package.json") `
  (Join-Path $OutDir "apps\streamdeck-plugin\package.json")

# Icon generator (Apply art from installed copy / PI button)
$genScripts = Join-Path $RepoRoot "apps\streamdeck-plugin\scripts"
if (Test-Path $genScripts) {
  Write-Host "  plugin scripts (generate-icons)"
  Invoke-Robo $genScripts (Join-Path $OutDir "apps\streamdeck-plugin\scripts")
}

# Prebuilt artifacts
$requiredDists = @(
  "packages\shared\dist",
  "apps\bridge\dist",
  "apps\web\dist"
)
foreach ($d in $requiredDists) {
  $src = Join-Path $RepoRoot $d
  if (-not (Test-Path $src)) {
    throw "Required build output missing: $d - run pnpm build first"
  }
  Write-Host "  dist $d"
  Invoke-Robo $src (Join-Path $OutDir $d)
}

# Install runtime deps into payload
Write-Host "==> pnpm install in payload..."
Push-Location $OutDir
try {
  $hasPnpm = [bool](Get-Command pnpm -ErrorAction SilentlyContinue)
  if ($hasPnpm) {
    & pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { & pnpm install }
  } else {
    & npx --yes pnpm@9.15.0 install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { & npx --yes pnpm@9.15.0 install }
  }
  if ($LASTEXITCODE -ne 0) { throw "pnpm install in payload failed" }

  if ($hasPnpm) {
    & pnpm --filter @csd/shared build
    & pnpm --filter @csd/bridge build
    & pnpm --filter @csd/web build
    & pnpm --filter @csd/setup build
  } else {
    & npx --yes pnpm@9.15.0 --filter @csd/shared build
    & npx --yes pnpm@9.15.0 --filter @csd/bridge build
    & npx --yes pnpm@9.15.0 --filter @csd/web build
    & npx --yes pnpm@9.15.0 --filter @csd/setup build
  }
} finally {
  Pop-Location
}

# Drop build-only weight (keep plugin art tooling: lucide-static + sharp)
Write-Host "==> Pruning build-only folders from payload..."
$prune = @(
  "apps\web\node_modules",
  "apps\web\src",
  "apps\bridge\src",
  "packages\shared\src"
)
foreach ($rel in $prune) {
  $p = Join-Path $OutDir $rel
  if (Test-Path $p) {
    Write-Host "  remove $rel"
    Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue
  }
}

# Art deps for Apply art (not part of slim workspace — avoid workspace:* in npm)
Write-Host "==> Installing lucide-static + sharp for icon generator..."
$pluginDir = Join-Path $OutDir "apps\streamdeck-plugin"
$pkgPath = Join-Path $pluginDir "package.json"
$pkgBak = Join-Path $pluginDir "package.json.workspace-bak"
if (Test-Path $pkgPath) { Copy-Item -Force $pkgPath $pkgBak }
@{
  name = "csd-art-tools"
  private = $true
  dependencies = @{
    "lucide-static" = "1.28.0"
    "sharp" = "0.35.3"
  }
} | ConvertTo-Json -Depth 5 | Set-Content -Path $pkgPath -Encoding UTF8
Push-Location $pluginDir
try {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & npm.cmd install --no-fund --no-audit
  $npmCode = $LASTEXITCODE
  $ErrorActionPreference = $prevEap
  if ($npmCode -ne 0) {
    Write-Warning "npm install art deps failed (exit $npmCode) - Apply art may not work from this payload"
  } else {
    Write-Host "  art deps ok (lucide-static + sharp)"
  }
} finally {
  Pop-Location
  if (Test-Path $pkgBak) { Move-Item -Force $pkgBak $pkgPath }
}

# Strip unused heavy workspace tooling only (do NOT remove lucide/sharp under plugin)
$pnpmStore = Join-Path $OutDir "node_modules\.pnpm"
if (Test-Path $pnpmStore) {
  Get-ChildItem $pnpmStore -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^(rollup@|@rollup\+|vite@)' } |
    ForEach-Object {
      Write-Host "  remove .pnpm\$($_.Name)"
      Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue
    }
}

# Version stamp
@{
  version = $Version
  stagedAt = (Get-Date).ToString("o")
} | ConvertTo-Json | Set-Content -Path (Join-Path $OutDir "INSTALLER_PAYLOAD.json") -Encoding UTF8

Write-Host "==> Payload ready: $OutDir"
Write-Host $Version
