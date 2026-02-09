# Asterisk Configuration Guide for VoIP Application

This guide provides step-by-step instructions for configuring Asterisk on Kali Linux (172.20.10.5) to work with your VoIP application running on 192.168.1.2.

## 📋 Prerequisites

- Kali Linux server at 172.20.10.5
- SSH access with credentials: `kali@172.20.10.5` (password: `kali`)
- VoIP application running on 192.168.1.2:3000
- Backend server running on 192.168.1.2:8080

## 🚀 Quick Setup Commands

### Step 1: Connect to Kali Server

```bash
ssh kali@172.20.10.5
# Password: kali
```

### Step 2: Create Backup and Setup Directory

```bash
sudo mkdir -p /etc/asterisk/backup-$(date +%Y%m%d-%H%M%S)
sudo cp /etc/asterisk/*.conf /etc/asterisk/backup-$(date +%Y%m%d-%H%M%S)/ 2>/dev/null || true
mkdir -p /tmp/asterisk-config
cd /tmp/asterisk-config
```

### Step 3: Create HTTP Configuration

```bash
sudo tee http.conf > /dev/null << 'EOF'
;
; Asterisk HTTP Configuration for VoIP Application
;

[general]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
sessiontimeout=10000
enablestatic=yes
sessionlimit=100
prefix=asterisk
websocket_enabled=yes
EOF
```

### Step 4: Create PJSIP Configuration

```bash
sudo tee pjsip.conf > /dev/null << 'EOF'
;
; Asterisk PJSIP Configuration for VoIP Application
;

;==========================
; TRANSPORT CONFIGURATION
;==========================

[transport-ws]
type=transport
protocol=ws
bind=0.0.0.0:8088
local_net=172.20.10.0/24
external_media_address=172.20.10.5
external_signaling_address=172.20.10.5

[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060
local_net=172.20.10.0/24
external_media_address=172.20.10.5
external_signaling_address=172.20.10.5

;==========================
; ENDPOINT TEMPLATES
;==========================

[webrtc_endpoint](!)
type=endpoint
context=default
disallow=all
allow=opus,ulaw,alaw,g722
webrtc=yes
use_ptime=yes
media_encryption=no
rtcp_mux=yes
ice_support=yes
media_use_received_transport=yes
transport=transport-ws

[webrtc_auth](!)
type=auth
auth_type=userpass

[webrtc_aor](!)
type=aor
max_contacts=5
remove_existing=yes

;==========================
; USER EXTENSIONS
;==========================

[1000](webrtc_endpoint)
auth=1000
aors=1000

[1000](webrtc_auth)
password=password1000
username=1000

[1000](webrtc_aor)

[1001](webrtc_endpoint)
auth=1001
aors=1001

[1001](webrtc_auth)
password=password1001
username=1001

[1001](webrtc_aor)

[1002](webrtc_endpoint)
auth=1002
aors=1002

[1002](webrtc_auth)
password=password1002
username=1002

[1002](webrtc_aor)

[1003](webrtc_endpoint)
auth=1003
aors=1003

[1003](webrtc_auth)
password=password1003
username=1003

[1003](webrtc_aor)

[1004](webrtc_endpoint)
auth=1004
aors=1004

[1004](webrtc_auth)
password=password1004
username=1004

[1004](webrtc_aor)

[1005](webrtc_endpoint)
auth=1005
aors=1005

[1005](webrtc_auth)
password=password1005
username=1005

[1005](webrtc_aor)

;==========================
; GLOBAL SETTINGS
;==========================

[global]
type=global
max_forwards=70
user_agent=Asterisk VoIP Server

[system]
type=system
timer_t1=500
timer_b=32000
compact_headers=no
EOF
```

### Step 5: Create Manager Configuration

```bash
sudo tee manager.conf > /dev/null << 'EOF'
;
; Asterisk Manager Interface (AMI) Configuration
;

[general]
enabled = yes
port = 5038
bindaddr = 0.0.0.0
displayconnects = yes
timestampevents = yes
webenabled = yes
allowmultiplelogin = yes
block-sockets = no
debug = 0
maxsessions = 100

;==========================
; MANAGER USERS
;==========================

[admin]
secret = amp111
read = all
write = all
permit = 172.20.10.0/24
permit = 127.0.0.1/32
permit = localhost

[monitor]
secret = monitor123
read = system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan
write = system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan
permit = 172.20.10.0/24
EOF
```

### Step 6: Create Extensions Configuration

```bash
sudo tee extensions.conf > /dev/null << 'EOF'
;
; Asterisk Dialplan Configuration for VoIP Application
;

[general]
static=yes
writeprotect=no
clearglobalvars=no

;==========================
; DEFAULT CONTEXT
;==========================

[default]
; Extension pattern for 4-digit extensions (1000-1999)
exten => _1XXX,1,NoOp(Call to extension ${EXTEN})
exten => _1XXX,n,Set(CALLERID(name)=Extension ${CALLERID(num)})
exten => _1XXX,n,Dial(PJSIP/${EXTEN},30,rtT)
exten => _1XXX,n,Hangup()

; Echo test (dial *43)
exten => *43,1,NoOp(Echo test)
exten => *43,n,Answer()
exten => *43,n,Wait(1)
exten => *43,n,Playback(demo-echotest)
exten => *43,n,Echo()
exten => *43,n,Hangup()

; Speaking clock (dial *60)
exten => *60,1,NoOp(Speaking clock)
exten => *60,n,Answer()
exten => *60,n,Wait(1)
exten => *60,n,SayUnixTime()
exten => *60,n,Hangup()

; Music on hold test (dial *61)
exten => *61,1,NoOp(Music on hold test)
exten => *61,n,Answer()
exten => *61,n,Wait(1)
exten => *61,n,MusicOnHold()

;==========================
; ERROR HANDLING
;==========================

; Handle invalid extensions
exten => i,1,NoOp(Invalid extension dialed)
exten => i,n,Playback(pbx-invalid)
exten => i,n,Hangup()

exten => t,1,NoOp(Call timeout)
exten => t,n,Hangup()

exten => h,1,NoOp(Call hangup)
exten => h,n,Return()
EOF
```

### Step 7: Install Configuration Files

```bash
sudo cp *.conf /etc/asterisk/
sudo chown root:root /etc/asterisk/*.conf
sudo chmod 644 /etc/asterisk/*.conf
```

### Step 8: Configure Firewall

```bash
sudo ufw allow 5038/tcp comment "Asterisk AMI"
sudo ufw allow 8088/tcp comment "Asterisk HTTP"
sudo ufw allow 5060/udp comment "Asterisk SIP"
sudo ufw allow 10000:20000/udp comment "Asterisk RTP"
```

### Step 9: Start Asterisk Service

```bash
sudo systemctl enable asterisk
sudo systemctl restart asterisk
sleep 5
sudo systemctl status asterisk --no-pager -l
```

### Step 10: Test Configuration

```bash
# Test ports
nc -z localhost 5038 && echo "✅ AMI port 5038 is accessible" || echo "❌ AMI port 5038 failed"
nc -z localhost 8088 && echo "✅ HTTP port 8088 is accessible" || echo "❌ HTTP port 8088 failed"
nc -z localhost 5060 && echo "✅ SIP port 5060 is accessible" || echo "❌ SIP port 5060 failed"

# Check Asterisk configuration
sudo asterisk -rx "core show version"
sudo asterisk -rx "pjsip show transports"
sudo asterisk -rx "pjsip show endpoints"
```

### Step 11: Cleanup

```bash
cd ~
rm -rf /tmp/asterisk-config
echo "Asterisk configuration completed successfully!"
```

## 📞 Test Extensions

The configuration includes these pre-configured extensions:

| Extension | Password | Description |
|-----------|----------|-------------|
| 1000 | password1000 | Test User 1 |
| 1001 | password1001 | Test User 2 |
| 1002 | password1002 | Test User 3 |
| 1003 | password1003 | Test User 4 |
| 1004 | password1004 | Test User 5 |
| 1005 | password1005 | Test User 6 |

## 🔧 VoIP Application Configuration

After completing the Asterisk setup, configure your VoIP application with these settings:

### IP Configuration Settings:
- **Backend Host:** `192.168.1.2`
- **Backend Port:** `8080`
- **Asterisk Host:** `172.20.10.5`
- **Asterisk SIP Port:** `8088`
- **Asterisk AMI Port:** `5038`

### AMI Credentials:
- **Username:** `admin`
- **Password:** `amp111`

## 🔍 Troubleshooting

### Common Issues and Solutions

#### 1. Port Connection Issues
```bash
# Check if ports are listening
sudo netstat -tlnp | grep asterisk

# Check firewall status
sudo ufw status

# Restart Asterisk if needed
sudo systemctl restart asterisk
```

#### 2. Configuration Errors
```bash
# Check Asterisk logs
sudo tail -f /var/log/asterisk/messages

# Test configuration syntax
sudo asterisk -rx "core reload"
```

#### 3. Extension Registration Issues
```bash
# Check endpoint status
sudo asterisk -rx "pjsip show endpoints"

# Check transport status
sudo asterisk -rx "pjsip show transports"

# Check authentication
sudo asterisk -rx "pjsip show auths"
```

### Useful Asterisk CLI Commands

```bash
# Connect to Asterisk CLI
sudo asterisk -r

# Inside Asterisk CLI:
core show version              # Show Asterisk version
pjsip show endpoints          # Show all SIP endpoints
pjsip show transports         # Show transport configurations
manager show users            # Show AMI users
core reload                   # Reload configuration
core restart now              # Restart Asterisk
```

## 🎯 Expected Results

After successful configuration, you should see:

### Port Tests:
- ✅ AMI port 5038 is accessible
- ✅ HTTP port 8088 is accessible
- ✅ SIP port 5060 is accessible (may show as failed, this is normal)

### Asterisk Status:
- Asterisk version 20.x running
- 2 transports configured (UDP and WebSocket)
- 6 endpoints configured (1000-1005)
- All endpoints showing as "Unavailable" (normal until devices register)

### VoIP Application:
- Backend connection test: ✅ Success
- Asterisk connection test: ✅ Success or ⚠️ Warning (both are acceptable)
- Ability to save configuration and proceed to login

## 📝 Configuration Files Summary

The setup creates/modifies these Asterisk configuration files:

1. **`/etc/asterisk/http.conf`** - Enables HTTP interface and WebSocket support
2. **`/etc/asterisk/pjsip.conf`** - Configures SIP endpoints and transports
3. **`/etc/asterisk/manager.conf`** - Sets up AMI interface for backend communication
4. **`/etc/asterisk/extensions.conf`** - Defines dialplan for call routing

## 🔒 Security Notes

- AMI access is restricted to the 172.20.10.0/24 network
- Firewall rules are configured for necessary ports only
- Configuration files have appropriate permissions
- Default passwords should be changed in production environments

## 🎉 Success Indicators

Your Asterisk server is properly configured when:

1. ✅ All configuration files are created and installed
2. ✅ Asterisk service is running without critical errors
3. ✅ Required ports (5038, 8088) are accessible
4. ✅ VoIP application can connect and test successfully
5. ✅ Extensions are configured and ready for registration

## 📞 Next Steps

1. **Test VoIP Application Connection** - Use the IP configuration page
2. **Register Extensions** - Create users in your VoIP application
3. **Make Test Calls** - Try calling between extensions
4. **Monitor Call Logs** - Check the admin dashboard for call activity
5. **Customize Extensions** - Add more users as needed

Your Asterisk server is now ready for production use with your VoIP application!
```
