# VoIP Call Flow Fixes - Complete Solution

## Summary of Issues Fixed

### 1. ✅ AMI Timeout and Error Handling
- **Issue**: 10-second AMI timeout causing 500 errors
- **Fix**: 
  - Increased AMI command timeout from 5s to 10s
  - Increased AMI response timeout from 10s to 30s
  - Added `Async: true` to Originate command to prevent blocking
  - Added comprehensive logging throughout AMI operations

### 2. ✅ Call Flow Architecture Simplified
- **Issue**: Multiple conflicting call initiation paths
- **Fix**:
  - Single clear call flow: Frontend → Backend API → Asterisk AMI
  - Improved error handling with specific error messages
  - Added step-by-step logging for debugging

### 3. ✅ SIP Registration Fixed
- **Issue**: Frontend not properly registering with Asterisk
- **Fix**:
  - Updated sipManager to wait for registration completion
  - Added registration timeout (15 seconds)
  - Proper cleanup of existing UA before re-initialization
  - Added registration status tracking

### 4. ✅ Configuration Consistency
- **Issue**: Hardcoded IP addresses throughout codebase
- **Fix**:
  - All IPs now use CONFIG variables
  - Consistent configuration across frontend and backend
  - Updated VoipPhone.jsx to use CONFIG instead of hardcoded IPs

### 5. ✅ Comprehensive Logging
- **Issue**: Insufficient logging for debugging
- **Fix**:
  - Added detailed logging in AMI operations
  - Added logging in call initiation flow
  - Added WebSocket connection logging
  - Added SIP registration logging

## Current Network Configuration

- **Your PC (Backend + Frontend)**: 192.168.1.2
- **Asterisk Server (Kali Linux)**: 172.20.10.5

## Testing Instructions

### Prerequisites
1. **Asterisk Configuration**: Ensure you've added the 20 extensions (1001-1020) to `/etc/asterisk/pjsip.conf`
2. **Backend Running**: Start with `cd backend && make dev` (using Air for hot reload)
3. **Frontend Running**: Start with `npm start`

### Step-by-Step Testing

#### 1. Login and Registration Test
```bash
# 1. Open browser to http://localhost:3000
# 2. Register a new user:
#    - Username: TestUser
#    - Email: test@example.com
#    - Extension: 1005 (or any 1001-1020)
#    - Password: password
# 3. Login with the same credentials
```

#### 2. SIP Registration Test
```bash
# Check browser console for:
[initializeSIP] Initializing SIP for extension: 1005
[SipManager] Initializing SIP for extension 1005
[SipManager] Connecting to SIP server: ws://172.20.10.5:8088/ws
[SipManager] SIP registration successful
[initializeSIP] SIP initialization completed successfully

# Check Asterisk CLI:
sudo asterisk -rx "pjsip show contacts"
# Should show: Contact: <sip:1005@...> ... Avail
```

#### 3. WebSocket Connection Test
```bash
# Check browser console for:
[websocketservice] ✅ WebSocket connected for extension 1005
[websocketservice] WebSocket URL: ws://192.168.1.2:8080/ws?extension=1005

# Check backend logs for:
WebSocket client connected: [timestamp] (extension: 1005)
Client registered: [timestamp] (extension: 1005)
```

#### 4. Call Initiation Test
```bash
# 1. Try calling extension 1001 (or another registered extension)
# 2. Check browser console for:
[call.js] Initiating call to extension: 1001
[call.js] Step 1: Notifying backend about call initiation
[call.js] Step 2: Backend call initiation successful
[call.js] Step 3: Making SIP call through sipManager
[call.js] Step 4: SIP call initiated successfully

# 3. Check backend logs for:
[CALL] User TestUser (ext: 1005) initiating call to 1001
[CALL] Target user found: user1 (ext: 1001, status: online)
[CALL] Initiating Asterisk call from 1005 to 1001
[AMI] Initiating call from 1005 to 1001
[AMI] Using caller channel: PJSIP/1005
[AMI] SUCCESS: Call initiated from 1005 to 1001

# 4. Check Asterisk CLI for:
# Should see call origination and channel creation
```

## Troubleshooting

### If SIP Registration Fails
```bash
# Check Asterisk logs:
sudo tail -f /var/log/asterisk/full

# Check if endpoint exists:
sudo asterisk -rx "pjsip show endpoint 1005"

# Check WebSocket transport:
sudo asterisk -rx "pjsip show transports"
```

### If AMI Calls Timeout
```bash
# Check AMI connection:
sudo asterisk -rx "manager show connected"

# Test manual AMI connection:
telnet 172.20.10.5 5038
# Then: Action: Login, Username: admin, Secret: amp111
```

### If WebSocket Connection Fails
```bash
# Check if backend WebSocket is listening:
netstat -tlnp | grep 8080

# Check CORS configuration in backend logs
```

## Expected Success Indicators

1. **✅ No 500 errors** in browser network tab
2. **✅ SIP registration successful** in browser console
3. **✅ WebSocket connected** in browser console and backend logs
4. **✅ AMI call initiation successful** in backend logs
5. **✅ Asterisk shows active channels** when call is made

## Next Steps After Testing

If all tests pass:
1. Test calls between different extensions
2. Test call hangup functionality
3. Test incoming call handling
4. Test call logs and history

If issues persist, check the specific error messages in the logs and refer to the troubleshooting section above.
