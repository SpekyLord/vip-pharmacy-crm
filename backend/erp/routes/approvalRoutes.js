/**
 * Approval Routes — Phase 28 (Authority Matrix)
 *
 * Mounted at /api/erp/approvals
 *
 * Rules:  CRUD for admin to manage approval rules (via Control Center)
 * Requests: List, approve, reject, cancel approval requests
 */

const express = require('express');
const router = express.Router();
const { adminOnly } = require('../../middleware/roleCheck');
const {
  listRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  listRequests,
  getMyPendingApprovals,
  approveRequest,
  rejectRequest,
  cancelRequest,
  getApprovalStatus,
} = require('../controllers/approvalController');

// Status check (is authority matrix enabled?)
router.get('/status', getApprovalStatus);

// My pending approvals (for the logged-in user as approver)
router.get('/my-pending', getMyPendingApprovals);

// Approval requests (read + decide)
router.get('/requests', listRequests);
router.post('/requests/:id/approve', approveRequest);
router.post('/requests/:id/reject', rejectRequest);
router.post('/requests/:id/cancel', cancelRequest);

// Approval rules CRUD (admin/president only)
router.get('/rules', listRules);
router.get('/rules/:id', getRule);
router.post('/rules', adminOnly, createRule);
router.put('/rules/:id', adminOnly, updateRule);
router.delete('/rules/:id', adminOnly, deleteRule);

module.exports = router;
