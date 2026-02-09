#!/usr/bin/env node

/**
 * Test Backend Health Endpoint
 * Tests the backend health endpoint to verify Asterisk status
 */

const https = require('https');
const http = require('http');

const { getBackendBaseURL } = require('./_env');

// Configuration (resolved from .env)
const backendURL = getBackendBaseURL();
const BACKEND_HOST = backendURL.hostname;
const BACKEND_PORT = Number(backendURL.port || 80);

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

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: path,
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
            status: res.statusCode,
            data: jsonData
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function testBasicHealth() {
  log('Testing basic health endpoint...', 'blue');
  
  try {
    const result = await makeRequest('/health');
    
    if (result.status === 200) {
      log('✅ Basic health endpoint working', 'green');
      log(`   Response: ${JSON.stringify(result.data, null, 2)}`, 'blue');
      return true;
    } else {
      log(`❌ Basic health endpoint failed: ${result.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Basic health endpoint error: ${error.message}`, 'red');
    return false;
  }
}

async function testFastHealthWithAuth() {
  log('Testing fast health endpoint (requires auth)...', 'blue');
  
  try {
    const result = await makeRequest('/protected/admin/health/fast');
    
    if (result.status === 401) {
      log('⚠️  Fast health endpoint requires authentication (expected)', 'yellow');
      log('   This is normal - the endpoint is protected', 'yellow');
      return true;
    } else if (result.status === 200) {
      log('✅ Fast health endpoint working', 'green');
      log(`   Asterisk status: ${result.data?.health?.services?.asterisk?.status || 'unknown'}`, 'blue');
      return true;
    } else {
      log(`❌ Fast health endpoint failed: ${result.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Fast health endpoint error: ${error.message}`, 'red');
    return false;
  }
}

async function testConfig() {
  log('Testing config endpoint...', 'blue');
  
  try {
    const result = await makeRequest('/config');
    
    if (result.status === 200) {
      log('✅ Config endpoint working', 'green');
      const config = result.data?.config;
      if (config) {
        log(`   Asterisk Host: ${config.asterisk?.host || 'unknown'}`, 'blue');
        log(`   SIP Server: ${config.sip?.server || 'unknown'}`, 'blue');
      }
      return true;
    } else {
      log(`❌ Config endpoint failed: ${result.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Config endpoint error: ${error.message}`, 'red');
    return false;
  }
}

async function main() {
  log('🔍 Testing Backend Health Endpoints', 'bold');
  log('===================================', 'blue');
  log(`Backend: ${backendURL.toString().replace(/\/$/, '')}`, 'blue');
  log('', 'reset');
  
  const results = [];
  
  // Test basic health
  results.push(await testBasicHealth());
  log('', 'reset');
  
  // Test config
  results.push(await testConfig());
  log('', 'reset');
  
  // Test fast health (with auth)
  results.push(await testFastHealthWithAuth());
  log('', 'reset');
  
  // Summary
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  if (passed === total) {
    log('🎉 All backend endpoints are working!', 'green');
    log('', 'reset');
    log('✅ Backend is ready for real-time health monitoring', 'green');
    log('✅ Asterisk status should now update in real-time', 'green');
    return 0;
  } else {
    log(`⚠️  ${passed}/${total} endpoints working`, 'yellow');
    log('', 'reset');
    log('🔧 Check if backend is running with: air or go run main.go', 'yellow');
    return 1;
  }
}

// Run the test
if (require.main === module) {
  main().then(process.exit);
}

module.exports = { testBasicHealth, testFastHealthWithAuth, testConfig };
