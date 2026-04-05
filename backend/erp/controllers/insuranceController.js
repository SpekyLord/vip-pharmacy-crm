/**
 * Insurance Controller — CRUD for insurance policy register
 *
 * All endpoints entity-scoped via tenantFilter.
 * Write operations: admin/finance/president (route-level roleCheck).
 * Delete: president only (route-level roleCheck).
 */
const InsurancePolicy = require('../models/InsurancePolicy');
const { catchAsync } = require('../../middleware/errorHandler');

const getAll = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };
  if (req.query.person_id) filter.person_id = req.query.person_id;
  if (req.query.policy_type) filter.policy_type = req.query.policy_type;
  if (req.query.status) filter.status = req.query.status;

  const policies = await InsurancePolicy.find(filter)
    .populate('person_id', 'full_name person_type')
    .sort({ policy_type: 1, expiry_date: 1 })
    .lean();

  res.json({ success: true, data: policies });
});

const getById = catchAsync(async (req, res) => {
  const policy = await InsurancePolicy.findOne({ _id: req.params.id, ...req.tenantFilter })
    .populate('person_id', 'full_name person_type');
  if (!policy) return res.status(404).json({ success: false, message: 'Insurance policy not found' });
  res.json({ success: true, data: policy });
});

const create = catchAsync(async (req, res) => {
  const policy = await InsurancePolicy.create({
    ...req.body,
    entity_id: req.entityId,
    created_by: req.user._id
  });
  res.status(201).json({ success: true, data: policy });
});

const update = catchAsync(async (req, res) => {
  const policy = await InsurancePolicy.findOne({ _id: req.params.id, ...req.tenantFilter });
  if (!policy) return res.status(404).json({ success: false, message: 'Insurance policy not found' });

  const blocked = ['_id', 'entity_id', 'created_at', 'created_by'];
  for (const [key, val] of Object.entries(req.body)) {
    if (!blocked.includes(key)) policy[key] = val;
  }
  await policy.save();
  res.json({ success: true, data: policy });
});

const remove = catchAsync(async (req, res) => {
  const policy = await InsurancePolicy.findOne({ _id: req.params.id, ...req.tenantFilter });
  if (!policy) return res.status(404).json({ success: false, message: 'Insurance policy not found' });
  await InsurancePolicy.deleteOne({ _id: policy._id });
  res.json({ success: true, message: `Policy ${policy.policy_no || policy._id} deleted` });
});

// Summary: count by type + expiring soon
const getSummary = catchAsync(async (req, res) => {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const [byType, expiringSoon] = await Promise.all([
    InsurancePolicy.aggregate([
      { $match: { entity_id: req.entityId, status: 'ACTIVE' } },
      { $group: { _id: '$policy_type', count: { $sum: 1 }, total_coverage: { $sum: '$coverage_amount' }, total_premium: { $sum: '$premium_amount' } } },
      { $sort: { _id: 1 } }
    ]),
    InsurancePolicy.find({
      ...req.tenantFilter,
      status: 'ACTIVE',
      expiry_date: { $lte: thirtyDaysFromNow, $gte: new Date() }
    }).populate('person_id', 'full_name').select('person_id policy_type provider policy_no expiry_date').lean()
  ]);

  res.json({ success: true, data: { byType, expiringSoon } });
});

module.exports = { getAll, getById, create, update, remove, getSummary };
