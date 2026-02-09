# Asterisk Auto-Configuration Guide

## Quick Setup (Recommended)

### Option 1: Automatic Configuration
```bash
# Run the auto-configuration tool
npm run configure-asterisk

# Or use the batch file (Windows)
configure-asterisk.bat

# Or use the shell script (Linux/Mac)
./configure-asterisk.sh
```

### Option 2: Web-Based Diagnostics
1. Open your VoIP application
2. Go to **Admin Dashboard** → **Settings**
3. Click **"Asterisk Diagnostics"**
4. Switch to **"Network Discovery"** tab
5. Click **"Discover Servers"**
6. Switch to **"Configuration"** tab
7. Copy the generated configuration

## Manual Configuration

### Your Current Setup
- **Asterisk Server**: 172.20.10.5 (Kali Linux)
- **SSH Access**: `ssh kali@172.20.10.5` (password: kali)
- **Backend/Client**: 192.168.1.2 (Windows)

### Backend Configuration
Create or edit `backend/.env`:
```bash
ASTERISK_HOST=172.20.10.5
ASTERISK_AMI_PORT=5038
ASTERISK_AMI_USERNAME=admin
ASTERISK_AMI_SECRET=amp111
SIP_DOMAIN=172.20.10.5
SIP_PORT=8088
```

### Frontend Configuration
Create or edit `.env` in project root:
```bash
REACT_APP_SIP_SERVER=172.20.10.5
REACT_APP_SIP_PORT=8088
REACT_APP_SIP_WS_URL=ws://172.20.10.5:8088/ws
REACT_APP_CLIENT_IP=192.168.1.2
```

## Asterisk Server Configuration

### SSH to Asterisk Server
```bash
ssh kali@172.20.10.5
# Password: kali
```

### Configure AMI (Asterisk Manager Interface)
```bash
# Edit manager.conf
sudo nano /etc/asterisk/manager.conf

# Add/verify these settings:
[general]
enabled = yes
port = 5038
bindaddr = 0.0.0.0

[admin]
secret = amp111
read = all
write = all
permit = 172.20.10.0/24
permit = 127.0.0.1/32
```

### Configure HTTP Interface
```bash
# Edit http.conf
sudo nano /etc/asterisk/http.conf

# Add/verify these settings:
[general]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
```

### Restart Asterisk
```bash
sudo systemctl restart asterisk

# Or reload configuration
sudo asterisk -rx "core reload"
```

## Troubleshooting

### Check Asterisk Status
```bash
# Check if Asterisk is running
sudo systemctl status asterisk

# Connect to Asterisk CLI
sudo asterisk -r

# Check AMI settings
manager show settings
manager show users
```

### Test Network Connectivity
```bash
# From your Windows machine, test AMI port
telnet 172.20.10.5 5038

# Test HTTP port
curl -I http://172.20.10.5:8088/

# Test SSH
ssh kali@172.20.10.5
```

### Check Firewall
```bash
# On Asterisk server (Kali), allow ports
sudo ufw allow 5038  # AMI
sudo ufw allow 8088  # HTTP
sudo ufw allow 5060  # SIP
sudo ufw allow 22    # SSH

# Check open ports
sudo netstat -tlnp | grep -E '(5038|8088|5060)'
```

## Verification Steps

### 1. Test AMI Connection
```bash
# Manual AMI test
telnet 172.20.10.5 5038

# Once connected, try login:
Action: Login
Username: admin
Secret: amp111

# Should see success response
```

### 2. Check System Health
1. Open VoIP application
2. Go to Admin Dashboard
3. System health should show Asterisk as "online"

### 3. Test Call Functionality
1. Try making a test call between extensions
2. Check call logs
3. Verify audio quality

## Common Issues

### Issue: "AMI client not available"
**Solution**: Check AMI configuration and network connectivity
```bash
# Verify AMI is enabled
sudo asterisk -rx "manager show settings"

# Check if port is listening
sudo netstat -tlnp | grep 5038
```

### Issue: "WebSocket connection failed"
**Solution**: Check HTTP interface and WebSocket configuration
```bash
# Verify HTTP is enabled
sudo asterisk -rx "http show status"

# Check WebSocket endpoint
curl -I http://172.20.10.5:8088/ws
```

### Issue: SSH connection timeout
**Solution**: Ensure SSH service is running and firewall allows connections
```bash
# Start SSH service
sudo systemctl start ssh
sudo systemctl enable ssh

# Allow SSH through firewall
sudo ufw allow ssh
```

## Advanced Configuration

### Custom AMI User
```bash
# Create custom AMI user in manager.conf
[voip_backend]
secret = your_secure_password
read = system,call,log,verbose,command,agent,user,config
write = system,call,log,verbose,command,agent,user,config
permit = 192.168.1.2/32
```

### SSL/TLS Configuration
```bash
# Enable HTTPS in http.conf
[general]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
tlsenable=yes
tlsbindaddr=0.0.0.0:8089
tlscertfile=/etc/asterisk/keys/asterisk.pem
tlsprivatekey=/etc/asterisk/keys/asterisk.key
```

## Scripts and Tools

### Available NPM Scripts
```bash
npm run configure-asterisk  # Auto-configure environment
npm run discover-asterisk   # Discover Asterisk servers
npm run show-config        # Show current configuration
```

### Batch Files
- `configure-asterisk.bat` - Windows auto-configuration
- `configure-asterisk.sh` - Linux/Mac auto-configuration

### Web Interface
- Admin Dashboard → Settings → Asterisk Diagnostics
- Network Discovery tab for server discovery
- Configuration tab for auto-generated config

## Support

If you encounter issues:

1. **Run Diagnostics**: Use the web-based diagnostics tool
2. **Check Logs**: Review Asterisk logs (`/var/log/asterisk/messages`)
3. **Test Connectivity**: Use the network discovery tool
4. **Verify Configuration**: Use `npm run show-config`

For additional help, refer to:
- `ASTERISK_TROUBLESHOOTING.md` - Detailed troubleshooting guide
- Asterisk documentation: https://wiki.asterisk.org/
- Project repository: https://github.com/Euphrase8/voip-application
