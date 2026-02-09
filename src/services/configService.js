// Dynamic Configuration Service
// This service fetches configuration from the backend instead of using hardcoded values

import ipConfigService from './ipConfigService';

class ConfigService {
  constructor() {
    this.config = null;
    this.isLoaded = false;
    this.loadPromise = null;
  }

  // Load configuration from backend
  async loadConfig() {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this._fetchConfig();
    return this.loadPromise;
  }

  async _fetchConfig() {
    try {
      console.log('[ConfigService] Loading dynamic configuration...');
      
      // Try multiple possible backend locations
      const possibleHosts = this._getPossibleBackendHosts();
      
      for (const host of possibleHosts) {
        try {
          console.log(`[ConfigService] Trying backend at: ${host}`);
          
          const response = await fetch(`${host}/config`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 5000,
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.config) {
              this.config = {
                ...data.config,
                _source: host,
                _loadedAt: new Date().toISOString(),
              };
              this.isLoaded = true;
              
              console.log('[ConfigService] ✓ Configuration loaded successfully from:', host);
              console.log('[ConfigService] Config:', this.config);
              
              return this.config;
            }
          }
        } catch (error) {
          console.log(`[ConfigService] Failed to load from ${host}:`, error.message);
          continue;
        }
      }

      // If all backends fail, use fallback configuration
      console.warn('[ConfigService] All backends failed, using fallback configuration');
      this.config = this._getFallbackConfig();
      this.isLoaded = true;
      
      return this.config;
      
    } catch (error) {
      console.error('[ConfigService] Failed to load configuration:', error);
      this.config = this._getFallbackConfig();
      this.isLoaded = true;
      return this.config;
    }
  }

  // Get possible backend host locations
  _getPossibleBackendHosts() {
    const currentHost = window.location.hostname;
    const protocol = window.location.protocol;

    // Get configured backend URL if available
    const configuredBackendUrl = ipConfigService.isConfigured()
      ? ipConfigService.getBackendUrl()
      : null;

    return [
      // Environment-specific (highest priority)
      ...(process.env.REACT_APP_API_URL ? [process.env.REACT_APP_API_URL] : []),

      // User-configured backend (high priority)
      ...(configuredBackendUrl ? [configuredBackendUrl] : []),

      // Known backend server IP (for network access)
      'http://localhost:8080',

      // Same host as frontend (common in development)
      `${protocol}//${currentHost}:8080`,

      // Current network variations
      ...(currentHost !== 'localhost' && currentHost !== '127.0.0.1' ? [
        `${protocol}//${currentHost}:8080`,
      ] : []),

      // Localhost variations (lowest priority for network access)
      `http://localhost:8080`,
      `http://127.0.0.1:8080`,

      // Service discovery names
      `http://voip-backend:8080`,
      `http://backend.local:8080`,
    ];
  }

  // Fallback configuration when backend is unreachable
  _getFallbackConfig() {
    const currentHost = window.location.hostname;

    // Use configured IPs if available, otherwise use defaults
    let backendHost, asteriskHost;

    if (ipConfigService.isConfigured()) {
      const config = ipConfigService.getConfig();
      backendHost = config.backendHost;
      asteriskHost = config.asteriskHost;
    } else {
      // Use localhost for development, fallback to current host
      backendHost = (currentHost === 'localhost' || currentHost === '127.0.0.1')
        ? 'localhost'
        : currentHost;
      asteriskHost = '192.168.1.2';
    }

    return {
      api_url: `http://${backendHost}:8080`,
      ws_url: `ws://${backendHost}:8080/ws`,
      asterisk: {
        host: asteriskHost,
        ws_url: `ws://${asteriskHost}:8088/ws`,
      },
      environment: 'development',
      debug: true,
      service: 'voip-frontend',
      _source: 'fallback',
      _loadedAt: new Date().toISOString(),
    };
  }

  // Get configuration value with fallback
  get(key, fallback = null) {
    if (!this.isLoaded) {
      console.warn('[ConfigService] Configuration not loaded yet, using fallback');
      return fallback;
    }

    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return fallback;
      }
    }
    
    return value;
  }

  // Get API URL
  getApiUrl() {
    if (ipConfigService.isConfigured()) {
      return ipConfigService.getBackendUrl();
    }
    return this.get('api_url', 'http://192.168.1.2:8080');
  }

  // Get WebSocket URL
  getWebSocketUrl() {
    if (ipConfigService.isConfigured()) {
      return ipConfigService.getBackendWebSocketUrl();
    }
    return this.get('ws_url', 'ws://192.168.1.2:8080/ws');
  }

  // Get Asterisk WebSocket URL
  getAsteriskWebSocketUrl() {
    if (ipConfigService.isConfigured()) {
      return ipConfigService.getAsteriskWebSocketUrl();
    }
    return this.get('asterisk.ws_url', 'ws://192.168.1.2:8088/ws');
  }

  // Get Asterisk Host
  getAsteriskHost() {
    if (ipConfigService.isConfigured()) {
      return ipConfigService.getAsteriskHost();
    }
    return this.get('asterisk.host', '192.168.1.2');
  }



  // Check if debug mode is enabled
  isDebugMode() {
    return this.get('debug', false);
  }

  // Get environment
  getEnvironment() {
    return this.get('environment', 'development');
  }

  // Get full configuration
  getConfig() {
    return this.config;
  }

  // Reload configuration
  async reload() {
    this.config = null;
    this.isLoaded = false;
    this.loadPromise = null;
    return this.loadConfig();
  }

  // Health check for current backend
  async healthCheck() {
    try {
      const apiUrl = this.getApiUrl();
      const response = await fetch(`${apiUrl}/health`, {
        method: 'GET',
        timeout: 5000,
      });
      
      if (response.ok) {
        const data = await response.json();
        return {
          healthy: true,
          status: data.status,
          backend: apiUrl,
        };
      }
      
      return {
        healthy: false,
        error: `HTTP ${response.status}`,
        backend: apiUrl,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        backend: this.getApiUrl(),
      };
    }
  }
}

// Create singleton instance
const configService = new ConfigService();

// Auto-load configuration when module is imported
configService.loadConfig().catch(console.error);

export default configService;
