const ProductMaster = require('../models/ProductMaster');
const { catchAsync } = require('../../middleware/errorHandler');

const getAll = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.entity_id) filter.entity_id = req.query.entity_id;
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';
  if (req.query.q) {
    filter.$or = [
      { brand_name: { $regex: req.query.q, $options: 'i' } },
      { generic_name: { $regex: req.query.q, $options: 'i' } }
    ];
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const [products, total] = await Promise.all([
    ProductMaster.find(filter).sort({ brand_name: 1 }).skip(skip).limit(limit).lean(),
    ProductMaster.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: products,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

const getById = catchAsync(async (req, res) => {
  const product = await ProductMaster.findById(req.params.id).lean();
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, data: product });
});

const create = catchAsync(async (req, res) => {
  req.body.added_by = req.user._id;
  const product = await ProductMaster.create(req.body);
  res.status(201).json({ success: true, data: product });
});

const update = catchAsync(async (req, res) => {
  const product = await ProductMaster.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, data: product });
});

const deactivate = catchAsync(async (req, res) => {
  const product = await ProductMaster.findByIdAndUpdate(
    req.params.id,
    { $set: { is_active: false } },
    { new: true }
  );
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, message: 'Product deactivated', data: product });
});

module.exports = { getAll, getById, create, update, deactivate };
