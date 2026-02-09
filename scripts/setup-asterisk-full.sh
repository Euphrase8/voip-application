#!/bin/bash

# Full Asterisk Setup Script for VoIP Application
# This script sets up all required Asterisk configuration files and services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[*]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root"
   exit 1
fi

ASTERISK_CONFIG_DIR="/etc/asterisk"
PROJECT_DIR="/home/joachim-euphrase/Projects/voip-application"
BACKUP_DIR="/tmp/asterisk-backup-$(date +%Y%m%d-%H%M%S)"

print_status "Starting full Asterisk setup..."

# Create backup directory
mkdir -p "$BACKUP_DIR"
print_status "Backup directory created: $BACKUP_DIR"

# Backup existing configuration
print_status "Backing up existing configuration..."
if [ -d "$ASTERISK_CONFIG_DIR" ]; then
    cp -r "$ASTERISK_CONFIG_DIR" "$BACKUP_DIR/" 2>/dev/null || print_warning "No existing configuration to backup"
fi

# Ensure Asterisk config directory exists
mkdir -p "$ASTERISK_CONFIG_DIR"

# Copy all configuration files
print_status "Copying configuration files..."

# Copy manager.conf
if [ -f "$PROJECT_DIR/asterisk-config/manager.conf" ]; then
    cp "$PROJECT_DIR/asterisk-config/manager.conf" "$ASTERISK_CONFIG_DIR/"
    print_success "manager.conf copied"
else
    print_error "manager.conf not found in project directory"
fi

# Copy http.conf
if [ -f "$PROJECT_DIR/asterisk-config/http.conf" ]; then
    cp "$PROJECT_DIR/asterisk-config/http.conf" "$ASTERISK_CONFIG_DIR/"
    print_success "http.conf copied"
else
    print_error "http.conf not found in project directory"
fi

# Copy pjsip.conf
if [ -f "$PROJECT_DIR/asterisk-config/pjsip.conf" ]; then
    cp "$PROJECT_DIR/asterisk-config/pjsip.conf" "$ASTERISK_CONFIG_DIR/"
    print_success "pjsip.conf copied"
else
    print_error "pjsip.conf not found in project directory"
fi

# Copy extensions.conf
if [ -f "$PROJECT_DIR/asterisk-config/extensions.conf" ]; then
    cp "$PROJECT_DIR/asterisk-config/extensions.conf" "$ASTERISK_CONFIG_DIR/"
    print_success "extensions.conf copied"
else
    print_error "extensions.conf not found in project directory"
fi

# Set proper permissions
print_status "Setting file permissions..."
chown -R asterisk:asterisk "$ASTERISK_CONFIG_DIR"
chmod 640 "$ASTERISK_CONFIG_DIR"/*.conf
print_success "Permissions set"

# Configure firewall
print_status "Configuring firewall..."
ufw allow 5038/tcp comment "Asterisk AMI" 2>/dev/null || print_warning "Could not configure firewall with ufw"
ufw allow 8088/tcp comment "Asterisk HTTP/WebSocket" 2>/dev/null || print_warning "Could not configure firewall with ufw"
ufw allow 5060/udp comment "Asterisk SIP UDP" 2>/dev/null || print_warning "Could not configure firewall with ufw"
ufw allow 5060/tcp comment "Asterisk SIP TCP" 2>/dev/null || print_warning "Could not configure firewall with ufw"
ufw allow 10000:20000/udp comment "Asterisk RTP" 2>/dev/null || print_warning "Could not configure firewall with ufw"

# Check if Asterisk is installed
if ! command -v asterisk &> /dev/null; then
    print_error "Asterisk is not installed. Please install Asterisk first."
    exit 1
fi

# Stop Asterisk if running
print_status "Stopping Asterisk service..."
systemctl stop asterisk 2>/dev/null || true

# Start Asterisk
print_status "Starting Asterisk service..."
systemctl start asterisk

# Wait for Asterisk to start
sleep 5

# Check if Asterisk is running
if systemctl is-active --quiet asterisk; then
    print_success "Asterisk started successfully"
else
    print_error "Failed to start Asterisk"
    # Try to get error logs
    journalctl -u asterisk --no-pager -n 20
    exit 1
fi

# Test configuration
print_status "Testing configuration..."

# Test AMI port
if nc -z localhost 5038 2>/dev/null; then
    print_success "AMI port (5038) is accessible"
else
    print_warning "AMI port (5038) is not accessible - may be starting up"
fi

# Test HTTP port
if nc -z localhost 8088 2>/dev/null; then
    print_success "HTTP port (8088) is accessible"
else
    print_warning "HTTP port (8088) is not accessible - may be starting up"
fi

# Test SIP port
if nc -zu localhost 5060 2>/dev/null; then
    print_success "SIP port (5060) UDP is accessible"
else
    print_warning "SIP port (5060) UDP test inconclusive"
fi

# Show Asterisk status
print_status "Asterisk status:"
asterisk -rx "core show version" 2>/dev/null || print_warning "Could not get Asterisk version"
asterisk -rx "manager show settings" 2>/dev/null || print_warning "Could not get manager settings"
asterisk -rx "pjsip show transports" 2>/dev/null || print_warning "Could not get PJSIP transports"
asterisk -rx "pjsip show endpoints" 2>/dev/null || print_warning "Could not get PJSIP endpoints"

# Test AMI connection manually
print_status "Testing AMI connection..."
{
    echo "Action: Login"
    echo "Username: admin"
    echo "Secret: amp111"
    echo ""
    sleep 2
    echo "Action: Ping"
    echo ""
    sleep 2
    echo "Action: Logoff"
    echo ""
} | nc localhost 5038 2>/dev/null && print_success "AMI connection test successful" || print_warning "AMI connection test failed"

print_success "Asterisk setup completed successfully!"
print_status "Configuration backup saved to: $BACKUP_DIR"
print_status "Next steps:"
print_status "1. Start your VoIP backend: cd backend && go run main.go"
print_status "2. Open your web browser to http://localhost:3000"
print_status "3. Go to IP Configuration and test connections"
print_status "4. If tests pass, save configuration and proceed to login"