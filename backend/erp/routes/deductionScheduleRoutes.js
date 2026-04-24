/**
 * Deduction Schedule Routes — Recurring & Non-Recurring Deduction Plans
 *
 * BDM (staff) creates schedules. Finance/Admin approves and manages.
 * NOTE: GET /my must come BEFORE GET /:id to avoid "my" matching as an id param.
 */
const express = require('express');
const { roleCheck } = require('../../middleware/roleCheck');
const periodLockCheck = require('../middleware/periodLockCheck');
const {
  createSchedule,
  getMySchedules,
  getScheduleById,
  getScheduleList,
  approveSchedule,
  rejectSchedule,
  cancelSchedule,
  earlyPayoff,
  adjustInstallment,
  financeCreateSchedule,
  withdrawSchedule,
  editPendingSchedule
} = require('../controllers/deductionScheduleController');

const router = express.Router();

// ═══ BDM (staff) ═══
router.post('/', roleCheck('staff'), periodLockCheck('DEDUCTION'), createSchedule);
router.get('/my', roleCheck('staff'), getMySchedules);
router.post('/:id/withdraw', roleCheck('staff'), withdrawSchedule);
router.put('/:id', roleCheck('staff'), periodLockCheck('DEDUCTION'), editPendingSchedule);

// ═══ Finance/Admin ═══
router.post('/finance-create', roleCheck('admin', 'finance', 'president'), periodLockCheck('DEDUCTION'), financeCreateSchedule);
router.get('/', roleCheck('admin', 'finance', 'president'), getScheduleList);
router.post('/:id/approve', roleCheck('admin', 'finance', 'president'), approveSchedule);
router.post('/:id/reject', roleCheck('admin', 'finance', 'president'), rejectSchedule);
router.post('/:id/cancel', roleCheck('admin', 'finance', 'president'), cancelSchedule);
router.post('/:id/early-payoff', roleCheck('admin', 'finance', 'president'), earlyPayoff);
router.put('/:id/installments/:instId', roleCheck('admin', 'finance', 'president'), adjustInstallment);

// ═══ Shared (own or admin — checked in controller) ═══
router.get('/:id', getScheduleById);

module.exports = router;
