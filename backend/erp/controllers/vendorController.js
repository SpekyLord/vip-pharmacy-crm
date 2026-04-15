const VendorMaster = require('../models/VendorMaster');
const { catchAsync } = require('../../middleware/errorHandler');
const { validateCoaCode } = require('../utils/validateCoaCode');

const getAll = catchAsync(async (req, res) => {
  // President sees all; others scoped by entity
  if (!req.isPresident && !req.entityId) {
    return res.status(400).json({ success: false, message: 'Your account has no entity assigned. Contact the president to assign you to an entity.' });
  }
  const filter = req.isPresident ? {} : { entity_id: req.entityId };
  if (req.query.entity_id && req.isPresident) filter.entity_id = req.query.entity_id;
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';
  if (req.query.q) {
    filter.$or = [
      { vendor_name: { $regex: req.query.q, $options: 'i' } },
      { vendor_aliases: { $regex: req.query.q, $options: 'i' } }
    ];
  }

  const vendors = await VendorMaster.find(filter).sort({ vendor_name: 1 }).lean();
  res.json({ success: true, data: vendors });
});

const getById = catchAsync(async (req, res) => {
  const filter = req.isPresident ? { _id: req.params.id } : { _id: req.params.id, entity_id: req.entityId };
  const vendor = await VendorMaster.findOne(filter).lean();
  if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
  res.json({ success: true, data: vendor });
});

const search = catchAsync(async (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.json({ success: true, data: [] });

  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const vendors = await VendorMaster.find({
    ...entityScope,
    is_active: true,
    $or: [
      { vendor_name: { $regex: q, $options: 'i' } },
      { vendor_aliases: { $regex: q, $options: 'i' } }
    ]
  }).limit(10).lean();

  res.json({ success: true, data: vendors });
});

const create = catchAsync(async (req, res) => {
  if (!req.entityId) {
    return res.status(400).json({ success: false, message: 'Cannot create vendor: your account has no entity assigned. Contact the president to assign you to an entity.' });
  }
  req.body.entity_id = req.entityId;
  req.body.created_by = req.user._id;
  // Strip empty vendor_code to avoid unique index collision
  if (!req.body.vendor_code || !req.body.vendor_code.trim()) delete req.body.vendor_code;
  // Validate COA code if provided
  if (req.body.coa_code) {
    const coaCheck = await validateCoaCode(req.body.coa_code, req.entityId);
    if (!coaCheck.valid) return res.status(400).json({ success: false, message: coaCheck.message });
  }
  const vendor = await VendorMaster.create(req.body);
  res.status(201).json({ success: true, data: vendor });
});

const update = catchAsync(async (req, res) => {
  req.body.updated_by = req.user._id;
  // Validate COA code if being updated
  if (req.body.coa_code) {
    const coaCheck = await validateCoaCode(req.body.coa_code, req.entityId);
    if (!coaCheck.valid) return res.status(400).json({ success: false, message: coaCheck.message });
  }
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const vendor = await VendorMaster.findOneAndUpdate(
    { _id: req.params.id, ...entityScope },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
  res.json({ success: true, data: vendor });
});

const addAlias = catchAsync(async (req, res) => {
  const { alias } = req.body;
  if (!alias) return res.status(400).json({ success: false, message: 'Alias is required' });

  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const vendor = await VendorMaster.findOneAndUpdate(
    { _id: req.params.id, ...entityScope },
    { $addToSet: { vendor_aliases: alias.trim() } },
    { new: true }
  );
  if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
  res.json({ success: true, data: vendor });
});

const deactivate = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const vendor = await VendorMaster.findOneAndUpdate(
    { _id: req.params.id, ...entityScope },
    { $set: { is_active: false } },
    { new: true }
  );
  if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
  res.json({ success: true, message: 'Vendor deactivated', data: vendor });
});

module.exports = { getAll, getById, search, create, update, addAlias, deactivate };
