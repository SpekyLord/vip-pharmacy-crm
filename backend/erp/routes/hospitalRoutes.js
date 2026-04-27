const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { roleCheck } = require('../../middleware/roleCheck');
const { erpSubAccessCheck, erpRoleOrSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/hospitalController');

// Note: protect + tenantFilter already applied at ERP router index level
// Bulk export/import stay role-gated — these are admin-grade operations (Excel round-trip,
// bypass per-record audit). Single-record CRUD migrated to lookup-driven sub-permission
// in Phase MD-1 (Apr 2026) so non-admin staff can be delegated Master Data write.
router.get('/export', roleCheck('admin', 'finance', 'president'), c.exportHospitals);
router.post('/import', roleCheck('admin', 'finance', 'president'), upload.single('file'), c.importHospitals);
router.get('/', c.getAll);
router.get('/:id', c.getById);
// Phase MD-1 (Apr 2026) — replaced hardcoded roleCheck with erpRoleOrSubAccessCheck so the
// new MASTER__HOSPITAL_MANAGE sub-permission gates Add/Edit/Alias-add WITHOUT regressing
// legacy admin/finance/president callers (they still pass via the role bypass even if
// their Access Template has master sub-perms in explicit-grant mode). Hospitals are
// globally shared (Phase 4A.3) so cross-entity write requires no extra flag — granting
// hospital_manage is sufficient.
router.post('/', erpRoleOrSubAccessCheck(['admin', 'finance', 'president'], 'master', 'hospital_manage'), c.create);
router.put('/:id', erpRoleOrSubAccessCheck(['admin', 'finance', 'president'], 'master', 'hospital_manage'), c.update);
// Phase 3c — Tier 2 lookup-only danger keys (downstream visits/SMERs / OCR matching impact).
router.patch('/:id/deactivate', erpSubAccessCheck('master', 'hospital_deactivate'), c.deactivate);
router.post('/:id/alias', erpRoleOrSubAccessCheck(['admin', 'finance', 'president'], 'master', 'hospital_manage'), c.addAlias);
router.delete('/:id/alias', erpSubAccessCheck('master', 'hospital_alias_delete'), c.removeAlias);

module.exports = router;
