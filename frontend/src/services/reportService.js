/**
 * Report Service
 *
 * API calls for generated reports and scheduled reports.
 */

import api from './api';

const reportService = {
  // Generated reports
  generateReport: async (data) => {
    const response = await api.post('/reports/generate', data);
    return response.data;
  },

  getReports: async (params = {}) => {
    const response = await api.get('/reports', { params });
    return response.data;
  },

  getReportStats: async () => {
    const response = await api.get('/reports/stats');
    return response.data;
  },

  downloadReport: async (id) => {
    const response = await api.get(`/reports/${id}/download`);
    return response.data;
  },

  deleteReport: async (id) => {
    const response = await api.delete(`/reports/${id}`);
    return response.data;
  },

  // Scheduled reports
  getScheduledReports: async () => {
    const response = await api.get('/reports/scheduled');
    return response.data;
  },

  createScheduledReport: async (data) => {
    const response = await api.post('/reports/scheduled', data);
    return response.data;
  },

  updateScheduledReport: async (id, data) => {
    const response = await api.put(`/reports/scheduled/${id}`, data);
    return response.data;
  },

  deleteScheduledReport: async (id) => {
    const response = await api.delete(`/reports/scheduled/${id}`);
    return response.data;
  },

  runScheduledNow: async (id) => {
    const response = await api.post(`/reports/scheduled/${id}/run`);
    return response.data;
  },
};

export default reportService;
