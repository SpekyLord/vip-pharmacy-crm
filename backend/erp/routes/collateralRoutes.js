/**
 * Collateral Routes — Phase 19
 *
 * Marketing collateral CRUD with distribution and return tracking.
 * Module-level erpAccessCheck('inventory') applied in index.js.
 * Sub-permission gated: requires inventory.collaterals
 * (access-template driven — not visible to all BDMs by default)
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/collateralController');

const gate = erpSubAccessCheck('inventory', 'collaterals');

// ═══ CRUD ═══
router.get('/export', gate, c.exportCollaterals);
router.post('/import', gate, upload.single('file'), c.importCollaterals);
router.get('/', gate, c.getAll);
router.get('/:id', gate, c.getById);
router.post('/', gate, c.create);
router.put('/:id', gate, c.update);

// ═══ Distribution & Returns ═══
router.post('/:id/distribute', gate, c.recordDistribution);
router.post('/:id/return', gate, c.recordReturn);

module.exports = router;
