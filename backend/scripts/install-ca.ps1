# install-ca.ps1
#
# Installs the VOIP local CA (backend/certs/ca.crt) into the Windows trust
# store so browsers stop showing ERR_CERT_AUTHORITY_INVALID for https://<ip>.
#
# Run this once on every Windows machine (server + client PCs).
# After installing, fully close and reopen the browser (including background
# processes) before opening the app.

param(
    [string]$CaPath = ""
)

$ErrorActionPreference = 'Stop'

if (-not $CaPath) {
    $BackendDir = Split-Path -Parent $PSScriptRoot
    $CaPath = Join-Path $BackendDir 'certs\ca.crt'
}

if (-not (Test-Path $CaPath)) {
    Write-Host "ERROR: CA file not found: $CaPath" -ForegroundColor Red
    exit 1
}

$ca = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CaPath)
Write-Host "Installing CA: $($ca.Subject)"

# CurrentUser store (no admin needed)
$userStore = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'CurrentUser')
$userStore.Open('ReadWrite')
$userStore.Add($ca)
$userStore.Close()
Write-Host "  CurrentUser\Root: installed" -ForegroundColor Green

# LocalMachine store (covers all users + services; needs admin)
try {
    $machineStore = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'LocalMachine')
    $machineStore.Open('ReadWrite')
    $machineStore.Add($ca)
    $machineStore.Close()
    Write-Host "  LocalMachine\Root: installed" -ForegroundColor Green
} catch {
    Write-Host "  LocalMachine\Root: skipped (run as Administrator to install for all users)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. Fully close the browser (also from the taskbar/background) and reopen it."
Write-Host "Then open: https://<server-ip>"
