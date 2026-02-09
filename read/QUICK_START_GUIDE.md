# VoIP App Quick Start Guide

## Your Network Setup
- **Your PC**: 192.168.1.2 (Frontend + Backend)
- **Asterisk Server**: 172.20.10.5 (SSH access)

## ✅ Current Status
- ✅ Backend running on 192.168.1.2:8080
- ✅ Asterisk AMI reachable at 172.20.10.5:5038
- ✅ Asterisk WebSocket reachable at 172.20.10.5:8088
- ✅ Configuration updated for your network
- ✅ WebRTC calling system implemented

## 🚀 Quick Start

### 1. Start the Application

**Backend (if not running):**
```bash
cd backend
go run main.go
```

**Frontend:**
```bash
npm start
```

### 2. Test the Setup

**Check backend health:**
```bash
curl http://192.168.1.2:8080/health
```

**Check configuration:**
```bash
curl http://192.168.1.2:8080/config
```

### 3. Login and Test

1. **Open browser**: http://localhost:3000
2. **Login** with your credentials:
   - Admin: username `admin`, password `admin123`
   - User1: username `user1`, password `user123`
3. **Check connection status** (bottom-right corner indicator)
4. **Make a test call** between different extensions

## 🎯 How to Make Calls

### WebRTC Calling (Recommended)
- ✅ **No Asterisk SIP registration needed**
- ✅ **Works immediately**
- ✅ **Better error handling**

1. Login with one extension (e.g., 1000)
2. Open another browser tab/window
3. Login with different extension (e.g., 1001)
4. In first tab, enter target extension and call
5. Second tab will show incoming call notification
6. Accept the call to establish WebRTC connection

### Traditional SIP Calling (Optional)
- Requires proper Asterisk endpoint configuration
- Uses SIP.js for registration
- Falls back to AMI if WebRTC fails

## 🔧 Configuration Files

### Frontend (.env)
```env
REACT_APP_API_URL=http://192.168.1.2:8080
REACT_APP_WS_URL=ws://192.168.1.2:8080/ws
REACT_APP_SIP_SERVER=172.20.10.5
REACT_APP_SIP_WS_URL=ws://172.20.10.5:8088/ws
REACT_APP_CLIENT_IP=192.168.1.2
```

### Backend (backend/.env)
```env
ASTERISK_HOST=172.20.10.5
PUBLIC_HOST=192.168.1.2
CORS_ORIGINS=http://localhost:3000,http://192.168.1.2:3000
```

## 🛠️ Troubleshooting

### Backend Issues
```bash
# Check if backend is running
netstat -ano | findstr :8080

# Test health endpoint
curl http://192.168.1.2:8080/health

# Restart backend
cd backend && go run main.go
```

### Frontend Issues
```bash
# Clear cache and restart
npm start

# Check browser console for errors
# Look for connection status indicator
```

### Asterisk Issues
```bash
# SSH to Asterisk server
ssh user@172.20.10.5

# Check Asterisk status
sudo asterisk -rx "core show version"
sudo asterisk -rx "pjsip show endpoints"
sudo asterisk -rx "manager show connected"
```

### Network Issues
```bash
# Test connectivity from your PC
Test-NetConnection -ComputerName 172.20.10.5 -Port 5038
Test-NetConnection -ComputerName 172.20.10.5 -Port 8088

# Check firewall on Asterisk server
sudo ufw status
```

## 📱 Features Available

### ✅ Working Features
- User authentication and registration
- WebRTC calling between extensions
- Real-time call status updates
- Incoming call notifications
- Call logs and history
- Connection status monitoring
- Dynamic configuration loading

### 🔄 Optional Features
- Traditional SIP registration
- Asterisk AMI integration
- Advanced call routing
- Conference calling

## 🎉 Success Indicators

**You'll know it's working when:**
1. ✅ Connection status shows green indicators
2. ✅ Login works without "No response from server" errors
3. ✅ WebRTC calls connect between different extensions
4. ✅ Incoming call notifications appear on target extensions
5. ✅ Browser console shows successful WebRTC initialization

## 🚨 Common Issues

### "No response from server"
- Check if backend is running on 192.168.1.2:8080
- Verify .env file has correct IP addresses
- Test with: `curl http://192.168.1.2:8080/health`

### "WebSocket connection failed"
- This is normal for traditional SIP (we're using WebRTC)
- Check connection status component for actual status
- WebRTC calls work without SIP registration

### "Call failed"
- Check if target user is logged in and online
- Verify WebRTC service is initialized
- Check browser console for detailed error messages

## 📞 Test Scenarios

### Basic Test
1. Login as admin (extension 1000)
2. Login as user1 (extension 1001) in another tab
3. Call from 1000 to 1001
4. Accept call in second tab
5. Verify audio connection

### Advanced Test
1. Test multiple simultaneous calls
2. Test call rejection
3. Test call ending from both sides
4. Check call logs after calls

## 🔄 Next Steps

1. **Test WebRTC calling** - Should work immediately
2. **Configure Asterisk endpoints** - For traditional SIP (optional)
3. **Set up proper DNS** - Replace IPs with hostnames (future)
4. **Deploy to production** - Use domain names and SSL

Your VoIP application is now configured for your network and ready to use!
