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

export const searchVoicemails = async (params = {}) => {
  const res = await axios.get(`${API_URL}/protected/voicemail/search`, {
    ...authHeaders(),
    params,
  });
  return res.data;
};

export const markVoicemailRead = async (id) => {
  const res = await axios.put(`${API_URL}/protected/voicemail/${id}/read`, {}, authHeaders());
  return res.data;
};

export const markVoicemailUnread = async (id) => {
  const res = await axios.put(`${API_URL}/protected/voicemail/${id}/unread`, {}, authHeaders());
  return res.data;
};

export const deleteVoicemail = async (id) => {
  const res = await axios.delete(`${API_URL}/protected/voicemail/${id}`, authHeaders());
  return res.data;
};

export const getVoicemailAudioUrl = (id) => {
  return `${API_URL}/protected/voicemail/${id}/audio?token=${getToken()}`;
};

export const getVoicemailDownloadUrl = (id) => {
  return `${API_URL}/protected/voicemail/${id}/download?token=${getToken()}`;
};

export const getVoicemailUnreadCount = async () => {
  const res = await axios.get(`${API_URL}/protected/voicemail/unread-count`, authHeaders());
  return res.data;
};

export const incrementPlaybackCount = async (id) => {
  const res = await axios.post(`${API_URL}/protected/voicemail/${id}/playback`, {}, authHeaders());
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

export const createVoicemail = async (formData) => {
  const res = await axios.post(`${API_URL}/protected/voicemail/create`, formData, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'multipart/form-data',
    },
  });
  return res.data;
};
