/**
 * HospitalContractPrice Controller — Phase CSI-X1 (April 2026)
 *
 * Master data CRUD for per-hospital BDM-negotiated contract pricing.
 * BDMs propose; admin/finance approves via gateApproval('PRICE_LIST').
 *
 * Lifecycle: DRAFT (proposed by BDM) → ACTIVE (after approval) → SUPERSEDED
 * (when a newer ACTIVE row covers the same (hospital, product) window) →
 * EXPIRED (effective_to passed) or CANCELLED (admin pulled the price).
 *
 * For X1 simplicity: writes go straight to ACTIVE if poster has authority
 * (gateApproval returns false). Otherwise, request is held in Approval Hub
 * (HTTP 202). When approved, the ApprovalRequest handler flips status →
 * ACTIVE on the linked row.
 */

const HospitalContractPrice = require('../models/HospitalContractPrice');
const Hospital = require('../models/Hospital');
const ProductMaster = require('../models/ProductMaster');
const ErpAuditLog = require('../models/ErpAuditLog');
const { catchAsync } = require('../../middleware/errorHandler');
const { invalidatePriceCache, resolveContractPrice, resolveContractPricesBulk } = require('../services/priceResolver');

// ─────────────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────────────
const listContractPrices = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.hospital_id) filter.hospital_id = req.query.hospital_id;
  if (req.query.product_id) filter.product_id = req.query.product_id;
  if (req.query.status) {
    const arr = String(req.query.status).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (arr.length) filter.status = { $in: arr };
  } else {
    filter.status = { $ne: 'CANCELLED' };  // default: hide cancelled
  }
  if (req.query.bdm_id) filter.negotiated_by = req.query.bdm_id;

  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit || '50', 10)));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    HospitalContractPrice.find(filter)
      .populate('hospital_id', 'hospital_name')
      .populate('product_id', 'brand_name generic_name dosage_strength selling_price unit_code')
      .populate('negotiated_by', 'name email role')
      .populate('approved_by', 'name email role')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    HospitalContractPrice.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// GET BY ID
// ─────────────────────────────────────────────────────────────────────────
const getContractPriceById = catchAsync(async (req, res) => {
  const item = await HospitalContractPrice.findOne({
    _id: req.params.id,
    entity_id: req.entityId
  })
    .populate('hospital_id', 'hospital_name')
    .populate('product_id', 'brand_name generic_name dosage_strength selling_price unit_code')
    .populate('negotiated_by', 'name email role')
    .populate('approved_by', 'name email role')
    .lean();
  if (!item) return res.status(404).json({ success: false, message: 'Contract price not found' });
  res.json({ success: true, data: item });
});

// ─────────────────────────────────────────────────────────────────────────
// CREATE — gated by gateApproval('PRICE_LIST')
// ─────────────────────────────────────────────────────────────────────────
const createContractPrice = catchAsync(async (req, res) => {
  const {
    hospital_id, product_id, contract_price,
    effective_from, effective_to, negotiated_by, change_reason, notes
  } = req.body || {};

  // Validate references exist
  if (!hospital_id || !product_id || contract_price == null) {
    return res.status(400).json({
      success: false,
      message: 'hospital_id, product_id, and contract_price are required'
    });
  }
  const [hospital, product] = await Promise.all([
    Hospital.findById(hospital_id).select('_id hospital_name').lean(),
    ProductMaster.findOne({ _id: product_id, entity_id: req.entityId }).select('_id brand_name selling_price').lean()
  ]);
  if (!hospital) return res.status(400).json({ success: false, message: 'Hospital not found' });
  if (!product) return res.status(400).json({ success: false, message: 'Product not found in this entity' });

  // Determine the negotiating BDM. Default to caller if BDM-shaped; admin/finance
  // must pass negotiated_by explicitly (price contracts are owned by BDMs).
  const bdmId = negotiated_by || req.user._id;

  // Approval gate — admin/finance/president pass through; others get held.
  const { gateApproval } = require('../services/approvalService');
  const gated = await gateApproval({
    entityId: req.entityId,
    module: 'PRICE_LIST',
    docType: 'CONTRACT_PRICE',
    docRef: `${hospital.hospital_name} / ${product.brand_name}`,
    amount: Number(contract_price),
    description: `Contract price ${product.brand_name} for ${hospital.hospital_name} = ${contract_price}`,
    requesterId: req.user._id,
    requesterName: req.user.name,
    forceApproval: false,
    metadata: {
      hospital_id, product_id, contract_price,
      effective_from, effective_to, change_reason
    }
  }, res);
  if (gated) return;  // 202 sent

  const row = await HospitalContractPrice.create({
    entity_id: req.entityId,
    hospital_id, product_id,
    contract_price,
    effective_from: effective_from || new Date(),
    effective_to: effective_to || null,
    negotiated_by: bdmId,
    approved_by: req.user._id,
    approved_at: new Date(),
    change_reason: change_reason || '',
    status: 'ACTIVE',
    notes: notes || '',
    created_by: req.user._id
  });

  // Supersede prior ACTIVE rows that overlap effective_from
  const newFrom = row.effective_from;
  await HospitalContractPrice.updateMany({
    entity_id: req.entityId,
    hospital_id, product_id,
    status: 'ACTIVE',
    _id: { $ne: row._id },
    $or: [
      { effective_to: null, effective_from: { $lte: newFrom } },
      { effective_to: { $gte: newFrom } }
    ]
  }, {
    $set: {
      status: 'SUPERSEDED',
      effective_to: new Date(newFrom.getTime() - 1),
      updated_by: req.user._id
    }
  });

  invalidatePriceCache(req.entityId, hospital_id, product_id);

  await ErpAuditLog.logChange({
    entity_id: req.entityId,
    bdm_id: bdmId,
    log_type: 'PRICE_CREATE',
    target_ref: row._id.toString(),
    target_model: 'HospitalContractPrice',
    changed_by: req.user._id,
    note: `Contract price created: ${product.brand_name} @ ${contract_price} for ${hospital.hospital_name}`
  }).catch(err => console.error('[contractPrice] audit failed:', err.message));

  res.status(201).json({ success: true, data: row });
});

// ─────────────────────────────────────────────────────────────────────────
// UPDATE — only metadata fields. Price changes = new row (audit).
// ─────────────────────────────────────────────────────────────────────────
const updateContractPrice = catchAsync(async (req, res) => {
  const row = await HospitalContractPrice.findOne({
    _id: req.params.id,
    entity_id: req.entityId
  });
  if (!row) return res.status(404).json({ success: false, message: 'Contract price not found' });

  const editable = ['notes', 'change_reason', 'effective_to'];
  // Price + effective_from + hospital_id + product_id are LOCKED. To change the
  // price, the operator creates a new row (which auto-supersedes this one).
  for (const k of editable) {
    if (req.body[k] !== undefined) row[k] = req.body[k];
  }
  row.updated_by = req.user._id;
  await row.save();

  invalidatePriceCache(req.entityId, row.hospital_id, row.product_id);

  res.json({ success: true, data: row });
});

// ─────────────────────────────────────────────────────────────────────────
// CANCEL — admin pulls a price (e.g. contract terminated)
// ─────────────────────────────────────────────────────────────────────────
const cancelContractPrice = catchAsync(async (req, res) => {
  const row = await HospitalContractPrice.findOne({
    _id: req.params.id,
    entity_id: req.entityId
  });
  if (!row) return res.status(404).json({ success: false, message: 'Contract price not found' });
  if (row.status === 'CANCELLED') {
    return res.status(400).json({ success: false, message: 'Already cancelled' });
  }
  row.status = 'CANCELLED';
  row.effective_to = new Date();
  row.notes = (row.notes ? row.notes + '\n' : '') + `[Cancelled ${new Date().toISOString()}] ${req.body.reason || ''}`.trim();
  row.updated_by = req.user._id;
  await row.save();

  invalidatePriceCache(req.entityId, row.hospital_id, row.product_id);

  await ErpAuditLog.logChange({
    entity_id: req.entityId,
    bdm_id: row.negotiated_by,
    log_type: 'PRICE_CANCEL',
    target_ref: row._id.toString(),
    target_model: 'HospitalContractPrice',
    changed_by: req.user._id,
    note: `Contract price cancelled: ${req.body.reason || '(no reason)'}`
  }).catch(err => console.error('[contractPrice] audit failed:', err.message));

  res.json({ success: true, data: row });
});

// ─────────────────────────────────────────────────────────────────────────
// RESOLVE — used by SalesEntry frontend autocomplete to display the
// resolved price + source (CONTRACT vs SRP) when picking hospital + product.
// ─────────────────────────────────────────────────────────────────────────
const resolvePrice = catchAsync(async (req, res) => {
  const { hospital_id, product_id, as_of_date } = req.query;
  if (!hospital_id || !product_id) {
    return res.status(400).json({
      success: false,
      message: 'hospital_id and product_id are required'
    });
  }
  const result = await resolveContractPrice(
    req.entityId,
    hospital_id,
    product_id,
    as_of_date ? new Date(as_of_date) : null
  );
  res.json({ success: true, data: result });
});

// Bulk resolve for multi-line PO entry
const resolvePricesBulk = catchAsync(async (req, res) => {
  const { items, as_of_date } = req.body || {};
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ success: false, message: 'items array is required' });
  }
  const results = await resolveContractPricesBulk(
    req.entityId,
    items,
    as_of_date ? new Date(as_of_date) : null
  );
  res.json({ success: true, data: results });
});

module.exports = {
  listContractPrices,
  getContractPriceById,
  createContractPrice,
  updateContractPrice,
  cancelContractPrice,
  resolvePrice,
  resolvePricesBulk
};
