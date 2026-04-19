const express = require('express');
const router = express.Router();
const { erpAccessCheck, erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/incentiveDisputeController');

/**
 * Incentive Dispute Routes — Phase SG-4 #24
 * Mount: /api/erp/incentive-disputes
 *
 * Authorization stack (Rule #2 wire end-to-end + Rule #20 never bypass gates):
 *   - Module-level: erpAccessCheck('sales_goals') for all reads/writes (BDMs
 *     have sales_goals VIEW by default — they can file + see their own).
 *   - Sub-perm: write transitions need 'plan_manage' (re-uses an existing
 *     sub-perm; finance-grade actors get it implicitly via Access Templates).
 *   - Default-Roles Gate: gateApproval('INCENTIVE_DISPUTE', '<docType>') runs
 *     inside the controller for take-review / resolve / close.
 *
 * SLA agent (#DSP) walks pending disputes nightly — see disputeSlaAgent.js.
 */

// Reads
router.get('/', erpAccessCheck('sales_goals', 'VIEW'), c.listDisputes);
router.get('/:id', erpAccessCheck('sales_goals', 'VIEW'), c.getDisputeById);

// File a new dispute — VIEW is enough; filing is a request, not a posting.
router.post('/', erpAccessCheck('sales_goals', 'VIEW'), c.fileDispute);

// Lifecycle transitions — gateApproval handled inside the controller.
// FULL access ensures BDMs without sub-perm can't escalate accidentally;
// president bypasses both via approvalService logic.
router.post('/:id/take-review', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.takeReview);
router.post('/:id/resolve', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.resolveDispute);
router.post('/:id/close', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.closeDispute);

// Filer-cancel (OPEN-only, no gate — withdraw your own request)
router.post('/:id/cancel', erpAccessCheck('sales_goals', 'VIEW'), c.cancelDispute);

module.exports = router;
