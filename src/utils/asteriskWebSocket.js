// Asterisk WebSocket Connection Utility
// Proper WebSocket connection to Asterisk with correct headers and protocols

export class AsteriskWebSocket {
  constructor(config = {}) {
    this.config = {
      url: config.url || 'ws://192.168.1.2:8088/ws',
      protocols: config.protocols || ['sip'],
      reconnectInterval: config.reconnectInterval || 3000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      pingInterval: config.pingInterval || 30000,
      ...config
    };
    
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.pingTimer = null;
    this.listeners = new Map();
    this.messageQueue = [];
  }

  // Connect to Asterisk WebSocket with proper headers
  async connect() {
    try {
      console.log('[AsteriskWebSocket] Connecting to:', this.config.url);
      
      // Create WebSocket with proper protocols
      this.ws = new WebSocket(this.config.url, this.config.protocols);
      
      // Set up event handlers
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      
      // Wait for connection to establish
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 10000);
        
        this.ws.onopen = (event) => {
          clearTimeout(timeout);
          this.handleOpen(event);
          resolve(this);
        };
        
        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          this.handleError(error);
          reject(error);
        };
      });
    } catch (error) {
      console.error('[AsteriskWebSocket] Connection failed:', error);
      throw error;
    }
  }

  // Handle WebSocket open event
  handleOpen(event) {
    console.log('[AsteriskWebSocket] ✅ Connected to Asterisk WebSocket');
    this.isConnected = true;
    this.reconnectAttempts = 0;
    
    // Start ping timer to keep connection alive
    this.startPingTimer();
    
    // Send queued messages
    this.flushMessageQueue();
    
    // Notify listeners
    this.emit('connected', event);
  }

  // Handle WebSocket message
  handleMessage(event) {
    try {
      console.log('[AsteriskWebSocket] Received message:', event.data);
      
      // Try to parse as JSON
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (parseError) {
        // Handle non-JSON messages (like SIP messages)
        message = {
          type: 'raw',
          data: event.data
        };
      }
      
      // Emit message to listeners
      this.emit('message', message);
      
      // Handle specific message types
      if (message.type) {
        this.emit(message.type, message);
      }
    } catch (error) {
      console.error('[AsteriskWebSocket] Error handling message:', error);
    }
  }

  // Handle WebSocket close event
  handleClose(event) {
    console.log('[AsteriskWebSocket] Connection closed:', event.code, event.reason);
    this.isConnected = false;
    this.stopPingTimer();
    
    // Emit close event
    this.emit('disconnected', event);
    
    // Attempt reconnection if not a clean close
    if (event.code !== 1000 && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  // Handle WebSocket error
  handleError(error) {
    console.error('[AsteriskWebSocket] WebSocket error:', error);
    this.emit('error', error);
  }

  // Schedule reconnection attempt
  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5));
    
    console.log(`[AsteriskWebSocket] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      if (!this.isConnected) {
        this.connect().catch(error => {
          console.error('[AsteriskWebSocket] Reconnection failed:', error);
        });
      }
    }, delay);
  }

  // Start ping timer to keep connection alive
  startPingTimer() {
    this.stopPingTimer();
    this.pingTimer = setInterval(() => {
      if (this.isConnected) {
        this.ping();
      }
    }, this.config.pingInterval);
  }

  // Stop ping timer
  stopPingTimer() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // Send ping message
  ping() {
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping && this.ws.ping();
        console.log('[AsteriskWebSocket] Ping sent');
      }
    } catch (error) {
      console.warn('[AsteriskWebSocket] Ping failed:', error);
    }
  }

  // Send message to Asterisk
  send(message) {
    try {
      if (!this.isConnected || this.ws.readyState !== WebSocket.OPEN) {
        console.warn('[AsteriskWebSocket] Not connected, queuing message:', message);
        this.messageQueue.push(message);
        return false;
      }
      
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
      this.ws.send(messageStr);
      console.log('[AsteriskWebSocket] Message sent:', messageStr);
      return true;
    } catch (error) {
      console.error('[AsteriskWebSocket] Failed to send message:', error);
      return false;
    }
  }

  // Flush queued messages
  flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      this.send(message);
    }
  }

  // Add event listener
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  // Remove event listener
  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  // Emit event to listeners
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[AsteriskWebSocket] Error in ${event} listener:`, error);
        }
      });
    }
  }

  // Close WebSocket connection
  close() {
    console.log('[AsteriskWebSocket] Closing connection...');
    this.stopPingTimer();
    
    if (this.ws) {
      this.ws.close(1000, 'Client closing');
      this.ws = null;
    }
    
    this.isConnected = false;
    this.messageQueue = [];
  }

  // Get connection status
  getStatus() {
    return {
      connected: this.isConnected,
      readyState: this.ws ? this.ws.readyState : WebSocket.CLOSED,
      url: this.config.url,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length
    };
  }
}

// Create singleton instance with default configuration
export const asteriskWebSocket = new AsteriskWebSocket({
  url: 'ws://192.168.1.2:8088/ws',
  protocols: ['sip'],
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
  pingInterval: 30000
});

// Convenience functions
export const connectToAsterisk = () => asteriskWebSocket.connect();
export const sendToAsterisk = (message) => asteriskWebSocket.send(message);
export const onAsteriskMessage = (callback) => asteriskWebSocket.on('message', callback);
export const onAsteriskConnected = (callback) => asteriskWebSocket.on('connected', callback);
export const onAsteriskDisconnected = (callback) => asteriskWebSocket.on('disconnected', callback);

export default asteriskWebSocket;
