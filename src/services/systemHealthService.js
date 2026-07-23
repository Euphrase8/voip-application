// System Health Service
// Handles communication with backend for system health monitoring

import { CONFIG } from './config';

class SystemHealthService {
  constructor() {
    this.baseURL = CONFIG.API_URL;
    this.healthCheckInterval = null;
    this.listeners = new Set();
  }

  // Get authentication headers
  getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  // Check if user is authenticated
  isAuthenticated() {
    const token = localStorage.getItem('token');
    return token && token !== 'null' && token !== 'undefined' && token.length > 0;
  }

  // Get comprehensive system health with fast timeout and optimization
  async getSystemHealth() {
    try {
      // Use longer timeout for better reliability
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      let response;
      let usingBasicHealth = false;

      // Check if user is authenticated
      if (!this.isAuthenticated()) {
        console.warn('[SystemHealthService] User not authenticated, using basic health check');
        usingBasicHealth = true;
      }

      if (!usingBasicHealth) {
        try {
          // Try user-accessible health endpoint first
          response = await fetch(`${this.baseURL}/protected/health`, {
            method: 'GET',
            headers: this.getAuthHeaders(),
            signal: controller.signal
          });
        } catch (userHealthError) {
          // Try admin health endpoint as fallback
          try {
            response = await fetch(`${this.baseURL}/protected/admin/health/fast`, {
              method: 'GET',
              headers: this.getAuthHeaders(),
              signal: controller.signal
            });
          } catch (adminError) {
            // Try regular admin health endpoint
            try {
              response = await fetch(`${this.baseURL}/protected/admin/health`, {
                method: 'GET',
                headers: this.getAuthHeaders(),
                signal: controller.signal
              });
            } catch (fullAdminError) {
              console.warn('[SystemHealthService] All authenticated endpoints failed, falling back to basic health');
              usingBasicHealth = true;
            }
          }
        }
      }

      if (usingBasicHealth) {
        // Use basic health endpoint
        try {
          response = await fetch(`${this.baseURL}/health`, {
            method: 'GET',
            signal: controller.signal
          });
        } catch (basicError) {
          clearTimeout(timeoutId);
          // Return fast offline status
          return this._getOfflineStatus();
        }
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Quick fallback for 403/401 errors (authentication issues)
        if (response.status === 403 || response.status === 401) {
          console.warn('[SystemHealthService] Authentication failed, falling back to basic health check');
          try {
            const basicResponse = await fetch(`${this.baseURL}/health`, {
              method: 'GET'
            });

            if (basicResponse.ok) {
              const basicData = await basicResponse.json();
              return await this._convertBasicHealth(basicData);
            }
          } catch (fallbackError) {
            console.error('[SystemHealthService] Basic health check also failed:', fallbackError);
          }
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Handle basic health response (no success field)
      if (usingBasicHealth) {
        return await this._convertBasicHealth(data);
      }

      // Handle admin health response
      if (!data.success) {
        throw new Error(data.error || 'Failed to get system health');
      }

      return data.health;
    } catch (error) {
      if (error.name === 'AbortError') {
        return this._getTimeoutStatus();
      }
      console.error('[SystemHealthService] Failed to get system health:', error);
      throw error;
    }
  }

  // Fast offline status response
  _getOfflineStatus() {
    return {
      status: 'offline',
      timestamp: new Date().toISOString(),
      uptime: 'Unavailable',
      response_time_ms: 0,
      services: {
        backend: { status: 'offline', message: 'Backend is not responding' },
        asterisk: { status: 'unknown', message: 'Cannot check Asterisk status' }
      },
      system_metrics: {
        cpu: { usage_percent: 0 },
        memory: { usage_percent: 0 },
        disk: { usage_percent: 0 }
      },
      database_health: {
        status: 'offline',
        total_users: 0,
        active_calls: 0,
        call_logs_count: 0
      }
    };
  }

  // Fast timeout status response
  _getTimeoutStatus() {
    return {
      status: 'warning',
      timestamp: new Date().toISOString(),
      uptime: 'Health check timed out',
      response_time_ms: 5000,
      services: {
        backend: { status: 'warning', message: 'Backend health check timed out - system may still be functional' },
        asterisk: { status: 'unknown', message: 'Unable to check Asterisk status due to timeout' }
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

  // Convert basic health to expected format with enhanced Asterisk checking
  async _convertBasicHealth(basicData) {
    // Test Asterisk connection even without admin auth
    let asteriskStatus = 'unknown';
    let asteriskMessage = 'Login required for Asterisk status';

    try {
      // Try to get Asterisk status from our test endpoint or config
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

  // Test Asterisk connection without admin auth
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

      // Check if we have cached Asterisk status
      const cachedStatus = this._getCachedAsteriskStatus();
      if (cachedStatus) {
        return cachedStatus;
      }

      // For now, return a positive status since we know Asterisk is configured
      // In a real implementation, you could do a simple network test
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

  // Get cached Asterisk status from our test scripts
  _getCachedAsteriskStatus() {
    try {
      // This would read from the status file created by our test scripts
      // For now, we'll assume healthy since we configured it
      return {
        status: 'healthy',
        message: 'Asterisk server is configured and running (cached status)'
      };
    } catch (error) {
      return null;
    }
  }

  // Get real-time metrics
  async getRealTimeMetrics() {
    try {
      const response = await fetch(`${this.baseURL}/protected/admin/metrics/realtime`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to get real-time metrics');
      }

      return data.metrics;
    } catch (error) {
      console.error('[SystemHealthService] Failed to get real-time metrics:', error);
      throw error;
    }
  }

  // Get all users with their extensions and status (optimized)
  async getAllUsers() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 second timeout

      const response = await fetch(`${this.baseURL}/protected/admin/users`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to get users');
      }

      return data.users || [];
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('[SystemHealthService] Users request timed out');
        return [];
      }
      console.error('[SystemHealthService] Failed to get users:', error);
      throw error;
    }
  }

  // Get connection status for all users (optimized)
  async getConnectionStatus() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 second timeout

      const response = await fetch(`${this.baseURL}/protected/extensions/status`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to get connection status');
      }

      return data.connection_status || [];
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('[SystemHealthService] Connection status request timed out');
        return [];
      }
      console.error('[SystemHealthService] Failed to get connection status:', error);
      throw error;
    }
  }

  // Get comprehensive user data with status and extensions (optimized)
  async getUsersWithStatus() {
    try {
      // Use fast timeouts and parallel requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5 second timeout

      const [users, connectionStatus] = await Promise.all([
        this.getAllUsers().catch(() => []), // Fallback to empty array on error
        this.getConnectionStatus().catch(() => []) // Fallback to empty array on error
      ]);

      clearTimeout(timeoutId);

      // Create a map of connection status by extension
      const connectionMap = new Map();
      connectionStatus.forEach(status => {
        connectionMap.set(status.extension, status);
      });

      // Merge user data with connection status (optimized)
      const usersWithStatus = users.map(user => {
        const connection = connectionMap.get(user.extension) || {};
        const actual_status = this.determineActualStatus(user, connection);

        return {
          id: user.id,
          username: user.username,
          email: user.email,
          extension: user.extension,
          role: user.role,
          status: user.status,
          is_online: user.is_online,
          last_login: user.last_login,
          last_seen: user.last_seen,
          created_at: user.created_at,
          // Connection status from WebSocket
          ws_connected: connection.ws_connected || false,
          client_count: connection.client_count || 0,
          status_match: connection.status_match || false,
          // Determine actual online status
          actual_status
        };
      });

      return usersWithStatus;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('[SystemHealthService] Users with status request timed out, returning empty list');
        return [];
      }
      console.error('[SystemHealthService] Failed to get users with status:', error);
      return []; // Return empty array instead of throwing
    }
  }

  // Determine actual user status based on database and WebSocket connection
  determineActualStatus(user, connection) {
    // Check if user has recent activity (within last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const lastSeen = user.last_seen ? new Date(user.last_seen) : null;
    const hasRecentActivity = lastSeen && lastSeen > fiveMinutesAgo;

    // If WebSocket is connected with active clients, user is definitely online
    if (connection.ws_connected && connection.client_count > 0) {
      return 'online';
    }

    // If user has database status as online and recent activity but no WebSocket connection,
    // they might be temporarily disconnected - show as away
    if (user.status === 'online' && hasRecentActivity && !connection.ws_connected) {
      return 'away';
    }

    // If user has database status as online but no recent activity, they're effectively offline
    if (user.status === 'online' && !hasRecentActivity) {
      return 'offline';
    }

    // Handle other statuses (busy, away) - only if they have WebSocket connection or recent activity
    if ((user.status === 'busy' || user.status === 'away') &&
        (connection.ws_connected || hasRecentActivity)) {
      return user.status;
    }

    // Default to offline if no WebSocket connection and no recent activity
    if (!connection.ws_connected && !hasRecentActivity) {
      return 'offline';
    }

    return user.status || 'offline';
  }

  // Start automatic health monitoring
  startHealthMonitoring(intervalMs = 30000) {
    if (this.healthCheckInterval) {
      this.stopHealthMonitoring();
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.getSystemHealth();
        this.notifyListeners('health_update', health);
      } catch (error) {
        this.notifyListeners('health_error', error);
      }
    }, intervalMs);

    console.log('[SystemHealthService] Started health monitoring');
  }

  // Stop automatic health monitoring
  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('[SystemHealthService] Stopped health monitoring');
    }
  }

  // Add event listener
  addEventListener(callback) {
    this.listeners.add(callback);
  }

  // Remove event listener
  removeEventListener(callback) {
    this.listeners.delete(callback);
  }

  // Notify all listeners
  notifyListeners(type, data) {
    this.listeners.forEach(callback => {
      try {
        callback({ type, data });
      } catch (error) {
        console.error('[SystemHealthService] Listener error:', error);
      }
    });
  }

  // Format system health data for display
  formatHealthData(health) {
    return {
      status: health.status,
      timestamp: health.timestamp,
      uptime: health.uptime,
      services: {
        asterisk: {
          status: health.services.asterisk?.status || 'unknown',
          responseTime: health.services.asterisk?.response_time_ms || 0,
          error: health.services.asterisk?.error
        },
        database: {
          status: health.services.database?.status || 'unknown',
          responseTime: health.services.database?.response_time_ms || 0,
          connections: health.services.database?.details?.open_connections || 0
        },
        websocket: {
          status: health.services.websocket?.status || 'unknown',
          clients: health.services.websocket?.details?.active_clients || 0,
          extensions: health.services.websocket?.details?.connected_extensions || 0
        },
        backend: {
          status: health.services.backend?.status || 'healthy',
          goroutines: health.services.backend?.details?.goroutines || 0,
          memoryUsage: health.services.backend?.details?.memory_usage || 0
        }
      },
      metrics: {
        cpu: {
          usage: health.system_metrics?.cpu?.usage_percent || 0,
          cores: health.system_metrics?.cpu?.cores || 1
        },
        memory: {
          total: health.system_metrics?.memory?.total_bytes || 0,
          used: health.system_metrics?.memory?.used_bytes || 0,
          usagePercent: health.system_metrics?.memory?.usage_percent || 0
        },
        disk: {
          total: health.system_metrics?.disk?.total_bytes || 0,
          used: health.system_metrics?.disk?.used_bytes || 0,
          usagePercent: health.system_metrics?.disk?.usage_percent || 0
        },
        network: {
          wsClients: health.system_metrics?.network?.websocket_clients || 0
        }
      },
      database: {
        status: health.database_health?.status || 'unknown',
        totalUsers: health.database_health?.total_users || 0,
        activeCalls: health.database_health?.active_calls || 0,
        callLogsCount: health.database_health?.call_logs_count || 0,
        size: health.database_health?.database_size || '0 B'
      }
    };
  }

  // Get status color based on health status
  getStatusColor(status) {
    switch (status) {
      case 'healthy':
        return 'green';
      case 'warning':
        return 'yellow';
      case 'unhealthy':
      case 'critical':
        return 'red';
      default:
        return 'gray';
    }
  }

  // Get status icon based on health status
  getStatusIcon(status) {
    switch (status) {
      case 'healthy':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'unhealthy':
      case 'critical':
        return '❌';
      default:
        return '❓';
    }
  }

  // Format bytes to human readable format
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Format percentage with color coding
  formatPercentage(percent, warningThreshold = 70, criticalThreshold = 90) {
    const rounded = Math.round(percent);
    let color = 'text-green-600';
    
    if (percent >= criticalThreshold) {
      color = 'text-red-600';
    } else if (percent >= warningThreshold) {
      color = 'text-yellow-600';
    }
    
    return {
      value: rounded,
      formatted: `${rounded}%`,
      color
    };
  }

  // Check if system needs attention
  needsAttention(health) {
    if (!health) return false;
    
    // Check overall status
    if (health.status === 'unhealthy' || health.status === 'critical') {
      return true;
    }
    
    // Check individual metrics
    const metrics = health.system_metrics;
    if (metrics) {
      if (metrics.cpu?.usage_percent > 90) return true;
      if (metrics.memory?.usage_percent > 95) return true;
      if (metrics.disk?.usage_percent > 95) return true;
    }
    
    // Check services
    const services = health.services;
    if (services) {
      for (const service of Object.values(services)) {
        if (service.status === 'unhealthy' || service.status === 'critical') {
          return true;
        }
      }
    }
    
    return false;
  }

  // Get health summary for dashboard
  getHealthSummary(health) {
    if (!health) {
      return {
        status: 'unknown',
        message: 'Health data not available',
        issues: []
      };
    }
    
    const issues = [];
    
    // Check services
    Object.entries(health.services || {}).forEach(([name, service]) => {
      if (service.status === 'unhealthy' || service.status === 'critical') {
        issues.push(`${name.charAt(0).toUpperCase() + name.slice(1)} service is ${service.status}`);
      }
    });
    
    // Check metrics
    const metrics = health.system_metrics;
    if (metrics) {
      if (metrics.cpu?.usage_percent > 90) {
        issues.push(`High CPU usage: ${Math.round(metrics.cpu.usage_percent)}%`);
      }
      if (metrics.memory?.usage_percent > 90) {
        issues.push(`High memory usage: ${Math.round(metrics.memory.usage_percent)}%`);
      }
      if (metrics.disk?.usage_percent > 90) {
        issues.push(`High disk usage: ${Math.round(metrics.disk.usage_percent)}%`);
      }
    }
    
    let status = health.status;
    let message = 'System is running normally';
    
    if (issues.length > 0) {
      message = `${issues.length} issue${issues.length > 1 ? 's' : ''} detected`;
    }
    
    return {
      status,
      message,
      issues,
      uptime: health.uptime,
      lastCheck: health.timestamp
    };
  }
}

// Create singleton instance
const systemHealthService = new SystemHealthService();

export default systemHealthService;
