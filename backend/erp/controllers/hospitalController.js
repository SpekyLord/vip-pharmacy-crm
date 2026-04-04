const Hospital = require('../models/Hospital');
const { catchAsync } = require('../../middleware/errorHandler');

const getAll = catchAsync(async (req, res) => {
  // Hospitals are globally shared (Phase 4A.3) — no entity_id filter
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) {
    filter.hospital_name = { $regex: req.query.q, $options: 'i' };
  }

  // BDM sees only their tagged hospitals; admin/president/finance/ceo see all
  const bdmRoles = ['employee'];
  if (bdmRoles.includes(req.user?.role) || req.query.my === 'true') {
    filter.tagged_bdms = {
      $elemMatch: { bdm_id: req.user._id, is_active: { $ne: false } }
    };
  }

  const page = parseInt(req.query.page) || 1;
  const rawLimit = req.query.limit;
  const limit = rawLimit === '0' || rawLimit === 0 ? 0 : (parseInt(rawLimit) || 50);
  const skip = (page - 1) * (limit || 1);

  const query = Hospital.find(filter).sort({ hospital_name: 1 });
  if (limit > 0) query.skip(skip).limit(limit);

  const [hospitals, total] = await Promise.all([
    query.lean(),
    Hospital.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: hospitals,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

const getById = catchAsync(async (req, res) => {
  const hospital = await Hospital.findById(req.params.id).lean();
  if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
  res.json({ success: true, data: hospital });
});

const create = catchAsync(async (req, res) => {
  const hospital = await Hospital.create(req.body);
  res.status(201).json({ success: true, data: hospital });
});

const update = catchAsync(async (req, res) => {
  const hospital = await Hospital.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
  res.json({ success: true, data: hospital });
});

const deactivate = catchAsync(async (req, res) => {
  const hospital = await Hospital.findByIdAndUpdate(
    req.params.id,
    { $set: { status: 'INACTIVE' } },
    { new: true }
  );
  if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
  res.json({ success: true, message: 'Hospital deactivated', data: hospital });
});

const addAlias = catchAsync(async (req, res) => {
  const { alias } = req.body;
  if (!alias) return res.status(400).json({ success: false, message: 'Alias is required' });

  const hospital = await Hospital.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { hospital_aliases: alias.trim() } },
    { new: true }
  );
  if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
  res.json({ success: true, data: hospital });
});

const removeAlias = catchAsync(async (req, res) => {
  const { alias } = req.body;
  if (!alias) return res.status(400).json({ success: false, message: 'Alias is required' });

  const hospital = await Hospital.findByIdAndUpdate(
    req.params.id,
    { $pull: { hospital_aliases: alias.trim() } },
    { new: true }
  );
  if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
  res.json({ success: true, data: hospital });
});

module.exports = { getAll, getById, create, update, deactivate, addAlias, removeAlias };
