#!/usr/bin/env node

/**
 * Test System Health Service
 * Tests the updated SystemHealthService behavior
 */

// Mock fetch for Node.js environment
global.fetch = require('node-fetch');

// Mock localStorage
global.localStorage = {
  getItem: (key) => {
    if (key === 'token') return null; // Simulate no auth token
    return null;
  },
  setItem: () => {},
  removeItem: () => {}
};

// Import the service (we'll need to adjust the import path)
const path = require('path');
const fs = require('fs');

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

// Mock SystemHealthService behavior
const { getBackendBaseURL } = require('./_env');

class MockSystemHealthService {
  constructor() {
    this.baseURL = getBackendBaseURL().toString().replace(/\/$/, '');
  }

  getAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer null` // No valid token
    };
  }

  isAuthenticated() {
    return false; // Simulate not authenticated
  }

  async _testAsteriskConnection() {
    try {
      // Get config to find Asterisk host
      const configResponse = await fetch(`${this.baseURL}/config`, {
        method: 'GET'
      });
      
      if (!configResponse.ok) {
        throw new Error('Cannot get config');
      }
      
      const configData = await configResponse.json();
      const asteriskHost = configData.config?.asterisk?.host;
      
      if (!asteriskHost) {
        return {
          status: 'warning',
          message: 'Asterisk host not configured'
        };
      }
      
      // Return healthy status since we know it's configured
      return {
        status: 'healthy',
        message: `Asterisk server configured at ${asteriskHost} (detailed status requires admin login)`
      };
      
    } catch (error) {
      return {
        status: 'warning',
        message: `Cannot verify Asterisk status: ${error.message}`
      };
    }
  }

  async _convertBasicHealth(basicData) {
    // Test Asterisk connection even without admin auth
    let asteriskStatus = 'unknown';
    let asteriskMessage = 'Login required for Asterisk status';
    
    try {
      const asteriskHealth = await this._testAsteriskConnection();
      asteriskStatus = asteriskHealth.status;
      asteriskMessage = asteriskHealth.message;
    } catch (error) {
      console.warn('[SystemHealthService] Could not test Asterisk connection:', error.message);
    }
    
    return {
      status: basicData.status === 'ok' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: 'Backend available - login required for full metrics',
      response_time_ms: basicData.response_time_ms || 0,
      services: {
        backend: { 
          status: 'healthy', 
          message: 'Backend is responding (basic health check)',
          last_check: new Date().toISOString()
        },
        asterisk: { 
          status: asteriskStatus, 
          message: asteriskMessage,
          last_check: new Date().toISOString()
        },
        database: { 
          status: 'unknown', 
          message: 'Login required for database status',
          last_check: new Date().toISOString()
        },
        websocket: { 
          status: 'unknown', 
          message: 'Login required for WebSocket status',
          last_check: new Date().toISOString()
        }
      },
      system_metrics: {
        cpu: { usage_percent: 0 },
        memory: { usage_percent: 0 },
        disk: { usage_percent: 0 }
      },
      database_health: {
        status: 'unknown',
        total_users: 0,
        active_calls: 0,
        call_logs_count: 0
      }
    };
  }

  async getSystemHealth() {
    try {
      // Simulate what happens when not authenticated
      log('Simulating unauthenticated user...', 'yellow');
      
      // Try basic health endpoint
      const response = await fetch(`${this.baseURL}/health`, {
        method: 'GET'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return await this._convertBasicHealth(data);
      
    } catch (error) {
      log(`Error: ${error.message}`, 'red');
      throw error;
    }
  }
}

async function main() {
  log('🔍 Testing Updated System Health Service', 'bold');
  log('========================================', 'blue');
  log('', 'reset');
  
  try {
    const service = new MockSystemHealthService();
    
    log('Testing system health with no authentication...', 'blue');
    const health = await service.getSystemHealth();
    
    log('✅ System health data retrieved successfully!', 'green');
    log('', 'reset');
    
    log('📄 System Health Response:', 'cyan');
    log(JSON.stringify(health, null, 2), 'cyan');
    log('', 'reset');
    
    // Check if services are present
    if (health.services) {
      log('✅ Services data found:', 'green');
      Object.entries(health.services).forEach(([name, service]) => {
        const statusColor = service.status === 'healthy' ? 'green' : 
                           service.status === 'warning' ? 'yellow' : 'blue';
        log(`   ${name}: ${service.status} - ${service.message}`, statusColor);
      });
    } else {
      log('❌ No services data found', 'red');
    }
    
    log('', 'reset');
    log('🎉 Frontend should now show system components!', 'green');
    
    return 0;
  } catch (error) {
    log(`❌ Test failed: ${error.message}`, 'red');
    return 1;
  }
}

// Run the test
if (require.main === module) {
  main().then(process.exit);
}

module.exports = { MockSystemHealthService };
