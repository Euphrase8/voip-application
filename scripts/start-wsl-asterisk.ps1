param(
    [string]$Distro = "Ubuntu-24.04",
    [switch]$StartBackend
)

$logFile = "$env:TEMP\wsl-asterisk-startup.log"
$backendDir = "C:\Users\Rose Victor\Documents\FINALYEAR\FINAL PROJECT\voip-application\backend"

function Log {
    param([string]$Msg)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp $Msg" | Out-File -FilePath $logFile -Append -Encoding UTF8
    Write-Host "$timestamp $Msg"
}

Log "=== WSL + Asterisk Auto-Start ==="
Log "Distro: $Distro"

# 1. Check if WSL distro is already running
$running = wsl -l --running | Select-String -Pattern "$Distro"
if (-not $running) {
    Log "WSL distro not running. Starting it..."
    wsl -d $Distro -u root -- bash -c "echo 'WSL started at \$(date)'" 2>&1 | ForEach-Object { Log "  $_" }
    Start-Sleep -Seconds 3
} else {
    Log "WSL distro already running"
}

# 2. Start Asterisk
Log "Starting Asterisk..."
$result = wsl -d $Distro -u root -- asterisk 2>&1
if ($LASTEXITCODE -eq 0) {
    Log "Asterisk started successfully"
} else {
    Log "Asterisk start output: $result"
}

# 3. Verify Asterisk is running
Start-Sleep -Seconds 2
$status = wsl -d $Distro -u root -- asterisk -rx "core show version" 2>&1
if ($LASTEXITCODE -eq 0) {
    Log "Asterisk is running: $($status -replace "`n","; ")"
} else {
    Log "WARNING: Asterisk may not be running. Status: $status"
}

# 4. Optionally start the Go backend
if ($StartBackend) {
    Log "Starting backend..."
    $backendProcess = Start-Process -NoNewWindow -FilePath "go" -ArgumentList "run ." -WorkingDirectory $backendDir -PassThru
    Log "Backend started (PID: $($backendProcess.Id))"
}

Log "=== Startup complete ==="
