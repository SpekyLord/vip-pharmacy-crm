/**
 * CSI Booklet — Public (BDM self-service) Routes
 *
 * Mounted at /erp/my-csi — does NOT apply the inventory module gate, so any
 * ERP-authenticated user (already protected + tenant-filtered upstream) can
 * see their OWN available CSI numbers while creating sales.
 *
 * The management UI (list, create, allocate, void) stays on /erp/csi-booklets
 * behind the inventory module + `inventory.csi_booklets` sub-permission gate.
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/csiBookletController');

router.get('/available', ctrl.getAvailable);

module.exports = router;
