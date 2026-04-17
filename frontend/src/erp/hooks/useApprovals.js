import { useState, useCallback } from 'react';
import useErpApi from './useErpApi';

/**
 * Hook for approval workflow operations.
 * Wraps /api/erp/approvals endpoints.
 */
export default function useApprovals() {
  const { get, post, put, patch, del, loading, error } = useErpApi();
  const [rules, setRules] = useState([]);
  const [requests, setRequests] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);

  // ─── Rules ────────────────────────────────
  const fetchRules = useCallback(async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await get(`/approvals/rules${qs ? `?${qs}` : ''}`);
    setRules(res.data);
    return res.data;
  }, [get]);

  const createRule = useCallback(async (data) => {
    const res = await post('/approvals/rules', data);
    return res.data;
  }, [post]);

  const updateRule = useCallback(async (id, data) => {
    const res = await put(`/approvals/rules/${id}`, data);
    return res.data;
  }, [put]);

  const deleteRule = useCallback(async (id) => {
    await del(`/approvals/rules/${id}`);
  }, [del]);

  // ─── Requests ─────────────────────────────
  const fetchRequests = useCallback(async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await get(`/approvals/requests${qs ? `?${qs}` : ''}`);
    setRequests(res.data);
    return res.data;
  }, [get]);

  const fetchMyPending = useCallback(async () => {
    const res = await get('/approvals/my-pending');
    setRequests(res.data);
    setPendingCount(res.data.length);
    return res.data;
  }, [get]);

  const approve = useCallback(async (requestId, reason) => {
    const res = await post(`/approvals/requests/${requestId}/approve`, { reason });
    return res.data;
  }, [post]);

  const reject = useCallback(async (requestId, reason) => {
    const res = await post(`/approvals/requests/${requestId}/reject`, { reason });
    return res.data;
  }, [post]);

  const cancel = useCallback(async (requestId, reason) => {
    const res = await post(`/approvals/requests/${requestId}/cancel`, { reason });
    return res.data;
  }, [post]);

  // ─── Status ───────────────────────────────
  const checkStatus = useCallback(async () => {
    const res = await get('/approvals/status');
    return res.data;
  }, [get]);

  // ─── Universal Approval Hub (Phase F) ────
  const [universalItems, setUniversalItems] = useState([]);
  const [universalCount, setUniversalCount] = useState(0);

  const fetchUniversalPending = useCallback(async () => {
    const res = await get('/approvals/universal-pending');
    setUniversalItems(res.data || []);
    setUniversalCount(res.count || (res.data || []).length);
    return res;
  }, [get]);

  const universalApprove = useCallback(async (data) => {
    const res = await post('/approvals/universal-approve', data);
    return res;
  }, [post]);

  // Phase G3: Quick-edit fields before approving
  const universalEdit = useCallback(async (data) => {
    const res = await patch('/approvals/universal-edit', data);
    return res;
  }, [patch]);

  return {
    rules,
    requests,
    pendingCount,
    universalItems,
    universalCount,
    loading,
    error,
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
    // Universal Hub
    fetchUniversalPending,
    universalApprove,
    universalEdit,
  };
}
