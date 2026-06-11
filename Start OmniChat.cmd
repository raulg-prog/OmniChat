@echo off
REM ===== OmniChat one-click launcher (Windows) =====
cd /d "%~dp0"
title OmniChat

where pnpm >nul 2>&1
if errorlevel 1 (
  echo.
  echo   pnpm was not found.
  echo   1^) Install Node.js LTS from the page that just opened
  echo   2^) Then run once:  npm install -g pnpm
  echo   3^) Double-click this file again.
  echo.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

REM Free port 8787 if a previous run is still holding it
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8787 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

if not exist node_modules (
  echo Installing dependencies ^(first run only, ~1 min^)...
  call pnpm install
)

REM Open the browser a few seconds after the server starts
start "" cmd /c "timeout /t 9 >nul & start "" http://localhost:8787"

echo.
echo   OmniChat is starting. Keep this window open while you use it.
echo   Landing: http://localhost:8787   Tool: /panel   Viewer: /live
echo   (Press Ctrl+C here to stop.)
echo.
call pnpm start
pause
