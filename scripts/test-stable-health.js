#!/usr/bin/env node

/**
 * Test Stable Health Status
 * Verifies that the system health is now stable and not fluctuating
 */

const http = require('http');

const { getBackendBaseURL } = require('./_env');

// Configuration (resolved from .env)
const backendURL = getBackendBaseURL();
const BACKEND_HOST = backendURL.hostname;
const BACKEND_PORT = Number(backendURL.port || 80);
const TEST_DURATION = 60; // Test for 60 seconds
const CHECK_INTERVAL = 5; // Check every 5 seconds

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

function getCurrentTime() {
  return new Date().toLocaleTimeString();
}

function testSystemHealth() {
  return new Promise((resolve) => {
    const options = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: '/api/system/health',
      method: 'GET',
      timeout: 10000
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
            status: res.statusCode,
            timestamp: new Date()
          });
        } catch (error) {
          resolve({
            success: false,
            error: 'Invalid JSON response',
            data: data,
            timestamp: new Date()
          });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ 
        success: false, 
        error: error.message,
        timestamp: new Date()
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ 
        success: false, 
        error: 'Request timeout',
        timestamp: new Date()
      });
    });

    req.end();
  });
}

function analyzeServiceStatus(healthData) {
  if (!healthData.success || !healthData.data?.health?.services) {
    return {
      asterisk: 'unavailable',
      backend: 'unavailable',
      database: 'unavailable',
      websocket: 'unavailable'
    };
  }

  const services = healthData.data.health.services;
  return {
    asterisk: services.asterisk?.status || 'unknown',
    backend: services.backend?.status || 'unknown',
    database: services.database?.status || 'unknown',
    websocket: services.websocket?.status || 'unknown'
  };
}

function getStatusColor(status) {
  switch (status.toLowerCase()) {
    case 'healthy': return 'green';
    case 'warning': return 'yellow';
    case 'unhealthy': return 'red';
    case 'unavailable': return 'magenta';
    default: return 'blue';
  }
}

async function runStabilityTest() {
  log('🔍 SYSTEM HEALTH STABILITY TEST', 'bold');
  log('════════════════════════════════════════════════════════════════', 'cyan');
  log(`Testing for ${TEST_DURATION} seconds with ${CHECK_INTERVAL}s intervals...`, 'blue');
  log('', 'reset');

  const results = [];
  const startTime = Date.now();
  let checkCount = 0;

  while (Date.now() - startTime < TEST_DURATION * 1000) {
    checkCount++;
    const healthData = await testSystemHealth();
    const services = analyzeServiceStatus(healthData);
    
    results.push({
      check: checkCount,
      timestamp: getCurrentTime(),
      services: services,
      success: healthData.success,
      error: healthData.error
    });

    // Display current status
    const statusLine = [
      `[${getCurrentTime()}]`,
      `Asterisk: ${services.asterisk}`,
      `Backend: ${services.backend}`,
      `Database: ${services.database}`,
      `WebSocket: ${services.websocket}`
    ].join(' | ');

    const overallColor = healthData.success ? 'green' : 'red';
    log(statusLine, overallColor);

    // Wait for next check
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL * 1000));
  }

  return results;
}

function analyzeResults(results) {
  log('', 'reset');
  log('📊 STABILITY ANALYSIS', 'bold');
  log('════════════════════════════════════════════════════════════════', 'cyan');
  log('', 'reset');

  // Count status changes for each service
  const serviceChanges = {
    asterisk: new Set(),
    backend: new Set(),
    database: new Set(),
    websocket: new Set()
  };

  const serviceCounts = {
    asterisk: {},
    backend: {},
    database: {},
    websocket: {}
  };

  results.forEach(result => {
    Object.keys(result.services).forEach(service => {
      const status = result.services[service];
      serviceChanges[service].add(status);
      serviceCounts[service][status] = (serviceCounts[service][status] || 0) + 1;
    });
  });

  // Display results
  Object.keys(serviceChanges).forEach(service => {
    const statuses = Array.from(serviceChanges[service]);
    const isStable = statuses.length === 1;
    const stabilityColor = isStable ? 'green' : 'red';
    
    log(`${service.toUpperCase()}:`, 'bold');
    log(`  Stability: ${isStable ? '✅ STABLE' : '❌ UNSTABLE'}`, stabilityColor);
    log(`  Statuses seen: ${statuses.join(', ')}`, 'blue');
    
    Object.entries(serviceCounts[service]).forEach(([status, count]) => {
      const percentage = ((count / results.length) * 100).toFixed(1);
      log(`  ${status}: ${count}/${results.length} (${percentage}%)`, getStatusColor(status));
    });
    log('', 'reset');
  });

  // Overall stability
  const totalChanges = Object.values(serviceChanges).reduce((sum, changes) => sum + changes.size, 0);
  const isOverallStable = totalChanges === 4; // Each service should have exactly 1 status
  
  log('🎯 OVERALL RESULT:', 'bold');
  if (isOverallStable) {
    log('✅ SYSTEM IS STABLE - All services maintain consistent status', 'green');
  } else {
    log('❌ SYSTEM IS UNSTABLE - Services are fluctuating', 'red');
    log('This indicates connection issues or health check problems', 'yellow');
  }

  return isOverallStable;
}

function provideSolutions(isStable, results) {
  if (isStable) {
    log('', 'reset');
    log('🎉 CONGRATULATIONS!', 'bold');
    log('Your system health monitoring is now stable and reliable.', 'green');
    log('The admin dashboard should show consistent status.', 'green');
    return;
  }

  log('', 'reset');
  log('🔧 RECOMMENDED ACTIONS:', 'bold');
  log('════════════════════════════════════════════════════════════════', 'yellow');
  log('', 'reset');

  // Check for specific patterns
  const lastResult = results[results.length - 1];
  
  if (!lastResult.success) {
    log('1. Backend Connection Issues:', 'red');
    log('   • Ensure backend is running with: air', 'yellow');
    log('   • Check if port 8080 is accessible', 'yellow');
    log('   • Verify backend configuration', 'yellow');
    log('', 'reset');
  }

  log('2. Restart Backend:', 'yellow');
  log('   • Stop current backend (Ctrl+C)', 'cyan');
  log('   • Run: air', 'cyan');
  log('   • Wait 30 seconds for AMI reconnection', 'cyan');
  log('', 'reset');

  log('3. Check Asterisk Status:', 'yellow');
  log('   • ssh kali@172.20.10.5 "sudo systemctl status asterisk"', 'cyan');
  log('   • If not running: sudo systemctl restart asterisk', 'cyan');
  log('', 'reset');

  log('4. Monitor Logs:', 'yellow');
  log('   • Check backend console for AMI connection errors', 'cyan');
  log('   • Look for reconnection attempts', 'cyan');
  log('', 'reset');
}

async function main() {
  try {
    const results = await runStabilityTest();
    const isStable = analyzeResults(results);
    provideSolutions(isStable, results);
    
    return isStable ? 0 : 1;
  } catch (error) {
    log(`❌ Test failed: ${error.message}`, 'red');
    return 1;
  }
}

// Run the test
if (require.main === module) {
  main().then(process.exit);
}

module.exports = { runStabilityTest, analyzeResults };
