@echo off
title Website to APK Builder
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or not in PATH.
  pause
  exit /b 1
)
echo Starting Website to APK Builder at http://localhost:3000 ...
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"
node server.js
pause
