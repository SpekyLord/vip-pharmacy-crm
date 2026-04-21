/**
 * Invite Service — Phase M1 (Apr 2026)
 *
 * Thin axios wrapper over /api/invites. Generates deep-link invites, lists
 * invites for the triage page, and manages manual consent + MD Partner enrollment.
 */

import api from './api';

const inviteService = {
  /**
   * Generate a deep-link invite for Messenger/Viber/WhatsApp.
   * payload: { doctorId?, clientId?, channel, templateKey? }
   * Returns: { inviteLinkId, channel, ref, linkUrl }
   */
  generate: async (payload) => {
    const response = await api.post('/invites/generate', payload);
    return response.data;
  },

  /**
   * List invites with filters.
   * params: { status?, channel?, bdmId?, from?, to?, page?, limit? }
   */
  list: async (params = {}) => {
    const response = await api.get('/invites', { params });
    return response.data;
  },

  /**
   * Manual consent capture (admin only, for paper forms / verbal consent).
   * payload: { doctorId?, clientId?, channel, consented, source }
   */
  setConsent: async (payload) => {
    const response = await api.post('/invites/consent', payload);
    return response.data;
  },

  /**
   * MD Partner enrollment (admin only, scaffold — agreement template pending counsel).
   * payload: { doctorId, tin, payoutMethod, withholdingCategory, agreedToTerms }
   */
  enrollPartner: async (payload) => {
    const response = await api.post('/invites/partner/enroll', payload);
    return response.data;
  },
};

export default inviteService;
