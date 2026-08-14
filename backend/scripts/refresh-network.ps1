# refresh-network.ps1
#
# Run this after connecting the server machine to a NEW network. It:
#   1. Detects the current IPv4 address (or uses one you pass with -Ip).
#   2. Regenerates the HTTPS server certificate so the new IP is trusted
#      (reuses the existing CA, so clients keep their trust settings).
#   3. Updates backend/.env and .env (frontend) with the new IP.
#   4. Prints the address to open in clients.
#
# Usage:
#   .\refresh-network.ps1                # auto-detect current IP
#   .\refresh-network.ps1 -Ip 10.0.0.50  # use a specific IP
#   .\refresh-network.ps1 -Restart       # also restart the backend

param(
    [string]$Ip = "",
    [switch]$Restart
)

$ErrorActionPreference = 'Stop'

$BackendDir = Split-Path -Parent $PSScriptRoot
$RepoRoot   = Split-Path -Parent $BackendDir
$BackendEnv = Join-Path $BackendDir '.env'
$FrontendEnv = Join-Path $RepoRoot '.env'
$CertsDir   = Join-Path $BackendDir 'certs'
$Gencerts   = Join-Path $BackendDir 'gencerts.exe'

if (-not $Ip) {
    $route = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
        Sort-Object RouteMetric | Select-Object -First 1
    if (-not $route) {
        Write-Host "ERROR: no active network route found." -ForegroundColor Red
        exit 1
    }
    $Ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.ifIndex -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notmatch '^169\.254\.' } |
        Select-Object -First 1).IPAddress
    if (-not $Ip) {
        Write-Host "ERROR: could not determine the current IPv4 address." -ForegroundColor Red
        exit 1
    }
}

if ($Ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
    Write-Host "ERROR: '$Ip' is not a valid IPv4 address." -ForegroundColor Red
    exit 1
}

Write-Host "Using server IP: $Ip"

# --- 1. Regenerate certificates (gencerts auto-detects current IPs too) ---
if (-not (Test-Path $Gencerts)) {
    Write-Host "Building gencerts..." -ForegroundColor Yellow
    Push-Location $BackendDir
    go build -o gencerts.exe ./cmd/gencerts
    Pop-Location
}
& $Gencerts (Join-Path $BackendDir 'certs') $Ip

# --- 2. Update backend/.env ---
$be = Get-Content $BackendEnv
for ($i = 0; $i -lt $be.Count; $i++) {
    if ($be[$i] -match '^ASTERISK_HOST=') { $be[$i] = "ASTERISK_HOST=$Ip" }
    elseif ($be[$i] -match '^SIP_DOMAIN=') { $be[$i] = "SIP_DOMAIN=$Ip" }
    elseif ($be[$i] -match '^PUBLIC_HOST=') { $be[$i] = "PUBLIC_HOST=$Ip" }
    elseif ($be[$i] -match '^CORS_ORIGINS=') {
        $be[$i] = $be[$i] -replace '\d{1,3}(\.\d{1,3}){3}', $Ip
    }
}
Set-Content -Path $BackendEnv -Value $be
Write-Host "Updated $BackendEnv"

# --- 3. Update frontend .env ---
$fe = Get-Content $FrontendEnv
for ($i = 0; $i -lt $fe.Count; $i++) {
    if ($fe[$i] -match '^REACT_APP_API_URL=') { $fe[$i] = "REACT_APP_API_URL=https://$Ip" }
    elseif ($fe[$i] -match '^REACT_APP_SIP_SERVER=') { $fe[$i] = "REACT_APP_SIP_SERVER=$Ip" }
    elseif ($fe[$i] -match '^REACT_APP_SIP_WS_URL=') { $fe[$i] = "REACT_APP_SIP_WS_URL=ws://$Ip:8088/ws" }
    elseif ($fe[$i] -match '^REACT_APP_CLIENT_IP=') { $fe[$i] = "REACT_APP_CLIENT_IP=$Ip" }
}
Set-Content -Path $FrontendEnv -Value $fe
Write-Host "Updated $FrontendEnv"

# --- 4. Restart the backend (optional) ---
if ($Restart) {
    $proc = Get-Process -Name voip-backend -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "Stopping running backend..."
        Stop-Process -Id $proc.Id -Force
        Start-Sleep 2
    }
    Write-Host "Starting backend..."
    Start-Process -FilePath (Join-Path $BackendDir 'voip-backend.exe') -WorkingDirectory $BackendDir -WindowStyle Hidden
}

Write-Host ""
Write-Host "Done. Open the app from clients at:" -ForegroundColor Green
Write-Host "  https://$Ip" -ForegroundColor Cyan
Write-Host ""
Write-Host "Clients only need to trust the CA once (backend/certs/ca.crt)."
Write-Host "NOTE: if the frontend build is stale, rebuild it with 'npm run build'."
