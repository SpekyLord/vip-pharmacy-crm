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

  /**
   * Phase P1.2 Slice 1 (May 2026) — upload Capture Hub photos to S3
   * BEFORE calling createCapture. Replaces the data-URL stuffing path.
   *
   * Args:
   *   files     — array of File objects (camera or gallery picks)
   *   opts      — { bdm_id?, workflow_type? } optional metadata for S3 path
   *
   * Returns the parsed response data: { artifacts: [{url, key, ...}] }.
   * The caller threads `artifacts` straight into the createCapture body's
   * captured_artifacts field after stamping the artifact kind from the
   * tile workflow definition.
   *
   * Errors propagate via useErpApi's normal flow. Screenshot rejection
   * (HTTP 422 + code: SCREENSHOT_DETECTED) is preserved end-to-end so
   * the caller can route the BDM to /bdm/comm-log.
   */
  const uploadArtifact = useCallback(
    (files, opts = {}) => {
      const fd = new FormData();
      (Array.isArray(files) ? files : [files]).forEach(f => {
        if (f) fd.append('photos', f);
      });
      if (opts.bdm_id) fd.append('bdm_id', String(opts.bdm_id));
      if (opts.workflow_type) fd.append('workflow_type', opts.workflow_type);
      return api.post('/capture-submissions/upload-artifact', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
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
    uploadArtifact,
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
