param(
    [string]$AsteriskHost = "",
    [string]$AmiHost = "127.0.0.1",
    [string]$AmiPort = "5038",
    [string]$AmiUser = "admin",
    [string]$AmiSecret = "",
    [string]$SipDomain = "",
    [string]$SipPort = "8088",
    [string]$PublicHost = "",
    [string]$HostAddr = "0.0.0.0",
    [string]$Port = "8080"
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
Write-Host "  AMI: ${AmiHost}:${AmiPort}"
Write-Host "  Listening: ${HostAddr}:${Port}"

& ".\voip-backend.exe"
