@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

title CursorDeck - Verify

echo.
echo  ========================================
echo   CursorDeck - Verify
echo  ========================================
echo.

set "FAIL=0"

echo [1] Bridge health...
powershell -NoProfile -Command "try { $h = Invoke-RestMethod http://127.0.0.1:3847/health -TimeoutSec 2; if ($h.ok) { Write-Host '  OK port' $h.port 'cursor=' $h.cursorWindowFound 'keys=' $h.keybindingsInstalled; exit 0 } else { Write-Host '  FAIL ok=false'; exit 1 } } catch { Write-Host '  FAIL bridge nedostupny - spust start.bat -tray- nebo Start CursorDeck.vbs'; exit 1 }"
if errorlevel 1 set "FAIL=1"

echo [2] Plugin files...
set "DEST=%APPDATA%\Elgato\StreamDeck\Plugins\com.cursorstreamdeck.bridge.sdPlugin"
if exist "%DEST%\bin\plugin.js" (
  echo   OK plugin.js
) else (
  echo   FAIL chybi plugin - spust install-plugin.bat
  set "FAIL=1"
)
if exist "%DEST%\imgs\actions\agent.png" (
  echo   OK ikony
) else (
  echo   FAIL chybi ikony
  set "FAIL=1"
)
if exist "%DEST%\imgs\spinner\frame-00.png" (
  echo   OK spinner
) else (
  echo   FAIL chybi spinner
  set "FAIL=1"
)

echo [3] Plugin log - posledni radky...
if exist "%DEST%\logs\plugin.log" (
  powershell -NoProfile -Command "Get-Content '%DEST%\logs\plugin.log' -Tail 8"
) else (
  echo   zatim zadny log - po restartu Stream Decku se vytvori
)

echo.
if "!FAIL!"=="0" (
  echo [OK] Zakladni kontroly prosly.
  echo      1. Quit Stream Deck a znovu otevri
  echo      2. Preferences - Plugins - zapni CursorDeck pokud je disabled
  echo      3. Spust start.bat - ikona CursorDeck ve skrytych ikonach
  echo      4. Stiskni Focus / Agent na Stream Decku
) else (
  echo [FAIL] Neco chybi - oprav podle zprav vyse.
)
echo.
pause
