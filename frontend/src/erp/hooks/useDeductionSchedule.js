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
  // Phase G1.4 — `data` may carry EITHER bdm_id (contractor schedule) OR
  // person_id (employee schedule, injects into Payslip instead of IncomeReport).
  // XOR enforced by the backend.
  const financeCreateSchedule = (data) => api.post('/deduction-schedules/finance-create', data);

  // ═══ BDM Self-Service ═══
  const withdrawSchedule = (id) => api.post(`/deduction-schedules/${id}/withdraw`);
  const editSchedule = (id, data) => api.put(`/deduction-schedules/${id}`, data);

  return {
    ...api,
    createSchedule, getMySchedules, getScheduleById,
    getScheduleList, approveSchedule, rejectSchedule,
    cancelSchedule, earlyPayoff, adjustInstallment, financeCreateSchedule,
    withdrawSchedule, editSchedule
  };
}
