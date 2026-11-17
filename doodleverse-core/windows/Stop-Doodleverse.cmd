@echo off
setlocal
cd /d "%~dp0"
"%~dp0runtime\node.exe" "%~dp0launcher.mjs" --stop
if errorlevel 1 pause
