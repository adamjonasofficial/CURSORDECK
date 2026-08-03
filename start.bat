@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM Default: silent CursorDeck tray (no console, no browser).
REM Debug:  start.bat --console
REM Setup:  start.bat --setup

if /I "%~1"=="--console" goto console_mode
if /I "%~2"=="--console" goto console_mode
if /I "%~1"=="--setup" (
  call "%~dp0setup.bat"
)
if /I "%~2"=="--setup" (
  if /I not "%~1"=="--setup" call "%~dp0setup.bat"
)

echo Starting CursorDeck in system tray (no console)...
cscript //nologo "%~dp0Start CursorDeck.vbs"
exit /b 0

:console_mode
title CursorDeck (console)

echo.
echo  ========================================
echo   CursorDeck - console / debug
echo  ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js neni v PATH. Nainstaluj Node 20+ a zkus znovu.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do echo [OK] Node %%v

set "PNPM_CMD=pnpm"
where pnpm >nul 2>&1
if errorlevel 1 (
  set "PNPM_CMD=npx --yes pnpm@9.15.0"
  echo [OK] pnpm neni globalne - pouziju npx pnpm@9.15.0
) else (
  echo [OK] pnpm nalezen
)

if not exist "node_modules\" (
  echo.
  echo [..] Instaluju zavislosti...
  call %PNPM_CMD% install
  if errorlevel 1 (
    echo [ERROR] pnpm install selhalo.
    pause
    exit /b 1
  )
)

echo.
echo [..] Build @csd/shared...
call %PNPM_CMD% --filter @csd/shared build
if errorlevel 1 (
  echo [ERROR] Shared build selhal.
  pause
  exit /b 1
)

if /I "%~1"=="--setup" goto do_setup
if /I "%~2"=="--setup" goto do_setup
if /I "%CSD_SETUP%"=="1" goto do_setup
goto after_setup

:do_setup
echo.
echo [..] Instaluju Cursor keybindings + hooks...
call %PNPM_CMD% setup:cursor
if errorlevel 1 (
  echo [WARN] setup:cursor selhalo - pokracuju bez nej.
)
echo [TIP] V Cursoru udelej Developer: Reload Window.

:after_setup

echo.
echo [..] Uvolnuju porty 3847 a 5173...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\free-ports.ps1" -Ports 3847,5173

echo.
echo [..] Spoustim bridge + web (dev)...
echo      Bridge:  http://127.0.0.1:3847
echo      Web UI:  http://127.0.0.1:5173
echo.
echo  Zavrenim tohoto okna zastavis oba servery.
echo  Pro bezny beh pouzij Start CursorDeck.vbs (tray, bez prohlizece).
echo.

call %PNPM_CMD% --filter @csd/bridge --filter @csd/web --parallel dev
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo [ERROR] Servery skoncity s kodem %EXITCODE%.
) else (
  echo [OK] Servery zastaveny.
)
pause
exit /b %EXITCODE%
