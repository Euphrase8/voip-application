import CONFIG from './config';

class AdminService {
  constructor() {
    this.baseURL = CONFIG.API_URL;
  }

  // Get authorization headers
  getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  }

  // Get system statistics
  async getSystemStats() {
    try {
      const response = await fetch(`${this.baseURL}/protected/admin/stats`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to get system stats:', error);
      throw error;
    }
  }

  // Get all users
  async getAllUsers() {
    try {
      const response = await fetch(`${this.baseURL}/protected/admin/users`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to get users:', error);
      throw error;
    }
  }

  // Get users (alias for compatibility)
  async getUsers() {
    try {
      const data = await this.getAllUsers();

      // Handle different response formats
      const users = data.users || data || [];

      return {
        success: true,
        users: users.map(user => ({
          id: user.id || user.ID,
          username: user.username || user.Username,
          email: user.email || user.Email,
          extension: user.extension || user.Extension,
          role: user.role || user.Role,
          status: this.determineUserStatus(user),
          enabled: user.enabled !== undefined ? user.enabled : true,
          created_at: user.created_at || user.CreatedAt,
          last_login: user.last_login || user.LastLogin,
          is_online: user.is_online !== undefined ? user.is_online : (user.IsOnline || false)
        }))
      };
    } catch (error) {
      console.error("Error fetching users:", error);
      return {
        success: false,
        error: error.message,
        users: []
      };
    }
  }

  // Determine user status based on various factors
  determineUserStatus(user) {
    // Respect the server-reported status when present
    const serverStatus = (user.status || user.Status || '').toLowerCase();
    if (['online', 'offline', 'busy', 'away'].includes(serverStatus)) {
      return serverStatus;
    }

    // Check if user is explicitly marked as online
    if (user.is_online || user.IsOnline) {
      return 'online';
    }

    // Check last login time (if within last 5 minutes, consider online)
    const lastLogin = user.last_login || user.LastLogin;
    if (lastLogin) {
      const lastLoginTime = new Date(lastLogin);
      const now = new Date();
      const diffMinutes = (now - lastLoginTime) / (1000 * 60);

      if (diffMinutes <= 5) {
        return 'online';
      } else if (diffMinutes <= 30) {
        return 'away';
      }
    }

    // Default to offline
    return 'offline';
  }

  // Delete all non-admin users (admin only, preserves admin accounts)
  async deleteAllUsers() {
    try {
      const response = await fetch(`${this.baseURL}/protected/admin/users/delete-all?confirm=true`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `HTTP error! status: ${response.status}`,
        };
      }

      return {
        success: true,
        ...data,
      };
    } catch (error) {
      console.error('Failed to delete all users:', error);
      return {
        success: false,
        error: error.message || 'Network error occurred',
      };
    }
  }

  // Delete user
  async deleteUser(userId) {
    try {
      const response = await fetch(`${this.baseURL}/protected/admin/users/${userId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;

        // Try to get more specific error message from response
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (parseError) {
          // If we can't parse the error response, use the status code
          if (response.status === 404) {
            errorMessage = 'User not found';
          } else if (response.status === 403) {
            errorMessage = 'Permission denied';
          } else if (response.status === 500) {
            errorMessage = 'Server error occurred';
          }
        }

        return {
          success: false,
          error: errorMessage
        };
      }

      const data = await response.json();
      return {
        success: true,
        ...data
      };
    } catch (error) {
      console.error('Failed to delete user:', error);
      return {
        success: false,
        error: error.message || 'Network error occurred'
      };
    }
  }

  // Admin call to any extension
  async adminCall(targetExtension, callerExtension) {
    try {
      const response = await fetch(`${this.baseURL}/protected/admin/call`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          target_extension: targetExtension,
          caller_extension: callerExtension
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        call: data
      };
    } catch (error) {
      console.error('Failed to make admin call:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get active calls (admin only)
  async getActiveCalls() {
    try {
      const response = await fetch(`${this.baseURL}/protected/admin/active-calls`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        calls: data.active_calls || data || []
      };
    } catch (error) {
      console.error('Failed to get active calls:', error);
      return {
        success: false,
        error: error.message,
        calls: []
      };
    }
  }

  // Terminate call (admin only)
  async terminateCall(callId) {
    try {
      const response = await fetch(`${this.baseURL}/protected/admin/terminate-call`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          call_id: callId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: data
      };
    } catch (error) {
      console.error('Failed to terminate call:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get system status
  async getSystemStatus() {
    try {
      const response = await fetch(`${this.baseURL}/protected/extensions/status`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to get system status:', error);
      throw error;
    }
  }

  // Get call logs (admin view)
  async getCallLogs(limit = 100) {
    try {
      const response = await fetch(`${this.baseURL}/protected/call/logs?limit=${limit}`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to get call logs:', error);
      throw error;
    }
  }

  // Get call logs (admin view - all users)
  async getAdminCallLogs(limit = 100, filters = {}) {
    try {
      const queryParams = new URLSearchParams({ limit });
      if (filters.status) queryParams.set('status', filters.status);
      if (filters.search) queryParams.set('search', filters.search);

      const response = await fetch(`${this.baseURL}/protected/admin/call-logs?${queryParams}`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        call_logs: data.call_logs || [],
      };
    } catch (error) {
      console.error('Failed to get admin call logs:', error);
      return {
        success: false,
        error: error.message,
        call_logs: [],
      };
    }
  }

  // Delete call log
  async deleteCallLog(logId) {
    try {
      const response = await fetch(`${this.baseURL}/protected/admin/call-logs/${logId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to delete call log:', error);
      throw error;
    }
  }

  // Get connected extensions
  async getConnectedExtensions() {
    try {
      const response = await fetch(`${this.baseURL}/protected/extensions/connected`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to get connected extensions:', error);
      throw error;
    }
  }

  // Get system diagnostics
  async getSystemDiagnostics() {
    try {
      const response = await fetch(`${this.baseURL}/protected/diagnostics`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to get system diagnostics:', error);
      throw error;
    }
  }

  // Create new user (admin only)
  async createUser(userData) {
    try {
      const response = await fetch(`${this.baseURL}/protected/admin/users`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (!response.ok) {
        // Extract error message from response
        const errorMessage = data.error || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }

      return data;
    } catch (error) {
      console.error('Failed to create user:', error);
      // Re-throw with original message if it's already a proper error
      throw error;
    }
  }

  // Update user (admin only)
  async updateUser(userId, userData) {
    try {
      const response = await fetch(`${this.baseURL}/protected/admin/users/${userId}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (!response.ok) {
        // Extract error message from response
        const errorMessage = data.error || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }

      return data;
    } catch (error) {
      console.error('Failed to update user:', error);
      // Re-throw with original message if it's already a proper error
      throw error;
    }
  }

  // Export call logs
  async exportCallLogs(format = 'csv', filters = {}) {
    try {
      const queryParams = new URLSearchParams({
        format,
        ...filters,
      });

      const response = await fetch(`${this.baseURL}/protected/admin/export/call-logs?${queryParams}`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle file download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `call-logs-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      return { success: true };
    } catch (error) {
      console.error('Failed to export call logs:', error);
      throw error;
    }
  }

  // Bulk delete call logs
  async bulkDeleteCallLogs(logIds) {
    try {
      const response = await fetch(`${this.baseURL}/protected/admin/call-logs/bulk-delete`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ log_ids: logIds }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to bulk delete call logs:', error);
      throw error;
    }
  }

  // Get real-time metrics
  async getRealTimeMetrics() {
    try {
      const response = await fetch(`${this.baseURL}/protected/admin/metrics/realtime`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to get real-time metrics:', error);
      throw error;
    }
  }
}

const adminService = new AdminService();
export default adminService;
