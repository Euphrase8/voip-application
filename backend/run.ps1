param(
    [string]$AsteriskHost = "",
    [string]$AmiHost = "",
    [string]$AmiPort = "",
    [string]$AmiUser = "",
    [string]$AmiSecret = "",
    [string]$SipDomain = "",
    [string]$SipPort = "",
    [string]$PublicHost = "",
    [string]$HostAddr = "",
    [string]$Port = ""
)

# Only override the .env values when explicitly passed on the command line.
# Empty defaults keep the addresses from backend/.env (or backend auto-detection),
# so this launcher works on any network without hardcoding an IP.
if ($AsteriskHost) { $env:ASTERISK_HOST = $AsteriskHost }
if ($AmiHost)      { $env:ASTERISK_AMI_HOST = $AmiHost }
if ($AmiPort)      { $env:ASTERISK_AMI_PORT = $AmiPort }
if ($AmiUser)      { $env:ASTERISK_AMI_USERNAME = $AmiUser }
if ($AmiSecret)    { $env:ASTERISK_AMI_SECRET = $AmiSecret }
if ($SipDomain)    { $env:SIP_DOMAIN = $SipDomain }
if ($SipPort)      { $env:SIP_PORT = $SipPort }
if ($PublicHost)   { $env:PUBLIC_HOST = $PublicHost }
if ($HostAddr)     { $env:HOST = $HostAddr }
if ($Port)         { $env:PORT = $Port }

Write-Host "Starting VoIP backend..."
Write-Host "  AMI: $($env:ASTERISK_AMI_HOST):$($env:ASTERISK_AMI_PORT)"
Write-Host "  Listening: $($env:HOST):$($env:PORT)"

& ".\voip-backend.exe"
