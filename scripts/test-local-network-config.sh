#!/bin/bash
# Test script to verify network configuration with local IP (192.168.1.2)

echo "Testing VoIP application network configuration with local IP 192.168.1.2..."
echo

# Test backend connectivity
echo "1. Testing backend connectivity on 192.168.1.2:8080..."
if curl -s -o /dev/null -w "%{http_code}" http://192.168.1.2:8080/health | grep -q "200"; then
    echo "   ✓ Backend is accessible at http://192.168.1.2:8080"
else
    echo "   ✗ Backend is not accessible at http://192.168.1.2:8080"
    echo "   ℹ Make sure the backend server is running on port 8080"
fi
echo

# Test CORS configuration
echo "2. Checking CORS configuration in backend..."
BACKEND_CORS=$(curl -s http://192.168.1.2:8080/config 2>/dev/null | grep -o "192.168.1.2" | head -1)
if [ ! -z "$BACKEND_CORS" ]; then
    echo "   ✓ Backend CORS configuration includes 192.168.1.2"
else
    echo "   ℹ Backend CORS configuration check skipped (server may not be running)"
fi
echo

# Test Asterisk AMI connection
echo "3. Testing Asterisk AMI connection on 192.168.1.2:5038..."
if nc -z 192.168.1.2 5038; then
    echo "   ✓ Asterisk AMI port 5038 is open on 192.168.1.2"
else
    echo "   ⚠ Asterisk AMI port 5038 is not accessible on 192.168.1.2"
    echo "   ℹ This is expected if Asterisk is not installed or not running"
fi
echo

# Test Asterisk WebSocket connection
echo "4. Testing Asterisk WebSocket connection on 192.168.1.2:8088..."
if nc -z 192.168.1.2 8088; then
    echo "   ✓ Asterisk WebSocket port 8088 is open on 192.168.1.2"
else
    echo "   ⚠ Asterisk WebSocket port 8088 is not accessible on 192.168.1.2"
    echo "   ℹ This is expected if Asterisk is not installed or not running"
fi
echo

# Test configuration file values
echo "5. Verifying configuration files use correct IP address..."
if grep -q "192.168.1.2" /home/joachim-euphrase/Projects/voip-application/backend/.env; then
    echo "   ✓ Backend .env file configured with 192.168.1.2"
else
    echo "   ✗ Backend .env file does not contain 192.168.1.2"
fi

if grep -q "192.168.1.2" /home/joachim-euphrase/Projects/voip-application/asterisk-config/pjsip.conf; then
    echo "   ✓ Asterisk pjsip.conf configured with 192.168.1.2"
else
    echo "   ✗ Asterisk pjsip.conf does not contain 192.168.1.2"
fi

if grep -q "192.168.1.0/24" /home/joachim-euphrase/Projects/voip-application/asterisk-config/manager.conf; then
    echo "   ✓ Asterisk manager.conf configured with 192.168.1.0/24 network"
else
    echo "   ✗ Asterisk manager.conf does not contain 192.168.1.0/24 network"
fi
echo

echo "Network configuration test completed!"
echo
echo "Next steps if Asterisk is not running:"
echo "1. Install Asterisk on this machine (192.168.1.2)"
echo "2. Use the configuration files in /home/joachim-euphrase/Projects/voip-application/asterisk-config/"
echo "3. Run: sudo systemctl start asterisk"
echo "4. Verify with: sudo systemctl status asterisk"