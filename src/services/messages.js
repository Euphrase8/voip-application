import axios from 'axios';
import { CONFIG } from './config';
import { getToken } from './login';

const API_URL = CONFIG.API_URL;

const authHeaders = () => ({
  headers: { Authorization: `Bearer ${getToken()}` },
});

export const sendMessage = async (receiverId, content, msgType = 'text') => {
  const res = await axios.post(`${API_URL}/protected/messages/send`, { receiver_id: receiverId, content, msg_type: msgType }, authHeaders());
  return res.data;
};

export const getMessages = async (userId) => {
  const res = await axios.get(`${API_URL}/protected/messages/${userId}`, authHeaders());
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
