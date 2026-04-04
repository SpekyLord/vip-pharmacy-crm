/**
 * Collateral Routes — Phase 19
 *
 * Marketing collateral CRUD with distribution and return tracking.
 * Module-level erpAccessCheck applied in index.js.
 */
const express = require('express');
const router = express.Router();
const c = require('../controllers/collateralController');

// ═══ CRUD ═══
router.get('/', c.getAll);
router.get('/:id', c.getById);
router.post('/', c.create);
router.put('/:id', c.update);

// ═══ Distribution & Returns ═══
router.post('/:id/distribute', c.recordDistribution);
router.post('/:id/return', c.recordReturn);

module.exports = router;
