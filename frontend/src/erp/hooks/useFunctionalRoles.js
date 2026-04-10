import { useState, useCallback } from 'react';
import useErpApi from './useErpApi';

/**
 * Hook for functional role assignment operations.
 * Wraps /api/erp/role-assignments endpoints.
 */
export default function useFunctionalRoles() {
  const { get, post, put, loading, error } = useErpApi();
  const [assignments, setAssignments] = useState([]);

  // ─── List (entity-scoped) ─────────────
  const fetchAssignments = useCallback(async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await get(`/role-assignments${qs ? `?${qs}` : ''}`);
    setAssignments(res.data);
    return res.data;
  }, [get]);

  // ─── By Person (cross-entity) ────────
  const fetchByPerson = useCallback(async (personId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await get(`/role-assignments/by-person/${personId}${qs ? `?${qs}` : ''}`);
    return res.data;
  }, [get]);

  // ─── Single ──────────────────────────
  const fetchAssignment = useCallback(async (id) => {
    const res = await get(`/role-assignments/${id}`);
    return res.data;
  }, [get]);

  // ─── Create ──────────────────────────
  const createAssignment = useCallback(async (data) => {
    const res = await post('/role-assignments', data);
    return res.data;
  }, [post]);

  // ─── Bulk Create ─────────────────────
  const bulkCreate = useCallback(async (data) => {
    const res = await post('/role-assignments/bulk', data);
    return res.data;
  }, [post]);

  // ─── Update ──────────────────────────
  const updateAssignment = useCallback(async (id, data) => {
    const res = await put(`/role-assignments/${id}`, data);
    return res.data;
  }, [put]);

  // ─── Deactivate ──────────────────────
  const deactivateAssignment = useCallback(async (id) => {
    const res = await post(`/role-assignments/${id}/deactivate`, {});
    return res.data;
  }, [post]);

  return {
    assignments,
    loading,
    error,
    fetchAssignments,
    fetchByPerson,
    fetchAssignment,
    createAssignment,
    bulkCreate,
    updateAssignment,
    deactivateAssignment,
  };
}
