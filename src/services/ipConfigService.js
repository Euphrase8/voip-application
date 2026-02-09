// IP Configuration Service
// Manages IP configuration storage and retrieval for VoIP application

class IPConfigService {
  constructor() {
    this.CONFIG_KEY = 'voipIPConfig';
    this.CONFIGURED_KEY = 'voipConfigured';
    this.defaultConfig = {
      // Default to LAN IP so the app works from your phone too.
      // You can change this in the IP Configuration page.
      backendHost: '192.168.1.2',
      backendPort: '8080',
      asteriskHost: '192.168.1.2',
      asteriskPort: '8088',
      asteriskAMIPort: '5038'
    };
  }

  // Check if the application has been configured
  isConfigured() {
    const configured = localStorage.getItem(this.CONFIGURED_KEY);
    const config = localStorage.getItem(this.CONFIG_KEY);
    return configured === 'true' && config !== null;
  }

  // Get the current IP configuration
  getConfig() {
    try {
      const configStr = localStorage.getItem(this.CONFIG_KEY);
      if (configStr) {
        const config = JSON.parse(configStr);
        // Merge with defaults to ensure all required fields exist
        return { ...this.defaultConfig, ...config };
      }
    } catch (error) {
      console.error('[IPConfigService] Failed to parse stored config:', error);
    }
    
    return this.defaultConfig;
  }

  // Save IP configuration
  saveConfig(config) {
    try {
      // Validate required fields
      const requiredFields = ['backendHost', 'backendPort', 'asteriskHost', 'asteriskPort'];
      for (const field of requiredFields) {
        if (!config[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Save configuration
      localStorage.setItem(this.CONFIG_KEY, JSON.stringify(config));
      localStorage.setItem(this.CONFIGURED_KEY, 'true');
      
      console.log('[IPConfigService] Configuration saved successfully:', config);
      return true;
    } catch (error) {
      console.error('[IPConfigService] Failed to save config:', error);
      throw error;
    }
  }

  // Reset configuration (for testing or reconfiguration)
  resetConfig() {
    localStorage.removeItem(this.CONFIG_KEY);
    localStorage.removeItem(this.CONFIGURED_KEY);
    console.log('[IPConfigService] Configuration reset');
  }

  // Get backend URL
  getBackendUrl() {
    const config = this.getConfig();
    return `http://${config.backendHost}:${config.backendPort}`;
  }

  // Get backend WebSocket URL
  getBackendWebSocketUrl() {
    const config = this.getConfig();
    return `ws://${config.backendHost}:${config.backendPort}/ws`;
  }

  // Get Asterisk WebSocket URL
  getAsteriskWebSocketUrl() {
    const config = this.getConfig();
    return `ws://${config.asteriskHost}:${config.asteriskPort}/ws`;
  }

  // Get Asterisk AMI URL
  getAsteriskAMIUrl() {
    const config = this.getConfig();
    return `${config.asteriskHost}:${config.asteriskAMIPort}`;
  }

  // Get Asterisk host
  getAsteriskHost() {
    const config = this.getConfig();
    return config.asteriskHost;
  }

  // Get backend host
  getBackendHost() {
    const config = this.getConfig();
    return config.backendHost;
  }

  // Test backend connection
  async testBackendConnection(config = null) {
    const testConfig = config || this.getConfig();
    const backendUrl = `http://${testConfig.backendHost}:${testConfig.backendPort}`;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${backendUrl}/config`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          return { 
            success: true, 
            message: 'Backend connection successful',
            data: data.config 
          };
        }
      }
      
      return { 
        success: false, 
        message: `Backend responded with status ${response.status}` 
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        return { 
          success: false, 
          message: 'Backend connection timeout' 
        };
      }
      return { 
        success: false, 
        message: `Backend connection failed: ${error.message}` 
      };
    }
  }

  // Test Asterisk connection through backend (recommended approach)
  async testAsteriskConnection(config = null) {
    const testConfig = config || this.getConfig();

    try {
      // Test through backend API instead of direct connection
      const backendUrl = `http://${testConfig.backendHost}:${testConfig.backendPort}`;

      // Get auth token from localStorage (optional for initial configuration)
      const token = localStorage.getItem('token');

      // Try public endpoint first (for initial configuration), then protected endpoint
      let response;
      let endpoint;

      if (!token) {
        // Use public endpoint for initial configuration
        endpoint = `${backendUrl}/api/test-asterisk`;
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            asteriskHost: testConfig.asteriskHost,
            asteriskPort: testConfig.asteriskPort,
            asteriskAMIPort: testConfig.asteriskAMIPort
          }),
          timeout: 10000
        });
      } else {
        // Use protected endpoint when authenticated
        endpoint = `${backendUrl}/protected/test-asterisk`;
        response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
      }

      if (!response.ok) {
        throw new Error(`Backend test failed: HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.results) {
        const tests = data.results.tests;
        const overallSuccess = data.results.overall_success;

        return {
          success: overallSuccess,
          message: overallSuccess
            ? 'All Asterisk services are working correctly'
            : 'Some Asterisk services need configuration',
          details: {
            ami: tests.ami,
            http: tests.http,
            websocket: tests.websocket,
            summary: data.results.summary
          }
        };
      } else {
        return {
          success: false,
          message: 'Backend test endpoint returned unexpected response',
          details: data
        };
      }
    } catch (error) {
      // Fallback: If backend test fails, indicate that backend connection is the issue
      return {
        success: false,
        message: `Cannot test Asterisk through backend: ${error.message}`,
        details: {
          error: error.message,
          suggestion: 'Check if backend is running and accessible'
        }
      };
    }
  }

  // Test all connections
  async testAllConnections(config = null) {
    const testConfig = config || this.getConfig();
    
    console.log('[IPConfigService] Testing all connections with config:', testConfig);
    
    const results = {
      backend: await this.testBackendConnection(testConfig),
      asterisk: await this.testAsteriskConnection(testConfig)
    };

    const allSuccessful = results.backend.success && results.asterisk.success;
    
    return {
      success: allSuccessful,
      results,
      message: allSuccessful 
        ? 'All connections successful' 
        : 'Some connections failed'
    };
  }

  // Get configuration for frontend services
  getFrontendConfig() {
    const config = this.getConfig();
    return {
      api_url: this.getBackendUrl(),
      ws_url: this.getBackendWebSocketUrl(),
      asterisk: {
        host: config.asteriskHost,
        ws_url: this.getAsteriskWebSocketUrl(),
        ami_url: this.getAsteriskAMIUrl()
      },
      backend: {
        host: config.backendHost,
        port: config.backendPort
      },
      _source: 'ipConfigService',
      _loadedAt: new Date().toISOString()
    };
  }

  // Update configuration (partial update)
  updateConfig(updates) {
    const currentConfig = this.getConfig();
    const newConfig = { ...currentConfig, ...updates };
    return this.saveConfig(newConfig);
  }

  // Export configuration for backup
  exportConfig() {
    const config = this.getConfig();
    const exportData = {
      config,
      timestamp: new Date().toISOString(),
      version: '1.0'
    };
    return JSON.stringify(exportData, null, 2);
  }

  // Import configuration from backup
  importConfig(configData) {
    try {
      const data = typeof configData === 'string' ? JSON.parse(configData) : configData;
      
      if (data.config) {
        this.saveConfig(data.config);
        return true;
      } else {
        throw new Error('Invalid configuration format');
      }
    } catch (error) {
      console.error('[IPConfigService] Failed to import config:', error);
      throw error;
    }
  }
}

// Create singleton instance
const ipConfigService = new IPConfigService();

export default ipConfigService;
