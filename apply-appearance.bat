@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title CursorDeck - Apply appearance art

echo.
echo  ========================================
echo   Apply appearance.json -^> key art
echo  ========================================
echo.
echo  Source: %USERPROFILE%\.cursor-streamdeck\appearance.json
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js neni v PATH.
  pause
  exit /b 1
)

set "PNPM_CMD=pnpm"
where pnpm >nul 2>&1
if errorlevel 1 set "PNPM_CMD=npx --yes pnpm@9.15.0"

echo [..] Regeneruji ikony...
call %PNPM_CMD% --filter @csd/streamdeck-plugin icons
if errorlevel 1 (
  echo [ERROR] Generovani ikon selhalo. Zkus: pnpm install
  pause
  exit /b 1
)

echo [..] Instaluju plugin do Stream Deck...
call "%~dp0install-plugin.bat"
if errorlevel 1 (
  echo [ERROR] install-plugin selhal.
  pause
  exit /b 1
)

echo.
echo [OK] Art aplikovan.
echo  Ted: Quit Stream Deck (tray) a znovu otevri.
echo.
pause
exit /b 0
