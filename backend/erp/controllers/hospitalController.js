const Hospital = require('../models/Hospital');
const { catchAsync } = require('../../middleware/errorHandler');

const getAll = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.entity_id) filter.entity_id = req.query.entity_id;
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
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

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

module.exports = { getAll, getById, create, update, deactivate };
