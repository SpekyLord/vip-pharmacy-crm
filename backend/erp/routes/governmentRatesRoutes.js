const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth');
const { roleCheck } = require('../../middleware/roleCheck');
const { getRates, getRateById, createRate, updateRate, deleteRate } = require('../controllers/governmentRatesController');

router.get('/', protect, getRates);
router.get('/:id', protect, getRateById);
router.post('/', protect, roleCheck('admin', 'finance'), createRate);
router.put('/:id', protect, roleCheck('admin', 'finance'), updateRate);
router.delete('/:id', protect, roleCheck('admin'), deleteRate);

module.exports = router;
