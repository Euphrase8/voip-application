// Asterisk Connection Diagnostics
// Helps diagnose and fix Asterisk connectivity issues

import { CONFIG } from '../services/config';

class AsteriskConnectionDiagnostics {
  constructor() {
    this.results = {};
  }

  // Run comprehensive diagnostics
  async runDiagnostics() {
    console.log('🔍 Starting Asterisk Connection Diagnostics...');
    
    const tests = [
      { name: 'Backend Health Check', test: this.testBackendHealth.bind(this) },
      { name: 'Asterisk HTTP Interface', test: this.testAsteriskHTTP.bind(this) },
      { name: 'Network Connectivity', test: this.testNetworkConnectivity.bind(this) },
      { name: 'Configuration Check', test: this.checkConfiguration.bind(this) },
      { name: 'AMI Connection Test', test: this.testAMIConnection.bind(this) }
    ];

    for (const test of tests) {
      console.log(`\n🧪 Running: ${test.name}`);
      try {
        this.results[test.name] = await test.test();
        console.log(`✅ ${test.name}: ${this.results[test.name].status}`);
      } catch (error) {
        this.results[test.name] = {
          status: 'FAILED',
          error: error.message,
          details: error
        };
        console.log(`❌ ${test.name}: FAILED - ${error.message}`);
      }
    }

    return this.generateReport();
  }

  // Test backend health endpoint
  async testBackendHealth() {
    // Backend exposes /health (public). Older frontend code called /api/system/health,
    // but that endpoint does not exist in this backend.
    const response = await fetch(`${CONFIG.API_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Backend health check failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      status: data.status === 'ok' ? 'HEALTHY' : 'FAILED',
      details: {
        backendService: data.service,
        backendStatus: data.status,
        responseTime: data.response_time_ms,
        timestamp: data.timestamp
      }
    };
  }

  // Test Asterisk HTTP interface
  async testAsteriskHTTP() {
    const asteriskHost = CONFIG.SIP_SERVER || 'localhost';
    const asteriskPort = CONFIG.SIP_PORT || '8088';
    const testUrl = `http://${asteriskHost}:${asteriskPort}/`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(testUrl, {
        method: 'GET',
        signal: controller.signal,
        mode: 'no-cors'
      });
      
      clearTimeout(timeoutId);
      
      return {
        status: 'REACHABLE',
        details: {
          url: testUrl,
          host: asteriskHost,
          port: asteriskPort
        }
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Timeout connecting to ${testUrl}`);
      }
      throw new Error(`Cannot reach Asterisk HTTP interface at ${testUrl}: ${error.message}`);
    }
  }

  // Test network connectivity
  async testNetworkConnectivity() {
    const tests = [];

    // Only test hosts that matter for *this* configuration.
    // Testing random discovery names like asterisk.local creates false WARNINGS.
    const primaryHost = CONFIG.SIP_SERVER || 'localhost';
    const hosts = [primaryHost, 'localhost', '127.0.0.1', '192.168.1.2'];

    for (const host of [...new Set(hosts)].filter(Boolean)) {
      try {
        const testUrl = `http://${host}:8088/`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        await fetch(testUrl, {
          method: 'HEAD',
          signal: controller.signal,
          mode: 'no-cors'
        });

        clearTimeout(timeoutId);
        tests.push({ host, status: 'REACHABLE' });
      } catch (error) {
        tests.push({
          host,
          status: 'UNREACHABLE',
          error: error.name === 'AbortError' ? 'Timeout' : error.message
        });
      }
    }

    const reachableHosts = tests.filter(t => t.status === 'REACHABLE');
    const primaryReachable = reachableHosts.some(t => t.host === primaryHost);

    // If the configured SIP server is reachable, treat network as healthy.
    // PARTIAL is reserved for cases where only fallbacks are reachable.
    const status = primaryReachable ? 'HEALTHY' : (reachableHosts.length > 0 ? 'PARTIAL' : 'FAILED');

    return {
      status,
      details: {
        primaryHost,
        primaryReachable,
        tests,
        reachableHosts: reachableHosts.map(t => t.host),
        totalTested: tests.length,
        reachableCount: reachableHosts.length
      }
    };
  }

  // Check configuration
  async checkConfiguration() {
    const config = {
      apiUrl: CONFIG.API_URL,
      sipServer: CONFIG.SIP_SERVER,
      sipPort: CONFIG.SIP_PORT,
      wsUrl: CONFIG.SIP_WS_URL,
      clientIp: CONFIG.CLIENT_IP
    };

    const issues = [];
    
    // Check for localhost/IP mismatches
    if (config.sipServer === 'localhost' && config.clientIp !== 'localhost') {
      issues.push('SIP server is localhost but client IP is not - may cause connectivity issues');
    }

    // Check for missing configuration
    Object.entries(config).forEach(([key, value]) => {
      if (!value || value === 'undefined') {
        issues.push(`Missing configuration: ${key}`);
      }
    });

    // Check WebSocket URL format
    if (config.wsUrl && !config.wsUrl.startsWith('ws://') && !config.wsUrl.startsWith('wss://')) {
      issues.push('WebSocket URL should start with ws:// or wss://');
    }

    return {
      status: issues.length === 0 ? 'VALID' : 'ISSUES_FOUND',
      details: {
        config,
        issues,
        recommendations: this.getConfigRecommendations(config, issues)
      }
    };
  }

  // Test AMI connection through backend
  async testAMIConnection() {
    try {
      // Use the backend public Asterisk test endpoint.
      // This endpoint validates AMI + HTTP + WebSocket against a provided host/ports.
      const response = await fetch(`${CONFIG.API_URL}/api/test-asterisk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asteriskHost: CONFIG.SIP_SERVER || 'localhost',
          asteriskPort: String(CONFIG.SIP_PORT || '8088'),
          asteriskAMIPort: '5038'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const results = data.results;

      if (!data.success || !results) {
        throw new Error(data.error || 'Invalid test response');
      }

      const overall = results.overall_success ? 'HEALTHY' : 'FAILED';

      return {
        status: overall,
        details: {
          overall_success: results.overall_success,
          summary: results.summary,
          tests: results.tests
        }
      };
    } catch (error) {
      throw new Error(`AMI connection test failed: ${error.message}`);
    }
  }

  // Get configuration recommendations
  getConfigRecommendations(config, issues) {
    const recommendations = [];

    if (issues.some(i => i.includes('localhost'))) {
      recommendations.push('Consider using actual IP addresses instead of localhost for better network compatibility');
    }

    if (issues.some(i => i.includes('Missing'))) {
      recommendations.push('Ensure all required environment variables are set in your .env file');
    }

    if (config.sipServer === 'localhost') {
      recommendations.push('If Asterisk is on a different machine, update REACT_APP_SIP_SERVER to the correct IP');
    }

    return recommendations;
  }

  // Generate diagnostic report
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      overall: this.determineOverallStatus(),
      results: this.results,
      recommendations: this.generateRecommendations()
    };

    console.log('\n📋 DIAGNOSTIC REPORT');
    console.log('===================');
    console.log(`Overall Status: ${report.overall}`);
    console.log(`Timestamp: ${report.timestamp}`);
    
    console.log('\n📊 Test Results:');
    Object.entries(this.results).forEach(([test, result]) => {
      const icon = result.status === 'FAILED' ? '❌' : 
                   result.status === 'PARTIAL' ? '⚠️' : '✅';
      console.log(`${icon} ${test}: ${result.status}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
    }

    return report;
  }

  // Determine overall status
  determineOverallStatus() {
    const statuses = Object.values(this.results).map(r => r.status);
    
    if (statuses.includes('FAILED')) return 'FAILED';
    if (statuses.includes('ISSUES_FOUND')) return 'WARNING';

    // Treat PARTIAL network discovery as warning only if core services aren't healthy.
    // (Network discovery can be noisy; the primary host test already marks HEALTHY.)
    if (statuses.includes('PARTIAL')) return 'WARNING';

    if (statuses.every(s => s === 'HEALTHY' || s === 'REACHABLE' || s === 'VALID')) return 'HEALTHY';
    
    return 'UNKNOWN';
  }

  // Generate recommendations based on results
  generateRecommendations() {
    const recommendations = [];
    
    // Check backend health
    const backendHealth = this.results['Backend Health Check'];
    if (backendHealth?.details?.asteriskStatus === 'unhealthy') {
      recommendations.push('Asterisk AMI connection is failing. Check Asterisk server status and AMI configuration.');
    }

    // Check HTTP interface
    const httpTest = this.results['Asterisk HTTP Interface'];
    if (httpTest?.status === 'FAILED') {
      recommendations.push('Asterisk HTTP interface is not reachable. Verify Asterisk is running and HTTP is enabled.');
    }

    // Check network connectivity
    const networkTest = this.results['Network Connectivity'];
    if (networkTest?.status === 'FAILED') {
      recommendations.push('No Asterisk servers are reachable. Check network configuration and firewall settings.');
    }

    // Check configuration
    const configTest = this.results['Configuration Check'];
    if (configTest?.details?.issues?.length > 0) {
      recommendations.push('Configuration issues detected. Review environment variables and network settings.');
    }

    // Check AMI
    const amiTest = this.results['AMI Connection Test'];
    if (amiTest?.status === 'FAILED') {
      recommendations.push('AMI connection failed. Verify AMI credentials and network connectivity to port 5038.');
    }

    return recommendations;
  }
}

// Export singleton instance
const asteriskDiagnostics = new AsteriskConnectionDiagnostics();

// Add to window for easy access in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.asteriskDiagnostics = asteriskDiagnostics;
}

export default asteriskDiagnostics;
