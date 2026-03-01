/**
 * Audit Log Service
 *
 * API calls for audit log data (admin only):
 * - List audit logs with filters
 * - Get daily stats
 */

import api from './api';

const auditLogService = {
  getAll: async (params = {}) => {
    const response = await api.get('/audit-logs', { params });
    return response.data;
  },

  getStats: async (params = {}) => {
    const response = await api.get('/audit-logs/stats', { params });
    return response.data;
  },
};

export default auditLogService;
