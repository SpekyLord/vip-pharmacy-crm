const BudgetAllocation = require('../models/BudgetAllocation');
const { catchAsync } = require('../../middleware/errorHandler');

const getAll = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };
  if (req.query.period) filter.period = req.query.period;
  if (req.query.target_type) filter.target_type = req.query.target_type;
  if (req.query.status) filter.status = req.query.status;

  const allocations = await BudgetAllocation.find(filter)
    .sort({ period: -1, target_name: 1 })
    .lean();
  res.json({ success: true, data: allocations });
});

const getById = catchAsync(async (req, res) => {
  const allocation = await BudgetAllocation.findOne({ _id: req.params.id, ...req.tenantFilter }).lean();
  if (!allocation) return res.status(404).json({ success: false, message: 'Budget allocation not found' });
  res.json({ success: true, data: allocation });
});

const create = catchAsync(async (req, res) => {
  const allocation = await BudgetAllocation.create({
    ...req.body,
    entity_id: req.entityId,
    created_by: req.user._id
  });
  res.status(201).json({ success: true, data: allocation });
});

const update = catchAsync(async (req, res) => {
  const allocation = await BudgetAllocation.findOneAndUpdate(
    { _id: req.params.id, ...req.tenantFilter },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!allocation) return res.status(404).json({ success: false, message: 'Budget allocation not found' });
  res.json({ success: true, data: allocation });
});

const approve = catchAsync(async (req, res) => {
  const allocation = await BudgetAllocation.findOneAndUpdate(
    { _id: req.params.id, ...req.tenantFilter },
    { $set: { status: 'APPROVED', approved_by: req.user._id, approved_at: new Date() } },
    { new: true }
  );
  if (!allocation) return res.status(404).json({ success: false, message: 'Budget allocation not found' });
  res.json({ success: true, data: allocation });
});

module.exports = { getAll, getById, create, update, approve };
