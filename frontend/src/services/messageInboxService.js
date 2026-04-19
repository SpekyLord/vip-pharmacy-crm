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
    const res = await api.get('/messages', {
      params,
      withCredentials: true, // ✅ ADD
      ...options,
    });
    return res.data;
  },

  getSent: async (params = {}, options = {}) => {
    const res = await api.get('/messages/sent', {
      params,
      withCredentials: true, // ✅ ADD
      ...options,
    });
    return res.data;
  },


  getMy: async (params = {}, options = {}) => {
    const res = await api.get('/messages/my', {
      params,
      withCredentials: true,
      ...options,
    });
    return res.data;
  },

  getById: async (id, options = {}) => {
    const res = await api.get(`/messages/${id}`, {
      withCredentials: true,
      ...options,
    });
    return res.data;
  },


  // Mark read (recommended: backend pushes userId into readBy)
  // ✅ PATCH /messages/:id/read
  markRead: async (id) => {
    const res = await api.patch(
      `/messages/${id}/read`,
      {},
      { withCredentials: true } // ✅ ADD
    );
    return res.data;
  },


  // Mark unread (only if you implement it)
  // ✅ PATCH /messages/:id/unread
  markUnread: async (id) => {
    const res = await api.patch(
      `/messages/${id}/unread`,
      {},
      { withCredentials: true }
    );
    return res.data;
  },

  toggleRead: async (id, shouldBeRead) => {
    const res = shouldBeRead
      ? await api.patch(`/messages/${id}/read`, {}, { withCredentials: true })
      : await api.patch(`/messages/${id}/unread`, {}, { withCredentials: true });
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

  // ─── Phase G9.R5 — Unified Operational Inbox ───────────────────────
  /** Lightweight unread + action_required counts for the navbar bell. */
  getCounts: async (options = {}) => {
    const res = await api.get('/messages/counts', { withCredentials: true, ...options });
    return res.data;
  },

  /** Lookup-driven folder + action config (cached on server). */
  getFolders: async (options = {}) => {
    const res = await api.get('/messages/folders', { withCredentials: true, ...options });
    return res.data;
  },

  /** Folder/filter list. Pass `?folder=APPROVALS&counts=1` etc. */
  list: async (params = {}, options = {}) => {
    const res = await api.get('/messages', { params, withCredentials: true, ...options });
    return res.data;
  },

  /** Full thread, oldest first. */
  getThread: async (threadId, options = {}) => {
    const res = await api.get(`/messages/thread/${threadId}`, {
      withCredentials: true,
      ...options,
    });
    return res.data;
  },

  /** Threaded reply to a parent message. */
  reply: async (id, body) => {
    const res = await api.post(`/messages/${id}/reply`, { body }, { withCredentials: true });
    return res.data;
  },

  /** Two-way compose. payload = { recipient_user_id?, recipient_role?, subject, body, category?, priority? }. */
  compose: async (payload) => {
    const res = await api.post('/messages/compose', payload, { withCredentials: true });
    return res.data;
  },

  /**
   * Execute the row's action (approve/reject/resolve/acknowledge).
   * args: { reason? }. The controller delegates to the canonical downstream
   * controller (universalApprovalController, varianceAlertController) — the
   * inbox endpoint is a thin facade (Rule #20: never bypass).
   */
  executeAction: async (id, args = {}) => {
    const res = await api.post(`/messages/${id}/action`, args, { withCredentials: true });
    return res.data;
  },
};

export default messageService;
