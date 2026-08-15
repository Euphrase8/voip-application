import { CONFIG } from './config';
import { getToken } from './login';

let socket = null;
let reconnectTimeout = null;
let reconnectAttempts = 0;
let currentExtension = null;
let currentToken = null;
const RECONNECT_INTERVAL = 5000;
const RECONNECT_MAX_INTERVAL = 30000;

// Event listener system for WebSocket messages
const messageListeners = new Set();

// Event listener system for connection status changes (open/close)
const connectionStatusListeners = new Set();

const notifyListeners = (event) => {
  messageListeners.forEach(listener => {
    try {
      listener(event);
    } catch (err) {
      console.error('[websocketservice] Listener error:', err);
    }
  });
};

const notifyConnectionStatus = (connected) => {
  connectionStatusListeners.forEach(listener => {
    try {
      listener({ connected });
    } catch (err) {
      console.error('[websocketservice] Connection listener error:', err);
    }
  });
};

export const addMessageListener = (listener) => {
  messageListeners.add(listener);
  return () => messageListeners.delete(listener);
};

export const removeMessageListener = (listener) => {
  messageListeners.delete(listener);
};

export const addConnectionStatusListener = (listener) => {
  connectionStatusListeners.add(listener);
  return () => connectionStatusListeners.delete(listener);
};

const setupSocketHandlers = () => {
  if (!socket) return;

  socket.onmessage = (event) => {
    const raw = typeof event.data === 'string' ? event.data : '';
    const chunks = raw.split('\n').map((s) => s.trim()).filter(Boolean);
    if (chunks.length === 0) return;
    for (const chunk of chunks) {
      notifyListeners({ data: chunk });
    }
  };

  socket.onopen = () => {
    console.log(`[websocketservice] ✅ WebSocket connected for extension ${currentExtension || 'unknown'}`);
    reconnectAttempts = 0;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    notifyConnectionStatus(true);
  };

  socket.onerror = (err) => {
    console.error('[websocketservice] WebSocket error:', err);
  };

  socket.onclose = (event) => {
    console.warn(`[websocketservice] WebSocket closed with code ${event.code}: ${event.reason || 'No reason provided'}`);
    notifyConnectionStatus(false);
    reconnectAttempts += 1;
    const delay = Math.min(RECONNECT_INTERVAL * Math.pow(2, reconnectAttempts - 1), RECONNECT_MAX_INTERVAL);
    console.log(`[websocketservice] Reconnecting (attempt ${reconnectAttempts}) in ${delay}ms...`);
    reconnectTimeout = setTimeout(() => {
      connectWebSocket(currentExtension, url);
    }, delay);
  };
};

let url = CONFIG.WS_URL;

export const connectWebSocket = (extension = null, wsUrl = CONFIG.WS_URL) => {
  url = wsUrl;
  const targetExtension = extension || localStorage.getItem('extension');
  const token = getToken();

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) && currentExtension === targetExtension) {
    return socket;
  }

  if (socket && currentExtension !== targetExtension) {
    socket.close();
    socket = null;
  }

  currentExtension = targetExtension;
  currentToken = token;

  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
  const fullUrl = targetExtension ? `${url}?extension=${encodeURIComponent(targetExtension)}${tokenParam}` : url;

  socket = new WebSocket(fullUrl);
  setupSocketHandlers();

  return socket;
};

export const sendWebSocketMessage = async (message) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.error('[websocketservice] WebSocket not connected. Attempting to reconnect...');
    connectWebSocket();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected after retry');
    }
  }

  // Validate and log message
  let messageStr;
  try {
    if (typeof message !== 'object') {
      console.error('[websocketservice] Invalid message: must be an object', message);
      throw new Error('Message must be a valid JSON object');
    }
    messageStr = JSON.stringify(message);
    console.log('[websocketservice] Sending message:', messageStr);
  } catch (error) {
    console.error('[websocketservice] Failed to stringify message:', error, 'Message:', message);
    throw error;
  }

  try {
    socket.send(messageStr);
  } catch (error) {
    console.error('[websocketservice] Failed to send message via WebSocket:', error, 'Message:', messageStr);
    throw error;
  }
};

export const getWebSocket = () => socket;

export const getConnectionStatus = () => {
  const status = {
    isConnected: socket && socket.readyState === WebSocket.OPEN,
    extension: currentExtension,
    readyState: socket ? socket.readyState : WebSocket.CLOSED
  };

  if (!socket) {
    status.state = 'CLOSED';
  } else {
    switch (socket.readyState) {
      case WebSocket.CONNECTING:
        status.state = 'CONNECTING';
        break;
      case WebSocket.OPEN:
        status.state = 'OPEN';
        break;
      case WebSocket.CLOSING:
        status.state = 'CLOSING';
        break;
      case WebSocket.CLOSED:
        status.state = 'CLOSED';
        break;
      default:
        status.state = 'UNKNOWN';
    }
  }

  return status;
};

// Close WebSocket connection
export const closeWebSocket = () => {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  reconnectAttempts = 0;
  if (socket) {
    socket.close();
    socket = null;
    currentExtension = null;
  }
};
