const express = require('express');
const ctrl = require('../controllers/vendorLearningController');
const { roleCheck } = require('../../middleware/roleCheck');

const router = express.Router();
const adminFinance = roleCheck('admin', 'finance', 'president');

// All routes are admin/finance/president only (review of machine-learned vendors
// is a governance action — line staff should not edit the classifier's training set).
router.use(adminFinance);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.patch('/:id', ctrl.review);

module.exports = router;
