/**
 * Doctor Service
 *
 * Doctor API calls:
 * - CRUD operations
 * - Search and filter
 * - Assignment operations
 */

import api from './api';

const doctorService = {
  getAll: async (params = {}, signal) => {
    const response = await api.get('/doctors', { params, signal });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/doctors/${id}`);
    return response.data;
  },

  create: async (doctorData) => {
    const response = await api.post('/doctors', doctorData);
    return response.data;
  },

  update: async (id, doctorData) => {
    const response = await api.put(`/doctors/${id}`, doctorData);
    return response.data;
  },

  delete: async (id, permanent = false) => {
    const response = await api.delete(`/doctors/${id}`, { params: permanent ? { permanent: true } : {} });
    return response.data;
  },

  // Mass deactivate all VIP Clients assigned to a BDM
  deleteByUser: async (userId) => {
    const response = await api.delete(`/doctors/by-user/${userId}`);
    return response.data;
  },

  // Get count of active VIP Clients assigned to a BDM (for preview)
  countByUser: async (userId) => {
    const response = await api.get(`/doctors/count-by-user/${userId}`);
    return response.data;
  },

  getVisitHistory: async (doctorId) => {
    const response = await api.get(`/doctors/${doctorId}/visits`);
    return response.data;
  },

  assignToRep: async (doctorId, repId) => {
    const response = await api.post(`/doctors/${doctorId}/assign`, { repId });
    return response.data;
  },

  // Get assigned products for a doctor
  getAssignedProducts: async (doctorId) => {
    const response = await api.get(`/doctors/${doctorId}/products`);
    return response.data;
  },

  // Update target products (3 slots) for a VIP Client
  updateTargetProducts: async (doctorId, targetProducts) => {
    const response = await api.put(`/doctors/${doctorId}/target-products`, {
      targetProducts,
    });
    return response.data;
  },

  // Get doctors assigned to or visited by a specific BDM
  getByBdm: async (bdmId) => {
    const response = await api.get(`/doctors/by-bdm/${bdmId}`);
    return response.data;
  },

  // Get distinct specializations from all VIP Clients
  getSpecializations: async () => {
    const response = await api.get('/doctors/specializations');
    return response.data;
  },

  // Name cleanup: preview proposed changes
  previewNameCleanup: async () => {
    const response = await api.get('/doctors/name-cleanup/preview');
    return response.data;
  },

  // Name cleanup: apply approved changes
  applyNameCleanup: async (approved) => {
    const response = await api.put('/doctors/name-cleanup/apply', { approved });
    return response.data;
  },

  // Phase VIP-1.A — Update MD Partner partnership_status (LEAD → CONTACTED →
  // VISITED → PARTNER → INACTIVE). Payload shape:
  //   { partnership_status, partner_agreement_date?, partnership_notes? }
  // Backend enforces:
  //   - PARTNER promotion requires partner_agreement_date (3-gate Gate #2)
  //   - Role gate driven by MD_PARTNER_ROLES lookup (admin/president by default;
  //     subscribers can override per-entity in Control Center → Lookup Tables)
  //   - BDMs may self-transition their own assigned Doctor to LEAD/CONTACTED/
  //     VISITED/INACTIVE; PARTNER promotion is admin/president only
  updatePartnershipStatus: async (id, payload) => {
    const response = await api.put(`/doctors/${id}/partnership-status`, payload);
    return response.data;
  },

  // Phase A.5.3 — "Join coverage" partner of the DUPLICATE_VIP_CLIENT 409 flow.
  // Adds the calling user to assignedTo[] (auto-mode for admin/president, or
  // any role enabled via VIP_CLIENT_LIFECYCLE_ROLES.JOIN_COVERAGE_AUTO) OR
  // posts a MessageInbox approval request to admin (approval-mode, gated by
  // JOIN_COVERAGE_APPROVAL).
  //
  // Response shapes:
  //   200 + { mode: 'auto', data: <updated doctor> }                       — joined
  //   202 + { mode: 'approval_pending', data: { messageId, doctorId } }     — request sent
  //   200 + { mode: 'auto', already_assigned: true }                        — no-op
  //   403                                                                    — neither gate passes
  //   409 + { code: 'DOCTOR_MERGED', mergedInto }                            — stale ref to merged loser
  joinCoverage: async (doctorId, notes = null) => {
    const response = await api.post(`/doctors/${doctorId}/join-coverage`, notes ? { notes } : {});
    return response.data;
  },
};

export default doctorService;
