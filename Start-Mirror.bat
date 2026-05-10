@echo off
setlocal

cd /d "%~dp0"

echo Starting Mirror...
echo.

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [Mirror] npm.cmd was not found. Please install Node.js or open a shell where Node.js is available.
  pause
  exit /b 1
)

where py >nul 2>nul
if errorlevel 1 (
  echo [Mirror] Python launcher py.exe was not found. Please install Python or add it to PATH.
  pause
  exit /b 1
)

start "Mirror TTS 5000" "%~dp0scripts\start-style-bert-vits2.cmd"
start "Mirror API 8004" "%~dp0scripts\start-api.cmd"
start "Mirror Web 5173" "%~dp0scripts\start-web.cmd"

echo Waiting for the Ota TTS model to warm up...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\wait-style-bert-vits2.ps1" -TimeoutSeconds 45

start "" "http://127.0.0.1:5173"

echo.
echo Mirror is starting.
echo Frontend: http://127.0.0.1:5173
echo API:      http://127.0.0.1:8004
echo TTS:      http://127.0.0.1:5000 ^(Style-Bert-VITS2 / Ota^)
echo.
echo Close the "Mirror TTS 5000", "Mirror API 8004", and "Mirror Web 5173" windows to stop the app.
timeout /t 3 /nobreak >nul

endlocal
