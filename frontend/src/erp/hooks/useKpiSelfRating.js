import { useState, useCallback } from 'react';
import useErpApi from './useErpApi';

/**
 * Hook for KPI Self-Rating & Performance Review operations.
 * Wraps /api/erp/self-ratings endpoints.
 *
 * IMPORTANT: useCallback deps use individual api methods (api.get, api.post, api.put)
 * instead of the whole `api` object, because the object reference changes when
 * loading/error state changes — using `api` would cause infinite re-render loops.
 */
export default function useKpiSelfRating() {
  const api = useErpApi();
  const [ratings, setRatings] = useState([]);
  const [currentDraft, setCurrentDraft] = useState(null);

  // ─── My Ratings (history) ───────────────
  const fetchMyRatings = useCallback(async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await api.get(`/self-ratings/my${qs ? `?${qs}` : ''}`);
    setRatings(res.data);
    return res.data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.get]);

  // ─── Get/Create Current Draft ───────────
  const fetchCurrentDraft = useCallback(async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await api.get(`/self-ratings/my/current${qs ? `?${qs}` : ''}`);
    setCurrentDraft(res.data);
    return res.data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.get]);

  // ─── Single Rating ─────────────────────
  const fetchRating = useCallback(async (id) => {
    const res = await api.get(`/self-ratings/${id}`);
    return res.data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.get]);

  // ─── Ratings for Review (manager/admin) ─
  const fetchForReview = useCallback(async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await api.get(`/self-ratings/review${qs ? `?${qs}` : ''}`);
    return res.data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.get]);

  // ─── Ratings by Person (admin) ─────────
  const fetchByPerson = useCallback(async (personId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await api.get(`/self-ratings/by-person/${personId}${qs ? `?${qs}` : ''}`);
    return res.data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.get]);

  // ─── Save Draft ────────────────────────
  const saveDraft = useCallback(async (data) => {
    const res = await api.post('/self-ratings', data);
    setCurrentDraft(res.data);
    return res.data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.post]);

  // ─── Submit ────────────────────────────
  const submitRating = useCallback(async (id) => {
    const res = await api.post(`/self-ratings/${id}/submit`, {});
    return res.data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.post]);

  // ─── Review (manager) ─────────────────
  const reviewRating = useCallback(async (id, data) => {
    const res = await api.put(`/self-ratings/${id}/review`, data);
    return res.data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.put]);

  // ─── Approve (admin) ──────────────────
  const approveRating = useCallback(async (id) => {
    const res = await api.post(`/self-ratings/${id}/approve`, {});
    return res.data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.post]);

  // ─── Return for Revision ──────────────
  const returnRating = useCallback(async (id, reason) => {
    const res = await api.post(`/self-ratings/${id}/return`, { return_reason: reason });
    return res.data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.post]);

  return {
    ratings,
    currentDraft,
    loading: api.loading,
    error: api.error,
    fetchMyRatings,
    fetchCurrentDraft,
    fetchRating,
    fetchForReview,
    fetchByPerson,
    saveDraft,
    submitRating,
    reviewRating,
    approveRating,
    returnRating,
  };
}
