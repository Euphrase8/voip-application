# Improved Connection Setup Guide

## Overview

I've implemented a dynamic configuration system that eliminates hardcoded IP addresses and provides better connection management between your frontend, backend, and Asterisk server.

## Key Improvements

### ✅ **Dynamic Configuration**
- Backend auto-detects best connection methods
- Frontend fetches configuration from backend
- No more hardcoded IP addresses
- Automatic fallback mechanisms

### ✅ **Service Discovery**
- Tries multiple host resolution methods
- Supports hostnames, service names, and IPs
- Works in development, Docker, and production

### ✅ **Environment-based Setup**
- Flexible .env configuration
- Different configs for dev/staging/production
- Easy deployment across environments

### ✅ **Health Monitoring**
- Real-time connection status
- Automatic configuration reloading
- Visual connection status indicator

## Setup Instructions

### 1. **Backend Configuration**

Create `backend/.env` from the example:
```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` for your environment:

**For Development (Recommended):**
```env
# Use hostnames instead of IPs
ASTERISK_HOST=asterisk.local
PUBLIC_HOST=localhost
ENVIRONMENT=development
DEBUG=true
```

**For Your Current Setup (Fallback):**
```env
# Keep your current IPs as fallback
ASTERISK_HOST=172.20.10.5
PUBLIC_HOST=192.168.1.2
ENVIRONMENT=development
DEBUG=true
```

**For Docker Deployment:**
```env
ASTERISK_HOST=voip-asterisk
PUBLIC_HOST=voip-backend
CORS_ORIGINS=http://voip-frontend:3000
```

### 2. **Frontend Configuration**

Create `.env` from the example:
```bash
cp .env.example .env
```

Edit `.env` for your environment:

**For Development (Recommended):**
```env
# Let frontend auto-discover backend
REACT_APP_API_URL=http://localhost:8080
REACT_APP_WS_URL=ws://localhost:8080/ws
REACT_APP_SIP_SERVER=asterisk.local
REACT_APP_SIP_WS_URL=ws://asterisk.local:8088/ws
```

**For Your Current Setup (Fallback):**
```env
# Use your current IPs
REACT_APP_API_URL=http://192.168.1.2:8080
REACT_APP_WS_URL=ws://192.168.1.2:8080/ws
REACT_APP_SIP_SERVER=172.20.10.5
REACT_APP_SIP_WS_URL=ws://172.20.10.5:8088/ws
```

### 3. **Asterisk Server Setup**

Add hostname resolution to your Asterisk server:

**Option A: Use mDNS/Bonjour (Recommended)**
```bash
# On Kali Linux (Asterisk server)
sudo apt-get install avahi-daemon
sudo systemctl enable avahi-daemon
sudo systemctl start avahi-daemon

# This makes your server available as "asterisk.local"
```

**Option B: Add to hosts file**
```bash
# On your PC (192.168.1.2), add to C:\Windows\System32\drivers\etc\hosts
172.20.10.5 asterisk.local asterisk

# On Asterisk server (172.20.10.5), add to /etc/hosts
192.168.1.2 voip-frontend frontend
```

**Option C: Use DNS**
Set up proper DNS entries in your router/network.

### 4. **Test the New System**

1. **Start Backend:**
```bash
cd backend
go run main.go
```

2. **Check Configuration Endpoint:**
```bash
curl http://localhost:8080/config
```

You should see dynamic configuration like:
```json
{
  "success": true,
  "config": {
    "api_url": "http://localhost:8080",
    "ws_url": "ws://localhost:8080/ws",
    "asterisk": {
      "host": "asterisk.local",
      "ws_url": "ws://asterisk.local:8088/ws"
    },
    "environment": "development",
    "debug": true
  }
}
```

3. **Start Frontend:**
```bash
npm start
```

4. **Check Connection Status:**
- Look for the connection status indicator in bottom-right corner
- Click it to see detailed connection information
- Use "Reload Config" if needed

## Benefits of New System

### 🚀 **Better Portability**
- Works on different networks without code changes
- Easy deployment to different environments
- No hardcoded IP dependencies

### 🔧 **Easier Development**
- Automatic service discovery
- Dynamic configuration loading
- Real-time connection monitoring

### 🐳 **Docker Ready**
- Service name resolution
- Container-friendly networking
- Easy scaling and deployment

### 🌐 **Production Ready**
- Domain name support
- SSL/TLS ready
- Environment-specific configs

## Troubleshooting

### **Backend Not Found**
1. Check if backend is running: `curl http://localhost:8080/health`
2. Try the connection status component
3. Check browser console for config service logs

### **Asterisk Not Reachable**
1. Test connectivity: `ping asterisk.local`
2. Check if mDNS is working: `nslookup asterisk.local`
3. Fallback to IP in .env files

### **WebRTC Calls Still Failing**
1. Check connection status component
2. Verify WebSocket connections in browser dev tools
3. Check backend logs for WebRTC call attempts

## Migration from IP-based Setup

### **Gradual Migration:**
1. Keep current IP-based .env as backup
2. Try hostname-based setup
3. Use connection status to verify
4. Switch back to IPs if needed

### **Immediate Benefits:**
- WebRTC calling works regardless of Asterisk SIP issues
- Better error handling and debugging
- Real-time connection monitoring
- Easier network changes

## Next Steps

1. **Test WebRTC calling** with new configuration system
2. **Set up hostname resolution** (mDNS or hosts file)
3. **Monitor connections** using the status component
4. **Deploy to production** with domain names

The new system maintains backward compatibility while providing much better connection management and portability!
