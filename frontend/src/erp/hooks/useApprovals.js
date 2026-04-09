import { useState, useCallback } from 'react';
import useErpApi from './useErpApi';

/**
 * Hook for approval workflow operations.
 * Wraps /api/erp/approvals endpoints.
 */
export default function useApprovals() {
  const api = useErpApi();
  const [rules, setRules] = useState([]);
  const [requests, setRequests] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);

  // ─── Rules ────────────────────────────────
  const fetchRules = useCallback(async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await api.get(`/approvals/rules${qs ? `?${qs}` : ''}`);
    setRules(res.data);
    return res.data;
  }, [api]);

  const createRule = useCallback(async (data) => {
    const res = await api.post('/approvals/rules', data);
    return res.data;
  }, [api]);

  const updateRule = useCallback(async (id, data) => {
    const res = await api.put(`/approvals/rules/${id}`, data);
    return res.data;
  }, [api]);

  const deleteRule = useCallback(async (id) => {
    await api.del(`/approvals/rules/${id}`);
  }, [api]);

  // ─── Requests ─────────────────────────────
  const fetchRequests = useCallback(async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await api.get(`/approvals/requests${qs ? `?${qs}` : ''}`);
    setRequests(res.data);
    return res.data;
  }, [api]);

  const fetchMyPending = useCallback(async () => {
    const res = await api.get('/approvals/my-pending');
    setRequests(res.data);
    setPendingCount(res.data.length);
    return res.data;
  }, [api]);

  const approve = useCallback(async (requestId, reason) => {
    const res = await api.post(`/approvals/requests/${requestId}/approve`, { reason });
    return res.data;
  }, [api]);

  const reject = useCallback(async (requestId, reason) => {
    const res = await api.post(`/approvals/requests/${requestId}/reject`, { reason });
    return res.data;
  }, [api]);

  const cancel = useCallback(async (requestId, reason) => {
    const res = await api.post(`/approvals/requests/${requestId}/cancel`, { reason });
    return res.data;
  }, [api]);

  // ─── Status ───────────────────────────────
  const checkStatus = useCallback(async () => {
    const res = await api.get('/approvals/status');
    return res.data;
  }, [api]);

  return {
    rules,
    requests,
    pendingCount,
    loading: api.loading,
    error: api.error,
    // Rules
    fetchRules,
    createRule,
    updateRule,
    deleteRule,
    // Requests
    fetchRequests,
    fetchMyPending,
    approve,
    reject,
    cancel,
    // Status
    checkStatus,
  };
}
