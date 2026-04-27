const express = require('express');
const ctrl = require('../controllers/vendorLearningController');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');

const router = express.Router();

// Reviewing auto-learned vendors is part of vendor-master governance, so the
// gate matches the write side of `vendorRoutes.js`: anyone holding the
// `purchasing.vendor_manage` sub-permission can review (admin/finance/president
// keep access through the normal subperm/president-bypass path). Lookup-driven
// (Rule #3) — president can grant or revoke per-user via Control Center
// without redeploying the route.
const vendorManage = erpSubAccessCheck('purchasing', 'vendor_manage');
router.use(vendorManage);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.patch('/:id', ctrl.review);

module.exports = router;
