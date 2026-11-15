@echo off
cd /d "%~dp0"
echo Doodleverse uses a private Tailscale network.
echo Install Tailscale, sign in, and invite your friends into the same network.
echo Then run Start Keeper.cmd on each computer.
start "" "https://tailscale.com/download/windows"
start "" notepad.exe "%~dp0PRIVATE-NETWORK.md"
