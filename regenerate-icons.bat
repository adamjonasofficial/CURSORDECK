@echo off
setlocal
cd /d "%~dp0"

echo.
echo  CursorDeck - regenerate Stream Deck key art from appearance.json
echo  Source: %USERPROFILE%\.cursor-streamdeck\appearance.json
echo.

set "PNPM_CMD=pnpm"
where pnpm >nul 2>&1
if errorlevel 1 set "PNPM_CMD=npx --yes pnpm@9.15.0"

call %PNPM_CMD% --filter @csd/streamdeck-plugin icons
if errorlevel 1 (
  echo ERROR: icon generation failed.
  exit /b 1
)

echo.
echo Art regenerated. Reinstall plugin:
echo   install-plugin.bat
echo or one-shot:
echo   apply-appearance.bat
echo Then Quit Stream Deck app and reopen.
echo.
exit /b 0
