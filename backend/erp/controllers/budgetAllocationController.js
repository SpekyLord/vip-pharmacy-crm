const BudgetAllocation = require('../models/BudgetAllocation');
const { catchAsync } = require('../../middleware/errorHandler');

const getAll = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.entity_id) filter.entity_id = req.query.entity_id;
  if (req.query.period) filter.period = req.query.period;
  if (req.query.target_type) filter.target_type = req.query.target_type;
  if (req.query.status) filter.status = req.query.status;

  const allocations = await BudgetAllocation.find(filter)
    .sort({ period: -1, target_name: 1 })
    .lean();
  res.json({ success: true, data: allocations });
});

const getById = catchAsync(async (req, res) => {
  const allocation = await BudgetAllocation.findById(req.params.id).lean();
  if (!allocation) return res.status(404).json({ success: false, message: 'Budget allocation not found' });
  res.json({ success: true, data: allocation });
});

const create = catchAsync(async (req, res) => {
  const allocation = await BudgetAllocation.create(req.body);
  res.status(201).json({ success: true, data: allocation });
});

const update = catchAsync(async (req, res) => {
  const allocation = await BudgetAllocation.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!allocation) return res.status(404).json({ success: false, message: 'Budget allocation not found' });
  res.json({ success: true, data: allocation });
});

const approve = catchAsync(async (req, res) => {
  const allocation = await BudgetAllocation.findByIdAndUpdate(
    req.params.id,
    { $set: { status: 'APPROVED', approved_by: req.user._id, approved_at: new Date() } },
    { new: true }
  );
  if (!allocation) return res.status(404).json({ success: false, message: 'Budget allocation not found' });
  res.json({ success: true, data: allocation });
});

module.exports = { getAll, getById, create, update, approve };
