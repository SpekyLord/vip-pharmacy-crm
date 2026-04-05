/**
 * Customer Controller — CRUD + BDM tagging for non-hospital customers
 * Phase 18 — mirrors hospitalController pattern but entity-scoped
 */
const Customer = require('../models/Customer');
const { catchAsync } = require('../../middleware/errorHandler');

const getAll = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.customer_type) filter.customer_type = req.query.customer_type;
  if (req.query.q) {
    filter.customer_name = { $regex: req.query.q, $options: 'i' };
  }

  // BDM sees only their tagged customers; admin/president/finance/ceo see all
  const bdmRoles = ['employee'];
  if (bdmRoles.includes(req.user?.role) || req.query.my === 'true') {
    filter.tagged_bdms = {
      $elemMatch: { bdm_id: req.user._id, is_active: { $ne: false } }
    };
  }

  const page = parseInt(req.query.page) || 1;
  const rawLimit = req.query.limit;
  const limit = rawLimit === '0' || rawLimit === 0 ? 0 : (parseInt(rawLimit) || 50);
  const skip = limit > 0 ? (page - 1) * limit : 0;

  const query = Customer.find(filter).sort({ customer_name: 1 });
  if (limit > 0) query.skip(skip).limit(limit);

  const [customers, total] = await Promise.all([
    query.lean(),
    Customer.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: customers,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

const getById = catchAsync(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, entity_id: req.entityId }).lean();
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
  res.json({ success: true, data: customer });
});

const create = catchAsync(async (req, res) => {
  const customer = await Customer.create({ ...req.body, entity_id: req.entityId });
  res.status(201).json({ success: true, data: customer });
});

const update = catchAsync(async (req, res) => {
  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, entity_id: req.entityId },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
  res.json({ success: true, data: customer });
});

const deactivate = catchAsync(async (req, res) => {
  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, entity_id: req.entityId },
    { $set: { status: 'INACTIVE' } },
    { new: true }
  );
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
  res.json({ success: true, message: 'Customer deactivated', data: customer });
});

const tagBdm = catchAsync(async (req, res) => {
  const { bdm_id } = req.body;
  if (!bdm_id) return res.status(400).json({ success: false, message: 'bdm_id is required' });

  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, entity_id: req.entityId },
    {
      $addToSet: {
        tagged_bdms: { bdm_id, tagged_by: req.user._id, tagged_at: new Date(), is_active: true }
      }
    },
    { new: true }
  );
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
  res.json({ success: true, data: customer });
});

const untagBdm = catchAsync(async (req, res) => {
  const { bdm_id } = req.body;
  if (!bdm_id) return res.status(400).json({ success: false, message: 'bdm_id is required' });

  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, entity_id: req.entityId },
    { $pull: { tagged_bdms: { bdm_id } } },
    { new: true }
  );
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
  res.json({ success: true, data: customer });
});

module.exports = { getAll, getById, create, update, deactivate, tagBdm, untagBdm };
