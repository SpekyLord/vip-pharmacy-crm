const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const ctrl = require('../controllers/lookupGenericController');

const adminFinance = roleCheck('admin', 'finance', 'president');

// Categories list + seed defaults info
router.get('/categories', ctrl.getCategories);
router.get('/seed-defaults', ctrl.getSeedDefaults);

// Seed all categories at once
router.post('/seed-all', adminFinance, ctrl.seedAll);

// Batch fetch — multiple categories in one request
router.get('/batch', ctrl.getBatch);

// Category-level CRUD
router.get('/:category', ctrl.getByCategory);
router.post('/:category', adminFinance, ctrl.create);
router.post('/:category/seed', adminFinance, ctrl.seedCategory);
router.put('/:category/:id', adminFinance, ctrl.update);
// Phase 3c — Tier 2 lookup-only danger key. Generic lookup-row delete may include
// danger-perm rows themselves (ERP_DANGER_SUB_PERMISSIONS) — same gate as classic lookup deletes.
router.delete('/:category/:id', erpSubAccessCheck('accounting', 'lookup_delete'), ctrl.remove);

module.exports = router;
