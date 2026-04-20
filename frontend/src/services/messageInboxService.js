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



  // ─── Phase G9.R8 — Archive (per-recipient) + Acknowledge + Retention ──
  //
  // All archive/ack operations are self-service: each user's archive and ack
  // state is independent. Sender's Sent folder is NEVER affected by recipient
  // archiving (matches Gmail/Slack semantics).

  /** PATCH /messages/:id/archive — archive just my copy. */
  archive: async (id) => {
    const res = await api.patch(`/messages/${id}/archive`, {}, { withCredentials: true });
    return res.data;
  },

  /** PATCH /messages/:id/unarchive — restore my copy to the inbox. */
  unarchive: async (id) => {
    const res = await api.patch(`/messages/${id}/unarchive`, {}, { withCredentials: true });
    return res.data;
  },

  /**
   * PATCH /messages/bulk-archive — archive N messages in one call.
   * @param {string[]} ids
   */
  bulkArchive: async (ids) => {
    const res = await api.patch('/messages/bulk-archive', { ids }, { withCredentials: true });
    return res.data;
  },

  /**
   * PATCH /messages/read-all — mark every message in the current folder read.
   * @param {string} folder - 'INBOX' | 'APPROVALS' | 'TASKS' | 'AI_AGENT_REPORTS' | 'ANNOUNCEMENTS' | 'CHAT' | 'ARCHIVE' | 'ACTION_REQUIRED' | 'SENT'
   */
  markAllRead: async (folder = 'INBOX') => {
    const res = await api.patch('/messages/read-all', { folder }, { withCredentials: true });
    return res.data;
  },

  /**
   * PATCH /messages/:id/acknowledge — explicit "I have read and understood this".
   * Idempotent: clicking twice is a no-op.
   */
  acknowledge: async (id) => {
    const res = await api.patch(`/messages/${id}/acknowledge`, {}, { withCredentials: true });
    return res.data;
  },

  /**
   * GET /messages/:id/ack-status — sender/admin view of who acknowledged.
   * Returns { total, acknowledged: [{user_id, name, at}], pending: [{user_id, name}] }.
   */
  getAckStatus: async (id) => {
    const res = await api.get(`/messages/${id}/ack-status`, { withCredentials: true });
    return res.data;
  },

  /**
   * POST /messages/retention/run-now — fire the retention agent manually.
   * Gated by messaging.retention_manage sub-perm. Returns summary envelope.
   * @param {{dry_run?: boolean}} opts
   */
  runRetention: async (opts = {}) => {
    const res = await api.post('/messages/retention/run-now', opts, { withCredentials: true });
    return res.data;
  },

  /**
   * GET /messages/retention/preview — dry-run retention count. Returns the
   * same envelope shape as runRetention but with dry_run=true and no writes.
   */
  previewRetention: async () => {
    const res = await api.get('/messages/retention/preview', { withCredentials: true });
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
