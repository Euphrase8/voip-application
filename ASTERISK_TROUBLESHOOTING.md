# Asterisk Troubleshooting Guide

## Quick Fix Instructions

### Step 1: Run the Fix Script on Asterisk Server (172.20.10.5)

```bash
# SSH into your Asterisk server
ssh kali@172.20.10.5

# Download and run the fix script
sudo ./fix-asterisk.sh

# Verify the fix worked
./verify-asterisk.sh
```

### Step 2: Test from Your PC (192.168.1.2)

```bash
# Run the connectivity test from your PC
./test-asterisk-from-pc.sh
```

### Step 3: Check Your VoIP Application

- Open your VoIP application dashboard
- Go to System Status → Health section
- Asterisk should now show as "healthy"

## Manual Troubleshooting Steps

### 1. Check Service Status

```bash
# Check if Asterisk service is running
sudo systemctl status asterisk

# If not running, start it
sudo systemctl start asterisk
sudo systemctl enable asterisk
```

### 2. Check Processes

```bash
# Check if Asterisk process is running
ps aux | grep asterisk

# If multiple processes, kill them and restart
sudo pkill -f asterisk
sudo systemctl start asterisk
```

### 3. Check Ports

```bash
# Check if required ports are listening
sudo netstat -tlnp | grep -E "(5038|8088|5060)"

# Expected output:
# tcp 0.0.0.0:5038 (AMI)
# tcp 0.0.0.0:8088 (HTTP)
# udp 0.0.0.0:5060 (SIP)
```

### 4. Check Configuration Files

```bash
# Verify configuration files exist
ls -la /etc/asterisk/manager.conf
ls -la /etc/asterisk/http.conf
ls -la /etc/asterisk/pjsip.conf
ls -la /etc/asterisk/extensions.conf

# Check file permissions
sudo chown -R asterisk:asterisk /etc/asterisk/
sudo chmod 640 /etc/asterisk/*.conf
```

### 5. Test AMI Connection

```bash
# Test AMI connection manually
telnet localhost 5038

# You should see: Asterisk Call Manager/X.X.X
# Then type:
Action: Login
Username: admin
Secret: amp111

# You should see: Response: Success
```

### 6. Check Logs

```bash
# View Asterisk logs
sudo journalctl -u asterisk -f

# View Asterisk CLI logs
sudo tail -f /var/log/asterisk/messages

# Connect to Asterisk CLI
sudo asterisk -rvvv
```

### 7. Firewall Configuration

```bash
# Configure UFW firewall
sudo ufw allow 5038/tcp
sudo ufw allow 8088/tcp
sudo ufw allow 5060/udp
sudo ufw allow 10000:20000/udp

# Or configure iptables
sudo iptables -A INPUT -p tcp --dport 5038 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 8088 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 5060 -j ACCEPT
```

## Common Issues and Solutions

### Issue 1: "AMI client not available"

**Solution:**
```bash
# Restart Asterisk service
sudo systemctl restart asterisk

# Check AMI configuration
sudo cat /etc/asterisk/manager.conf

# Verify AMI is enabled and listening
sudo netstat -tlnp | grep 5038
```

### Issue 2: "Connection refused"

**Solution:**
```bash
# Check if Asterisk is running
sudo systemctl status asterisk

# Check firewall
sudo ufw status
sudo iptables -L

# Test local connectivity
telnet localhost 5038
```

### Issue 3: "Permission denied"

**Solution:**
```bash
# Fix permissions
sudo chown -R asterisk:asterisk /etc/asterisk/
sudo chown -R asterisk:asterisk /var/lib/asterisk/
sudo chown -R asterisk:asterisk /var/log/asterisk/
sudo chmod 640 /etc/asterisk/*.conf
```

### Issue 4: "Port already in use"

**Solution:**
```bash
# Find what's using the port
sudo lsof -i :5038
sudo lsof -i :8088

# Kill the process if it's not Asterisk
sudo kill -9 <PID>

# Restart Asterisk
sudo systemctl restart asterisk
```

## Configuration Details

### AMI Configuration (manager.conf)
- Port: 5038
- Admin user: admin/amp111
- Monitor user: monitor/monitor123
- Allowed networks: 172.20.10.0/24, 127.0.0.1

### HTTP Configuration (http.conf)
- Port: 8088
- Bind address: 0.0.0.0 (all interfaces)
- WebSocket support enabled

### SIP Configuration (pjsip.conf)
- Transport: UDP/TCP on port 5060
- Extensions: 1000 (admin), 1001-1003 (users)
- Password: "password" for all extensions

### Test Extensions
- 8888: Echo test
- 9999: Hello world test

## Verification Commands

### From Asterisk Server (172.20.10.5)
```bash
# Check service
sudo systemctl is-active asterisk

# Check ports
sudo netstat -tlnp | grep -E "(5038|8088|5060)"

# Test AMI
echo -e "Action: Ping\r\n\r\n" | nc localhost 5038
```

### From Your PC (192.168.1.2)
```bash
# Test connectivity
ping 172.20.10.5

# Test AMI port
telnet 172.20.10.5 5038

# Test HTTP port
curl http://172.20.10.5:8088/

# Test with netcat
nc -zv 172.20.10.5 5038
nc -zv 172.20.10.5 8088
```

## Expected Results

When everything is working correctly:

1. **Service Status**: `systemctl status asterisk` shows "active (running)"
2. **Ports**: 5038, 8088, and 5060 are listening
3. **AMI**: Can connect and authenticate with admin/amp111
4. **HTTP**: Port 8088 responds to HTTP requests
5. **VoIP App**: System status shows Asterisk as "healthy"
6. **Logs**: No errors in `journalctl -u asterisk`

## Getting Help

If issues persist after following this guide:

1. Run the verification script: `./verify-asterisk.sh`
2. Check the logs: `sudo journalctl -u asterisk --no-pager -n 50`
3. Test connectivity: `./test-asterisk-from-pc.sh`
4. Connect to Asterisk CLI: `sudo asterisk -rvvv`

The fix script should resolve 99% of Asterisk configuration issues. If problems persist, there may be network or system-level issues that need additional investigation.
