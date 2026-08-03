@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "SILENT=0"
if /I "%~1"=="/silent" set "SILENT=1"
if /I "%CURSORDECK_SILENT%"=="1" set "SILENT=1"

title CursorDeck - Install Plugin

echo.
echo  ========================================
echo   Install CursorDeck (Elgato plugin)
echo  ========================================
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

set "SRC=%~dp0apps\streamdeck-plugin\com.cursorstreamdeck.bridge.sdPlugin"
set "DEST=%APPDATA%\Elgato\StreamDeck\Plugins\com.cursorstreamdeck.bridge.sdPlugin"
set "PLUGINS_DIR=%APPDATA%\Elgato\StreamDeck\Plugins"

if exist "%SRC%\bin\plugin.js" (
  echo [..] Using prebuilt plugin ^(skip rebuild^)
  goto :copy_plugin
)

if not exist "node_modules\" (
  echo [..] Instaluju zavislosti...
  call %PNPM_CMD% install
  if errorlevel 1 (
    echo [ERROR] pnpm install selhalo.
    if "%SILENT%"=="0" pause
    exit /b 1
  )
)

echo [..] Build pluginu...
call %PNPM_CMD% plugin:build
if errorlevel 1 (
  echo [ERROR] Build pluginu selhal.
  if "%SILENT%"=="0" pause
  exit /b 1
)

:copy_plugin
if not exist "%PLUGINS_DIR%" (
  echo [ERROR] Nenalezena slozka Stream Deck Plugins:
  echo         %PLUGINS_DIR%
  echo         Spust nejdrive Elgato Stream Deck appku.
  if "%SILENT%"=="0" pause
  exit /b 1
)

echo [..] Kopiruju plugin do:
echo      %DEST%
mkdir "%DEST%" 2>nul
robocopy "%SRC%" "%DEST%" /E /IS /IT /NFL /NDL /NJH /NJS /nc /ns /np >nul
set "RC=%ERRORLEVEL%"
if %RC% GEQ 8 (
  echo [ERROR] Kopirovani selhalo kod %RC%. Uplne Quit Stream Deck a zkus znovu.
  if "%SILENT%"=="0" pause
  exit /b 1
)

echo.
echo [OK] CursorDeck plugin nainstalovan.
echo.
echo  DULEZITE:
echo   1. Quit Stream Deck (tray) a znovu otevri
echo   2. Preferences -^> Plugins - zapni CursorDeck pokud je disabled
echo   3. Spust start.bat (CursorDeck ve skrytych ikonach)
echo   4. Wall Auto: poloz 4/9 stejnych klaves do ctverce (i Live Status)
echo   5. Navod: docs\USAGE.md
echo.
if "%SILENT%"=="0" pause
exit /b 0
