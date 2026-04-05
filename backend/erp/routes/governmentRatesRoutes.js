const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { protect } = require('../../middleware/auth');
const { roleCheck } = require('../../middleware/roleCheck');
const {
  getRates, getRateById, createRate, updateRate, deleteRate,
  exportRates, importRates, computeBreakdown
} = require('../controllers/governmentRatesController');

// Static routes BEFORE /:id
router.get('/export', protect, roleCheck('admin', 'finance'), exportRates);
router.post('/import', protect, roleCheck('admin', 'finance'), upload.single('file'), importRates);
router.post('/compute-breakdown', protect, computeBreakdown);

router.get('/', protect, getRates);
router.get('/:id', protect, getRateById);
router.post('/', protect, roleCheck('admin', 'finance'), createRate);
router.put('/:id', protect, roleCheck('admin', 'finance'), updateRate);
router.delete('/:id', protect, roleCheck('admin'), deleteRate);

module.exports = router;
