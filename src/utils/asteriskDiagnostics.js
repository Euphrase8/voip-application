// Asterisk Connection Diagnostics
// Tool to help diagnose and fix Asterisk connectivity issues

import { healthToast, showToast } from './toastUtils';

class AsteriskDiagnostics {
  constructor() {
    this.diagnosticResults = {};
  }

  // Run comprehensive Asterisk diagnostics
  async runDiagnostics() {
    console.log('[AsteriskDiagnostics] Starting comprehensive diagnostics...');
    
    const results = {
      timestamp: new Date().toISOString(),
      tests: {},
      summary: {
        passed: 0,
        failed: 0,
        warnings: 0
      }
    };

    // Test 1: Backend Health Check
    results.tests.backendHealth = await this.testBackendHealth();
    
    // Test 2: System Health API
    results.tests.systemHealth = await this.testSystemHealthAPI();
    
    // Test 3: Configuration Check
    results.tests.configuration = await this.testConfiguration();
    
    // Test 4: Network Connectivity
    results.tests.networkConnectivity = await this.testNetworkConnectivity();
    
    // Test 5: AMI Port Check
    results.tests.amiPort = await this.testAMIPort();

    // Calculate summary
    Object.values(results.tests).forEach(test => {
      if (test.status === 'pass') results.summary.passed++;
      else if (test.status === 'fail') results.summary.failed++;
      else if (test.status === 'warning') results.summary.warnings++;
    });

    this.diagnosticResults = results;
    this.displayResults(results);
    
    return results;
  }

  // Test backend health endpoint
  async testBackendHealth() {
    try {
      const response = await fetch('/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        return {
          status: 'pass',
          message: 'Backend health endpoint accessible',
          details: data
        };
      } else {
        return {
          status: 'fail',
          message: `Backend health endpoint returned ${response.status}`,
          details: { status: response.status, statusText: response.statusText }
        };
      }
    } catch (error) {
      return {
        status: 'fail',
        message: 'Cannot reach backend health endpoint',
        details: { error: error.message }
      };
    }
  }

  // Test system health API specifically
  async testSystemHealthAPI() {
    try {
      // Backend does not provide /api/system/health.
      // Use public /api/test-asterisk to validate Asterisk connectivity.
      const response = await fetch('/api/test-asterisk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asteriskHost: '192.168.1.2',
          asteriskPort: '8088',
          asteriskAMIPort: '5038'
        })
      });

      if (response.ok) {
        const data = await response.json();

        if (!data.success || !data.results) {
          return {
            status: 'fail',
            message: 'Invalid Asterisk test response format',
            details: data
          };
        }

        const overallSuccess = !!data.results.overall_success;
        return {
          status: overallSuccess ? 'pass' : 'fail',
          message: overallSuccess ? 'Asterisk connectivity tests passed' : `Asterisk connectivity tests failed: ${data.results.summary}`,
          details: data.results
        };
      } else {
        return {
          status: 'fail',
          message: `System health API returned ${response.status}`,
          details: { status: response.status }
        };
      }
    } catch (error) {
      return {
        status: 'fail',
        message: 'Cannot reach system health API',
        details: { error: error.message }
      };
    }
  }

  // Test configuration
  async testConfiguration() {
    try {
      const response = await fetch('/api/config', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.success && data.config) {
          const asteriskConfig = data.config.asterisk;
          
          if (asteriskConfig && asteriskConfig.host) {
            return {
              status: 'pass',
              message: `Asterisk configured at: ${asteriskConfig.host}`,
              details: asteriskConfig
            };
          } else {
            return {
              status: 'warning',
              message: 'Asterisk configuration incomplete',
              details: data.config
            };
          }
        } else {
          return {
            status: 'fail',
            message: 'Invalid configuration response',
            details: data
          };
        }
      } else {
        return {
          status: 'fail',
          message: `Configuration API returned ${response.status}`,
          details: { status: response.status }
        };
      }
    } catch (error) {
      return {
        status: 'fail',
        message: 'Cannot reach configuration API',
        details: { error: error.message }
      };
    }
  }

  // Test network connectivity to common Asterisk hosts
  async testNetworkConnectivity() {
    const commonHosts = [
      'asterisk.local',
      '192.168.1.2',
      '192.168.1.100',
      'localhost'
    ];

    const results = [];
    
    for (const host of commonHosts) {
      try {
        // Try to reach the host via HTTP (port 8088 - Asterisk HTTP)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(`http://${host}:8088/`, {
          method: 'GET',
          signal: controller.signal,
          mode: 'no-cors' // Avoid CORS issues for testing
        });
        
        clearTimeout(timeoutId);
        
        results.push({
          host,
          reachable: true,
          method: 'HTTP:8088'
        });
      } catch (error) {
        results.push({
          host,
          reachable: false,
          error: error.message
        });
      }
    }

    const reachableHosts = results.filter(r => r.reachable);
    
    if (reachableHosts.length > 0) {
      return {
        status: 'pass',
        message: `Found ${reachableHosts.length} reachable Asterisk host(s)`,
        details: { results, reachableHosts }
      };
    } else {
      return {
        status: 'fail',
        message: 'No Asterisk hosts reachable',
        details: { results }
      };
    }
  }

  // Test AMI port connectivity
  async testAMIPort() {
    // This is limited in browser environment, but we can try some checks
    return {
      status: 'warning',
      message: 'AMI port test limited in browser environment',
      details: {
        note: 'AMI (port 5038) connectivity must be tested from backend',
        suggestion: 'Check backend logs for AMI connection errors'
      }
    };
  }

  // Display diagnostic results
  displayResults(results) {
    console.log('[AsteriskDiagnostics] Diagnostic Results:', results);
    
    const { passed, failed, warnings } = results.summary;
    
    if (failed === 0 && warnings === 0) {
      showToast.success(`✅ All diagnostics passed (${passed}/${passed + failed + warnings})`);
    } else if (failed === 0) {
      showToast.warning(`⚠️ Diagnostics completed with warnings (${passed} passed, ${warnings} warnings)`);
    } else {
      showToast.error(`❌ Diagnostics found issues (${passed} passed, ${failed} failed, ${warnings} warnings)`);
    }

    // Show specific issues
    Object.entries(results.tests).forEach(([testName, result]) => {
      if (result.status === 'fail') {
        console.error(`[AsteriskDiagnostics] ${testName} FAILED:`, result.message, result.details);
      } else if (result.status === 'warning') {
        console.warn(`[AsteriskDiagnostics] ${testName} WARNING:`, result.message, result.details);
      }
    });
  }

  // Get suggestions based on diagnostic results
  getSuggestions() {
    const suggestions = [];
    
    if (!this.diagnosticResults.tests) {
      suggestions.push('Run diagnostics first using asteriskDiagnostics.runDiagnostics()');
      return suggestions;
    }

    const { tests } = this.diagnosticResults;

    // Backend health issues
    if (tests.backendHealth?.status === 'fail') {
      suggestions.push('🔧 Backend is not responding - check if backend server is running');
    }

    // System health API issues
    if (tests.systemHealth?.status === 'fail') {
      const details = tests.systemHealth.details;
      if (details?.error?.includes('AMI')) {
        suggestions.push('🔧 AMI connection failed - check Asterisk AMI configuration');
        suggestions.push('🔧 Verify ASTERISK_HOST environment variable points to correct IP');
        suggestions.push('🔧 Check if Asterisk AMI is enabled and accessible on port 5038');
      }
    }

    // Configuration issues
    if (tests.configuration?.status !== 'pass') {
      suggestions.push('🔧 Check backend configuration - ensure Asterisk host is properly set');
    }

    // Network connectivity issues
    if (tests.networkConnectivity?.status === 'fail') {
      suggestions.push('🔧 No Asterisk hosts reachable - check network connectivity');
      suggestions.push('🔧 Try setting ASTERISK_HOST to your Asterisk server IP (e.g., 192.168.1.2)');
    }

    return suggestions;
  }

  // Quick fix suggestions
  getQuickFixes() {
    return [
      {
        title: 'Set Asterisk Host Environment Variable',
        description: 'Set ASTERISK_HOST to your Asterisk server IP',
        command: 'export ASTERISK_HOST=192.168.1.2',
        type: 'environment'
      },
      {
        title: 'Check Asterisk Service',
        description: 'Verify Asterisk is running on the server',
        command: 'systemctl status asterisk',
        type: 'system'
      },
      {
        title: 'Test AMI Connection',
        description: 'Test AMI connectivity from backend server',
        command: 'telnet 192.168.1.2 5038',
        type: 'network'
      },
      {
        title: 'Check AMI Configuration',
        description: 'Verify AMI is enabled in Asterisk',
        command: 'asterisk -rx "manager show settings"',
        type: 'asterisk'
      }
    ];
  }
}

// Create singleton instance
const asteriskDiagnostics = new AsteriskDiagnostics();

// Make available globally for debugging
if (typeof window !== 'undefined') {
  window.asteriskDiagnostics = asteriskDiagnostics;
}

export default asteriskDiagnostics;
