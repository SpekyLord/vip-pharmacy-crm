const GovernmentRates = require('../models/GovernmentRates');
const { catchAsync } = require('../../middleware/errorHandler');

/**
 * GET /api/erp/government-rates
 * List all rates, optionally filtered by rate_type
 */
const getRates = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.rate_type) filter.rate_type = req.query.rate_type;
  if (req.query.active_only === 'true') {
    filter.effective_date = { $lte: new Date() };
    filter.$or = [{ expiry_date: null }, { expiry_date: { $gt: new Date() } }];
  }

  const rates = await GovernmentRates.find(filter).sort({ rate_type: 1, effective_date: -1 }).lean();
  res.json({ success: true, data: rates });
});

/**
 * GET /api/erp/government-rates/:id
 */
const getRateById = catchAsync(async (req, res) => {
  const rate = await GovernmentRates.findById(req.params.id).lean();
  if (!rate) {
    return res.status(404).json({ success: false, message: 'Rate not found' });
  }
  res.json({ success: true, data: rate });
});

/**
 * POST /api/erp/government-rates
 * Create a new rate schedule (admin/finance only)
 */
const createRate = catchAsync(async (req, res) => {
  req.body.set_by = req.user._id;
  const rate = await GovernmentRates.create(req.body);
  res.status(201).json({ success: true, data: rate });
});

/**
 * PUT /api/erp/government-rates/:id
 * Update a rate schedule (admin/finance only)
 */
const updateRate = catchAsync(async (req, res) => {
  const rate = await GovernmentRates.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!rate) {
    return res.status(404).json({ success: false, message: 'Rate not found' });
  }
  res.json({ success: true, data: rate });
});

/**
 * DELETE /api/erp/government-rates/:id
 * Delete a rate schedule (admin only)
 */
const deleteRate = catchAsync(async (req, res) => {
  const rate = await GovernmentRates.findByIdAndDelete(req.params.id);
  if (!rate) {
    return res.status(404).json({ success: false, message: 'Rate not found' });
  }
  res.json({ success: true, message: 'Rate deleted' });
});

module.exports = { getRates, getRateById, createRate, updateRate, deleteRate };
