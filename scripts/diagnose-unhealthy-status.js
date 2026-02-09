#!/usr/bin/env node

/**
 * Diagnose Unhealthy Status
 * Comprehensive diagnosis for all services showing unhealthy
 */

const net = require('net');
const http = require('http');

const { getBackendBaseURL, getAsteriskConfig } = require('./_env');

// Configuration (resolved from .env)
const backendURL = getBackendBaseURL();
const BACKEND_HOST = backendURL.hostname;
const BACKEND_PORT = Number(backendURL.port || 80);

const asterisk = getAsteriskConfig();
const ASTERISK_HOST = asterisk.host;
const ASTERISK_AMI_PORT = Number(asterisk.amiPort);
const ASTERISK_WS_PORT = Number(asterisk.sipPort);
const AMI_USERNAME = asterisk.amiUsername;
const AMI_PASSWORD = asterisk.amiSecret;

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function testTCPConnection(host, port, name) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ success: false, error: 'Connection timeout' });
    }, 5000);

    socket.connect(port, host, () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve({ success: true });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });
  });
}

function testAMILogin() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let buffer = '';
    let loginSent = false;
    let authenticated = false;

    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ success: false, error: 'AMI login timeout' });
    }, 10000);

    socket.connect(ASTERISK_AMI_PORT, ASTERISK_HOST, () => {
      log('   Connected to AMI, waiting for greeting...', 'blue');
    });

    socket.on('data', (data) => {
      buffer += data.toString();
      
      // Check for AMI greeting
      if (buffer.includes('Asterisk Call Manager') && !loginSent) {
        log('   Received AMI greeting, sending login...', 'blue');
        
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
        log('   ✅ AMI authentication successful', 'green');
        authenticated = true;
        socket.destroy();
        resolve({ success: true });
      }
      
      // Check for authentication failure
      if (buffer.includes('Response: Error') && buffer.includes('Authentication failed')) {
        clearTimeout(timeout);
        socket.destroy();
        resolve({ success: false, error: 'AMI authentication failed - check username/password' });
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });

    socket.on('close', () => {
      if (!authenticated && loginSent) {
        clearTimeout(timeout);
        resolve({ success: false, error: 'Connection closed before authentication completed' });
      }
    });
  });
}

function testBackendHealth() {
  return new Promise((resolve) => {
    const options = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: '/health',
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            success: res.statusCode === 200,
            data: jsonData,
            status: res.statusCode
          });
        } catch (error) {
          resolve({
            success: false,
            error: 'Invalid JSON response',
            data: data
          });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });

    req.end();
  });
}

async function diagnoseAsterisk() {
  log('🔍 DIAGNOSING ASTERISK', 'bold');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  
  // Test AMI port connectivity
  log('1. Testing AMI port connectivity...', 'blue');
  const amiConnection = await testTCPConnection(ASTERISK_HOST, ASTERISK_AMI_PORT, 'AMI');
  if (amiConnection.success) {
    log('   ✅ AMI port 5038 is reachable', 'green');
  } else {
    log(`   ❌ AMI port 5038 failed: ${amiConnection.error}`, 'red');
    return false;
  }
  
  // Test WebSocket port connectivity
  log('2. Testing WebSocket port connectivity...', 'blue');
  const wsConnection = await testTCPConnection(ASTERISK_HOST, ASTERISK_WS_PORT, 'WebSocket');
  if (wsConnection.success) {
    log('   ✅ WebSocket port 8088 is reachable', 'green');
  } else {
    log(`   ❌ WebSocket port 8088 failed: ${wsConnection.error}`, 'red');
  }
  
  // Test AMI authentication
  log('3. Testing AMI authentication...', 'blue');
  const amiAuth = await testAMILogin();
  if (amiAuth.success) {
    log('   ✅ AMI authentication successful', 'green');
    return true;
  } else {
    log(`   ❌ AMI authentication failed: ${amiAuth.error}`, 'red');
    return false;
  }
}

async function diagnoseBackend() {
  log('🔍 DIAGNOSING BACKEND', 'bold');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  
  // Test backend health endpoint
  log('1. Testing backend health endpoint...', 'blue');
  const backendHealth = await testBackendHealth();
  if (backendHealth.success) {
    log('   ✅ Backend health endpoint working', 'green');
    log(`   Response: ${JSON.stringify(backendHealth.data, null, 2)}`, 'cyan');
    return true;
  } else {
    log(`   ❌ Backend health failed: ${backendHealth.error}`, 'red');
    if (backendHealth.status) {
      log(`   HTTP Status: ${backendHealth.status}`, 'yellow');
    }
    return false;
  }
}

async function provideSolutions(asteriskOk, backendOk) {
  log('💡 SOLUTIONS', 'bold');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'green');
  log('', 'reset');
  
  if (!asteriskOk) {
    log('🔧 ASTERISK ISSUES:', 'red');
    log('1. Check if Asterisk is running:', 'yellow');
    log(`   ssh kali@${ASTERISK_HOST} "sudo systemctl status asterisk"`, 'cyan');
    log('', 'reset');
    
    log('2. Restart Asterisk if needed:', 'yellow');
    log(`   ssh kali@${ASTERISK_HOST} "sudo systemctl restart asterisk"`, 'cyan');
    log('', 'reset');
    
    log('3. Check AMI configuration:', 'yellow');
    log(`   ssh kali@${ASTERISK_HOST} "sudo asterisk -rx 'manager show users'"`, 'cyan');
    log('', 'reset');
    
    log('4. Reload manager configuration:', 'yellow');
    log(`   ssh kali@${ASTERISK_HOST} "sudo asterisk -rx 'module reload manager'"`, 'cyan');
    log('', 'reset');
  }
  
  if (!backendOk) {
    log('🔧 BACKEND ISSUES:', 'red');
    log('1. Check if backend is running with air:', 'yellow');
    log('   Make sure you\'re running: air', 'cyan');
    log('', 'reset');
    
    log('2. Check backend logs for errors', 'yellow');
    log('', 'reset');
    
    log('3. Verify backend configuration:', 'yellow');
    log('   Check backend/.env file', 'cyan');
    log('', 'reset');
  }
  
  if (asteriskOk && backendOk) {
    log('🎉 BOTH SERVICES ARE WORKING!', 'green');
    log('The issue might be:', 'yellow');
    log('1. Backend AMI client initialization failed', 'yellow');
    log('2. Database connection issues', 'yellow');
    log('3. WebSocket hub not initialized', 'yellow');
    log('', 'reset');
    
    log('Try restarting the backend (air command)', 'green');
  }
}

async function main() {
  log('🔍 COMPREHENSIVE SYSTEM DIAGNOSIS', 'bold');
  log('════════════════════════════════════════════════════════════════', 'cyan');
  log('Diagnosing why all services show as unhealthy...', 'yellow');
  log('', 'reset');
  
  const asteriskOk = await diagnoseAsterisk();
  log('', 'reset');
  
  const backendOk = await diagnoseBackend();
  log('', 'reset');
  
  await provideSolutions(asteriskOk, backendOk);
  
  log('🔄 NEXT STEPS:', 'bold');
  log('1. Fix any issues found above', 'blue');
  log('2. Restart backend (air command)', 'blue');
  log('3. Wait 10-15 seconds', 'blue');
  log('4. Check admin dashboard again', 'blue');
  
  return asteriskOk && backendOk ? 0 : 1;
}

// Run the script
if (require.main === module) {
  main().then(process.exit);
}

module.exports = { diagnoseAsterisk, diagnoseBackend };
