const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
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
} = require('../controllers/erpAccessController');

// ═══ Self-service ═══
router.get('/my', getMyAccess);

// ═══ Sub-Permission Keys (Phase 16 — returns available sub-keys per module) ═══
router.get('/sub-permission-keys', getSubPermissionKeys);

// ═══ Template CRUD (admin/president only for mutations) ═══
router.get('/templates', getTemplates);
router.post('/templates', roleCheck('admin', 'president'), createTemplate);
router.put('/templates/:id', roleCheck('admin', 'president'), updateTemplate);
router.delete('/templates/:id', roleCheck('admin', 'president'), deleteTemplate);

// ═══ User Access Management (admin/president only) ═══
router.get('/users/:userId', roleCheck('admin', 'president'), getUserAccess);
router.put('/users/:userId', roleCheck('admin', 'president'), setUserAccess);
router.post('/users/:userId/apply-template', roleCheck('admin', 'president'), applyTemplateToUser);

module.exports = router;
