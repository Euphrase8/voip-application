import axios from 'axios';
import { getToken } from './login';

const API_URL = process.env.REACT_APP_API_URL || 'http://192.168.1.2:8080';

export const hangup = async (channel) => {
  try {
    console.log(`[hang.js] Attempting to hang up call for channel: ${channel}`);

    if (!channel || channel.trim() === '') {
      console.warn('[hang.js] No valid channel provided for hangup:', channel);
      throw new Error('Channel is required for hangup');
    }

    const response = await axios.post(
      `${API_URL}/protected/call/hangup`,
      { channel },
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[hang.js] Call hung up successfully for channel ${channel}`);
    return response.data;
  } catch (error) {
    console.error(`[hang.js] Error hanging up call for channel ${channel}:`, error.response?.data || error.message);

    // If it's a 400 or 404 error, the call might already be ended
    if (error.response?.status === 400 || error.response?.status === 404) {
      console.log(`[hang.js] Call already ended or not found for channel ${channel}`);
      return { message: 'Call already ended or not found' };
    }

    throw new Error(`Failed to hang up call: ${error.response?.data?.error || error.message}`);
  }
};