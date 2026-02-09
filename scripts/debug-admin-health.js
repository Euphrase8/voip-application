#!/usr/bin/env node

/**
 * Debug Admin Health Endpoints
 * Tests the admin health endpoints with proper authentication
 */

const http = require('http');

const { getBackendBaseURL } = require('./_env');

// Configuration (resolved from .env)
const backendURL = getBackendBaseURL();
const BACKEND_HOST = backendURL.hostname;
const BACKEND_PORT = Number(backendURL.port || 80);

// Test credentials (you'll need to replace with real ones)
const TEST_CREDENTIALS = {
  username: 'admin',
  password: 'admin123'
};

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(path, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 10000
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(responseData);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: jsonData
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: responseData
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

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function login() {
  log('🔐 Attempting to login...', 'blue');
  
  try {
    const result = await makeRequest('/api/login', 'POST', TEST_CREDENTIALS);
    
    if (result.status === 200 && result.data.token) {
      log('✅ Login successful', 'green');
      return result.data.token;
    } else {
      log(`❌ Login failed: ${result.status}`, 'red');
      log(`Response: ${JSON.stringify(result.data, null, 2)}`, 'yellow');
      return null;
    }
  } catch (error) {
    log(`❌ Login error: ${error.message}`, 'red');
    return null;
  }
}

async function testHealthEndpoint(token, endpoint, name) {
  log(`🔍 Testing ${name}...`, 'blue');
  
  try {
    const result = await makeRequest(endpoint, 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    if (result.status === 200) {
      log(`✅ ${name} working`, 'green');
      
      // Check if we have services data
      const health = result.data.health || result.data;
      if (health && health.services) {
        log(`   Services found: ${Object.keys(health.services).join(', ')}`, 'cyan');
        
        // Check Asterisk specifically
        if (health.services.asterisk) {
          const asteriskStatus = health.services.asterisk.status;
          log(`   Asterisk Status: ${asteriskStatus}`, asteriskStatus === 'healthy' ? 'green' : 'yellow');
        }
      } else {
        log(`   ⚠️  No services data in response`, 'yellow');
      }
      
      return true;
    } else {
      log(`❌ ${name} failed: ${result.status}`, 'red');
      log(`Response: ${JSON.stringify(result.data, null, 2)}`, 'yellow');
      return false;
    }
  } catch (error) {
    log(`❌ ${name} error: ${error.message}`, 'red');
    return false;
  }
}

async function testBasicHealth() {
  log('🔍 Testing basic health (no auth)...', 'blue');
  
  try {
    const result = await makeRequest('/health');
    
    if (result.status === 200) {
      log('✅ Basic health working', 'green');
      log(`   Response: ${JSON.stringify(result.data, null, 2)}`, 'cyan');
      return true;
    } else {
      log(`❌ Basic health failed: ${result.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Basic health error: ${error.message}`, 'red');
    return false;
  }
}

async function main() {
  log('🔍 Debug Admin Health Endpoints', 'bold');
  log('================================', 'blue');
  log(`Backend: ${backendURL.toString().replace(/\/$/, '')}`, 'blue');
  log('', 'reset');
  
  // Test basic health first
  await testBasicHealth();
  log('', 'reset');
  
  // Try to login
  const token = await login();
  if (!token) {
    log('❌ Cannot test admin endpoints without valid token', 'red');
    log('', 'reset');
    log('🔧 Please check:', 'yellow');
    log('1. Backend is running with air command', 'yellow');
    log('2. Admin user exists in database', 'yellow');
    log('3. Credentials are correct', 'yellow');
    return 1;
  }
  
  log('', 'reset');
  
  // Test admin health endpoints
  const results = [];
  results.push(await testHealthEndpoint(token, '/protected/admin/health/fast', 'Fast Health Endpoint'));
  log('', 'reset');
  results.push(await testHealthEndpoint(token, '/protected/admin/health', 'Full Health Endpoint'));
  log('', 'reset');
  
  // Summary
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  if (passed === total) {
    log('🎉 All admin health endpoints working!', 'green');
    log('', 'reset');
    log('✅ The issue might be in the frontend', 'yellow');
    log('✅ Check browser console for errors', 'yellow');
    log('✅ Verify user has admin role', 'yellow');
    return 0;
  } else {
    log(`⚠️  ${passed}/${total} endpoints working`, 'yellow');
    return 1;
  }
}

// Run the script
if (require.main === module) {
  main().then(process.exit);
}

module.exports = { login, testHealthEndpoint, testBasicHealth };
