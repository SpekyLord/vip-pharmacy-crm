const AccessTemplate = require('../models/AccessTemplate');
const User = require('../../models/User');
const { catchAsync } = require('../../middleware/errorHandler');

// ═══ Template CRUD ═══

const getTemplates = catchAsync(async (req, res) => {
  const filter = { is_active: true };
  if (req.entityId) filter.entity_id = req.entityId;

  const templates = await AccessTemplate.find(filter)
    .sort({ is_system: -1, template_name: 1 })
    .lean();

  res.json({ success: true, data: templates });
});

const createTemplate = catchAsync(async (req, res) => {
  const { template_name, description, modules, can_approve } = req.body;

  if (!template_name) {
    return res.status(400).json({ success: false, message: 'Template name is required' });
  }

  const template = await AccessTemplate.create({
    entity_id: req.entityId,
    template_name,
    description,
    modules: modules || {},
    can_approve: can_approve || false,
    is_system: false,
    created_by: req.user._id,
  });

  res.status(201).json({ success: true, data: template });
});

const updateTemplate = catchAsync(async (req, res) => {
  const template = await AccessTemplate.findById(req.params.id);
  if (!template) {
    return res.status(404).json({ success: false, message: 'Template not found' });
  }
  if (template.is_system) {
    return res.status(403).json({ success: false, message: 'System templates cannot be edited' });
  }

  const { template_name, description, modules, can_approve, is_active } = req.body;
  if (template_name !== undefined) template.template_name = template_name;
  if (description !== undefined) template.description = description;
  if (modules) {
    for (const [key, val] of Object.entries(modules)) {
      if (template.modules[key] !== undefined) template.modules[key] = val;
    }
  }
  if (can_approve !== undefined) template.can_approve = can_approve;
  if (is_active !== undefined) template.is_active = is_active;

  await template.save();
  res.json({ success: true, data: template });
});

const deleteTemplate = catchAsync(async (req, res) => {
  const template = await AccessTemplate.findById(req.params.id);
  if (!template) {
    return res.status(404).json({ success: false, message: 'Template not found' });
  }
  if (template.is_system) {
    return res.status(403).json({ success: false, message: 'System templates cannot be deleted' });
  }

  await AccessTemplate.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Template deleted' });
});

// ═══ User Access Management ═══

const getUserAccess = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.userId).select('name email role erp_access entity_id').lean();
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  res.json({ success: true, data: user });
});

const setUserAccess = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const { enabled, modules, can_approve, template_id } = req.body;

  if (!user.erp_access) user.erp_access = {};

  if (enabled !== undefined) user.erp_access.enabled = enabled;
  if (template_id !== undefined) user.erp_access.template_id = template_id;
  if (can_approve !== undefined) user.erp_access.can_approve = can_approve;
  if (modules) {
    if (!user.erp_access.modules) user.erp_access.modules = {};
    for (const [key, val] of Object.entries(modules)) {
      user.erp_access.modules[key] = val;
    }
  }
  user.erp_access.updated_by = req.user._id;
  user.erp_access.updated_at = new Date();

  user.markModified('erp_access');
  await user.save();

  res.json({ success: true, data: { _id: user._id, name: user.name, erp_access: user.erp_access } });
});

const applyTemplateToUser = catchAsync(async (req, res) => {
  const { template_id } = req.body;
  if (!template_id) {
    return res.status(400).json({ success: false, message: 'template_id is required' });
  }

  const template = await AccessTemplate.findById(template_id).lean();
  if (!template) {
    return res.status(404).json({ success: false, message: 'Template not found' });
  }

  const user = await User.findById(req.params.userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  user.erp_access = {
    enabled: true,
    template_id: template._id,
    modules: { ...template.modules },
    can_approve: template.can_approve,
    updated_by: req.user._id,
    updated_at: new Date(),
  };

  user.markModified('erp_access');
  await user.save();

  res.json({ success: true, data: { _id: user._id, name: user.name, erp_access: user.erp_access } });
});

const getMyAccess = catchAsync(async (req, res) => {
  const { role, erp_access } = req.user;

  // Role overrides for display purposes
  if (role === 'president') {
    return res.json({
      success: true,
      data: {
        enabled: true,
        role_override: 'president',
        modules: {
          sales: 'FULL', inventory: 'FULL', collections: 'FULL', expenses: 'FULL',
          reports: 'FULL', people: 'FULL', payroll: 'FULL', accounting: 'FULL',
          purchasing: 'FULL', banking: 'FULL',
        },
        can_approve: true,
      },
    });
  }
  if (role === 'ceo') {
    return res.json({
      success: true,
      data: {
        enabled: true,
        role_override: 'ceo',
        modules: {
          sales: 'VIEW', inventory: 'VIEW', collections: 'VIEW', expenses: 'VIEW',
          reports: 'VIEW', people: 'VIEW', payroll: 'VIEW', accounting: 'VIEW',
          purchasing: 'VIEW', banking: 'VIEW',
        },
        can_approve: false,
      },
    });
  }
  if (role === 'admin' && (!erp_access || !erp_access.enabled)) {
    return res.json({
      success: true,
      data: {
        enabled: true,
        role_override: 'admin',
        modules: {
          sales: 'FULL', inventory: 'FULL', collections: 'FULL', expenses: 'FULL',
          reports: 'FULL', people: 'FULL', payroll: 'FULL', accounting: 'FULL',
          purchasing: 'FULL', banking: 'FULL',
        },
        can_approve: true,
      },
    });
  }

  res.json({ success: true, data: erp_access || { enabled: false, modules: {} } });
});

module.exports = {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getUserAccess,
  setUserAccess,
  applyTemplateToUser,
  getMyAccess,
};
