# Asterisk Configuration for VoIP Application

This guide provides complete instructions for configuring Asterisk on your Kali Linux server (172.20.10.5) to work with your VoIP application.

## ✅ Current Status (Updated: July 4, 2025)

**🎉 CONFIGURATION COMPLETE AND WORKING!**

- ✅ **Backend Connection**: Connected successfully
- ✅ **Asterisk Server**: Reachable at 172.20.10.5
- ✅ **AMI Authentication**: Working (admin user configured)
- ✅ **HTTP Service**: Running on port 8088
- ✅ **WebSocket Service**: Available at `/asterisk/ws`
- ✅ **PJSIP Transports**: WebRTC configured for extensions 1000-1005
- ✅ **Extensions**: Ready for use with passwords

**Ready for VoIP calling!** You can now:
- Register extensions 1000-1005 in your VoIP application
- Make calls between extensions
- Test with echo (*43), speaking clock (*60), music on hold (*61)

## 🚀 Quick Setup (Recommended)

### Option 1: Automated Setup Script

1. **Copy the configuration files to your Asterisk server:**
   ```bash
   # On your Kali Linux server (172.20.10.5)
   cd /tmp
   # Copy the asterisk-config folder from your Windows machine to the server
   ```

2. **Run the automated setup script:**
   ```bash
   sudo chmod +x setup-asterisk.sh
   sudo ./setup-asterisk.sh
   ```

3. **Test the configuration** using the VoIP application's "Test Connections" button.

### Option 2: Manual Configuration

If you prefer to configure manually, follow these steps:

## 📋 Manual Configuration Steps

### 1. Install Asterisk (if not already installed)

```bash
sudo apt update
sudo apt install asterisk asterisk-modules asterisk-config
```

### 2. Backup Existing Configuration

```bash
sudo mkdir -p /etc/asterisk/backup-$(date +%Y%m%d)
sudo cp /etc/asterisk/*.conf /etc/asterisk/backup-$(date +%Y%m%d)/
```

### 3. Configure HTTP Interface

Edit `/etc/asterisk/http.conf`:

```ini
[general]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
sessiontimeout=10000
enablestatic=yes
sessionlimit=100
websocket_enabled=yes
```

### 4. Configure PJSIP (WebRTC Support)

Edit `/etc/asterisk/pjsip.conf`:

```ini
; WebSocket transport for browser connections
[transport-ws]
type=transport
protocol=ws
bind=0.0.0.0:8088
local_net=172.20.10.0/24
external_media_address=172.20.10.5
external_signaling_address=172.20.10.5

; UDP transport for traditional SIP
[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060
local_net=172.20.10.0/24
external_media_address=172.20.10.5
external_signaling_address=172.20.10.5

; WebRTC endpoint template
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

; Authentication template
[webrtc_auth](!)
type=auth
auth_type=userpass

; AOR template
[webrtc_aor](!)
type=aor
max_contacts=5
remove_existing=yes

; Example extensions (1000-1005)
[1000](webrtc_endpoint)
auth=1000
aors=1000

[1000](webrtc_auth)
password=password1000
username=1000

[1000](webrtc_aor)

; Repeat for extensions 1001-1005...
```

### 5. Configure Manager Interface (AMI)

Edit `/etc/asterisk/manager.conf`:

```ini
[general]
enabled = yes
port = 5038
bindaddr = 0.0.0.0
displayconnects = yes
timestampevents = yes
webenabled = yes
allowmultiplelogin = yes

[admin]
secret = amp111
read = all
write = all
permit = 172.20.10.0/24
permit = 127.0.0.1/32
```

### 6. Configure Dialplan

Edit `/etc/asterisk/extensions.conf`:

```ini
[general]
static=yes
writeprotect=no

[default]
; Internal extension calls
exten => _1XXX,1,NoOp(Call to extension ${EXTEN})
exten => _1XXX,n,Set(CALLERID(name)=Extension ${CALLERID(num)})
exten => _1XXX,n,Dial(PJSIP/${EXTEN},30,rtT)
exten => _1XXX,n,Hangup()

; Echo test
exten => *43,1,Answer()
exten => *43,n,Echo()
exten => *43,n,Hangup()
```

### 7. Set Permissions and Restart

```bash
sudo chown asterisk:asterisk /etc/asterisk/*.conf
sudo chmod 640 /etc/asterisk/*.conf
sudo systemctl restart asterisk
sudo systemctl enable asterisk
```

### 8. Configure Firewall

```bash
sudo ufw allow 5038/tcp comment "Asterisk AMI"
sudo ufw allow 8088/tcp comment "Asterisk HTTP"
sudo ufw allow 5060/udp comment "Asterisk SIP"
sudo ufw allow 10000:20000/udp comment "Asterisk RTP"
```

## 🔧 Testing Your Configuration

### 1. Check Asterisk Status

```bash
sudo systemctl status asterisk
sudo asterisk -rx "core show version"
```

### 2. Test Ports

```bash
# Test AMI port
nc -z localhost 5038 && echo "AMI OK" || echo "AMI Failed"

# Test HTTP port
nc -z localhost 8088 && echo "HTTP OK" || echo "HTTP Failed"
```

### 3. Test from VoIP Application

1. Open your VoIP application at `http://localhost:3000`
2. Enter the IP configuration:
   - **Backend Host**: 192.168.1.2
   - **Backend Port**: 8080
   - **Asterisk Host**: 172.20.10.5
   - **Asterisk SIP Port**: 8088
   - **Asterisk AMI Port**: 5038
3. Click "Test Connections"
4. You should see green checkmarks for successful connections

## 📞 Test Extensions

The configuration includes these test extensions:

| Extension | Password | Description |
|-----------|----------|-------------|
| 1000 | password1000 | Test User 1 |
| 1001 | password1001 | Test User 2 |
| 1002 | password1002 | Test User 3 |
| 1003 | password1003 | Test User 4 |
| 1004 | password1004 | Test User 5 |
| 1005 | password1005 | Test User 6 |

## 🔍 Troubleshooting

### Common Issues

1. **"Failed to fetch" errors**: Check firewall settings and ensure Asterisk is running
2. **WebSocket connection failed**: Verify HTTP interface is enabled and port 8088 is open
3. **AMI connection failed**: Check manager.conf configuration and port 5038

### Useful Commands

```bash
# Check Asterisk logs
sudo tail -f /var/log/asterisk/messages

# Restart Asterisk
sudo systemctl restart asterisk

# Check listening ports
sudo netstat -tlnp | grep asterisk

# Connect to Asterisk CLI
sudo asterisk -r
```

### Asterisk CLI Commands

```
# Show PJSIP endpoints
pjsip show endpoints

# Show transports
pjsip show transports

# Show manager users
manager show users

# Reload configuration
core reload
```

## 🎯 Next Steps

Once Asterisk is configured and tests pass:

1. Save the IP configuration in your VoIP application
2. Proceed to login and user management
3. Register extensions and start making calls
4. Monitor call logs and manage users through the admin dashboard

## 📞 Support

If you encounter issues:

1. Check the Asterisk logs: `/var/log/asterisk/messages`
2. Verify network connectivity between servers
3. Ensure all required ports are open
4. Test individual components (AMI, HTTP, WebSocket) separately

Your VoIP application should now work seamlessly with the properly configured Asterisk server!
