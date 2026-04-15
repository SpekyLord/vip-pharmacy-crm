/**
 * CSI Booklet Routes — Phase 15.2
 *
 * Sub-permission gated: requires inventory.csi_booklets
 * (access-template driven — not visible to all BDMs by default)
 */
const express = require('express');
const router = express.Router();
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const ctrl = require('../controllers/csiBookletController');

const gate = erpSubAccessCheck('inventory', 'csi_booklets');

router.get('/', gate, ctrl.list);
router.get('/validate', gate, ctrl.validate);
router.post('/', gate, ctrl.create);
router.post('/:id/allocate', gate, ctrl.allocate);

module.exports = router;
