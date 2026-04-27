/**
 * Customer Routes — Phase 18
 * Shared infrastructure (no module gate, same level as /hospitals)
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { roleCheck } = require('../../middleware/roleCheck');
const { erpSubAccessCheck, erpRoleOrSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/customerController');

// Bulk export/import stay role-gated — admin-grade operations (Excel round-trip,
// bypass per-record audit). Single-record CRUD migrated to lookup-driven sub-permission
// in Phase MD-1 (Apr 2026) so non-admin staff can be delegated Master Data write.
router.get('/export', roleCheck('admin', 'finance', 'president'), c.exportCustomers);
router.post('/import', roleCheck('admin', 'finance', 'president'), upload.single('file'), c.importCustomers);
router.get('/', c.getAll);
router.get('/:id', c.getById);
// Phase MD-1 (Apr 2026) — replaced hardcoded roleCheck with erpRoleOrSubAccessCheck so
// the new MASTER__CUSTOMER_MANAGE sub-permission gates Add/Edit and BDM tagging WITHOUT
// regressing legacy admin/finance/president callers (they pass via the role bypass even
// if their Access Template is in explicit-grant mode). Customers are globally shared
// (Phase G5) so cross-entity write needs no extra flag — granting customer_manage is
// sufficient.
router.post('/', erpRoleOrSubAccessCheck(['admin', 'finance', 'president'], 'master', 'customer_manage'), c.create);
router.put('/:id', erpRoleOrSubAccessCheck(['admin', 'finance', 'president'], 'master', 'customer_manage'), c.update);
// Phase 3c — deactivate hides the customer; downstream invoices/AR remain. Tier 2 lookup-only.
router.patch('/:id/deactivate', erpSubAccessCheck('master', 'customer_deactivate'), c.deactivate);
router.post('/:id/tag-bdm', erpRoleOrSubAccessCheck(['admin', 'finance', 'president'], 'master', 'customer_manage'), c.tagBdm);
router.post('/:id/untag-bdm', erpRoleOrSubAccessCheck(['admin', 'finance', 'president'], 'master', 'customer_manage'), c.untagBdm);

module.exports = router;
