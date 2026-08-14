@echo off
rem Installs the VOIP local CA into the Windows trust store. Run once per Windows machine.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-ca.ps1" %*
pause
