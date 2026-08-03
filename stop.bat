@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "SILENT=0"
if /I "%~1"=="/silent" set "SILENT=1"
if /I "%CURSORDECK_SILENT%"=="1" set "SILENT=1"

title CursorDeck - Stop

echo Stopping CursorDeck (tray + bridge)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-tray.ps1"
echo.
if "%SILENT%"=="0" pause
exit /b 0
