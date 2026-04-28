/**
 * HospitalPO Controller — Phase CSI-X1 (April 2026)
 *
 * Captures hospital purchase orders received via Messenger / formal PDF /
 * verbal. PO is the spine connecting Sales (CSIs) to inventory replenishment
 * priorities and BDM accountability for unserved orders.
 *
 * Lifecycle:
 *   OPEN → PARTIAL → FULFILLED  (or CANCELLED / EXPIRED)
 *
 * Proxy entry: Iloilo office encoders create POs on behalf of BDMs via
 * Phase G4.5a `resolveOwnerForWrite` + PROXY_ENTRY_ROLES.HOSPITAL_PO
 * lookup gate. Same pattern Sales uses.
 */

const mongoose = require('mongoose');
const { HospitalPO, HospitalPOLine } = require('../models/HospitalPO');
const Hospital = require('../models/Hospital');
const ProductMaster = require('../models/ProductMaster');
const ErpAuditLog = require('../models/ErpAuditLog');
const Lookup = require('../models/Lookup');
const { catchAsync } = require('../../middleware/errorHandler');
const { resolveOwnerForWrite, widenFilterForProxy } = require('../utils/resolveOwnerScope');
const { resolveContractPrice } = require('../services/priceResolver');

// ─────────────────────────────────────────────────────────────────────────
// Helper — read PO_EXPIRY_DAYS from Lookup (per-entity, lookup-driven)
// ─────────────────────────────────────────────────────────────────────────
const _expiryCache = new Map();
const EXPIRY_TTL_MS = 5 * 60 * 1000;
async function getPoExpiryDays(entityId) {
  const key = String(entityId);
  const cached = _expiryCache.get(key);
  if (cached && Date.now() - cached.ts < EXPIRY_TTL_MS) return cached.days;
  let days = 90;
  try {
    const doc = await Lookup.findOne({
      entity_id: entityId,
      category: 'PO_EXPIRY_DAYS',
      code: 'DEFAULT',
      is_active: true
    }).lean();
    const val = Number(doc?.metadata?.days);
    if (Number.isFinite(val) && val > 0) days = val;
  } catch (e) {
    // fall back silently
  }
  _expiryCache.set(key, { ts: Date.now(), days });
  return days;
}

// ─────────────────────────────────────────────────────────────────────────
// LIST (Open Backlog page hits this)
// ─────────────────────────────────────────────────────────────────────────
const listHospitalPos = catchAsync(async (req, res) => {
  // Phase G4.5a: widen scope for proxy roles so admin/finance see all BDMs.
  // BDMs see their own POs only.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry', lookupCode: 'HOSPITAL_PO' });
  const filter = { ...scope };
  if (req.query.hospital_id) filter.hospital_id = req.query.hospital_id;
  if (req.query.bdm_id) filter.bdm_id = req.query.bdm_id;
  if (req.query.status) {
    const arr = String(req.query.status).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (arr.length) filter.status = { $in: arr };
  }
  if (req.query.open === 'true' || req.query.open === '1') {
    filter.status = { $in: ['OPEN', 'PARTIAL'] };
  }
  if (req.query.from || req.query.to) {
    filter.po_date = {};
    if (req.query.from) filter.po_date.$gte = new Date(req.query.from);
    if (req.query.to) filter.po_date.$lte = new Date(req.query.to);
  }

  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit || '50', 10)));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    HospitalPO.find(filter)
      .populate('hospital_id', 'hospital_name')
      .populate('bdm_id', 'name email role')
      .populate('entered_by', 'name email role')
      .sort({ po_date: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    HospitalPO.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// GET BY ID (with lines)
// ─────────────────────────────────────────────────────────────────────────
const getHospitalPoById = catchAsync(async (req, res) => {
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry', lookupCode: 'HOSPITAL_PO' });
  const po = await HospitalPO.findOne({
    _id: req.params.id,
    ...scope
  })
    .populate('hospital_id', 'hospital_name address contact_person')
    .populate('bdm_id', 'name email role')
    .populate('entered_by', 'name email role')
    .populate('recorded_on_behalf_of', 'name email role')
    .lean();
  if (!po) return res.status(404).json({ success: false, message: 'Hospital PO not found' });
  const lines = await HospitalPOLine.find({ po_id: po._id })
    .populate('product_id', 'brand_name generic_name dosage_strength unit_code selling_price')
    .sort({ createdAt: 1 })
    .lean();
  res.json({ success: true, data: { ...po, lines } });
});

// ─────────────────────────────────────────────────────────────────────────
// CREATE PO with lines
// ─────────────────────────────────────────────────────────────────────────
const createHospitalPo = catchAsync(async (req, res) => {
  // Phase G4.5a — resolve proxy owner using HOSPITAL_PO lookup-code
  let owner;
  try {
    owner = await resolveOwnerForWrite(req, 'sales', {
      subKey: 'proxy_entry',
      lookupCode: 'HOSPITAL_PO'
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    throw err;
  }

  const {
    hospital_id, po_number, po_date, source_kind, source_text, source_attachments, notes,
    line_items: rawLines
  } = req.body || {};

  if (!hospital_id || !po_number) {
    return res.status(400).json({ success: false, message: 'hospital_id and po_number are required' });
  }
  if (!Array.isArray(rawLines) || !rawLines.length) {
    return res.status(400).json({ success: false, message: 'At least one line item is required' });
  }

  const hospital = await Hospital.findById(hospital_id).select('_id hospital_name').lean();
  if (!hospital) return res.status(400).json({ success: false, message: 'Hospital not found' });

  // Validate every product exists in this entity + resolve unit_price per line
  const productIds = rawLines.map(l => l.product_id).filter(Boolean);
  const products = await ProductMaster.find({
    _id: { $in: productIds },
    entity_id: req.entityId
  }).select('_id brand_name selling_price').lean();
  const productMap = new Map(products.map(p => [String(p._id), p]));
  for (const ln of rawLines) {
    if (!productMap.has(String(ln.product_id))) {
      return res.status(400).json({
        success: false,
        message: `Product ${ln.product_id} not found in this entity`
      });
    }
    if (!ln.qty_ordered || Number(ln.qty_ordered) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Each line must have qty_ordered > 0'
      });
    }
  }

  // Pre-resolve prices (locked at PO entry per mentor decision)
  const asOf = po_date ? new Date(po_date) : new Date();
  const resolvedPrices = await Promise.all(
    rawLines.map(ln => resolveContractPrice(req.entityId, hospital_id, ln.product_id, asOf))
  );

  // Auto-compute expiry from lookup
  const expiryDays = await getPoExpiryDays(req.entityId);
  const expiryDate = new Date((po_date ? new Date(po_date) : new Date()).getTime() + expiryDays * 86400000);

  // Atomic header + lines write inside a transaction
  const session = await mongoose.startSession();
  let createdPo;
  try {
    await session.withTransaction(async () => {
      const [poDoc] = await HospitalPO.create([{
        entity_id: req.entityId,
        hospital_id,
        po_number,
        po_date: po_date || new Date(),
        bdm_id: owner.ownerId,
        entered_by: req.user._id,
        recorded_on_behalf_of: owner.proxiedBy || null,
        expiry_date: expiryDate,
        source_kind: source_kind || 'OTHER',
        source_text: source_text || '',
        source_attachments: Array.isArray(source_attachments) ? source_attachments : [],
        notes: notes || '',
        status: 'OPEN'
      }], { session });

      const lineDocs = rawLines.map((ln, idx) => {
        // Use override price if explicitly provided; otherwise resolved price; otherwise SRP fallback
        const resolved = resolvedPrices[idx];
        const overridePrice = (typeof ln.unit_price === 'number' && ln.unit_price >= 0) ? ln.unit_price : null;
        const unitPrice = overridePrice != null ? overridePrice : (resolved.price != null ? resolved.price : 0);
        const priceSource = overridePrice != null ? 'MANUAL_OVERRIDE' : (resolved.source === 'CONTRACT' ? 'CONTRACT' : 'SRP');
        const qtyOrdered = Number(ln.qty_ordered);
        return {
          entity_id: req.entityId,
          po_id: poDoc._id,
          hospital_id,
          product_id: ln.product_id,
          qty_ordered: qtyOrdered,
          qty_served: 0,
          // Pre-compute qty_unserved here because insertMany skips the
          // line's pre('save') hook. Subsequent .save() calls (post-CSI
          // increment, reopen giveback) recompute correctly via the hook.
          qty_unserved: qtyOrdered,
          unit_price: unitPrice,
          contract_price_ref: resolved.contract_price_ref,
          price_source: priceSource,
          status: 'OPEN',
          notes: ln.notes || ''
        };
      });
      const lines = await HospitalPOLine.insertMany(lineDocs, { session });

      // Compute totals
      let totalQtyOrdered = 0;
      let totalAmountOrdered = 0;
      for (const ln of lines) {
        totalQtyOrdered += ln.qty_ordered;
        totalAmountOrdered += ln.qty_ordered * ln.unit_price;
      }
      poDoc.total_qty_ordered = totalQtyOrdered;
      poDoc.total_amount_ordered = totalAmountOrdered;
      await poDoc.save({ session });
      createdPo = poDoc;
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: `PO number "${po_number}" already exists for hospital ${hospital.hospital_name}`
      });
    }
    throw err;
  } finally {
    await session.endSession();
  }

  // Audit (outside the txn — non-critical)
  if (owner.isOnBehalf) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: owner.ownerId,
      log_type: 'PROXY_CREATE',
      target_ref: createdPo._id.toString(),
      target_model: 'HospitalPO',
      changed_by: req.user._id,
      note: `Proxy create: HospitalPO ${createdPo.po_number} for ${hospital.hospital_name} on behalf of BDM ${owner.ownerId}`
    }).catch(err => console.error('[hospitalPo] audit failed:', err.message));
  }

  res.status(201).json({ success: true, data: createdPo });
});

// ─────────────────────────────────────────────────────────────────────────
// CANCEL PO (entire PO)
// ─────────────────────────────────────────────────────────────────────────
const cancelHospitalPo = catchAsync(async (req, res) => {
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry', lookupCode: 'HOSPITAL_PO' });
  const po = await HospitalPO.findOne({
    _id: req.params.id,
    ...scope
  });
  if (!po) return res.status(404).json({ success: false, message: 'Hospital PO not found' });
  if (po.status === 'FULFILLED') {
    return res.status(400).json({ success: false, message: 'Cannot cancel a fully-fulfilled PO' });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      po.status = 'CANCELLED';
      po.cancellation_reason = req.body.reason || '';
      await po.save({ session });
      // Cancel any non-served lines; PARTIAL keeps served qty intact
      await HospitalPOLine.updateMany(
        { po_id: po._id, status: { $in: ['OPEN', 'PARTIAL'] } },
        { $set: { status: 'CANCELLED', cancellation_reason: req.body.reason || '' } },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  await ErpAuditLog.logChange({
    entity_id: req.entityId,
    bdm_id: po.bdm_id,
    log_type: 'PO_CANCEL',
    target_ref: po._id.toString(),
    target_model: 'HospitalPO',
    changed_by: req.user._id,
    note: `Hospital PO ${po.po_number} cancelled: ${req.body.reason || '(no reason)'}`
  }).catch(err => console.error('[hospitalPo] audit failed:', err.message));

  res.json({ success: true, data: po });
});

// ─────────────────────────────────────────────────────────────────────────
// CANCEL a single line (partial cancel)
// ─────────────────────────────────────────────────────────────────────────
const cancelHospitalPoLine = catchAsync(async (req, res) => {
  const line = await HospitalPOLine.findOne({
    _id: req.params.lineId,
    entity_id: req.entityId
  });
  if (!line) return res.status(404).json({ success: false, message: 'PO line not found' });
  if (line.status === 'FULFILLED') {
    return res.status(400).json({ success: false, message: 'Cannot cancel a fulfilled line' });
  }
  line.status = 'CANCELLED';
  line.cancellation_reason = req.body.reason || '';
  await line.save();

  // Recompute parent PO status + totals
  await HospitalPO.recomputeFromLines(line.po_id);

  res.json({ success: true, data: line });
});

// ─────────────────────────────────────────────────────────────────────────
// BACKLOG SUMMARY (per warehouse/hospital — used by the Backlog page tiles)
// X3 will move this onto the Cockpit. For X1 it lives on the Backlog page.
// ─────────────────────────────────────────────────────────────────────────
const getBacklogSummary = catchAsync(async (req, res) => {
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry', lookupCode: 'HOSPITAL_PO' });
  // Build matches conditionally — president's tenantFilter has no entity_id
  // (global scope), and Mongo's aggregate $match treats { entity_id: undefined }
  // as "match documents where the field is missing", which excludes everything.
  const baseMatch = { status: { $in: ['OPEN', 'PARTIAL'] } };
  if (scope.entity_id) baseMatch.entity_id = scope.entity_id;
  if (scope.bdm_id) baseMatch.bdm_id = scope.bdm_id;
  const lineMatch = { status: { $in: ['OPEN', 'PARTIAL'] }, qty_unserved: { $gt: 0 } };
  if (scope.entity_id) lineMatch.entity_id = scope.entity_id;
  // HospitalPOLine has no bdm_id; hospital_id denormalized from header drives BDM scope via PO list.

  const [openCount, byHospital, topUnservedSkus] = await Promise.all([
    HospitalPO.countDocuments(baseMatch),
    HospitalPO.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: '$hospital_id',
          po_count: { $sum: 1 },
          total_unserved_amount: {
            $sum: { $subtract: ['$total_amount_ordered', '$total_amount_served'] }
          }
        }
      },
      { $sort: { total_unserved_amount: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: 'erp_hospitals',
          localField: '_id',
          foreignField: '_id',
          as: 'hospital'
        }
      },
      { $unwind: { path: '$hospital', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          po_count: 1,
          total_unserved_amount: 1,
          hospital_name: '$hospital.hospital_name'
        }
      }
    ]),
    HospitalPOLine.aggregate([
      { $match: lineMatch },
      {
        $group: {
          _id: '$product_id',
          total_unserved_qty: { $sum: '$qty_unserved' },
          line_count: { $sum: 1 }
        }
      },
      { $sort: { total_unserved_qty: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: 'erp_product_master',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          total_unserved_qty: 1,
          line_count: 1,
          brand_name: '$product.brand_name',
          generic_name: '$product.generic_name',
          dosage_strength: '$product.dosage_strength'
        }
      }
    ])
  ]);

  res.json({
    success: true,
    data: {
      open_po_count: openCount,
      by_hospital: byHospital,
      top_unserved_skus: topUnservedSkus,
      generated_at: new Date()
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// EXPIRE STALE POs — admin button or future cron
// ─────────────────────────────────────────────────────────────────────────
const expireStalePos = catchAsync(async (req, res) => {
  const result = await HospitalPO.updateMany(
    {
      entity_id: req.entityId,
      status: { $in: ['OPEN', 'PARTIAL'] },
      expiry_date: { $lt: new Date() }
    },
    { $set: { status: 'EXPIRED' } }
  );
  res.json({
    success: true,
    data: { matched: result.matchedCount, modified: result.modifiedCount }
  });
});

module.exports = {
  listHospitalPos,
  getHospitalPoById,
  createHospitalPo,
  cancelHospitalPo,
  cancelHospitalPoLine,
  getBacklogSummary,
  expireStalePos
};
