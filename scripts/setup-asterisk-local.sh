#!/bin/bash
# Script to install and configure Asterisk on the local machine (192.168.1.2)

echo "Setting up Asterisk on local machine (192.168.1.2)..."

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "This script should not be run as root" 
   exit 1
fi

# Install prerequisites
echo "Installing prerequisites..."
sudo apt update
sudo apt install -y build-essential libxml2-dev libsqlite3-dev uuid-dev libjansson-dev libssl-dev libsrtp2-dev libspeex-dev libspeexdsp-dev libogg-dev libvorbis-dev libcurl4-openssl-dev libasound2-dev unixodbc-dev libmysqlclient-dev libpq-dev libneon27-dev libgmime-2.6-dev libiksemel-dev libresample1-dev libsndfile1-dev pkg-config automake libtool subversion git unixodbc libical-dev libldap2-dev libsqlite3-dev libsrtp2-dev libspandsp-dev

# Download Asterisk
echo "Downloading Asterisk..."
cd /tmp
wget http://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
tar -zxvf asterisk-20-current.tar.gz
cd asterisk-20*/

# Run configuration
echo "Configuring Asterisk..."
./configure --with-pjproject-bundled

# Run menuselect to enable desired features (optional)
echo "Running menuselect..."
make menuselect

# Compile Asterisk
echo "Compiling Asterisk..."
make

# Install Asterisk
echo "Installing Asterisk..."
sudo make install
sudo make samples
sudo make config

# Copy configuration files
echo "Copying configuration files..."
sudo cp /home/joachim-euphrase/Projects/voip-application/asterisk-config/*.conf /etc/asterisk/

# Set proper ownership
sudo chown -R asterisk:asterisk /etc/asterisk/
sudo chmod 640 /etc/asterisk/*.conf

# Enable and start Asterisk service
echo "Starting Asterisk service..."
sudo systemctl enable asterisk
sudo systemctl start asterisk

# Check status
echo "Checking Asterisk status..."
sudo systemctl status asterisk

echo "Asterisk installation and configuration completed!"
echo "To manually restart Asterisk, use: sudo systemctl restart asterisk"
echo "Configuration files have been updated to use IP address 192.168.1.2"