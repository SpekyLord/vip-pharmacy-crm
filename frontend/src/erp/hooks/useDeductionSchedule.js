import useErpApi from './useErpApi';

export default function useDeductionSchedule() {
  const api = useErpApi();

  // ═══ BDM (contractor) ═══
  const createSchedule = (data) => api.post('/deduction-schedules', data);
  const getMySchedules = (params) => api.get('/deduction-schedules/my', { params });

  // ═══ Shared ═══
  const getScheduleById = (id) => api.get(`/deduction-schedules/${id}`);

  // ═══ Finance/Admin ═══
  const getScheduleList = (params) => api.get('/deduction-schedules', { params });
  const approveSchedule = (id) => api.post(`/deduction-schedules/${id}/approve`);
  const rejectSchedule = (id, reason) => api.post(`/deduction-schedules/${id}/reject`, { reason });
  const cancelSchedule = (id, reason) => api.post(`/deduction-schedules/${id}/cancel`, { reason });
  const earlyPayoff = (id, data) => api.post(`/deduction-schedules/${id}/early-payoff`, data);
  const adjustInstallment = (id, instId, data) => api.put(`/deduction-schedules/${id}/installments/${instId}`, data);
  const financeCreateSchedule = (data) => api.post('/deduction-schedules/finance-create', data);

  return {
    ...api,
    createSchedule, getMySchedules, getScheduleById,
    getScheduleList, approveSchedule, rejectSchedule,
    cancelSchedule, earlyPayoff, adjustInstallment, financeCreateSchedule
  };
}
