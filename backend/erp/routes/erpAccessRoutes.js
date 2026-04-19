const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getUserAccess,
  setUserAccess,
  applyTemplateToUser,
  getMyAccess,
  getSubPermissionKeys,
  getModuleKeys,
} = require('../controllers/erpAccessController');

// ═══ Self-service ═══
router.get('/my', getMyAccess);

// ═══ Module & Sub-Permission Keys (Phase A — lookup-driven) ═══
router.get('/module-keys', getModuleKeys);
router.get('/sub-permission-keys', getSubPermissionKeys);

// ═══ Template CRUD (admin/president only for mutations) ═══
// Phase 3c — template-delete orphans every user previously assigned (their template_ref
// goes dangling). Danger-baseline. Create/update remain role-gated (recoverable).
router.get('/templates', getTemplates);
router.post('/templates', roleCheck('admin', 'president'), createTemplate);
router.put('/templates/:id', roleCheck('admin', 'president'), updateTemplate);
router.delete('/templates/:id', erpSubAccessCheck('erp_access', 'template_delete'), deleteTemplate);

// ═══ User Access Management (admin/president only — INTENTIONALLY not delegable) ═══
// Per Phase 3c plan: delegating "the power to delegate" is a separate architectural decision.
// Keep these strictly admin/president; revisit if a subscriber asks for a delegation officer role.
router.get('/users/:userId', roleCheck('admin', 'president'), getUserAccess);
router.put('/users/:userId', roleCheck('admin', 'president'), setUserAccess);
router.post('/users/:userId/apply-template', roleCheck('admin', 'president'), applyTemplateToUser);

module.exports = router;
