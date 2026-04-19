/**
 * Insurance Routes — PRD Module 14 Insurance Register
 *
 * CRUD for insurance policies per person.
 * Read: all authenticated ERP users. Write: admin/finance/president. Delete: president only.
 */
const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/insuranceController');

router.get('/export', c.exportInsurance);
router.get('/', c.getAll);
router.get('/summary', c.getSummary);
router.get('/:id', c.getById);
router.post('/', roleCheck('admin', 'finance', 'president'), c.create);
router.put('/:id', roleCheck('admin', 'finance', 'president'), c.update);
// Phase 3c — closes Phase 3a residual (was president-only roleCheck). Tier 2 lookup-only.
router.delete('/:id', erpSubAccessCheck('payroll', 'insurance_delete'), c.remove);

module.exports = router;
