/**
 * CRM Bridge Controller — Phase 9.2
 *
 * Lightweight endpoints that expose ERP data for CRM consumption:
 * - AR summary per hospital (for CRM visit page: "Hospital X owes PHP Y")
 * - Stock availability per product (for CRM product view)
 */
const mongoose = require('mongoose');
const { catchAsync, ApiError } = require('../../middleware/errorHandler');
const { getHospitalArBalance } = require('../services/arEngine');
const InventoryLedger = require('../models/InventoryLedger');
const ProductMaster = require('../models/ProductMaster');
const Hospital = require('../models/Hospital');
const { ROLES } = require('../../constants/roles');
const { isAdminLike } = require('../../constants/roles');

/**
 * GET /crm-bridge/ar-summary?hospital_id=xxx
 * Returns AR balance for a specific hospital
 */
const getArSummary = catchAsync(async (req, res) => {
  const { hospital_id } = req.query;
  if (!hospital_id || !mongoose.Types.ObjectId.isValid(hospital_id)) {
    throw new ApiError(400, 'hospital_id query param is required');
  }

  const arBalance = await getHospitalArBalance(hospital_id, req.entityId);

  res.json({
    success: true,
    data: {
      hospital_id,
      ar_balance: arBalance || 0
    }
  });
});

/**
 * GET /crm-bridge/stock-check?product_id=xxx
 * Returns available stock for a specific product
 */
const getStockCheck = catchAsync(async (req, res) => {
  const { product_id } = req.query;
  if (!product_id || !mongoose.Types.ObjectId.isValid(product_id)) {
    throw new ApiError(400, 'product_id query param is required');
  }

  const filter = { ...req.tenantFilter, product_id: new mongoose.Types.ObjectId(product_id) };

  const stockAgg = await InventoryLedger.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { batch_lot_no: '$batch_lot_no' },
        total_in: { $sum: '$qty_in' },
        total_out: { $sum: '$qty_out' },
        expiry_date: { $first: '$expiry_date' }
      }
    },
    { $addFields: { available: { $subtract: ['$total_in', '$total_out'] } } },
    { $match: { available: { $gt: 0 } } },
    { $sort: { expiry_date: 1 } }
  ]);

  const totalAvailable = stockAgg.reduce((sum, b) => sum + b.available, 0);

  // Get product info
  const product = await ProductMaster.findById(product_id)
    .select('brand_name dosage_strength sold_per unit_code')
    .lean();

  res.json({
    success: true,
    data: {
      product_id,
      product_name: product ? `${product.brand_name} ${product.dosage_strength || ''}`.trim() : 'Unknown',
      unit: product?.unit_code || product?.sold_per || '',
      total_available: totalAvailable,
      batches: stockAgg.map(b => ({
        batch_lot_no: b._id.batch_lot_no,
        available: b.available,
        expiry_date: b.expiry_date
      }))
    }
  });
});

/**
 * GET /crm-bridge/hospitals
 * Role-based hospital list for CRM dropdowns (Gap 9).
 * Admin sees all; BDMs see only their tagged hospitals.
 */
const getHospitals = catchAsync(async (req, res) => {
  const filter = { status: 'ACTIVE' };

  // BDMs see only tagged hospitals (same logic as hospitalController.getAll)
  if (req.user?.role === ROLES.CONTRACTOR) {
    filter.tagged_bdms = {
      $elemMatch: { bdm_id: req.user._id, is_active: { $ne: false } }
    };
  }

  const hospitals = await Hospital.find(filter)
    .select('hospital_name engagement_level')
    .sort({ hospital_name: 1 })
    .lean();

  res.json({ success: true, data: hospitals });
});

/**
 * GET /crm-bridge/hospital-heat?hospital_id=xxx
 * Full HEAT data for a specific hospital (Gap 9).
 */
const getHospitalHeat = catchAsync(async (req, res) => {
  const { hospital_id } = req.query;
  if (!hospital_id || !mongoose.Types.ObjectId.isValid(hospital_id)) {
    throw new ApiError(400, 'hospital_id query param is required');
  }

  const hospital = await Hospital.findById(hospital_id)
    .select('hospital_name hospital_type bed_capacity engagement_level purchaser_name purchaser_phone chief_pharmacist_name chief_pharmacist_phone key_decision_maker major_events programs_to_level_5')
    .lean();

  if (!hospital) {
    throw new ApiError(404, 'Hospital not found');
  }

  res.json({ success: true, data: hospital });
});

module.exports = {
  getArSummary,
  getStockCheck,
  getHospitals,
  getHospitalHeat,
};
