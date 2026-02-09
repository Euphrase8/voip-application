// Asterisk Configuration Helper
// Tool to help configure and test Asterisk connection settings

import { showToast } from './toastUtils';

class AsteriskConfigHelper {
  constructor() {
    this.commonHosts = [
      { name: 'This PC (LAN IP 192.168.1.2)', host: '192.168.1.2', port: '5038' },
      { name: 'Localhost (same machine)', host: 'localhost', port: '5038' },
      { name: 'Local Docker (asterisk.local)', host: 'asterisk.local', port: '5038' },
      { name: 'Other LAN (192.168.1.100)', host: '192.168.1.100', port: '5038' },
      { name: 'Custom', host: '', port: '5038' }
    ];
  }

  // Get current backend configuration
  async getCurrentConfig() {
    try {
      const response = await fetch('/api/config', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        return data.config || {};
      } else {
        throw new Error(`Config API returned ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to get current config:', error);
      return null;
    }
  }

  // Test connection to a specific Asterisk host
  async testConnection(host, port = '5038') {
    const testResults = {
      host,
      port,
      tests: {},
      overall: 'unknown'
    };

    // Test 1: HTTP connectivity (Asterisk HTTP interface on port 8088)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`http://${host}:8088/`, {
        method: 'GET',
        signal: controller.signal,
        mode: 'no-cors'
      });
      
      clearTimeout(timeoutId);
      testResults.tests.http = { status: 'pass', message: 'HTTP interface reachable' };
    } catch (error) {
      testResults.tests.http = { 
        status: 'fail', 
        message: `HTTP interface not reachable: ${error.message}` 
      };
    }

    // Test 2: Backend health check with this host
    try {
      const response = await fetch('/api/test-asterisk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asteriskHost: host,
          asteriskPort: '8088',
          asteriskAMIPort: port
        })
      });

      if (response.ok) {
        const data = await response.json();
        const ok = !!data?.results?.overall_success;
        testResults.tests.ami = ok
          ? { status: 'pass', message: 'AMI/HTTP/WebSocket tests passed via backend' }
          : { status: 'fail', message: `Asterisk tests failed: ${data?.results?.summary || data?.error || 'Unknown error'}` };
      } else {
        testResults.tests.ami = {
          status: 'fail',
          message: `Asterisk test failed: ${response.status}`
        };
      }
    } catch (error) {
      testResults.tests.ami = { 
        status: 'fail', 
        message: `AMI test failed: ${error.message}` 
      };
    }

    // Determine overall result
    const passedTests = Object.values(testResults.tests).filter(t => t.status === 'pass').length;
    const totalTests = Object.keys(testResults.tests).length;
    
    if (passedTests === totalTests) {
      testResults.overall = 'pass';
    } else if (passedTests > 0) {
      testResults.overall = 'partial';
    } else {
      testResults.overall = 'fail';
    }

    return testResults;
  }

  // Auto-discover Asterisk servers
  async autoDiscover() {
    showToast.info('🔍 Scanning for Asterisk servers...');
    
    const results = [];
    
    for (const hostConfig of this.commonHosts.slice(0, -1)) { // Exclude "Custom"
      try {
        const testResult = await this.testConnection(hostConfig.host, hostConfig.port);
        results.push({
          ...hostConfig,
          ...testResult
        });
      } catch (error) {
        results.push({
          ...hostConfig,
          overall: 'fail',
          tests: { error: { status: 'fail', message: error.message } }
        });
      }
    }

    const workingServers = results.filter(r => r.overall === 'pass' || r.overall === 'partial');
    
    if (workingServers.length > 0) {
      showToast.success(`✅ Found ${workingServers.length} working Asterisk server(s)`);
      console.log('[AsteriskConfigHelper] Working servers:', workingServers);
    } else {
      showToast.warning('⚠️ No working Asterisk servers found');
    }

    return results;
  }

  // Update backend configuration
  async updateConfig(newConfig) {
    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asterisk: newConfig
        })
      });

      if (response.ok) {
        const data = await response.json();
        showToast.success('✅ Configuration updated successfully');
        return data;
      } else {
        throw new Error(`Config update failed: ${response.status}`);
      }
    } catch (error) {
      showToast.error('❌ Failed to update configuration: ' + error.message);
      throw error;
    }
  }

  // Get configuration suggestions based on current environment
  getConfigSuggestions() {
    const suggestions = [
      {
        title: 'Docker Environment',
        description: 'If running Asterisk in Docker with default settings',
        config: {
          host: 'asterisk.local',
          port: '5038',
          username: 'admin',
          secret: 'amp111'
        },
        priority: 'high'
      },
      {
        title: 'Local Network Server',
        description: 'If Asterisk is running on a local network server',
        config: {
          host: '192.168.1.2',
          port: '5038',
          username: 'admin',
          secret: 'amp111'
        },
        priority: 'high'
      },
      {
        title: 'Localhost Installation',
        description: 'If Asterisk is installed locally on the same machine',
        config: {
          host: 'localhost',
          port: '5038',
          username: 'admin',
          secret: 'amp111'
        },
        priority: 'medium'
      },
      {
        title: 'Custom Network',
        description: 'For custom network configurations',
        config: {
          host: '192.168.1.100',
          port: '5038',
          username: 'admin',
          secret: 'amp111'
        },
        priority: 'low'
      }
    ];

    return suggestions;
  }

  // Generate environment variable commands
  generateEnvCommands(config) {
    const commands = {
      windows: [
        `set ASTERISK_HOST=${config.host}`,
        `set ASTERISK_AMI_PORT=${config.port}`,
        `set ASTERISK_AMI_USERNAME=${config.username}`,
        `set ASTERISK_AMI_SECRET=${config.secret}`
      ],
      linux: [
        `export ASTERISK_HOST=${config.host}`,
        `export ASTERISK_AMI_PORT=${config.port}`,
        `export ASTERISK_AMI_USERNAME=${config.username}`,
        `export ASTERISK_AMI_SECRET=${config.secret}`
      ],
      docker: [
        `-e ASTERISK_HOST=${config.host}`,
        `-e ASTERISK_AMI_PORT=${config.port}`,
        `-e ASTERISK_AMI_USERNAME=${config.username}`,
        `-e ASTERISK_AMI_SECRET=${config.secret}`
      ]
    };

    return commands;
  }

  // Quick fix for common issues
  async quickFix() {
    showToast.info('🔧 Attempting quick fix...');
    
    // Try auto-discovery first
    const discoveryResults = await this.autoDiscover();
    const workingServer = discoveryResults.find(r => r.overall === 'pass');
    
    if (workingServer) {
      // Update configuration with working server
      try {
        await this.updateConfig({
          host: workingServer.host,
          port: workingServer.port,
          username: 'admin',
          secret: 'amp111'
        });
        
        showToast.success('✅ Quick fix applied! Asterisk should now be online.');
        return true;
      } catch (error) {
        showToast.error('❌ Quick fix failed: ' + error.message);
        return false;
      }
    } else {
      showToast.warning('⚠️ No working Asterisk servers found for quick fix');
      return false;
    }
  }
}

// Create singleton instance
const asteriskConfigHelper = new AsteriskConfigHelper();

// Make available globally for debugging
if (typeof window !== 'undefined') {
  window.asteriskConfigHelper = asteriskConfigHelper;
}

export default asteriskConfigHelper;
