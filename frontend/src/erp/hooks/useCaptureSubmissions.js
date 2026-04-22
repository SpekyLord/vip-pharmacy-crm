/**
 * useCaptureSubmissions — Phase P1 (April 23, 2026).
 *
 * Hook wrapping CaptureSubmission API endpoints through useErpApi.
 */
import { useCallback } from 'react';
import useErpApi from './useErpApi';

export default function useCaptureSubmissions() {
  const api = useErpApi();

  // ── BDM-side ──
  const createCapture = useCallback(
    (data) => api.post('/capture-submissions', data),
    [api]
  );

  const getMyCaptures = useCallback(
    (params) => api.get('/capture-submissions/my', { params }),
    [api]
  );

  const getMyReviewQueue = useCallback(
    (params) => api.get('/capture-submissions/my/review', { params }),
    [api]
  );

  const acknowledgeCapture = useCallback(
    (id) => api.put(`/capture-submissions/${id}/acknowledge`),
    [api]
  );

  const disputeCapture = useCallback(
    (id, data) => api.put(`/capture-submissions/${id}/dispute`, data),
    [api]
  );

  const cancelCapture = useCallback(
    (id) => api.put(`/capture-submissions/${id}/cancel`),
    [api]
  );

  // ── Proxy-side ──
  const getProxyQueue = useCallback(
    (params) => api.get('/capture-submissions/queue', { params }),
    [api]
  );

  const getCaptureById = useCallback(
    (id) => api.get(`/capture-submissions/${id}`),
    [api]
  );

  const pickupCapture = useCallback(
    (id) => api.put(`/capture-submissions/${id}/pickup`),
    [api]
  );

  const releaseCapture = useCallback(
    (id) => api.put(`/capture-submissions/${id}/release`),
    [api]
  );

  const completeCapture = useCallback(
    (id, data) => api.put(`/capture-submissions/${id}/complete`, data),
    [api]
  );

  // ── Dashboard ──
  const getQueueStats = useCallback(
    () => api.get('/capture-submissions/stats'),
    [api]
  );

  return {
    ...api,
    // BDM
    createCapture,
    getMyCaptures,
    getMyReviewQueue,
    acknowledgeCapture,
    disputeCapture,
    cancelCapture,
    // Proxy
    getProxyQueue,
    getCaptureById,
    pickupCapture,
    releaseCapture,
    completeCapture,
    // Dashboard
    getQueueStats,
  };
}
