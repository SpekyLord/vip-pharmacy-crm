import { useState, useCallback } from 'react';
import useErpApi from './useErpApi';

/**
 * Hook for KPI Self-Rating & Performance Review operations.
 * Wraps /api/erp/self-ratings endpoints.
 */
export default function useKpiSelfRating() {
  const { get, post, put, loading, error } = useErpApi();
  const [ratings, setRatings] = useState([]);
  const [currentDraft, setCurrentDraft] = useState(null);

  // ─── My Ratings (history) ───────────────
  const fetchMyRatings = useCallback(async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await get(`/self-ratings/my${qs ? `?${qs}` : ''}`);
    setRatings(res.data);
    return res.data;
  }, [get]);

  // ─── Get/Create Current Draft ───────────
  const fetchCurrentDraft = useCallback(async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await get(`/self-ratings/my/current${qs ? `?${qs}` : ''}`);
    setCurrentDraft(res.data);
    return res.data;
  }, [get]);

  // ─── Single Rating ─────────────────────
  const fetchRating = useCallback(async (id) => {
    const res = await get(`/self-ratings/${id}`);
    return res.data;
  }, [get]);

  // ─── Ratings for Review (manager/admin) ─
  const fetchForReview = useCallback(async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await get(`/self-ratings/review${qs ? `?${qs}` : ''}`);
    return res.data;
  }, [get]);

  // ─── Ratings by Person (admin) ─────────
  const fetchByPerson = useCallback(async (personId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const res = await get(`/self-ratings/by-person/${personId}${qs ? `?${qs}` : ''}`);
    return res.data;
  }, [get]);

  // ─── Save Draft ────────────────────────
  const saveDraft = useCallback(async (data) => {
    const res = await post('/self-ratings', data);
    setCurrentDraft(res.data);
    return res.data;
  }, [post]);

  // ─── Submit ────────────────────────────
  const submitRating = useCallback(async (id) => {
    const res = await post(`/self-ratings/${id}/submit`, {});
    return res.data;
  }, [post]);

  // ─── Review (manager) ─────────────────
  const reviewRating = useCallback(async (id, data) => {
    const res = await put(`/self-ratings/${id}/review`, data);
    return res.data;
  }, [put]);

  // ─── Approve (admin) ──────────────────
  const approveRating = useCallback(async (id) => {
    const res = await post(`/self-ratings/${id}/approve`, {});
    return res.data;
  }, [post]);

  // ─── Return for Revision ──────────────
  const returnRating = useCallback(async (id, reason) => {
    const res = await post(`/self-ratings/${id}/return`, { return_reason: reason });
    return res.data;
  }, [post]);

  return {
    ratings,
    currentDraft,
    loading,
    error,
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
