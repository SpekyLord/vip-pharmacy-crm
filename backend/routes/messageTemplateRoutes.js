/**
 * Message Template Routes
 *
 * POST   /api/message-templates            — Create template (Admin)
 * GET    /api/message-templates            — List templates (Admin: all, BDM: active only)
 * GET    /api/message-templates/:id        — Get single template
 * PUT    /api/message-templates/:id        — Update template (Admin)
 * DELETE /api/message-templates/:id        — Delete template (Admin)
 * POST   /api/message-templates/:id/send   — Send from template (BDM, Admin)
 */

const express = require('express');
const router = express.Router();

const {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplates,
  getTemplateById,
  sendFromTemplate,
} = require('../controllers/messageTemplateController');

const { protect } = require('../middleware/auth');
const { adminOnly, adminOrEmployee } = require('../middleware/roleCheck');

router.use(protect);

// Admin CRUD
router.post('/', adminOnly, createTemplate);
router.put('/:id', adminOnly, updateTemplate);
router.delete('/:id', adminOnly, deleteTemplate);

// List (admin sees all, BDM sees active)
router.get('/', adminOrEmployee, getTemplates);
router.get('/:id', adminOrEmployee, getTemplateById);

// Send from template (one-click)
router.post('/:id/send', adminOrEmployee, sendFromTemplate);

module.exports = router;
