#!/usr/bin/env node

/**
 * Test Frontend API Calls
 * Simulates the exact API calls the frontend makes
 */

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

async function testBasicHealthEndpoint() {
  log('🔍 Testing basic health endpoint (what frontend falls back to)...', 'blue');
  
  try {
    const result = await makeRequest('/health');
    
    if (result.status === 200) {
      log('✅ Basic health endpoint working', 'green');
      log('📄 Response structure:', 'cyan');
      log(JSON.stringify(result.data, null, 2), 'cyan');
      
      // Check if this has services data
      if (result.data.services) {
        log('✅ Services data found in basic health', 'green');
      } else {
        log('⚠️  No services data in basic health (expected)', 'yellow');
      }
      
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

async function testSystemHealthService() {
  log('🔍 Testing SystemHealthService behavior...', 'blue');
  
  // Test what happens when no auth token is provided (frontend fallback)
  try {
    // First try admin endpoint without auth (should fail)
    const adminResult = await makeRequest('/protected/admin/health/fast');
    log(`Admin endpoint without auth: ${adminResult.status} (expected 401)`, 'yellow');
    
    // Then try basic health (what frontend falls back to)
    const basicResult = await makeRequest('/health');
    log(`Basic health fallback: ${basicResult.status}`, basicResult.status === 200 ? 'green' : 'red');
    
    if (basicResult.status === 200) {
      log('📄 Basic health response:', 'cyan');
      log(JSON.stringify(basicResult.data, null, 2), 'cyan');
      
      // Check if frontend can extract system info from this
      const data = basicResult.data;
      if (data.status === 'ok') {
        log('✅ Backend is responding as healthy', 'green');
        
        // Create mock system health data like frontend should
        const mockSystemHealth = {
          status: 'healthy',
          services: {
            backend: {
              status: 'healthy',
              last_check: new Date().toISOString()
            }
          },
          timestamp: new Date().toISOString()
        };
        
        log('📄 Mock system health that frontend should create:', 'cyan');
        log(JSON.stringify(mockSystemHealth, null, 2), 'cyan');
      }
    }
    
    return true;
  } catch (error) {
    log(`❌ SystemHealthService test error: ${error.message}`, 'red');
    return false;
  }
}

async function testConfigEndpoint() {
  log('🔍 Testing config endpoint...', 'blue');
  
  try {
    const result = await makeRequest('/config');
    
    if (result.status === 200) {
      log('✅ Config endpoint working', 'green');
      log('📄 Config response:', 'cyan');
      log(JSON.stringify(result.data, null, 2), 'cyan');
      
      const config = result.data.config;
      if (config && config.asterisk) {
        log(`✅ Asterisk config found: ${config.asterisk.host}`, 'green');
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
  log('🔍 Testing Frontend API Behavior', 'bold');
  log('=================================', 'blue');
  log(`Backend: ${backendURL.toString().replace(/\/$/, '')}`, 'blue');
  log('', 'reset');
  
  log('This test simulates what the frontend does when no admin auth is available', 'yellow');
  log('', 'reset');
  
  // Test basic health
  await testBasicHealthEndpoint();
  log('', 'reset');
  
  // Test config
  await testConfigEndpoint();
  log('', 'reset');
  
  // Test SystemHealthService behavior
  await testSystemHealthService();
  log('', 'reset');
  
  log('🔧 DIAGNOSIS:', 'bold');
  log('If the admin dashboard shows no system components, it means:', 'yellow');
  log('1. User is not authenticated as admin', 'yellow');
  log('2. Frontend is falling back to basic health endpoint', 'yellow');
  log('3. Basic health endpoint doesn\'t include services data', 'yellow');
  log('4. Frontend needs to create mock system health data', 'yellow');
  log('', 'reset');
  
  log('💡 SOLUTION:', 'bold');
  log('Update the frontend to show system status even with basic health data', 'green');
  
  return 0;
}

// Run the script
if (require.main === module) {
  main().then(process.exit);
}

module.exports = { testBasicHealthEndpoint, testSystemHealthService };
