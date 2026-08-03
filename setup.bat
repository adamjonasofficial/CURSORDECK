@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM Silent when called from installer / automation (no pause)
set "SILENT=0"
if /I "%~1"=="/silent" set "SILENT=1"
if /I "%CURSORDECK_SILENT%"=="1" set "SILENT=1"

title CursorDeck - Setup

echo.
echo  ========================================
echo   CursorDeck - Setup
echo  ========================================
echo.
echo  Nainstaluje keybindings + hooks do Cursoru.
echo  Predtim zalohuje existujici soubory.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js neni v PATH.
  if "%SILENT%"=="0" pause
  exit /b 1
)

set "PNPM_CMD=pnpm"
where pnpm >nul 2>&1
if errorlevel 1 set "PNPM_CMD=npx --yes pnpm@9.15.0"

if not exist "node_modules\" (
  echo [..] Instaluju zavislosti...
  call %PNPM_CMD% install
  if errorlevel 1 (
    echo [ERROR] pnpm install selhalo.
    if "%SILENT%"=="0" pause
    exit /b 1
  )
)

call %PNPM_CMD% setup:cursor
if errorlevel 1 (
  echo [ERROR] Setup selhal.
  if "%SILENT%"=="0" pause
  exit /b 1
)

echo.
echo [OK] Hotovo. V Cursoru udelej: Developer: Reload Window
echo.
if "%SILENT%"=="0" pause
exit /b 0
