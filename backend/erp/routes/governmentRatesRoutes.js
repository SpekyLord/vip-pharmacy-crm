const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { protect } = require('../../middleware/auth');
const { roleCheck } = require('../../middleware/roleCheck');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const {
  getRates, getRateById, createRate, updateRate, deleteRate,
  exportRates, importRates, computeBreakdown
} = require('../controllers/governmentRatesController');

// Static routes BEFORE /:id
router.get('/export', protect, roleCheck('admin', 'finance', 'president'), exportRates);
router.post('/import', protect, roleCheck('admin', 'finance', 'president'), upload.single('file'), importRates);
router.post('/compute-breakdown', protect, computeBreakdown);

router.get('/', protect, getRates);
router.get('/:id', protect, getRateById);
router.post('/', protect, roleCheck('admin', 'finance', 'president'), createRate);
router.put('/:id', protect, roleCheck('admin', 'finance', 'president'), updateRate);
// Phase 3c — danger-baseline. Deleting a tax rate row reshapes payroll computation
// for every payslip that references it; require explicit Access Template grant.
router.delete('/:id', protect, erpSubAccessCheck('payroll', 'gov_rate_delete'), deleteRate);

module.exports = router;
