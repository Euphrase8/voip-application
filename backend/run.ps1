param(
    [string]$AsteriskHost = "172.30.163.165",
    [string]$AmiPort = "5038",
    [string]$AmiUser = "admin",
    [string]$AmiSecret = "",
    [string]$SipDomain = "172.30.163.165",
    [string]$SipPort = "8088",
    [string]$PublicHost = "172.30.163.165",
    [string]$HostAddr = "0.0.0.0",
    [string]$Port = "8080"
)

$env:ASTERISK_HOST=$AsteriskHost
$env:ASTERISK_AMI_PORT=$AmiPort
$env:ASTERISK_AMI_USERNAME=$AmiUser
$env:ASTERISK_AMI_SECRET=$AmiSecret
$env:SIP_DOMAIN=$SipDomain
$env:SIP_PORT=$SipPort
$env:PUBLIC_HOST=$PublicHost
$env:HOST=$HostAddr
$env:PORT=$Port

Write-Host "Starting VoIP backend..."
Write-Host "  Asterisk: ${AsteriskHost}:${AmiPort}"
Write-Host "  SIP Domain: ${SipDomain}:${SipPort}"
Write-Host "  Listening: ${HostAddr}:${Port}"

& ".\voip-backend.exe"
