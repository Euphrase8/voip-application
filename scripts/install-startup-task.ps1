param(
    [string]$Distro = "Ubuntu-24.04",
    [switch]$Uninstall
)

$taskName = "StartWslAsterisk"
$scriptPath = Join-Path $PSScriptRoot "start-wsl-asterisk.ps1"

if ($Uninstall) {
    Write-Host "Removing scheduled task '$taskName'..."
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Task removed."
    return
}

# Build the arguments for the PowerShell script
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -Distro $Distro"

# Create the scheduled task action
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments

# Trigger: at system startup (runs for all users)
$trigger = New-ScheduledTaskTrigger -AtStartup

# Run as the current user with highest privileges
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -RunLevel Highest

# Settings: allow task to run if missed, retry on failure
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Write-Host "Registering scheduled task '$taskName'..."
Write-Host "  Script: $scriptPath"
Write-Host "  Distro: $Distro"
Write-Host "  Runs at: Windows startup"

try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
    Write-Host "Task registered successfully!"
    Write-Host ""
    Write-Host "To verify: Get-ScheduledTask -TaskName '$taskName' | Format-List"
    Write-Host "To remove: .\install-startup-task.ps1 -Uninstall"
} catch {
    Write-Host "Failed to register task: $_"
    Write-Host ""
    Write-Host "Try running PowerShell as Administrator and retry."
}
