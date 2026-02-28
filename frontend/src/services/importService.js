/**
 * Import Service
 *
 * API calls for CPT Excel import batch management.
 * All endpoints require admin authentication.
 */

import api from './api';

/**
 * Upload a CPT Excel file for parsing and staging.
 * @param {FormData} formData - Must contain: file, assignedToBDM, regionId, cycleNumber
 * @returns {Promise} Batch creation result with stats
 */
export const upload = async (formData) => {
  const response = await api.post('/imports/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000, // 60s for large files
  });
  return response.data;
};

/**
 * List import batches with optional filters.
 * @param {Object} params - { page, limit, status }
 */
export const list = async (params = {}) => {
  const response = await api.get('/imports', { params });
  return response.data;
};

/**
 * Get full batch detail for preview/review.
 * @param {string} id - Batch ID
 */
export const getById = async (id) => {
  const response = await api.get(`/imports/${id}`);
  return response.data;
};

/**
 * Approve a pending batch (writes to Doctor + Schedule collections).
 * @param {string} id - Batch ID
 */
export const approve = async (id) => {
  const response = await api.post(`/imports/${id}/approve`);
  return response.data;
};

/**
 * Reject a pending batch with a reason.
 * @param {string} id - Batch ID
 * @param {string} reason - Rejection reason
 */
export const reject = async (id, reason) => {
  const response = await api.post(`/imports/${id}/reject`, { reason });
  return response.data;
};

/**
 * Delete a pending import batch.
 * @param {string} id - Batch ID
 */
export const deleteBatch = async (id) => {
  const response = await api.delete(`/imports/${id}`);
  return response.data;
};

export default {
  upload,
  list,
  getById,
  approve,
  reject,
  deleteBatch,
};
