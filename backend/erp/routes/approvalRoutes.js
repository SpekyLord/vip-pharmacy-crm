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
const { erpAccessCheck, erpSubAccessCheck } = require('../middleware/erpAccessCheck');
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
const {
  getUniversalPendingEndpoint,
  universalApprove,
  universalEdit,
} = require('../controllers/universalApprovalController');

// ═══ Universal Approval Hub (Phase F + G3) ═══
// VIEW on approvals module = see pending items + approve/reject
router.get('/universal-pending', erpAccessCheck('approvals'), getUniversalPendingEndpoint);
router.post('/universal-approve', erpAccessCheck('approvals'), universalApprove);
router.patch('/universal-edit', erpAccessCheck('approvals'), universalEdit);

// Status check (is authority matrix enabled?)
router.get('/status', getApprovalStatus);

// My pending approvals (for the logged-in user as approver)
router.get('/my-pending', erpAccessCheck('approvals'), getMyPendingApprovals);

// Approval requests (read + decide)
router.get('/requests', erpAccessCheck('approvals'), listRequests);
router.post('/requests/:id/approve', erpAccessCheck('approvals'), approveRequest);
router.post('/requests/:id/reject', erpAccessCheck('approvals'), rejectRequest);
router.post('/requests/:id/cancel', erpAccessCheck('approvals'), cancelRequest);

// Approval rules CRUD — requires approvals module + rule_manage sub-permission
router.get('/rules', erpAccessCheck('approvals'), listRules);
router.get('/rules/:id', erpAccessCheck('approvals'), getRule);
router.post('/rules', erpSubAccessCheck('approvals', 'rule_manage'), createRule);
router.put('/rules/:id', erpSubAccessCheck('approvals', 'rule_manage'), updateRule);
router.delete('/rules/:id', erpSubAccessCheck('approvals', 'rule_manage'), deleteRule);

module.exports = router;
