@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or newer from https://nodejs.org then run this file again.
  pause
  exit /b 1
)
echo Opening Doodle Tick Keeper...
start "" "http://127.0.0.1:4317"
node server.mjs
pause
