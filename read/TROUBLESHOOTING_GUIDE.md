# VoIP Endpoint Registration Troubleshooting Guide

## Current Issue
You're experiencing "Could not create dialog to invalid URI" errors for extensions 1001 and 1004, which indicates these endpoints are not properly registered with Asterisk.

## Step-by-Step Diagnosis

### 1. Check Backend Diagnostics
First, let's check if your backend can communicate with Asterisk:

```bash
# Make sure your backend is running
cd backend
make dev

# In another terminal, test the diagnostic endpoint
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://192.168.1.2:8080/protected/diagnostics
```

### 2. Check Asterisk Server Status
On your Kali Linux server (172.20.10.5):

```bash
# Check if Asterisk is running
sudo systemctl status asterisk

# Check if AMI is accessible
sudo asterisk -rx "manager show connected"

# Check WebSocket transport
sudo asterisk -rx "pjsip show transports"

# Check if endpoints are configured
sudo asterisk -rx "pjsip show endpoints"

# Check if any contacts are registered
sudo asterisk -rx "pjsip show contacts"
```

### 3. Verify Asterisk Configuration Files

#### Check `/etc/asterisk/pjsip.conf`:
```bash
sudo cat /etc/asterisk/pjsip.conf | grep -A 20 "transport-ws"
sudo cat /etc/asterisk/pjsip.conf | grep -A 15 "1001"
sudo cat /etc/asterisk/pjsip.conf | grep -A 15 "1004"
```

#### Check `/etc/asterisk/http.conf`:
```bash
sudo cat /etc/asterisk/http.conf | grep -E "(enabled|bindaddr|bindport)"
```

#### Check `/etc/asterisk/manager.conf`:
```bash
sudo cat /etc/asterisk/manager.conf | grep -A 10 "admin"
```

### 4. Network Connectivity Tests

```bash
# From your PC (192.168.1.2), test connectivity to Asterisk
telnet 172.20.10.5 5038  # AMI port
telnet 172.20.10.5 8088  # WebSocket port

# Check if WebSocket endpoint is responding
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: test" http://172.20.10.5:8088/ws
```

### 5. Frontend SIP Registration Test

Open browser console and check for:
```javascript
// Should see successful registration
[SipManager] SIP registration successful

// Should NOT see these errors:
[SipManager] SIP registration failed: Unauthorized
[SipManager] SIP registration failed: Connection failed
```

## Common Issues and Solutions

### Issue 1: Endpoints Not Configured in Asterisk
**Symptoms**: `pjsip show endpoints` shows no endpoints or missing 1001/1004

**Solution**: Add endpoint configuration to `/etc/asterisk/pjsip.conf`:
```ini
[transport-ws]
type=transport
protocol=ws
bind=0.0.0.0:8088

[1001]
type=endpoint
context=default
disallow=all
allow=ulaw,alaw
transport=transport-ws
auth=1001
aors=1001

[1001]
type=auth
auth_type=userpass
password=password1001
username=1001

[1001]
type=aor
max_contacts=5

[1004]
type=endpoint
context=default
disallow=all
allow=ulaw,alaw
transport=transport-ws
auth=1004
aors=1004

[1004]
type=auth
auth_type=userpass
password=password1004
username=1004

[1004]
type=aor
max_contacts=5
```

Then reload: `sudo asterisk -rx "module reload res_pjsip.so"`

### Issue 2: WebSocket Transport Not Working
**Symptoms**: Frontend can't register, WebSocket connection fails

**Solution**: 
1. Check `/etc/asterisk/http.conf`:
```ini
[general]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
```

2. Restart Asterisk: `sudo systemctl restart asterisk`

### Issue 3: AMI Connection Issues
**Symptoms**: Backend shows "AMI client not available"

**Solution**: Check `/etc/asterisk/manager.conf`:
```ini
[general]
enabled = yes
port = 5038
bindaddr = 0.0.0.0

[admin]
secret = amp111
read = all
write = all
```

Then reload: `sudo asterisk -rx "module reload manager"`

### Issue 4: Firewall Blocking Connections
**Symptoms**: Connection timeouts from 192.168.1.2 to 172.20.10.5

**Solution**: On Kali Linux server:
```bash
# Allow AMI port
sudo ufw allow 5038

# Allow WebSocket port  
sudo ufw allow 8088

# Or disable firewall temporarily for testing
sudo ufw disable
```

## Quick Fix Commands

If you need to quickly restart everything:

```bash
# On Asterisk server (172.20.10.5)
sudo systemctl restart asterisk
sudo asterisk -rx "module reload res_pjsip.so"
sudo asterisk -rx "module reload manager"

# On your PC (192.168.1.2)
# Restart backend
cd backend && make dev

# Restart frontend
npm start
```

## Verification Steps

After applying fixes:

1. **Check Asterisk**: `sudo asterisk -rx "pjsip show contacts"` should show registered endpoints
2. **Check Backend**: Diagnostic endpoint should show "ami_status": "connected"
3. **Check Frontend**: Browser console should show successful SIP registration
4. **Test Call**: Try making a call between registered extensions

## Next Steps

Once you've run through these diagnostics, please share:
1. Output of the diagnostic endpoint
2. Output of `pjsip show endpoints` and `pjsip show contacts`
3. Any error messages from browser console
4. Backend logs when attempting a call

This will help identify the exact issue and provide a targeted solution.
