import axios from 'axios';
import { getToken } from './login';
import CONFIG from './config';

const API_URL = CONFIG.API_URL;
const WS_URL = CONFIG.WS_URL;

export const getUsers = async () => {
  try {
    const token = getToken();
    const response = await axios.get(`${API_URL}/protected/users`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.data.success && response.data.users) {
      return response.data.users.map(u => ({
        id: u.id,
        username: u.username,
        extension: u.extension,
        status: u.status || 'offline',
        is_online: u.is_online,
        role: u.role,
      }));
    }
    return [];
  } catch (error) {
    console.error('[users.js] Error fetching users:', error);
    if (error.response) {
      const { status } = error.response;
      if (status === 401) throw new Error('Invalid JWT');
      else if (status === 403) throw new Error('Non-admin user');
    }
    throw new Error('Failed to fetch users');
  }
};

export const setupWebSocket = (extension, onIncomingCall, onError) => {
  const ws = new WebSocket(`${WS_URL}?userID=${extension}`);

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