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

  // Phase A.6 — Reschedule a single planned/carried entry by passing a date.
  adminReschedule: async (id, date) => {
    const response = await api.patch(`/schedules/admin/${id}`, { date });
    return response.data;
  },

  // Phase A.6 — List upcoming planned/carried entries for one VIP under one BDM.
  // Used by the Reschedule modal so admin sees what's currently planned.
  adminGetUpcoming: async (doctorId, userId) => {
    const response = await api.get('/schedules/admin/upcoming', {
      params: { doctorId, userId },
    });
    return response.data;
  },

  // Phase A.6 — Bulk count of upcoming planned/carried entries for many VIPs.
  // Powers the "Needs scheduling" badge on the doctor list.
  adminGetUpcomingCounts: async (doctorIds) => {
    const ids = (doctorIds || []).join(',');
    if (!ids) return { success: true, data: { counts: {} } };
    const response = await api.get('/schedules/admin/upcoming-counts', {
      params: { doctorIds: ids },
    });
    return response.data;
  },

  getCPTGrid: async (cycleNumber, userId) => {
    const params = {};
    if (cycleNumber != null) params.cycleNumber = cycleNumber;
    if (userId) params.userId = userId;
    const response = await api.get('/schedules/cpt-grid', { params });
    return response.data;
  },

  getCPTGridSummary: async (cycleNumber) => {
    const params = {};
    if (cycleNumber != null) params.cycleNumber = cycleNumber;
    const response = await api.get('/schedules/cpt-grid-summary', { params });
    return response.data;
  },

  getCrossBdmHeatmap: async (cycleNumber) => {
    const params = {};
    if (cycleNumber != null) params.cycleNumber = cycleNumber;
    const response = await api.get('/schedules/cross-bdm-heatmap', { params });
    return response.data;
  },

  // Team Activity Cockpit — one row per active BDM with today / this week
  // / this month / cycle visit counts + last-visit recency + red-flag.
  // Powers /admin/statistics → Team Activity tab. Thresholds resolved
  // server-side from TEAM_ACTIVITY_THRESHOLDS lookup and echoed in the
  // response so the UI doesn't need a second round-trip.
  getTeamActivity: async () => {
    const response = await api.get('/schedules/team-activity');
    return response.data;
  },

};

export default scheduleService;
