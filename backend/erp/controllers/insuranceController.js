/**
 * Insurance Controller — CRUD for insurance policy register
 *
 * All endpoints entity-scoped via tenantFilter.
 * Write operations: admin/finance/president (route-level roleCheck).
 * Delete: president only (route-level roleCheck).
 */
const InsurancePolicy = require('../models/InsurancePolicy');
const { catchAsync } = require('../../middleware/errorHandler');
const XLSX = require('xlsx');

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
  await InsurancePolicy.deleteOne({ _id: policy._id, entity_id: policy.entity_id });
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

// ═══ Export Insurance Policies (Excel) ═══
const exportInsurance = catchAsync(async (req, res) => {
  const policies = await InsurancePolicy.find({ entity_id: req.entityId })
    .populate('person_id', 'full_name')
    .sort({ policy_type: 1 }).lean();
  const rows = policies.map(p => ({
    'Person': p.person_id?.full_name || '',
    'Policy Type': p.policy_type || '',
    'Provider': p.provider || '',
    'Policy No': p.policy_no || '',
    'Coverage Amount': p.coverage_amount || 0,
    'Premium Amount': p.premium_amount || 0,
    'Premium Frequency': p.premium_frequency || '',
    'Effective Date': p.effective_date ? new Date(p.effective_date).toISOString().slice(0, 10) : '',
    'Expiry Date': p.expiry_date ? new Date(p.expiry_date).toISOString().slice(0, 10) : '',
    'Beneficiary': p.beneficiary || '',
    'Vehicle Plate': p.vehicle_plate_no || '',
    'Vehicle Desc': p.vehicle_description || '',
    'Status': p.status || 'ACTIVE',
    'Notes': p.notes || ''
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Insurance Policies');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="insurance-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

module.exports = { getAll, getById, create, update, remove, getSummary, exportInsurance };
