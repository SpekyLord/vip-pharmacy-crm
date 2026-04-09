import { useState, useCallback } from 'react';
import useErpApi from './useErpApi';

/**
 * Hook for functional role assignment operations.
 * Wraps /api/erp/role-assignments endpoints.
 */
export default function useFunctionalRoles() {
  const api = useErpApi();
  const [assignments, setAssignments] = useState([]);

  // ─── List (entity-scoped) ─────────────
  const fetchAssignments = useCallback(async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await api.get(`/role-assignments${qs ? `?${qs}` : ''}`);
    setAssignments(res.data);
    return res.data;
  }, [api]);

  // ─── By Person (cross-entity) ────────
  const fetchByPerson = useCallback(async (personId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await api.get(`/role-assignments/by-person/${personId}${qs ? `?${qs}` : ''}`);
    return res.data;
  }, [api]);

  // ─── Single ──────────────────────────
  const fetchAssignment = useCallback(async (id) => {
    const res = await api.get(`/role-assignments/${id}`);
    return res.data;
  }, [api]);

  // ─── Create ──────────────────────────
  const createAssignment = useCallback(async (data) => {
    const res = await api.post('/role-assignments', data);
    return res.data;
  }, [api]);

  // ─── Bulk Create ─────────────────────
  const bulkCreate = useCallback(async (data) => {
    const res = await api.post('/role-assignments/bulk', data);
    return res.data;
  }, [api]);

  // ─── Update ──────────────────────────
  const updateAssignment = useCallback(async (id, data) => {
    const res = await api.put(`/role-assignments/${id}`, data);
    return res.data;
  }, [api]);

  // ─── Deactivate ──────────────────────
  const deactivateAssignment = useCallback(async (id) => {
    const res = await api.post(`/role-assignments/${id}/deactivate`);
    return res.data;
  }, [api]);

  return {
    assignments,
    loading: api.loading,
    error: api.error,
    fetchAssignments,
    fetchByPerson,
    fetchAssignment,
    createAssignment,
    bulkCreate,
    updateAssignment,
    deactivateAssignment,
  };
}
