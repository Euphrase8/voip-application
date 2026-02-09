// Dynamic Network configuration for VoIP services
import configService from './configService';

// Dynamic configuration that adapts to network changes
class DynamicConfig {
  constructor() {
    this._staticConfig = {
      // SIP transport protocol
      SIP_TRANSPORT: 'ws',

      // Media constraints
      MEDIA_CONSTRAINTS: {
        audio: true,
        video: false
      }
    };
  }

  // Get API URL dynamically
  get API_URL() {
    return process.env.REACT_APP_API_URL || configService.getApiUrl();
  }

  // Get WebSocket URL dynamically
  get WS_URL() {
    return process.env.REACT_APP_WS_URL || configService.getWebSocketUrl();
  }

  // Get Asterisk SIP server dynamically
  get SIP_SERVER() {
    return process.env.REACT_APP_SIP_SERVER || configService.getAsteriskHost();
  }

  // Get SIP port
  get SIP_PORT() {
    return process.env.REACT_APP_SIP_PORT || '8088';
  }

  // Get Asterisk WebSocket URL dynamically
  get SIP_WS_URL() {
    return process.env.REACT_APP_SIP_WS_URL || configService.getAsteriskWebSocketUrl();
  }

  // Get Asterisk host
  get ASTERISK_HOST() {
    return process.env.REACT_APP_ASTERISK_HOST || configService.getAsteriskHost();
  }

  // Get Asterisk WebSocket URL (alias for SIP_WS_URL)
  get ASTERISK_WS_URL() {
    return this.SIP_WS_URL;
  }

  // Get client IP dynamically
  get CLIENT_IP() {
    if (process.env.REACT_APP_CLIENT_IP) {
      return process.env.REACT_APP_CLIENT_IP;
    }

    // Try to determine client IP from current hostname
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return hostname;
    }

    return 'localhost';
  }

  // Static properties
  get SIP_TRANSPORT() {
    return this._staticConfig.SIP_TRANSPORT;
  }

  get MEDIA_CONSTRAINTS() {
    return this._staticConfig.MEDIA_CONSTRAINTS;
  }

  // Get all configuration
  getAll() {
    return {
      API_URL: this.API_URL,
      WS_URL: this.WS_URL,
      SIP_SERVER: this.SIP_SERVER,
      SIP_PORT: this.SIP_PORT,
      SIP_WS_URL: this.SIP_WS_URL,
      CLIENT_IP: this.CLIENT_IP,
      SIP_TRANSPORT: this.SIP_TRANSPORT,
      MEDIA_CONSTRAINTS: this.MEDIA_CONSTRAINTS,
    };
  }

  // Debug information
  getDebugInfo() {
    return {
      config: this.getAll(),
      backend_config: configService.getConfig(),
      environment: configService.getEnvironment(),
      debug_mode: configService.isDebugMode(),
    };
  }
}

// Create singleton instance
export const CONFIG = new DynamicConfig();
export default CONFIG;
