import axios from 'axios';
import { connectWebSocket } from './websocketservice'; // ✅ Import WebSocket connector
import { CONFIG } from './config';

const API_URL = CONFIG.API_URL;

// Validate API_URL
let validatedApiUrl;
try {
  validatedApiUrl = new URL(API_URL).toString().replace(/\/$/, '');
} catch (error) {
  console.error('[login.js] Invalid API_URL:', API_URL, error);
  validatedApiUrl = CONFIG.API_URL;
}

export const getToken = () => {
  const token = localStorage.getItem('token');
  if (!token) {
    console.warn('[login.js] No token found');
    return null;
  }
  return token;
};

export const getExtension = () => {
  const extension = localStorage.getItem('extension');
  if (!extension) {
    console.warn('[login.js] No extension found');
    return null;
  }
  return extension;
};

export const getUser = () => {
  const extension = getExtension();
  if (!extension) {
    console.warn('[login.js] No user found');
    return null;
  }
  return { username: extension, extension };
};

export const login = async (username, password) => {
  if (!username || !password) {
    console.error('[login.js] Username or password missing');
    return { success: false, message: 'Username and password are required' };
  }

  try {
    console.log('[login.js] Attempting login for:', username);
    const response = await axios.post(`${validatedApiUrl}/api/login`, {
      username: username.trim(),
      password,
    }, {
      timeout: 8000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.data && response.data.token && response.data.user && response.data.user.extension) {
      const { token, message, user } = response.data;
      const extension = user.extension;

      if (!/^\d{4,6}$/.test(extension)) {
        console.error('[login.js] Invalid extension format:', extension);
        return { success: false, message: 'Extension must be a 4-6 digit number' };
      }

      localStorage.setItem('token', token);
      localStorage.setItem('extension', extension);
      localStorage.setItem('userRole', user.role || 'user'); // Store user role
      console.log('[login.js] Login successful, stored:', { token, extension, role: user.role });

      // ✅ Connect to WebSocket after successful login
      connectWebSocket();

      return {
        success: true,
        token,
        extension,
        message: message || 'Login successful',
        user: {
          username: user.username,
          extension,
          role: user.role || 'user'
        },
      };
    } else {
      console.error('[login.js] Invalid response:', response.data);
      return { success: false, message: 'Invalid login response: token or user data missing' };
    }
  } catch (error) {
    let message = 'Login failed. Please try again.';
    if (error.code === 'ERR_INVALID_URL') {
      message = 'Invalid API URL configuration. Contact support.';
      console.error('[login.js] URL error:', validatedApiUrl, error);
    } else if (error.response && error.response.data) {
      message = error.response.data.message || 'Invalid credentials';
    } else if (error.request) {
      message = 'No response from server. Check your connection.';
    } else {
      message = error.message;
    }
    console.error('[login.js] Login error:', message, error);
    return { success: false, message };
  }
};

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('extension');
  localStorage.removeItem('userRole');
  console.log('[login.js] Logged out');
};
