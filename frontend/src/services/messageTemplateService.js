/**
 * Message Template Service
 *
 * API calls for admin template management and BDM one-click sending.
 */

import api from './api';

const messageTemplateService = {
  // Get all templates (admin: all statuses, BDM: active only)
  getAll: async (params = {}) => {
    const response = await api.get('/message-templates', { params });
    return response.data;
  },

  // Get single template
  getById: async (id) => {
    const response = await api.get(`/message-templates/${id}`);
    return response.data;
  },

  // Create template (admin)
  create: async (data) => {
    const response = await api.post('/message-templates', data);
    return response.data;
  },

  // Update template (admin)
  update: async (id, data) => {
    const response = await api.put(`/message-templates/${id}`, data);
    return response.data;
  },

  // Delete template (admin)
  delete: async (id) => {
    const response = await api.delete(`/message-templates/${id}`);
    return response.data;
  },

  // Send from template (one-click)
  sendFromTemplate: async (templateId, data) => {
    const response = await api.post(`/message-templates/${templateId}/send`, data);
    return response.data;
  },
};

export default messageTemplateService;
