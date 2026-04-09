const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
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
router.delete('/:category/:id', adminFinance, ctrl.remove);

module.exports = router;
