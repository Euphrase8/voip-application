import axios from 'axios';
import { CONFIG } from './config';
import { getToken } from './login';

const API_URL = CONFIG.API_URL;

const authHeaders = () => ({
  headers: { Authorization: `Bearer ${getToken()}` },
});

export const getVoicemails = async () => {
  const res = await axios.get(`${API_URL}/protected/voicemail/list`, authHeaders());
  return res.data;
};

export const getVoicemail = async (id) => {
  const res = await axios.get(`${API_URL}/protected/voicemail/${id}`, authHeaders());
  return res.data;
};

export const markVoicemailRead = async (id) => {
  const res = await axios.put(`${API_URL}/protected/voicemail/${id}/read`, {}, authHeaders());
  return res.data;
};

export const deleteVoicemail = async (id) => {
  const res = await axios.delete(`${API_URL}/protected/voicemail/${id}`, authHeaders());
  return res.data;
};

export const getVoicemailAudioUrl = (id) => {
  return `${API_URL}/protected/voicemail/${id}/audio?token=${getToken()}`;
};

export const getVoicemailUnreadCount = async () => {
  const res = await axios.get(`${API_URL}/protected/voicemail/unread-count`, authHeaders());
  return res.data;
};

export const uploadVoicemailGreeting = async (file) => {
  const formData = new FormData();
  formData.append('greeting', file);
  const res = await axios.post(`${API_URL}/protected/voicemail-greeting`, formData, {
    ...authHeaders(),
    headers: { ...authHeaders().headers, 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const getMissedCalls = async () => {
  const res = await axios.get(`${API_URL}/protected/missed-calls`, authHeaders());
  return res.data;
};
