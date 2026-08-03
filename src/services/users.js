import axios from 'axios';
import { getToken } from './login';
import CONFIG from './config';

const API_URL = CONFIG.API_URL;
const WS_URL = CONFIG.WS_URL;

const getWsUrlWithToken = (extension) => {
  const token = getToken();
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
  return `${WS_URL}?extension=${encodeURIComponent(extension)}${tokenParam}`;
};

export const getUsers = async () => {
  try {
    const token = getToken();
    if (!token) {
      return { success: false, users: [], error: 'No authentication token. Please login again.' };
    }
    const response = await axios.get(`${API_URL}/protected/users`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: 10000,
    });

    if (response.data && response.data.success !== false) {
      const users = (response.data.users || []).map(u => ({
        id: u.id,
        username: u.username,
        extension: u.extension,
        status: u.status || 'offline',
        is_online: u.is_online || false,
        role: u.role || 'user',
        email: u.email || '',
        name: u.username,
      }));
      return { success: true, users };
    }
    return { success: false, users: [], error: response.data?.error || 'Invalid response from server' };
  } catch (error) {
    const message = error.response?.status === 401
      ? 'Session expired. Please login again.'
      : error.response?.data?.error || error.message || 'Failed to load contacts';
    console.error('[users.js] Error fetching users:', message);
    return { success: false, users: [], error: message };
  }
};

export const setupWebSocket = (extension, onIncomingCall, onError) => {
  const ws = new WebSocket(getWsUrlWithToken(extension));

  ws.onopen = () => {
    console.log(`WebSocket connected for user: ${extension}`);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'incoming-call') {
        onIncomingCall(data);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    onError('WebSocket connection failed');
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    onError('WebSocket connection closed');
  };

  return ws;
};

export const sendWebSocketMessage = (ws, to, message) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ to, message }));
  } else {
    console.error('WebSocket is not open');
  }
};

export const updateUserStatus = async (status) => {
  try {
    const token = getToken();
    const response = await axios.put(`${API_URL}/protected/status`,
      { status },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.success) {
      console.log(`[users.js] Status updated to: ${status}`);
      return response.data;
    } else {
      throw new Error(response.data.error || 'Failed to update status');
    }
  } catch (error) {
    console.error('[users.js] Error updating user status:', error);
    if (error.response) {
      const { status: httpStatus } = error.response;
      if (httpStatus === 401) {
        throw new Error('Invalid JWT');
      }
    }
    throw new Error('Failed to update user status');
  }
};