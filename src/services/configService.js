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
      const seen = new Set();
      
      for (const host of possibleHosts) {
        if (seen.has(host)) continue;
        seen.add(host);

        try {
          console.log(`[ConfigService] Trying backend at: ${host}`);
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          let response;
          try {
            response = await fetch(`${host}/config`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeoutId);
          }

          // Only JSON config responses count as a valid backend. This skips
          // pages served by the frontend dev server (HTML) without noise.
          const contentType = response.headers.get('content-type') || '';
          if (response.ok && contentType.includes('application/json')) {
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
          } else {
            console.log(`[ConfigService] ${host} is not a backend (HTTP ${response.status}, ${contentType || 'no content-type'}), skipping`);
          }
        } catch (error) {
          if (error.name === 'AbortError') {
            console.log(`[ConfigService] Timed out connecting to ${host}`);
          } else {
            console.log(`[ConfigService] Failed to load from ${host}:`, error.message);
          }
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
    const currentPort = window.location.port;

    // The CRA dev server (port 3000) is never the backend.
    const isDevServer = currentPort === '3000';

    // Get configured backend URL if available
    const configuredBackendUrl = ipConfigService.isConfigured()
      ? ipConfigService.getBackendUrl()
      : null;

    // The page's own origin (highest priority): when the app is served by the
    // backend itself, /config is available at the exact same origin over the
    // same scheme (https/wss included). Skipped on the CRA dev server.
    const sameOrigin = !isDevServer
      ? (currentPort && !['80', '443'].includes(currentPort)
        ? `${protocol}//${currentHost}:${currentPort}`
        : `${protocol}//${currentHost}`)
      : null;

    return [
      sameOrigin,

      // Environment-specific
      ...(process.env.REACT_APP_API_URL ? [process.env.REACT_APP_API_URL] : []),

      // User-configured backend
      ...(configuredBackendUrl ? [configuredBackendUrl] : []),

      // Same host, backend port
      `${protocol}//${currentHost}:8080`,

      // Localhost variations (lowest priority for network access)
      `http://localhost:8080`,
      `http://127.0.0.1:8080`,

      // Service discovery names
      `http://voip-backend:8080`,
      `http://backend.local:8080`,
    ].filter(Boolean);
  }

  // Fallback configuration when backend is unreachable
  _getFallbackConfig() {
    const currentHost = window.location.hostname;
    const protocol = window.location.protocol;
    const isHttps = protocol === 'https:';
    const wsProtocol = isHttps ? 'wss:' : 'ws:';
    // On HTTPS the backend serves everything from the same origin (no :8080).
    const portSuffix = isHttps ? '' : ':8080';

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
      asteriskHost = 'localhost';
    }

    return {
      api_url: `${protocol}//${backendHost}${portSuffix}`,
      ws_url: `${wsProtocol}//${backendHost}${portSuffix}/ws`,
      asterisk: {
        host: asteriskHost,
        ws_url: `${wsProtocol}//${asteriskHost}:8088/ws`,
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

    // Prefer the same host the frontend is served from (works on LAN/mobile).
    // Fallback to localhost only for local dev.
    const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const proto = typeof window !== 'undefined' ? window.location.protocol : 'http:';
    const defaultHost = (currentHost === 'localhost' || currentHost === '127.0.0.1') ? 'localhost' : currentHost;

    return this.get('api_url', `${proto}//${defaultHost}:8080`);
  }

  // Get WebSocket URL
  getWebSocketUrl() {
    if (ipConfigService.isConfigured()) {
      return ipConfigService.getBackendWebSocketUrl();
    }

    const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const proto = typeof window !== 'undefined' ? window.location.protocol : 'http:';
    const wsProto = proto === 'https:' ? 'wss:' : 'ws:';
    const defaultHost = (currentHost === 'localhost' || currentHost === '127.0.0.1') ? 'localhost' : currentHost;

    return this.get('ws_url', `${wsProto}//${defaultHost}:8080/ws`);
  }

  // Get Asterisk WebSocket URL
  getAsteriskWebSocketUrl() {
    if (ipConfigService.isConfigured()) {
      return ipConfigService.getAsteriskWebSocketUrl();
    }
    // Keep the known LAN default for Asterisk, but allow backend-provided config to override.
    return this.get('asterisk.ws_url', 'ws://localhost:8088/ws');
  }

  // Get Asterisk Host
  getAsteriskHost() {
    if (ipConfigService.isConfigured()) {
      return ipConfigService.getAsteriskHost();
    }
    return this.get('asterisk.host', 'localhost');
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
