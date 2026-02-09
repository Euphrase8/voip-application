/**
 * Asterisk WebSocket Service
 * Handles direct WebSocket connections to Asterisk for SIP/WebRTC communication
 */

import { CONFIG } from './config';

class AsteriskWebSocketService {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.extension = null;
    this.onMessage = null;
    this.onStatusChange = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
  }

  /**
   * Connect to Asterisk WebSocket with proper SIP headers
   */
  connect(extension, onMessage, onStatusChange) {
    this.extension = extension;
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[AsteriskWS] Already connected');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        // Get Asterisk WebSocket URL
        const asteriskWsUrl = CONFIG.ASTERISK_WS_URL || `ws://${CONFIG.ASTERISK_HOST}:8088/ws`;
        
        console.log(`[AsteriskWS] Connecting to Asterisk WebSocket: ${asteriskWsUrl}`);
        console.log(`[AsteriskWS] Extension: ${extension}`);

        // Create WebSocket connection with SIP protocol
        this.ws = new WebSocket(asteriskWsUrl, ['sip']);

        // Set up connection timeout
        const connectionTimeout = setTimeout(() => {
          if (this.ws.readyState === WebSocket.CONNECTING) {
            console.error('[AsteriskWS] Connection timeout');
            this.ws.close();
            reject(new Error('Connection timeout'));
          }
        }, 10000);

        this.ws.onopen = (event) => {
          clearTimeout(connectionTimeout);
          console.log('[AsteriskWS] ✅ Connected to Asterisk WebSocket');
          console.log('[AsteriskWS] Protocol:', this.ws.protocol);
          console.log('[AsteriskWS] Ready State:', this.ws.readyState);
          
          this.connected = true;
          this.reconnectAttempts = 0;
          
          if (this.onStatusChange) {
            this.onStatusChange('connected');
          }

          // Send initial SIP registration if needed
          this.sendSIPRegister();
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          console.log('[AsteriskWS] 📨 Received message:', event.data);
          
          try {
            // Handle SIP messages
            if (event.data.startsWith('SIP/2.0') || event.data.startsWith('REGISTER') || 
                event.data.startsWith('INVITE') || event.data.startsWith('OPTIONS')) {
              console.log('[AsteriskWS] SIP Message received');
              this.handleSIPMessage(event.data);
            } else {
              // Try to parse as JSON
              const data = JSON.parse(event.data);
              this.handleJSONMessage(data);
            }
          } catch (error) {
            console.warn('[AsteriskWS] Failed to parse message:', error);
            // Handle as raw message
            if (this.onMessage) {
              this.onMessage({ type: 'raw', data: event.data });
            }
          }
        };

        this.ws.onerror = (evt) => {
          clearTimeout(connectionTimeout);
          const msg = evt?.message || evt?.type || 'WebSocket error';
          console.error('[AsteriskWS] ❌ WebSocket error:', msg, evt);

          if (this.onStatusChange) {
            this.onStatusChange('error');
          }

          reject(new Error(`[AsteriskWS] ${msg}`));
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          console.log('[AsteriskWS] 🔌 Connection closed');
          console.log('[AsteriskWS] Close code:', event.code);
          console.log('[AsteriskWS] Close reason:', event.reason);
          console.log('[AsteriskWS] Was clean:', event.wasClean);
          
          this.connected = false;
          
          if (this.onStatusChange) {
            this.onStatusChange('disconnected');
          }

          // Attempt reconnection if not a clean close
          if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          }
        };

      } catch (error) {
        console.error('[AsteriskWS] Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Send SIP REGISTER message
   */
  sendSIPRegister() {
    if (!this.extension) {
      console.warn('[AsteriskWS] No extension provided for SIP registration');
      return;
    }

    const sipRegister = [
      `REGISTER sip:${CONFIG.ASTERISK_HOST} SIP/2.0`,
      `Via: SIP/2.0/WS ${window.location.hostname};branch=z9hG4bK${this.generateBranch()}`,
      `From: <sip:${this.extension}@${CONFIG.ASTERISK_HOST}>;tag=${this.generateTag()}`,
      `To: <sip:${this.extension}@${CONFIG.ASTERISK_HOST}>`,
      `Call-ID: ${this.generateCallId()}`,
      `CSeq: 1 REGISTER`,
      `Contact: <sip:${this.extension}@${window.location.hostname};transport=ws>`,
      `Expires: 300`,
      `Content-Length: 0`,
      '',
      ''
    ].join('\r\n');

    console.log('[AsteriskWS] 📤 Sending SIP REGISTER');
    this.send(sipRegister);
  }

  /**
   * Handle SIP messages
   */
  handleSIPMessage(sipMessage) {
    console.log('[AsteriskWS] Processing SIP message:', sipMessage.substring(0, 100) + '...');
    
    if (this.onMessage) {
      this.onMessage({
        type: 'sip',
        data: sipMessage,
        parsed: this.parseSIPMessage(sipMessage)
      });
    }
  }

  /**
   * Handle JSON messages
   */
  handleJSONMessage(data) {
    console.log('[AsteriskWS] Processing JSON message:', data);
    
    if (this.onMessage) {
      this.onMessage({
        type: 'json',
        data: data
      });
    }
  }

  /**
   * Parse SIP message into components
   */
  parseSIPMessage(sipMessage) {
    const lines = sipMessage.split('\r\n');
    const firstLine = lines[0];
    const headers = {};
    
    // Parse headers
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) break;
      
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const headerName = line.substring(0, colonIndex).trim();
        const headerValue = line.substring(colonIndex + 1).trim();
        headers[headerName] = headerValue;
      }
    }

    return {
      firstLine,
      headers,
      method: firstLine.split(' ')[0],
      statusCode: firstLine.startsWith('SIP/2.0') ? firstLine.split(' ')[1] : null
    };
  }

  /**
   * Send message to Asterisk
   */
  send(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[AsteriskWS] Cannot send message - not connected');
      return false;
    }

    try {
      this.ws.send(message);
      return true;
    } catch (error) {
      console.error('[AsteriskWS] Failed to send message:', error);
      return false;
    }
  }

  /**
   * Attempt to reconnect
   */
  attemptReconnect() {
    this.reconnectAttempts++;
    console.log(`[AsteriskWS] Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    setTimeout(() => {
      if (this.extension && this.onMessage && this.onStatusChange) {
        this.connect(this.extension, this.onMessage, this.onStatusChange)
          .catch(error => {
            console.error('[AsteriskWS] Reconnection failed:', error);
          });
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  /**
   * Disconnect from Asterisk WebSocket
   */
  disconnect() {
    if (this.ws) {
      console.log('[AsteriskWS] Disconnecting...');
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
    this.connected = false;
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Generate random branch for SIP Via header
   */
  generateBranch() {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Generate random tag for SIP From header
   */
  generateTag() {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Generate random Call-ID
   */
  generateCallId() {
    return Math.random().toString(36).substring(2, 15) + '@' + window.location.hostname;
  }
}

// Export singleton instance
export const asteriskWebSocketService = new AsteriskWebSocketService();
export default asteriskWebSocketService;
