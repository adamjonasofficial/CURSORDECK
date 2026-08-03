@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM CursorDeck Setup builder - produces dist\CursorDeck-Setup-*.exe
set "REPO=%~dp0"
set "REPO=%REPO:~0,-1%"
set "ISCC="
set "TOOLS_IS=%REPO%\tools\innosetup"
set "VERSION=0.9.0"

for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content '%REPO%\package.json' | ConvertFrom-Json).version"`) do set "VERSION=%%V"

echo.
echo ========================================
echo   CursorDeck Setup builder  v%VERSION%
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found. Install Node 20+ from https://nodejs.org/
  exit /b 1
)

echo [1/4] Installing dependencies and building...
where pnpm >nul 2>&1
if errorlevel 1 (
  call npx --yes pnpm@9.15.0 install
  if errorlevel 1 exit /b 1
  call npx --yes pnpm@9.15.0 build
  if errorlevel 1 exit /b 1
) else (
  call pnpm install
  if errorlevel 1 exit /b 1
  call pnpm build
  if errorlevel 1 exit /b 1
)

echo.
echo [2/4] Staging payload...
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%\installer\stage-payload.ps1" -RepoRoot "%REPO%"
if errorlevel 1 (
  echo ERROR: stage-payload.ps1 failed
  exit /b 1
)

echo.
echo [3/4] Locating Inno Setup compiler (ISCC)...

if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not defined ISCC if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if not defined ISCC if exist "%TOOLS_IS%\ISCC.exe" set "ISCC=%TOOLS_IS%\ISCC.exe"
if not defined ISCC if exist "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"

if not defined ISCC (
  echo ISCC not found - downloading Inno Setup into tools\innosetup ...
  if not exist "%TOOLS_IS%" mkdir "%TOOLS_IS%"
  set "IS_SETUP=%TEMP%\innosetup-cursordeck-setup.exe"
  powershell -NoProfile -ExecutionPolicy Bypass -Command " $ProgressPreference='SilentlyContinue'; $out=Join-Path $env:TEMP 'innosetup-cursordeck-setup.exe'; Invoke-WebRequest -Uri 'https://jrsoftware.org/download.php/is.exe' -OutFile $out -UseBasicParsing; if (-not (Test-Path $out)) { throw 'download failed' }; Write-Host ('Downloaded ' + $out) "
  if errorlevel 1 (
    echo ERROR: Failed to download Inno Setup
    exit /b 1
  )
  echo Installing Inno Setup silently to %TOOLS_IS% ...
  "%TEMP%\innosetup-cursordeck-setup.exe" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR="%TOOLS_IS%" /CURRENTUSER
  if not exist "%TOOLS_IS%\ISCC.exe" (
    "%TEMP%\innosetup-cursordeck-setup.exe" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR="%TOOLS_IS%"
  )
  if exist "%TOOLS_IS%\ISCC.exe" set "ISCC=%TOOLS_IS%\ISCC.exe"
)

if not defined ISCC (
  echo ERROR: ISCC.exe still not found after Inno Setup install.
  echo Install Inno Setup 6 from https://jrsoftware.org/isinfo.php and re-run.
  exit /b 1
)

echo Using: %ISCC%
echo.
echo [4/4] Compiling installer...

"%ISCC%" "/DMyAppVersion=%VERSION%" "%REPO%\installer\CursorDeck.iss"
if errorlevel 1 (
  echo ERROR: ISCC failed
  exit /b 1
)

set "OUT=%REPO%\dist\CursorDeck-Setup-%VERSION%.exe"
if not exist "%OUT%" (
  echo ERROR: Expected output missing: %OUT%
  dir /b "%REPO%\dist\CursorDeck-Setup-*.exe" 2>nul
  exit /b 1
)

echo.
echo ========================================
echo   Done: %OUT%
echo ========================================
exit /b 0
