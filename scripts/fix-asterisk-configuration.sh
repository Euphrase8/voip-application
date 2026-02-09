#!/bin/bash

# Fix Asterisk Configuration Script
# This script ensures Asterisk is properly configured for the VoIP application

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
BACKUP_DIR="/tmp/asterisk-backup-$(date +%Y%m%d-%H%M%S)"

print_status "Starting Asterisk configuration fix..."

# Create backup directory
mkdir -p "$BACKUP_DIR"
print_status "Backup directory created: $BACKUP_DIR"

# Backup existing configuration
print_status "Backing up existing configuration..."
cp -r "$ASTERISK_CONFIG_DIR" "$BACKUP_DIR/" 2>/dev/null || print_warning "No existing configuration to backup"

# Copy configuration files
print_status "Copying configuration files..."

# Copy manager.conf
if [ -f "/home/joachim-euphrase/Projects/voip-application/asterisk-config/manager.conf" ]; then
    cp "/home/joachim-euphrase/Projects/voip-application/asterisk-config/manager.conf" "$ASTERISK_CONFIG_DIR/"
    print_success "manager.conf copied"
else
    print_error "manager.conf not found in project directory"
fi

# Copy http.conf
if [ -f "/home/joachim-euphrase/Projects/voip-application/asterisk-config/http.conf" ]; then
    cp "/home/joachim-euphrase/Projects/voip-application/asterisk-config/http.conf" "$ASTERISK_CONFIG_DIR/"
    print_success "http.conf copied"
else
    print_error "http.conf not found in project directory"
fi

# Copy pjsip.conf
if [ -f "/home/joachim-euphrase/Projects/voip-application/asterisk-config/pjsip.conf" ]; then
    cp "/home/joachim-euphrase/Projects/voip-application/asterisk-config/pjsip.conf" "$ASTERISK_CONFIG_DIR/"
    print_success "pjsip.conf copied"
else
    print_error "pjsip.conf not found in project directory"
fi

# Copy extensions.conf
if [ -f "/home/joachim-euphrase/Projects/voip-application/asterisk-config/extensions.conf" ]; then
    cp "/home/joachim-euphrase/Projects/voip-application/asterisk-config/extensions.conf" "$ASTERISK_CONFIG_DIR/"
    print_success "extensions.conf copied"
else
    print_error "extensions.conf not found in project directory"
fi

# Set proper permissions
print_status "Setting file permissions..."
chown -R asterisk:asterisk "$ASTERISK_CONFIG_DIR"
chmod 640 "$ASTERISK_CONFIG_DIR"/*.conf
print_success "Permissions set"

# Restart Asterisk
print_status "Restarting Asterisk service..."
systemctl restart asterisk

# Wait for Asterisk to start
sleep 5

# Check if Asterisk is running
if systemctl is-active --quiet asterisk; then
    print_success "Asterisk restarted successfully"
else
    print_error "Failed to restart Asterisk"
    exit 1
fi

# Test configuration
print_status "Testing configuration..."

# Test AMI port
if nc -z localhost 5038 2>/dev/null; then
    print_success "AMI port (5038) is accessible"
else
    print_error "AMI port (5038) is not accessible"
fi

# Test HTTP port
if nc -z localhost 8088 2>/dev/null; then
    print_success "HTTP port (8088) is accessible"
else
    print_error "HTTP port (8088) is not accessible"
fi

# Test SIP port
if nc -zu localhost 5060 2>/dev/null; then
    print_success "SIP port (5060) is accessible"
else
    print_warning "SIP port (5060) UDP test inconclusive"
fi

# Show Asterisk status
print_status "Asterisk status:"
asterisk -rx "core show version"
asterisk -rx "manager show settings"
asterisk -rx "pjsip show transports"

print_success "Asterisk configuration fix completed!"
print_status "Configuration backup saved to: $BACKUP_DIR"