@echo off
rem Refresh certs + env for the current network IP. Double-click after switching networks.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0refresh-network.ps1" %*
pause
