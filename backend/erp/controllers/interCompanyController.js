/**
 * Inter-Company Transfer Controller
 *
 * Endpoints for creating, approving, shipping, receiving, posting,
 * and cancelling inter-company stock transfers between entities.
 * Also manages transfer pricing.
 */
const mongoose = require('mongoose');
const InterCompanyTransfer = require('../models/InterCompanyTransfer');
const TransferPriceList = require('../models/TransferPriceList');
const Entity = require('../models/Entity');
const ProductMaster = require('../models/ProductMaster');
const ErpAuditLog = require('../models/ErpAuditLog');
const { catchAsync } = require('../../middleware/errorHandler');
const { ROLES } = require('../../constants/roles');
const interCompanyService = require('../services/interCompanyService');
const { canProxyEntry, getValidOwnerRolesForModule } = require('../utils/resolveOwnerScope');

// Phase G4.5dd (Apr 30 2026) — Internal Stock Reassignment proxy options.
// Pairs sub-perm `inventory.internal_transfer_proxy` with PROXY_ENTRY_ROLES
// + VALID_OWNER_ROLES rows whose code is INTERNAL_TRANSFER. Distinct namespace
// from `grn_proxy_entry` because reassignment shifts ownership (KPI / commission
// impact) — must be a separate explicit grant, not bundled.
const INTERNAL_TRANSFER_PROXY_OPTS = { subKey: 'internal_transfer_proxy', lookupCode: 'INTERNAL_TRANSFER' };

/**
 * POST /transfers — Create DRAFT transfer (president/admin only)
 */
const createTransfer = catchAsync(async (req, res) => {
  const { source_entity_id, target_entity_id, transfer_date, line_items, notes, source_bdm_id, target_bdm_id, source_warehouse_id, target_warehouse_id, csi_ref } = req.body;

  if (!source_entity_id || !target_entity_id) {
    return res.status(400).json({ success: false, message: 'Source and target entities are required' });
  }
  if (source_entity_id === target_entity_id) {
    return res.status(400).json({ success: false, message: 'Source and target entities must be different' });
  }
  if (!line_items?.length) {
    return res.status(400).json({ success: false, message: 'At least one line item is required' });
  }

  // Validate entities exist
  const [source, target] = await Promise.all([
    Entity.findById(source_entity_id).lean(),
    Entity.findById(target_entity_id).lean()
  ]);
  if (!source) return res.status(404).json({ success: false, message: 'Source entity not found' });
  if (!target) return res.status(404).json({ success: false, message: 'Target entity not found' });

  // Auto-fill transfer prices from TransferPriceList if not provided
  for (const item of line_items) {
    if (!item.transfer_price) {
      // eslint-disable-next-line vip-tenant/require-entity-filter -- TransferPriceList is a cross-entity relationship model (keys: source_entity_id + target_entity_id, no single entity_id); both legs are validated upstream
      const price = await TransferPriceList.findOne({
        source_entity_id,
        target_entity_id,
        product_id: item.product_id,
        is_active: true
      }).lean();
      if (price) {
        item.transfer_price = price.transfer_price;
      }
    }
  }

  const transfer = await InterCompanyTransfer.create({
    source_entity_id,
    target_entity_id,
    transfer_date: transfer_date || new Date(),
    line_items,
    notes,
    source_bdm_id: source_bdm_id || undefined,
    target_bdm_id: target_bdm_id || undefined,
    source_warehouse_id: source_warehouse_id || undefined,
    target_warehouse_id: target_warehouse_id || undefined,
    csi_ref: csi_ref || undefined,
    requested_by: req.user._id,
    created_by: req.user._id
  });

  await ErpAuditLog.logChange({
    entity_id: source_entity_id,
    log_type: 'STATUS_CHANGE',
    target_ref: transfer._id.toString(),
    target_model: 'InterCompanyTransfer',
    field_changed: 'status',
    new_value: 'DRAFT',
    changed_by: req.user._id,
    note: `IC Transfer ${transfer.transfer_ref} created: ${line_items.length} item(s) to ${target.entity_name}`
  });

  res.status(201).json({ success: true, data: transfer });
});

/**
 * GET /transfers — List transfers with pagination & filters
 */
const getTransfers = catchAsync(async (req, res) => {
  const filter = {};

  // President sees all; others see their entity's transfers
  if (!req.isPresident) {
    filter.$or = [
      { source_entity_id: req.entityId },
      { target_entity_id: req.entityId }
    ];
  }

  if (req.query.status) filter.status = req.query.status;
  if (req.query.source_entity_id) filter.source_entity_id = req.query.source_entity_id;
  if (req.query.target_entity_id) filter.target_entity_id = req.query.target_entity_id;

  // Phase 6 — hide reversed rows by default; opt-in via ?include_reversed=true.
  if (req.query.include_reversed !== 'true') {
    filter.deletion_event_id = { $exists: false };
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const [transfers, total] = await Promise.all([
    InterCompanyTransfer.find(filter)
      .populate('source_entity_id', 'entity_name')
      .populate('target_entity_id', 'entity_name')
      .populate('requested_by', 'name')
      .populate('approved_by', 'name')
      .populate('shipped_by', 'name')
      .populate('received_by', 'name')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    InterCompanyTransfer.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: transfers,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

/**
 * GET /transfers/:id — Single transfer detail with enriched line items
 */
const getTransferById = catchAsync(async (req, res) => {
  // Entity-scope: president sees all, others must be source or target entity
  const entityFilter = req.isPresident ? {} : {
    $or: [{ source_entity_id: req.entityId }, { target_entity_id: req.entityId }]
  };
  const transfer = await InterCompanyTransfer.findOne({ _id: req.params.id, ...entityFilter })
    .populate('source_entity_id', 'entity_name brand_color brand_text_color')
    .populate('target_entity_id', 'entity_name brand_color brand_text_color')
    .populate('source_bdm_id', 'name role')
    .populate('target_bdm_id', 'name role')
    .populate('requested_by', 'name')
    .populate('approved_by', 'name')
    .populate('shipped_by', 'name')
    .populate('received_by', 'name')
    .populate('posted_by', 'name')
    .populate('cancelled_by', 'name')
    .lean();

  if (!transfer) {
    return res.status(404).json({ success: false, message: 'Transfer not found' });
  }

  // Enrich line items with product details
  const productIds = transfer.line_items.map(li => li.product_id);
  // eslint-disable-next-line vip-tenant/require-entity-filter -- productIds harvested from same-entity-scoped transfer.line_items; _id is globally unique
  const products = await ProductMaster.find({ _id: { $in: productIds } })
    .select('brand_name generic_name item_key unit_code')
    .lean();
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  for (const item of transfer.line_items) {
    item.product = productMap.get(item.product_id?.toString()) || null;
  }

  res.json({ success: true, data: transfer });
});

/**
 * Phase G6.7-PC6 (May 01 2026) — Shared lifecycle helper for IC Transfer
 * approval. Single source of truth for the DRAFT → APPROVED transition (the
 * status-flip + audit log step; NO stock movement, NO JE — that fires on ship).
 *
 * Used by:
 *   1. approveTransfer (BDM-direct route): runs gateApproval + entity scope,
 *      then calls this helper.
 *   2. universalApprovalController.approvalHandlers.ic_transfer (Approval Hub,
 *      doc_type === 'IC_TRANSFER'): gate has already passed; calls helper directly.
 *
 * Idempotency: short-circuits when transfer.status === 'APPROVED' or any
 * downstream state (SHIPPED/RECEIVED/POSTED) so re-clicking Approve from the
 * Hub never demotes a shipped transfer back to APPROVED.
 *
 * No period lock: APPROVED is a pre-financial state — no JE, no stock move.
 * Period gate fires on shipTransfer / postTransfer downstream.
 */
async function approveSingleIcTransfer(transferId, userId) {
  // eslint-disable-next-line vip-tenant/require-entity-filter -- helper resolves entity from transfer; caller provides authorization
  const transfer = await InterCompanyTransfer.findById(transferId);
  if (!transfer) throw Object.assign(new Error('Transfer not found'), { statusCode: 404 });

  // Idempotent on APPROVED and any downstream state (already past the gate).
  if (['APPROVED', 'SHIPPED', 'RECEIVED', 'POSTED'].includes(transfer.status)) {
    return { transfer, already_approved: true };
  }
  if (transfer.status !== 'DRAFT') {
    throw Object.assign(new Error(`Cannot approve transfer in ${transfer.status} status`), { statusCode: 400 });
  }

  transfer.status = 'APPROVED';
  transfer.approved_by = userId;
  transfer.approved_at = new Date();
  await transfer.save();

  await ErpAuditLog.logChange({
    entity_id: transfer.source_entity_id,
    log_type: 'STATUS_CHANGE',
    target_ref: transfer._id.toString(),
    target_model: 'InterCompanyTransfer',
    field_changed: 'status',
    old_value: 'DRAFT',
    new_value: 'APPROVED',
    changed_by: userId,
    note: `IC Transfer ${transfer.transfer_ref} approved`,
  });

  return { transfer, already_approved: false };
}

/**
 * PATCH /transfers/:id/approve — DRAFT → APPROVED (president only)
 */
const approveTransfer = catchAsync(async (req, res) => {
  const entityFilter = req.isPresident ? {} : {
    $or: [{ source_entity_id: req.entityId }, { target_entity_id: req.entityId }]
  };
  const transferPre = await InterCompanyTransfer.findOne({ _id: req.params.id, ...entityFilter }).lean();
  if (!transferPre) return res.status(404).json({ success: false, message: 'Transfer not found' });
  if (transferPre.status !== 'DRAFT') {
    return res.status(400).json({ success: false, message: `Cannot approve transfer in ${transferPre.status} status` });
  }

  // Authority matrix gate (caller-responsibility — helper does NOT gate)
  const { gateApproval } = require('../services/approvalService');
  const totalAmount = (transferPre.line_items || []).reduce((sum, li) => sum + ((li.qty || 0) * (li.unit_cost || 0)), 0);
  const gated = await gateApproval({
    entityId: transferPre.source_entity_id,
    module: 'IC_TRANSFER',
    docType: 'IC_TRANSFER',
    docId: transferPre._id,
    docRef: transferPre.transfer_ref,
    amount: transferPre.total_amount || totalAmount,
    description: `IC transfer ${transferPre.transfer_ref}`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  try {
    const { transfer } = await approveSingleIcTransfer(transferPre._id, req.user._id);
    res.json({ success: true, message: 'Transfer approved', data: transfer });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, message: err.message, code: err.code });
  }
});

/**
 * PATCH /transfers/:id/ship — APPROVED → SHIPPED
 * Calls interCompanyService.shipTransfer for FIFO stock deduction.
 */
const shipTransfer = catchAsync(async (req, res) => {
  const transfer = await interCompanyService.shipTransfer(req.params.id, req.user._id);
  res.json({ success: true, message: 'Transfer shipped — source stock deducted', data: transfer });
});

/**
 * PATCH /transfers/:id/receive — SHIPPED → RECEIVED
 * Target entity BDM/admin confirms receipt.
 */
const receiveTransfer = catchAsync(async (req, res) => {
  const transfer = await interCompanyService.receiveTransfer(req.params.id, req.user._id);
  res.json({ success: true, message: 'Transfer received — target stock updated', data: transfer });
});

/**
 * PATCH /transfers/:id/post — RECEIVED → POSTED
 */
const postTransfer = catchAsync(async (req, res) => {
  const transfer = await interCompanyService.postTransfer(req.params.id, req.user._id);
  res.json({ success: true, message: 'Transfer posted (final)', data: transfer });
});

/**
 * PATCH /transfers/:id/cancel — Cancel with reason
 */
const cancelTransfer = catchAsync(async (req, res) => {
  const { reason } = req.body;
  const transfer = await interCompanyService.cancelTransfer(req.params.id, req.user._id, reason);
  res.json({ success: true, message: 'Transfer cancelled', data: transfer });
});

/**
 * GET /transfer-prices — List transfer prices for an entity pair
 */
const getTransferPrices = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.source_entity_id) filter.source_entity_id = req.query.source_entity_id;
  if (req.query.target_entity_id) filter.target_entity_id = req.query.target_entity_id;
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';
  else filter.is_active = true;

  const prices = await TransferPriceList.find(filter)
    .populate('product_id', 'brand_name generic_name item_key unit_code selling_price')
    .populate('source_entity_id', 'entity_name')
    .populate('target_entity_id', 'entity_name')
    .populate('set_by', 'name')
    .sort({ 'product_id.brand_name': 1 })
    .lean();

  res.json({ success: true, data: prices });
});

/**
 * PUT /transfer-prices — Create or update a transfer price
 */
const setTransferPrice = catchAsync(async (req, res) => {
  const { source_entity_id, target_entity_id, product_id, transfer_price, notes } = req.body;

  if (!source_entity_id || !target_entity_id || !product_id || !transfer_price) {
    return res.status(400).json({
      success: false,
      message: 'source_entity_id, target_entity_id, product_id, and transfer_price are required'
    });
  }

  // eslint-disable-next-line vip-tenant/require-entity-filter -- TransferPriceList is a cross-entity relationship model (keys: source_entity_id + target_entity_id, no single entity_id)
  const price = await TransferPriceList.findOneAndUpdate(
    { source_entity_id, target_entity_id, product_id },
    {
      $set: {
        transfer_price,
        effective_date: new Date(),
        set_by: req.user._id,
        is_active: true,
        notes: notes || ''
      }
    },
    { upsert: true, new: true, runValidators: true }
  );

  res.json({ success: true, data: price });
});

/**
 * GET /prices/products — All source entity products merged with existing transfer prices
 * Shows every product so the user can set prices for ones that don't have them yet.
 */
const getTransferPriceProducts = catchAsync(async (req, res) => {
  const { source_entity_id, target_entity_id, search } = req.query;
  if (!source_entity_id || !target_entity_id) {
    return res.status(400).json({ success: false, message: 'source_entity_id and target_entity_id are required' });
  }

  // Get active products from the SOURCE entity (all products belong to VIP)
  // Transfer prices tag which products VIP supplies to the target entity
  const productFilter = { entity_id: source_entity_id, is_active: { $ne: false } };
  if (search) {
    productFilter.$or = [
      { brand_name: new RegExp(search, 'i') },
      { generic_name: new RegExp(search, 'i') }
    ];
  }

  const products = await ProductMaster.find(productFilter)
    .select('brand_name generic_name dosage_strength unit_code selling_price purchase_price')
    .sort({ brand_name: 1 })
    .lean();

  // Get existing transfer prices for this entity pair
  // eslint-disable-next-line vip-tenant/require-entity-filter -- TransferPriceList is a cross-entity relationship model (keys: source_entity_id + target_entity_id, no single entity_id)
  const existingPrices = await TransferPriceList.find({
    source_entity_id,
    target_entity_id,
    is_active: true
  }).populate('set_by', 'name').lean();

  const priceMap = new Map(existingPrices.map(p => [p.product_id.toString(), p]));

  // Merge: every product gets a row, with transfer_price if one exists
  const merged = products.map(prod => {
    const existing = priceMap.get(prod._id.toString());
    return {
      product_id: prod._id,
      brand_name: prod.brand_name,
      generic_name: prod.generic_name,
      dosage_strength: prod.dosage_strength,
      unit_code: prod.unit_code,
      selling_price: prod.selling_price || 0,
      purchase_price: prod.purchase_price || 0,
      transfer_price: existing?.transfer_price || null,
      effective_date: existing?.effective_date || null,
      set_by: existing?.set_by || null,
      price_id: existing?._id || null
    };
  });

  res.json({ success: true, data: merged, total: merged.length });
});

/**
 * PUT /prices/bulk — Bulk create/update transfer prices
 * Body: { source_entity_id, target_entity_id, items: [{ product_id, transfer_price }] }
 */
const bulkSetTransferPrices = catchAsync(async (req, res) => {
  const { source_entity_id, target_entity_id, items } = req.body;

  if (!source_entity_id || !target_entity_id || !items?.length) {
    return res.status(400).json({ success: false, message: 'source_entity_id, target_entity_id, and items[] are required' });
  }

  const ops = items
    .filter(item => item.product_id && item.transfer_price > 0)
    .map(item => ({
      updateOne: {
        filter: { source_entity_id, target_entity_id, product_id: item.product_id },
        update: {
          $set: {
            transfer_price: item.transfer_price,
            effective_date: new Date(),
            set_by: req.user._id,
            is_active: true,
            notes: item.notes || ''
          }
        },
        upsert: true
      }
    }));

  if (!ops.length) {
    return res.status(400).json({ success: false, message: 'No valid items to save (transfer_price must be > 0)' });
  }

  const result = await TransferPriceList.bulkWrite(ops);

  await ErpAuditLog.logChange({
    entity_id: source_entity_id,
    log_type: 'UPDATE',
    target_model: 'TransferPriceList',
    field_changed: 'transfer_price',
    new_value: `${ops.length} prices`,
    changed_by: req.user._id,
    note: `Bulk update: ${result.upsertedCount} created, ${result.modifiedCount} updated`
  });

  res.json({
    success: true,
    message: `${result.upsertedCount} created, ${result.modifiedCount} updated`,
    created: result.upsertedCount,
    updated: result.modifiedCount
  });
});

/**
 * GET /entities — List all entities (for dropdowns)
 */
const getEntities = catchAsync(async (req, res) => {
  const filter = { status: 'ACTIVE' };
  const entities = await Entity.find(filter)
    .sort({ entity_type: 1, entity_name: 1 })
    .lean();
  res.json({ success: true, data: entities });
});

/**
 * GET /bdms?entity_id=xxx — List BDMs (employees) for an entity (for source/target BDM dropdowns)
 * Includes president/admin users who may hold warehouse stock.
 */
const getBdmsByEntity = catchAsync(async (req, res) => {
  const User = require('../../models/User');
  const filter = { isActive: { $ne: false } };
  if (req.query.entity_id) filter.entity_id = req.query.entity_id;
  // Include employees + president/admin (warehouse keepers)
  filter.role = { $in: [ROLES.CONTRACTOR, ROLES.PRESIDENT, ROLES.ADMIN] };

  const users = await User.find(filter)
    .select('name email role entity_id bdm_stage')
    .sort({ role: 1, name: 1 })
    .lean();

  // Optionally include unassigned BDMs (no entity_id — contractors not yet assigned)
  if (req.query.include_unassigned === 'true') {
    const unassigned = await User.find({
      $or: [{ entity_id: { $exists: false } }, { entity_id: null }],
      role: ROLES.CONTRACTOR,
      isActive: { $ne: false }
    }).select('name email role entity_id bdm_stage').lean();

    for (const u of unassigned) {
      // Avoid duplicates if somehow already in results
      if (!users.some(existing => existing._id.toString() === u._id.toString())) {
        users.push({ ...u, _unassigned: true });
      }
    }
  }

  res.json({ success: true, data: users });
});

// ═══ Internal Stock Reassignment (same entity, GRN-like approval) ═══

const StockReassignment = require('../models/StockReassignment');
const InventoryLedger = require('../models/InventoryLedger');
const TransactionEvent = require('../models/TransactionEvent');
const { consumeSpecificBatch } = require('../services/fifoEngine');

/**
 * POST /reassign — Create PENDING reassignment.
 * Same entity, different BDMs. Requires finance/admin approval to deduct stock.
 *
 * Phase G4.5dd (Apr 30 2026) — proxy gate added. Caller must be admin/finance/
 * president OR hold `inventory.internal_transfer_proxy` AND a role in
 * PROXY_ENTRY_ROLES.INTERNAL_TRANSFER. Source + target BDMs are validated
 * against VALID_OWNER_ROLES.INTERNAL_TRANSFER and same-entity (defense in
 * depth — a privileged role passing admin _ids would corrupt KPI/commission).
 * Approval (the dispositive stock-deduction action) remains admin/finance/
 * president only — see approveReassignment.
 */
const createReassignment = catchAsync(async (req, res) => {
  const { source_bdm_id, target_bdm_id, source_warehouse_id, target_warehouse_id, reassignment_date, line_items, undertaking_photo_url, ocr_data, notes } = req.body;

  if (!source_bdm_id || !target_bdm_id) {
    return res.status(400).json({ success: false, message: 'Source and target custodians are required' });
  }
  // Phase G4.5dd-r2 — same-custodian, two-warehouse rebalance is allowed.
  // BDMs commonly hold stock at multiple warehouses (e.g. ACC + BAC) and need
  // to shift quantity between them without changing ownership. When source ===
  // target, warehouses MUST differ — else there is no operation. Cross-BDM
  // (different source/target) keeps the existing two-person flow.
  const sameCustodian = String(source_bdm_id) === String(target_bdm_id);
  if (sameCustodian) {
    if (!source_warehouse_id || !target_warehouse_id) {
      return res.status(400).json({ success: false, message: 'Same-custodian rebalance requires both source and target warehouses' });
    }
    if (String(source_warehouse_id) === String(target_warehouse_id)) {
      return res.status(400).json({ success: false, message: 'Same-custodian rebalance requires different source and target warehouses' });
    }
  }
  if (!line_items?.length) {
    return res.status(400).json({ success: false, message: 'At least one line item is required' });
  }

  // Use requesting user's entity_id, or allow override for president (resolved
  // before product validation so we can scope the catalog query to this entity).
  const entityId = req.entityId || req.body.entity_id;
  if (!entityId) {
    return res.status(400).json({ success: false, message: 'Entity ID required' });
  }

  // Phase G4.5dd — Proxy gate. Privileged users always pass; everyone else must
  // hold `inventory.internal_transfer_proxy` AND a role in PROXY_ENTRY_ROLES.
  // INTERNAL_TRANSFER. Without this gate, any user with `inventory.transfers`
  // (the route-level sub-perm — broadly granted for IC visibility) could
  // create cross-BDM reassignments.
  //
  // Phase G4.5dd-r2 — self-source same-custodian rebalance bypasses the proxy
  // gate. A BDM moving their OWN stock between their OWN warehouses isn't
  // acting on behalf of anyone, so the proxy check is moot. Cross-BDM (or
  // same-custodian acting on someone else's stock) still requires the proxy.
  const privileged = req.isAdmin || req.isFinance || req.isPresident;
  const isSelfMove = sameCustodian && String(source_bdm_id) === String(req.user._id);
  if (!privileged && !isSelfMove) {
    const { canProxy } = await canProxyEntry(req, 'inventory', INTERNAL_TRANSFER_PROXY_OPTS);
    if (!canProxy) {
      return res.status(403).json({
        success: false,
        message: 'Internal Stock Reassignment proxy denied. Your role or Access Template does not grant cross-BDM internal-transfer rights for inventory. Required: inventory.internal_transfer_proxy + role in PROXY_ENTRY_ROLES.INTERNAL_TRANSFER.'
      });
    }
  }

  // Defense-in-depth — validate source + target BDMs are valid owners and
  // belong to the caller's entity. Mirrors resolveOwnerForWrite hardening so
  // a privileged caller can't accidentally pass an admin _id and corrupt
  // per-BDM KPI / commission ledgers.
  const User = require('../../models/User');
  const validOwnerRoles = await getValidOwnerRolesForModule(entityId, 'inventory', 'INTERNAL_TRANSFER');
  const [srcUser, tgtUser] = await Promise.all([
    User.findById(source_bdm_id).select('role entity_id entity_ids isActive name').lean(),
    User.findById(target_bdm_id).select('role entity_id entity_ids isActive name').lean(),
  ]);
  for (const [label, u, id] of [['Source', srcUser, source_bdm_id], ['Target', tgtUser, target_bdm_id]]) {
    if (!u) {
      return res.status(400).json({ success: false, message: `${label} BDM not found (${id})` });
    }
    if (!u.isActive) {
      return res.status(400).json({ success: false, message: `${label} BDM ${u.name || id} is inactive` });
    }
    if (!validOwnerRoles.includes(u.role)) {
      return res.status(400).json({
        success: false,
        message: `${label} role '${u.role}' is not a valid owner for Internal Stock Reassignment. Configured (VALID_OWNER_ROLES.INTERNAL_TRANSFER): ${validOwnerRoles.join(', ')}.`
      });
    }
    const userEntities = [u.entity_id, ...(u.entity_ids || [])].filter(Boolean).map(String);
    if (!userEntities.includes(String(entityId))) {
      return res.status(400).json({
        success: false,
        message: `${label} BDM ${u.name || id} is not assigned to the current entity. Cross-entity reassignment is not permitted — use Inter-Company Transfer instead.`
      });
    }
  }

  // Validate products exist within the caller's entity. Without entity_id, a
  // user could pass product_ids from a sibling entity and the reassignment
  // would silently accept them. Mirrors the GRN-create fix in inventoryController.
  const productIds = line_items.map(li => li.product_id);
  const products = await ProductMaster.find({ entity_id: entityId, _id: { $in: productIds } }).select('_id item_key').lean();
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  for (const li of line_items) {
    if (!productMap.has(li.product_id?.toString())) {
      return res.status(400).json({ success: false, message: `Product ${li.product_id} not found in this entity` });
    }
    if (!li.item_key) li.item_key = productMap.get(li.product_id.toString()).item_key;
  }

  // reassignment_ref is now auto-generated by the StockReassignment pre-save
  // hook via docNumbering — format IST-{TERRITORY|ENTITY}{MMDDYY}-{NNN}, atomic
  // DocSequence. Phase G4.5dd-r1 (Apr 30 2026): the legacy `territory_code`
  // input was dropped, controller no longer touches the ref.
  const refDate = reassignment_date ? new Date(reassignment_date) : new Date();

  const reassignment = await StockReassignment.create({
    entity_id: entityId,
    source_bdm_id,
    target_bdm_id,
    source_warehouse_id: source_warehouse_id || undefined,
    target_warehouse_id: target_warehouse_id || undefined,
    reassignment_date: refDate,
    line_items,
    undertaking_photo_url,
    ocr_data,
    notes,
    created_by: req.user._id
  });

  await ErpAuditLog.logChange({
    entity_id: entityId,
    bdm_id: source_bdm_id,
    log_type: 'STATUS_CHANGE',
    target_ref: reassignment._id.toString(),
    target_model: 'StockReassignment',
    field_changed: 'status',
    new_value: 'PENDING',
    changed_by: req.user._id,
    note: `Stock reassignment created: ${line_items.length} item(s)`
  });

  res.status(201).json({ success: true, data: reassignment });
});

/**
 * POST /reassign/:id/approve — Source contractor or admin approves
 * On APPROVED: FIFO consume from source → TRANSFER_OUT only.
 * Status becomes AWAITING_GRN — receiving contractor must enter GRN to complete.
 */
const approveReassignment = catchAsync(async (req, res) => {
  const { action, rejection_reason } = req.body;

  if (!['APPROVED', 'REJECTED'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Action must be APPROVED or REJECTED' });
  }

  // Phase G4.5dd — explicit role gate on approval. Two-person rule: the proxy
  // (staff with `inventory.internal_transfer_proxy`) may CREATE the PENDING
  // reassignment, but APPROVE — which deducts FIFO stock from source and shifts
  // ownership — must be admin / finance / president. Closes the latent gap
  // where the route-level `inventory.transfers` sub-perm alone permitted any
  // grantee to approve. President always passes; CEO is denied (view-only).
  const isApprover = req.isAdmin || req.isFinance || req.isPresident;
  if (!isApprover) {
    return res.status(403).json({
      success: false,
      message: 'Approval of Internal Stock Reassignment is restricted to admin, finance, or president. Two-person rule on stock-ownership changes — proxies may create but not approve.'
    });
  }

  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const reassignment = await StockReassignment.findOne({ _id: req.params.id, ...entityScope, status: 'PENDING' });
  if (!reassignment) {
    return res.status(404).json({ success: false, message: 'Reassignment not found or not in PENDING status' });
  }

  if (action === 'REJECTED') {
    reassignment.status = 'REJECTED';
    reassignment.rejection_reason = rejection_reason || '';
    reassignment.reviewed_by = req.user._id;
    reassignment.reviewed_at = new Date();
    await reassignment.save();

    await ErpAuditLog.logChange({
      entity_id: reassignment.entity_id,
      log_type: 'STATUS_CHANGE',
      target_ref: reassignment._id.toString(),
      target_model: 'StockReassignment',
      field_changed: 'status',
      old_value: 'PENDING',
      new_value: 'REJECTED',
      changed_by: req.user._id,
      note: rejection_reason || 'Reassignment rejected'
    });

    return res.json({ success: true, message: 'Reassignment rejected', data: reassignment });
  }

  // APPROVED — atomic transaction.
  //
  // Cross-BDM (default): TRANSFER_OUT from source only; status AWAITING_GRN —
  // the receiving custodian creates a GRN at the target warehouse to complete.
  //
  // Phase G4.5dd-r2 — Same-custodian rebalance: the same person owns both
  // sides, so the GRN-wait step is meaningless (nobody else needs to sign for
  // receipt). Write TRANSFER_OUT (source warehouse) AND TRANSFER_IN (target
  // warehouse) atomically and close the doc → COMPLETED. Ownership doesn't
  // shift; only warehouse_id moves. FIFO stays consistent because the IN row
  // immediately re-creates the same batch at the target warehouse.
  const isSameCustodian = String(reassignment.source_bdm_id) === String(reassignment.target_bdm_id);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Create TransactionEvent
      const [event] = await TransactionEvent.create([{
        entity_id: reassignment.entity_id,
        bdm_id: reassignment.source_bdm_id,
        event_type: 'STOCK_REASSIGNMENT',
        event_date: reassignment.reassignment_date,
        document_ref: reassignment._id.toString(),
        payload: {
          source_bdm_id: reassignment.source_bdm_id,
          target_bdm_id: reassignment.target_bdm_id,
          source_warehouse_id: reassignment.source_warehouse_id,
          target_warehouse_id: reassignment.target_warehouse_id,
          same_custodian: isSameCustodian,
          line_items: reassignment.line_items
        },
        created_by: req.user._id
      }], { session });

      // Phase 17: warehouse context for FIFO and ledger entries
      const srcWhId = reassignment.source_warehouse_id;
      const tgtWhId = reassignment.target_warehouse_id;
      const fifoOpts = srcWhId ? { warehouseId: srcWhId.toString() } : undefined;

      for (const item of reassignment.line_items) {
        // Validate stock available via FIFO
        await consumeSpecificBatch(
          reassignment.entity_id, reassignment.source_bdm_id,
          item.product_id, item.batch_lot_no, item.qty, fifoOpts
        );

        // TRANSFER_OUT from source (always)
        await InventoryLedger.create([{
          entity_id: reassignment.entity_id,
          bdm_id: reassignment.source_bdm_id,
          warehouse_id: srcWhId || undefined,
          product_id: item.product_id,
          batch_lot_no: item.batch_lot_no,
          expiry_date: item.expiry_date,
          transaction_type: 'TRANSFER_OUT',
          qty_in: 0,
          qty_out: item.qty,
          event_id: event._id,
          recorded_by: req.user._id
        }], { session });

        // Same-custodian: also write TRANSFER_IN to target warehouse so FIFO
        // tracks the batch at its new location. Cross-BDM skips this — the
        // receiving GRN will write the IN row at the target warehouse.
        if (isSameCustodian) {
          await InventoryLedger.create([{
            entity_id: reassignment.entity_id,
            bdm_id: reassignment.target_bdm_id,
            warehouse_id: tgtWhId || undefined,
            product_id: item.product_id,
            batch_lot_no: item.batch_lot_no,
            expiry_date: item.expiry_date,
            transaction_type: 'TRANSFER_IN',
            qty_in: item.qty,
            qty_out: 0,
            event_id: event._id,
            recorded_by: req.user._id
          }], { session });
        }
      }

      // Same-custodian closes immediately; cross-BDM waits on receiver GRN.
      reassignment.status = isSameCustodian ? 'COMPLETED' : 'AWAITING_GRN';
      reassignment.reviewed_by = req.user._id;
      reassignment.reviewed_at = new Date();
      reassignment.event_id = event._id;
      await reassignment.save({ session });
    });

    const newStatus = isSameCustodian ? 'COMPLETED' : 'AWAITING_GRN';
    await ErpAuditLog.logChange({
      entity_id: reassignment.entity_id,
      log_type: 'STATUS_CHANGE',
      target_ref: reassignment._id.toString(),
      target_model: 'StockReassignment',
      field_changed: 'status',
      old_value: 'PENDING',
      new_value: newStatus,
      changed_by: req.user._id,
      note: isSameCustodian
        ? `Same-custodian rebalance approved: ${reassignment.line_items.length} item(s) moved between warehouses — closed`
        : `Reassignment approved: ${reassignment.line_items.length} item(s) deducted from source — awaiting GRN from receiver`
    });

    res.json({
      success: true,
      message: isSameCustodian
        ? 'Same-custodian rebalance approved and completed'
        : 'Reassignment approved — awaiting GRN from receiving contractor',
      data: reassignment
    });
  } finally {
    await session.endSession();
  }
});

/**
 * GET /reassign — List reassignments with status filter
 */
const getReassignments = catchAsync(async (req, res) => {
  const filter = {};

  // President sees all; others see their entity
  if (!req.isPresident && req.entityId) {
    filter.entity_id = req.entityId;
  }
  if (req.query.status) filter.status = req.query.status;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const [reassignments, total] = await Promise.all([
    StockReassignment.find(filter)
      .populate('source_bdm_id', 'name role')
      .populate('target_bdm_id', 'name role')
      .populate('reviewed_by', 'name')
      .populate('created_by', 'name')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    StockReassignment.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: reassignments,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// President-only: dual-side SAP Storno reversal of an SHIPPED/RECEIVED/POSTED IC
// Transfer. DRAFT/APPROVED/CANCELLED rows are hard-deleted. Blocks if any
// target-entity SalesLine has consumed the transferred stock.
const { buildPresidentReverseHandler } = require('../services/documentReversalService');
const presidentReverseIcTransfer = buildPresidentReverseHandler('IC_TRANSFER');

module.exports = {
  createTransfer,
  getTransfers,
  getTransferById,
  approveTransfer,
  shipTransfer,
  receiveTransfer,
  postTransfer,
  cancelTransfer,
  getTransferPrices,
  setTransferPrice,
  getTransferPriceProducts,
  bulkSetTransferPrices,
  getEntities,
  getBdmsByEntity,
  createReassignment,
  approveReassignment,
  getReassignments,
  presidentReverseIcTransfer,
  // Phase G6.7-PC6 — shared helper for the Approval Hub.
  approveSingleIcTransfer,
};
