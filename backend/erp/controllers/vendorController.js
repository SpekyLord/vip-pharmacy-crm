const VendorMaster = require('../models/VendorMaster');
const { catchAsync } = require('../../middleware/errorHandler');

const getAll = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.entity_id) filter.entity_id = req.query.entity_id;
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
  const vendor = await VendorMaster.findById(req.params.id).lean();
  if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
  res.json({ success: true, data: vendor });
});

const search = catchAsync(async (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.json({ success: true, data: [] });

  const vendors = await VendorMaster.find({
    is_active: true,
    $or: [
      { vendor_name: { $regex: q, $options: 'i' } },
      { vendor_aliases: { $regex: q, $options: 'i' } }
    ]
  }).limit(10).lean();

  res.json({ success: true, data: vendors });
});

const create = catchAsync(async (req, res) => {
  req.body.created_by = req.user._id;
  const vendor = await VendorMaster.create(req.body);
  res.status(201).json({ success: true, data: vendor });
});

const update = catchAsync(async (req, res) => {
  req.body.updated_by = req.user._id;
  const vendor = await VendorMaster.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
  res.json({ success: true, data: vendor });
});

const addAlias = catchAsync(async (req, res) => {
  const { alias } = req.body;
  if (!alias) return res.status(400).json({ success: false, message: 'Alias is required' });

  const vendor = await VendorMaster.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { vendor_aliases: alias.trim() } },
    { new: true }
  );
  if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
  res.json({ success: true, data: vendor });
});

const deactivate = catchAsync(async (req, res) => {
  const vendor = await VendorMaster.findByIdAndUpdate(
    req.params.id,
    { $set: { is_active: false } },
    { new: true }
  );
  if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
  res.json({ success: true, message: 'Vendor deactivated', data: vendor });
});

module.exports = { getAll, getById, search, create, update, addAlias, deactivate };
