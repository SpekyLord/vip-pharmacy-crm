/**
 * MD Merge Service — Phase A.5.5 (Apr 2026).
 *
 * Wraps the /api/admin/md-merge endpoints. Used by:
 *   - frontend/src/pages/admin/MdMergePage.jsx (admin merge tool UI)
 *
 * Every endpoint role-gates server-side via VIP_CLIENT_LIFECYCLE_ROLES lookup
 * (lookup-driven, lazy-seeded). Frontend treats 403 as "your role doesn't
 * cover this action" and surfaces the server-provided allowed-roles list.
 */

import api from './api';

const mdMergeService = {
  /**
   * Find duplicate canonical-key groups (vip_client_name_clean count >= 2).
   * @param {Object} params - { search, limit }
   */
  findCandidates: async (params = {}, signal) => {
    const response = await api.get('/admin/md-merge/candidates', { params, signal });
    return response.data;
  },

  /**
   * Read-only cascade preview — counts per FK target + collision detection.
   * @param {string} winnerId - Doctor _id to KEEP
   * @param {string} loserId  - Doctor _id to ABSORB
   */
  preview: async (winnerId, loserId) => {
    const response = await api.post('/admin/md-merge/preview', { winnerId, loserId });
    return response.data;
  },

  /**
   * Execute the merge. Reason is required (audit trail).
   */
  execute: async (winnerId, loserId, reason) => {
    const response = await api.post('/admin/md-merge/execute', { winnerId, loserId, reason });
    return response.data;
  },

  /**
   * Audit history (most recent first).
   * @param {Object} params - { status: 'APPLIED'|'ROLLED_BACK'|'HARD_DELETED', limit }
   */
  history: async (params = {}, signal) => {
    const response = await api.get('/admin/md-merge/history', { params, signal });
    return response.data;
  },

  /**
   * Rollback an APPLIED merge. Reason is required.
   */
  rollback: async (auditId, reason) => {
    const response = await api.post(`/admin/md-merge/rollback/${auditId}`, { reason });
    return response.data;
  },
};

export default mdMergeService;
