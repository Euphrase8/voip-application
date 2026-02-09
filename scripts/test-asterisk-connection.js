#!/usr/bin/env node

/**
 * Asterisk Connection Test Script
 * Tests AMI connection and updates system status
 */

const net = require('net');
const fs = require('fs');
const path = require('path');

const { getAsteriskConfig } = require('./_env');

// Configuration (resolved from .env)
const { host: ASTERISK_HOST, amiPort, amiUsername: AMI_USERNAME, amiSecret: AMI_PASSWORD } = getAsteriskConfig();
const ASTERISK_AMI_PORT = Number(amiPort);

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function testTCPConnection() {
  return new Promise((resolve, reject) => {
    log(`Testing TCP connection to ${ASTERISK_HOST}:${ASTERISK_AMI_PORT}...`, 'blue');
    
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Connection timeout'));
    }, 5000);

    socket.connect(ASTERISK_AMI_PORT, ASTERISK_HOST, () => {
      clearTimeout(timeout);
      log('✅ TCP connection successful', 'green');
      socket.destroy();
      resolve(true);
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function testAMIAuthentication() {
  return new Promise((resolve, reject) => {
    log('Testing AMI authentication...', 'blue');
    
    const socket = new net.Socket();
    let buffer = '';
    let authenticated = false;
    let loginSent = false;

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('AMI authentication timeout'));
    }, 10000);

    socket.connect(ASTERISK_AMI_PORT, ASTERISK_HOST, () => {
      log('Connected to AMI, waiting for greeting...', 'yellow');
    });

    socket.on('data', (data) => {
      buffer += data.toString();
      
      // Check for AMI greeting
      if (buffer.includes('Asterisk Call Manager') && !loginSent) {
        log('Received AMI greeting, sending login...', 'yellow');
        
        const loginCommand = [
          'Action: Login',
          `Username: ${AMI_USERNAME}`,
          `Secret: ${AMI_PASSWORD}`,
          'Events: off',
          '',
          ''
        ].join('\r\n');
        
        socket.write(loginCommand);
        loginSent = true;
      }
      
      // Check for authentication response
      if (buffer.includes('Response: Success') && buffer.includes('Authentication accepted')) {
        clearTimeout(timeout);
        log('✅ AMI authentication successful', 'green');
        authenticated = true;
        
        // Send a test command
        const statusCommand = [
          'Action: CoreStatus',
          '',
          ''
        ].join('\r\n');
        
        socket.write(statusCommand);
      }
      
      // Check for core status response
      if (authenticated && buffer.includes('CoreStartupTime')) {
        clearTimeout(timeout);
        log('✅ AMI commands working correctly', 'green');
        socket.destroy();
        resolve(true);
      }
      
      // Check for authentication failure
      if (buffer.includes('Response: Error') && buffer.includes('Authentication failed')) {
        clearTimeout(timeout);
        socket.destroy();
        reject(new Error('AMI authentication failed'));
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    socket.on('close', () => {
      if (!authenticated) {
        clearTimeout(timeout);
        reject(new Error('Connection closed before authentication'));
      }
    });
  });
}

function updateSystemStatus(status) {
  const statusFile = path.join(__dirname, '..', 'tmp', 'asterisk-status.json');
  const statusDir = path.dirname(statusFile);
  
  // Create tmp directory if it doesn't exist
  if (!fs.existsSync(statusDir)) {
    fs.mkdirSync(statusDir, { recursive: true });
  }
  
  const statusData = {
    timestamp: new Date().toISOString(),
    status: status,
    host: ASTERISK_HOST,
    port: ASTERISK_AMI_PORT,
    lastCheck: new Date().toISOString()
  };
  
  fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2));
  log(`Status updated: ${status}`, status === 'healthy' ? 'green' : 'red');
}

async function main() {
  log('🔍 Starting Asterisk Connection Test', 'bold');
  log('=====================================', 'blue');
  
  try {
    // Test 1: TCP Connection
    await testTCPConnection();
    
    // Test 2: AMI Authentication
    await testAMIAuthentication();
    
    // All tests passed
    log('', 'reset');
    log('🎉 All tests passed! Asterisk is healthy', 'green');
    updateSystemStatus('healthy');
    
    return 0;
    
  } catch (error) {
    log('', 'reset');
    log(`❌ Test failed: ${error.message}`, 'red');
    updateSystemStatus('unhealthy');
    
    // Provide troubleshooting suggestions
    log('', 'reset');
    log('🔧 Troubleshooting suggestions:', 'yellow');
    log('1. Check if Asterisk is running on the server', 'yellow');
    log('2. Verify AMI is enabled in manager.conf', 'yellow');
    log('3. Check firewall settings on both machines', 'yellow');
    log('4. Verify network connectivity between machines', 'yellow');
    
    return 1;
  }
}

// Run the test
if (require.main === module) {
  main().then(process.exit);
}

module.exports = { testTCPConnection, testAMIAuthentication, updateSystemStatus };
