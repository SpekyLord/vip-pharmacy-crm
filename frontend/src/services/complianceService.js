/**
 * Compliance Service
 *
 * Compliance API calls for Task 2.1:
 * - Get compliance alerts
 * - Get behind-schedule BDMs
 * - Get quota dumping alerts
 * - Get weekly/monthly compliance reports
 * - Send notification to BDM
 */

import api from './api';

const complianceService = {
  /**
   * Get all compliance alerts
   * Returns BDMs who are behind schedule or have compliance issues
   */
  getComplianceAlerts: async (params = {}) => {
    const response = await api.get('/compliance/alerts', { params });
    return response.data;
  },

  /**
   * Get BDMs who are behind their weekly visit schedule
   * Threshold: < 80% of weekly target = "Behind Schedule"
   */
  getBehindScheduleEmployees: async (params = {}) => {
    const response = await api.get('/compliance/behind-schedule', { params });
    return response.data;
  },

  /**
   * Get quota dumping alerts
   * Detects suspicious patterns: multiple visits in a short period
   */
  getQuotaDumpingAlerts: async (params = {}) => {
    const response = await api.get('/compliance/quota-dumping', { params });
    return response.data;
  },

  /**
   * Get weekly compliance report for all employees
   * Shows weekly visit completion status per employee
   */
  getWeeklyComplianceReport: async (params = {}) => {
    const response = await api.get('/compliance/report/weekly', { params });
    return response.data;
  },

  /**
   * Get monthly compliance report
   * Shows monthly completion rates and trends
   */
  getMonthlyComplianceReport: async (params = {}) => {
    const response = await api.get('/compliance/report/monthly', { params });
    return response.data;
  },

  /**
   * Get compliance overview stats
   * Summary metrics for the compliance dashboard
   */
  getOverviewStats: async (params = {}) => {
    const response = await api.get('/compliance/overview', { params });
    return response.data;
  },

  /**
   * Send compliance notification to an employee
   * Notifies via email and dashboard inbox
   */
  sendNotification: async (employeeId, notificationData) => {
    const response = await api.post(`/compliance/notify/${employeeId}`, notificationData);
    return response.data;
  },

  /**
   * Get notification history for an employee
   */
  getNotificationHistory: async (employeeId) => {
    const response = await api.get(`/compliance/notifications/${employeeId}`);
    return response.data;
  },
};

export default complianceService;