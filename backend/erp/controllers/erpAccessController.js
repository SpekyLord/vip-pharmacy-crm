const AccessTemplate = require('../models/AccessTemplate');
const Lookup = require('../models/Lookup');
const User = require('../../models/User');
const { catchAsync } = require('../../middleware/errorHandler');
const { SEED_DEFAULTS } = require('./lookupGenericController');

// ═══ Helper: fetch lookup items with auto-seed / merge ═══
// Always upserts seed defaults so newly added entries (e.g. PRODUCT_MANAGE)
// appear automatically. $setOnInsert ensures existing user-customized entries
// are never overwritten.
async function fetchLookupCategory(category, entityId, userId) {
  const filter = { category, is_active: true };
  if (entityId) filter.entity_id = entityId;
  let items = await Lookup.find(filter).sort({ sort_order: 1, label: 1 }).lean();

  // Merge seed defaults — inserts missing entries, skips existing ones
  if (entityId && SEED_DEFAULTS[category]) {
    const defaults = SEED_DEFAULTS[category];
    const ops = defaults.map((item, i) => {
      const isObj = typeof item === 'object';
      const label = isObj ? item.label : item;
      const code = isObj ? item.code.toUpperCase() : label.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      return {
        updateOne: {
          filter: { entity_id: entityId, category, code },
          update: { $setOnInsert: { label, sort_order: i * 10, is_active: true, metadata: isObj ? (item.metadata || {}) : {}, created_by: userId } },
          upsert: true
        }
      };
    });
    const result = await Lookup.bulkWrite(ops);
    // Re-query only if new entries were actually inserted
    if (result.upsertedCount > 0) {
      items = await Lookup.find(filter).sort({ sort_order: 1, label: 1 }).lean();
    }
  }
  return items;
}

// ═══ Sub-Permission Keys — lookup-driven (Phase A) ═══
// Fetches ERP_SUB_PERMISSION from Lookup, groups by metadata.module
const getSubPermissionKeys = catchAsync(async (req, res) => {
  const items = await fetchLookupCategory('ERP_SUB_PERMISSION', req.entityId, req.user?._id);

  // Group by module → [{ key, label }]
  const grouped = {};
  for (const item of items) {
    const mod = item.metadata?.module;
    if (!mod) continue;
    if (!grouped[mod]) grouped[mod] = [];
    grouped[mod].push({ key: item.metadata.key || item.code.toLowerCase(), label: item.label });
  }

  res.json({ success: true, data: grouped });
});

// ═══ Module Keys — lookup-driven (Phase A) ═══
// Returns ERP_MODULE items so frontend doesn't hardcode the module list
const getModuleKeys = catchAsync(async (req, res) => {
  const items = await fetchLookupCategory('ERP_MODULE', req.entityId, req.user?._id);

  const modules = items.map(item => ({
    key: item.metadata?.key || item.code.toLowerCase(),
    label: item.label,
    short_label: item.metadata?.short_label || item.label,
  }));

  res.json({ success: true, data: modules });
});

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
  const { template_name, description, modules, can_approve, sub_permissions } = req.body;

  if (!template_name) {
    return res.status(400).json({ success: false, message: 'Template name is required' });
  }

  const template = await AccessTemplate.create({
    entity_id: req.entityId,
    template_name,
    description,
    modules: modules || {},
    can_approve: can_approve || false,
    sub_permissions: sub_permissions || {},
    is_system: false,
    created_by: req.user._id,
  });

  res.status(201).json({ success: true, data: template });
});

const updateTemplate = catchAsync(async (req, res) => {
  // Entity-scope the lookup — without it, admin/finance in entity A could
  // mutate entity B's template (modules, sub_permissions, can_approve) by
  // guessing the id, then a later applyTemplateToUser would propagate the
  // hijacked permissions. President bypass for cross-entity admin tooling.
  const filter = { _id: req.params.id };
  if (!req.isPresident) filter.entity_id = req.entityId;
  const template = await AccessTemplate.findOne(filter);
  if (!template) {
    return res.status(404).json({ success: false, message: 'Template not found' });
  }
  if (template.is_system) {
    return res.status(403).json({ success: false, message: 'System templates cannot be edited' });
  }

  const { template_name, description, modules, can_approve, sub_permissions, is_active } = req.body;
  if (template_name !== undefined) template.template_name = template_name;
  if (description !== undefined) template.description = description;
  if (modules) {
    for (const [key, val] of Object.entries(modules)) {
      if (['NONE', 'VIEW', 'FULL'].includes(val)) template.modules[key] = val;
    }
    template.markModified('modules');
  }
  if (can_approve !== undefined) template.can_approve = can_approve;
  if (sub_permissions !== undefined) {
    // Clean falsy values before saving to template
    const cleaned = {};
    for (const [mod, subs] of Object.entries(sub_permissions)) {
      if (subs && typeof subs === 'object') {
        const truthy = {};
        for (const [key, val] of Object.entries(subs)) {
          if (val) truthy[key] = true;
        }
        if (Object.keys(truthy).length > 0) cleaned[mod] = truthy;
      }
    }
    template.sub_permissions = cleaned;
    template.markModified('sub_permissions');
  }
  if (is_active !== undefined) template.is_active = is_active;

  await template.save();
  res.json({ success: true, data: template });
});

const deleteTemplate = catchAsync(async (req, res) => {
  // Entity-scope the lookup — same risk as updateTemplate (cross-entity
  // template manipulation). President bypass for admin tooling.
  const filter = { _id: req.params.id };
  if (!req.isPresident) filter.entity_id = req.entityId;
  const template = await AccessTemplate.findOne(filter);
  if (!template) {
    return res.status(404).json({ success: false, message: 'Template not found' });
  }
  if (template.is_system) {
    return res.status(403).json({ success: false, message: 'System templates cannot be deleted' });
  }

  // eslint-disable-next-line vip-tenant/require-entity-filter -- template._id from entity-scoped findOne above
  await AccessTemplate.findByIdAndDelete(template._id);
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

  const { enabled, modules, can_approve, template_id, sub_permissions } = req.body;

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
  if (sub_permissions !== undefined) {
    // Clean falsy values — prevents false entries from breaking FULL bypass
    const cleaned = {};
    for (const [mod, subs] of Object.entries(sub_permissions)) {
      if (subs && typeof subs === 'object') {
        const truthy = {};
        for (const [key, val] of Object.entries(subs)) {
          if (val) truthy[key] = true;
        }
        if (Object.keys(truthy).length > 0) cleaned[mod] = truthy;
      }
    }
    user.erp_access.sub_permissions = cleaned;
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

  // Entity-scope the template lookup. Without it, admin in entity A could
  // pass entity B's looser template_id and copy its modules/sub_permissions
  // onto a user — direct cross-entity privilege escalation vector. President
  // bypass keeps cross-entity admin tooling working.
  const tplFilter = { _id: template_id };
  if (!req.isPresident) tplFilter.entity_id = req.entityId;
  const template = await AccessTemplate.findOne(tplFilter).lean();
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
    sub_permissions: template.sub_permissions || {},
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
  // Build module map dynamically from ERP_MODULE lookups so new modules are auto-included
  const buildOverrideModules = async (level) => {
    const modItems = await fetchLookupCategory('ERP_MODULE', req.entityId, req.user?._id);
    const mods = {};
    for (const item of modItems) {
      const key = item.metadata?.key || item.code.toLowerCase();
      mods[key] = level;
    }
    return mods;
  };

  if (role === 'president') {
    return res.json({
      success: true,
      data: {
        enabled: true,
        role_override: 'president',
        modules: await buildOverrideModules('FULL'),
        sub_permissions: {},
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
        modules: await buildOverrideModules('VIEW'),
        sub_permissions: {},
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
        modules: await buildOverrideModules('FULL'),
        sub_permissions: {},
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
  getSubPermissionKeys,
  getModuleKeys,
};
