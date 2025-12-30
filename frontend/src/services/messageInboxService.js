/**
 * Message Service
 *
 * Message Inbox API calls:
 * - Get inbox messages (with optional filters)
 * - Get by id
 * - Mark read / mark unread (toggle)
 * - Archive / unarchive (optional if you have it)
 * - Create / delete (optional admin)
 */

import api from './api';

const messageService = {
  // Get all visible messages for current user (employee)
  // Supports query params: category, search, read, page, limit, etc.
  // ✅ Route example: GET /messages?category=announcement&search=holiday&page=1&limit=10
  getAll: async (params = {}, options = {}) => {
    const res = await api.get('/messages', { params, ...options });
    return res.data; // expect { success, data, pagination? } OR controller format
  },

  // If you later create a dedicated endpoint like GET /messages/my
  getMy: async (params = {}, options = {}) => {
    const res = await api.get('/messages/my', { params, ...options });
    return res.data;
  },

  // Get single message (if you have it)
  getById: async (id, options = {}) => {
    const res = await api.get(`/messages/${id}`, { ...options });
    return res.data;
  },

  // Mark read (recommended: backend pushes userId into readBy)
  // ✅ PATCH /messages/:id/read
  markRead: async (id) => {
    const res = await api.patch(`/messages/${id}/read`);
    return res.data;
  },

  // Mark unread (only if you implement it)
  // ✅ PATCH /messages/:id/unread
  markUnread: async (id) => {
    const res = await api.patch(`/messages/${id}/unread`);
    return res.data;
  },

  // Toggle read (fallback: if backend uses one route and toggles internally)
  toggleRead: async (id) => {
    const res = await api.patch(`/messages/${id}/read`);
    return res.data;
  },

  // Archive (optional)
  // ✅ PATCH /messages/:id/archive
  archive: async (id) => {
    const res = await api.patch(`/messages/${id}/archive`);
    return res.data;
  },

  // Unarchive (optional)
  // ✅ PATCH /messages/:id/unarchive
  unarchive: async (id) => {
    const res = await api.patch(`/messages/${id}/unarchive`);
    return res.data;
  },

  // Admin create (optional)
  create: async (payload) => {
    const res = await api.post('/messages', payload);
    return res.data;
  },

  // Admin delete (optional)
  delete: async (id) => {
    const res = await api.delete(`/messages/${id}`);
    return res.data;
  },
};

export default messageService;
