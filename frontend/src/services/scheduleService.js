/**
 * Schedule Service
 *
 * API calls for 4-week cycle schedule management.
 */

import api from './api';

const scheduleService = {
  getCycleSchedule: async (cycleNumber) => {
    const params = {};
    if (cycleNumber != null) params.cycleNumber = cycleNumber;
    const response = await api.get('/schedules/cycle', { params });
    return response.data;
  },

  getToday: async () => {
    const response = await api.get('/schedules/today');
    return response.data;
  },

  generate: async (data) => {
    const response = await api.post('/schedules/generate', data);
    return response.data;
  },

  reconcile: async (data) => {
    const response = await api.post('/schedules/reconcile', data);
    return response.data;
  },

  adminGetCycle: async (userId, cycleNumber) => {
    const params = { userId };
    if (cycleNumber != null) params.cycleNumber = cycleNumber;
    const response = await api.get('/schedules/admin/cycle', { params });
    return response.data;
  },

  adminCreate: async (data) => {
    const response = await api.post('/schedules/admin/create', data);
    return response.data;
  },

  adminClearCycle: async (userId, cycleNumber) => {
    const params = { userId };
    if (cycleNumber != null) params.cycleNumber = cycleNumber;
    const response = await api.delete('/schedules/admin/cycle', { params });
    return response.data;
  },

  getCPTGrid: async (cycleNumber, userId) => {
    const params = {};
    if (cycleNumber != null) params.cycleNumber = cycleNumber;
    if (userId) params.userId = userId;
    const response = await api.get('/schedules/cpt-grid', { params });
    return response.data;
  },

};

export default scheduleService;
