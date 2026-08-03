import axios from 'axios';
import { CONFIG } from './config';
import { getToken } from './login';

const API_URL = CONFIG.API_URL;

const authHeaders = () => ({
  headers: { Authorization: `Bearer ${getToken()}` },
});

const uploadHeaders = () => ({
  headers: {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'multipart/form-data',
  },
});

export const sendMessage = async (receiverId, content, clientMessageId = null, msgType = 'text', replyToId = null) => {
  const body = { receiver_id: receiverId, content, msg_type: msgType };
  if (clientMessageId) body.client_message_id = clientMessageId;
  if (replyToId) body.reply_to_id = replyToId;
  const res = await axios.post(`${API_URL}/protected/messages/send`, body, authHeaders());
  return res.data;
};

export const sendVoiceMessage = async (receiverId, blob, duration) => {
  const formData = new FormData();
  formData.append('audio', blob, `voice_${Date.now()}.webm`);
  formData.append('receiver_id', receiverId);
  formData.append('duration', String(duration));
  const res = await axios.post(`${API_URL}/protected/messages/send-voice`, formData, uploadHeaders());
  return res.data;
};

export const getVoiceMessageAudioUrl = (messageId) => {
  return `${API_URL}/protected/messages/voice/${messageId}/audio?token=${getToken()}`;
};

export const getMessages = async (userId) => {
  const res = await axios.get(`${API_URL}/protected/messages/${userId}?limit=100`, authHeaders());
  return res.data;
};

export const deleteMessage = async (messageId) => {
  const res = await axios.delete(`${API_URL}/protected/messages/${messageId}`, authHeaders());
  return res.data;
};

export const getConversations = async () => {
  const res = await axios.get(`${API_URL}/protected/messages/conversations`, authHeaders());
  return res.data;
};

export const getUnreadCount = async () => {
  const res = await axios.get(`${API_URL}/protected/messages/unread-count`, authHeaders());
  return res.data;
};

export const markAsRead = async (senderId) => {
  const res = await axios.put(`${API_URL}/protected/messages/read/${senderId}`, {}, authHeaders());
  return res.data;
};

export const createGroup = async (name, members) => {
  const res = await axios.post(`${API_URL}/protected/messages/group/create`, { name, members }, authHeaders());
  return res.data;
};

export const sendGroupMessage = async (groupId, content) => {
  const res = await axios.post(`${API_URL}/protected/messages/group/send`, { group_id: groupId, content }, authHeaders());
  return res.data;
};

export const getGroupMessages = async (groupId) => {
  const res = await axios.get(`${API_URL}/protected/messages/group/${groupId}/messages`, authHeaders());
  return res.data;
};

export const getUserGroups = async () => {
  const res = await axios.get(`${API_URL}/protected/messages/groups`, authHeaders());
  return res.data;
};
