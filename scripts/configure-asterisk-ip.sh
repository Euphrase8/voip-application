#!/bin/bash
# Script to update Asterisk configuration to use the local IP address (192.168.1.2)

echo "Updating Asterisk configuration files to use IP address 192.168.1.2..."

# Update the configuration files in the project directory
sed -i 's/172.20.10.5/192.168.1.2/g' /home/joachim-euphrase/Projects/voip-application/asterisk-config/*.conf
sed -i 's/172.20.10.0\/24/192.168.1.0\/24/g' /home/joachim-euphrase/Projects/voip-application/asterisk-config/*.conf

# Also copy these updated configs to /etc/asterisk if possible (will fail in sandbox)
if [ -w /etc/asterisk ]; then
    sudo cp /home/joachim-euphrase/Projects/voip-application/asterisk-config/*.conf /etc/asterisk/
    echo "Configuration files copied to /etc/asterisk/"
else
    echo "Cannot copy to /etc/asterisk/ - requires elevated privileges"
    echo "Configuration files updated in project directory only"
fi

echo "Asterisk configuration updated to use IP address 192.168.1.2"
echo "Configuration files updated:"
echo "- manager.conf: AMI access now permits connections from 192.168.1.0/24"
echo "- pjsip.conf: WebSocket and UDP transports configured for 192.168.1.2"
echo "- http.conf: HTTP interface configured for WebSocket connections"