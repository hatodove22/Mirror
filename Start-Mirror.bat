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

start "Mirror API 8004" "%~dp0scripts\start-api.cmd"
start "Mirror Web 5173" "%~dp0scripts\start-web.cmd"

echo Waiting for servers to warm up...
timeout /t 6 /nobreak >nul

start "" "http://127.0.0.1:5173"

echo.
echo Mirror is starting.
echo Frontend: http://127.0.0.1:5173
echo API:      http://127.0.0.1:8004
echo.
echo Close the "Mirror API 8004" and "Mirror Web 5173" windows to stop the app.
timeout /t 3 /nobreak >nul

endlocal
