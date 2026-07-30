import CONFIG from './config';

class StatusService {
  constructor() {
    this.heartbeatInterval = null;
    this.heartbeatFrequency = 30000; // 30 seconds
    this.isActive = false;
  }

  // Start heartbeat to keep user status active
  startHeartbeat() {
    if (this.heartbeatInterval) {
      this.stopHeartbeat();
    }

    this.isActive = true;
    this.sendHeartbeat(); // Send initial heartbeat

    this.heartbeatInterval = setInterval(() => {
      if (this.isActive) {
        this.sendHeartbeat();
      }
    }, this.heartbeatFrequency);

    console.log('Status heartbeat started');
  }

  // Stop heartbeat
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.isActive = false;
    console.log('Status heartbeat stopped');
  }

  // Send heartbeat to server
  async sendHeartbeat() {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('[StatusService] No token for heartbeat, stopping');
        this.stopHeartbeat();
        return;
      }

      console.log(`[StatusService] Sending heartbeat to: ${CONFIG.API_URL}/protected/heartbeat`);

      const response = await fetch(`${CONFIG.API_URL}/protected/heartbeat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[StatusService] Heartbeat failed! status: ${response.status}, response: ${errorText}`);

        if (response.status === 401) {
          // Token expired, stop heartbeat
          console.warn('[StatusService] Token expired, stopping heartbeat');
          this.stopHeartbeat();
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('[StatusService] Heartbeat successful:', data);
      return data;
    } catch (error) {
      console.error('[StatusService] Heartbeat failed:', error);
      // Don't stop heartbeat on network errors, just log them
    }
  }

  // Update user status
  async updateStatus(status) {
    try {
      const token = localStorage.getItem('token');
      const user = localStorage.getItem('username');
      const extension = localStorage.getItem('extension');

      if (!token) {
        console.warn('[StatusService] No authentication token found');
        throw new Error('No authentication token');
      }

      if (!user || !extension) {
        console.warn('[StatusService] Missing user data', { user, extension });
        throw new Error('Missing user authentication data');
      }

      // Validate status value
      const validStatuses = ['online', 'offline', 'busy', 'away'];
      if (!validStatuses.includes(status)) {
        console.error('[StatusService] Invalid status value:', status);
        throw new Error(`Invalid status: ${status}`);
      }

      console.log(`[StatusService] Updating status to: ${status} for user: ${user} (${extension})`);
      console.log(`[StatusService] Using API URL: ${CONFIG.API_URL}`);

      const requestBody = { status };
      console.log(`[StatusService] Request body:`, requestBody);

      const response = await fetch(`${CONFIG.API_URL}/protected/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log(`[StatusService] Response status: ${response.status}`);
      console.log(`[StatusService] Response headers:`, Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        let errorText;
        try {
          errorText = await response.text();
          console.error(`[StatusService] Error response body: ${errorText}`);
        } catch (e) {
          errorText = 'Could not read error response';
          console.error(`[StatusService] Could not read error response:`, e);
        }

        // Try to parse as JSON for more details
        try {
          const errorJson = JSON.parse(errorText);
          console.error(`[StatusService] Parsed error:`, errorJson);
        } catch (e) {
          // Not JSON, that's fine
        }

        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data = await response.json();
      console.log(`[StatusService] Status updated successfully:`, data);

      // If setting to online, start heartbeat
      if (status === 'online' && !this.isActive) {
        this.startHeartbeat();
      } else if (status === 'offline') {
        this.stopHeartbeat();
      }

      return data;
    } catch (error) {
      console.error('[StatusService] Failed to update status:', error);

      // If it's a 500 error, let's add some additional context
      if (error.message.includes('500')) {
        console.error('[StatusService] Server error detected. This might be due to:');
        console.error('- Database connection issues');
        console.error('- Invalid JWT token');
        console.error('- Backend service problems');
        console.error('- Missing user record in database');
      }

      throw error;
    }
  }

  // Set user online
  async setOnline() {
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('[StatusService] Cannot set online status without authentication token');
      return;
    }
    return this.updateStatus('online');
  }

  // Set user offline
  async setOffline() {
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('[StatusService] Cannot set offline status without authentication token');
      return;
    }
    return this.updateStatus('offline');
  }

  // Set user busy
  async setBusy() {
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('[StatusService] Cannot set busy status without authentication token');
      return;
    }
    return this.updateStatus('busy');
  }

  // Set user away
  async setAway() {
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('[StatusService] Cannot set away status without authentication token');
      return;
    }
    return this.updateStatus('away');
  }

  // Handle page visibility changes
  handleVisibilityChange() {
    if (document.hidden) {
      // Page is hidden, set to away
      this.setAway();
    } else {
      // Page is visible, set to online
      this.setOnline();
    }
  }

  // Initialize status tracking
  initialize() {
    // Check if user is authenticated before initializing
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('username');
    const extension = localStorage.getItem('extension');

    if (!token || !user || !extension) {
      console.warn('[StatusService] Cannot initialize without complete authentication data', {
        hasToken: !!token,
        hasUser: !!user,
        hasExtension: !!extension
      });
      return;
    }

    console.log('[StatusService] Initializing status service for user:', user, 'extension:', extension);

    // Add a small delay before starting heartbeat to ensure everything is ready
    setTimeout(() => {
      this.startHeartbeat();
    }, 1000);

    // Handle page visibility changes with debouncing
    this._visibilityHandler = () => {
      clearTimeout(this._visibilityTimeout);
      this._visibilityTimeout = setTimeout(() => {
        this.handleVisibilityChange();
      }, 500);
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);

    // Handle window focus/blur with debouncing
    this._focusHandler = () => {
      clearTimeout(this._focusTimeout);
      this._focusTimeout = setTimeout(() => {
        this.setOnline();
      }, 500);
    };
    window.addEventListener('focus', this._focusHandler);

    this._blurHandler = () => {
      clearTimeout(this._blurTimeout);
      this._blurTimeout = setTimeout(() => {
        this.setAway();
      }, 1000);
    };
    window.addEventListener('blur', this._blurHandler);

    // Handle page unload
    this._beforeUnloadHandler = () => { this.setOffline(); };
    window.addEventListener('beforeunload', this._beforeUnloadHandler);

    // Handle browser close/refresh
    this._unloadHandler = () => { this.setOffline(); };
    window.addEventListener('unload', this._unloadHandler);

    console.log('[StatusService] Status service initialized successfully');
  }

  // Test authentication and status endpoint
  async testStatusEndpoint() {
    try {
      const token = localStorage.getItem('token');
      const user = localStorage.getItem('username');
      const extension = localStorage.getItem('extension');

      console.log('[StatusService] Testing status endpoint...');

      if (!token) {
        throw new Error('No token available');
      }

      // First test the profile endpoint to verify authentication
      const profileResponse = await fetch(`${CONFIG.API_URL}/protected/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('[StatusService] Profile endpoint response:', profileResponse.status);

      if (!profileResponse.ok) {
        const profileError = await profileResponse.text();
        console.error('[StatusService] Profile endpoint failed:', profileError);
        throw new Error(`Profile check failed: ${profileResponse.status}`);
      }

      const profileData = await profileResponse.json();
      console.log('[StatusService] Profile data:', profileData);

      // Now test a simple status update
      const testResponse = await fetch(`${CONFIG.API_URL}/protected/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'online' }),
      });

      console.log('[StatusService] Status test response:', testResponse.status);

      if (!testResponse.ok) {
        const statusError = await testResponse.text();
        console.error('[StatusService] Status endpoint failed:', statusError);
        throw new Error(`Status test failed: ${testResponse.status}`);
      }

      const statusData = await testResponse.json();
      console.log('[StatusService] Status test successful:', statusData);

      return { success: true, profile: profileData, status: statusData };
    } catch (error) {
      console.error('[StatusService] Endpoint test failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Cleanup
  cleanup() {
    this.stopHeartbeat();

    // Remove event listeners
    if (this._visibilityHandler) document.removeEventListener('visibilitychange', this._visibilityHandler);
    if (this._focusHandler) window.removeEventListener('focus', this._focusHandler);
    if (this._blurHandler) window.removeEventListener('blur', this._blurHandler);
    if (this._beforeUnloadHandler) window.removeEventListener('beforeunload', this._beforeUnloadHandler);
    if (this._unloadHandler) window.removeEventListener('unload', this._unloadHandler);
    this._visibilityHandler = null;
    this._focusHandler = null;
    this._blurHandler = null;
    this._beforeUnloadHandler = null;
    this._unloadHandler = null;

    console.log('[StatusService] Status service cleaned up');
  }
}

// Create singleton instance
const statusService = new StatusService();

export default statusService;
