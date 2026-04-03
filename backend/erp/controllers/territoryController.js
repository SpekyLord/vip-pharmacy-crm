const Territory = require('../models/Territory');
const { catchAsync } = require('../../middleware/errorHandler');

const getAll = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.entity_id) filter.entity_id = req.query.entity_id;
  if (req.query.active_only !== 'false') filter.is_active = true;
  const territories = await Territory.find(filter)
    .populate('assigned_bdms', 'firstName lastName email')
    .sort({ territory_code: 1 }).lean();
  res.json({ success: true, data: territories });
});

const getById = catchAsync(async (req, res) => {
  const territory = await Territory.findById(req.params.id)
    .populate('assigned_bdms', 'firstName lastName email').lean();
  if (!territory) return res.status(404).json({ success: false, message: 'Territory not found' });
  res.json({ success: true, data: territory });
});

const create = catchAsync(async (req, res) => {
  const territory = await Territory.create(req.body);
  res.status(201).json({ success: true, data: territory });
});

const update = catchAsync(async (req, res) => {
  const territory = await Territory.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!territory) return res.status(404).json({ success: false, message: 'Territory not found' });
  res.json({ success: true, data: territory });
});

const remove = catchAsync(async (req, res) => {
  await Territory.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Territory deleted' });
});

// Get territory for a specific BDM
const getForBdm = catchAsync(async (req, res) => {
  const code = await Territory.getCodeForBdm(req.params.bdmId || req.bdmId);
  res.json({ success: true, data: { territory_code: code } });
});

module.exports = { getAll, getById, create, update, remove, getForBdm };
