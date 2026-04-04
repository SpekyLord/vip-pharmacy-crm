/**
 * Inter-Company Transfer Service — Dual-Ledger Inventory Movements
 *
 * Handles the SHIPPED and RECEIVED lifecycle steps for inter-company transfers.
 * Source entity stock decreases at SHIPPED (TRANSFER_OUT).
 * Target entity stock increases at RECEIVED (TRANSFER_IN).
 *
 * Also handles product catalog sync: if the target entity doesn't have
 * a ProductMaster record for a transferred product, one is auto-created.
 */
const mongoose = require('mongoose');
const InterCompanyTransfer = require('../models/InterCompanyTransfer');
const InventoryLedger = require('../models/InventoryLedger');
const TransactionEvent = require('../models/TransactionEvent');
const ProductMaster = require('../models/ProductMaster');
const ErpAuditLog = require('../models/ErpAuditLog');
const User = require('../../models/User');
const { consumeFIFO, consumeSpecificBatch } = require('./fifoEngine');

/**
 * Ship a transfer — APPROVED → SHIPPED
 * Deducts stock from source entity via FIFO engine, creates TRANSFER_OUT ledger entries.
 */
const shipTransfer = async (transferId, shippedBy) => {
  const transfer = await InterCompanyTransfer.findById(transferId);
  if (!transfer) throw new Error('Transfer not found');
  if (transfer.status !== 'APPROVED') {
    throw new Error(`Cannot ship transfer in ${transfer.status} status. Must be APPROVED.`);
  }

  // Use explicit source_bdm_id (warehouse keeper), fallback to first BDM in entity
  let sourceBdmId = transfer.source_bdm_id;
  if (!sourceBdmId) {
    const sourceBdm = await User.findOne({
      entity_id: transfer.source_entity_id,
      role: 'employee',
      isActive: true
    }).select('_id').lean();
    sourceBdmId = sourceBdm ? sourceBdm._id : shippedBy;
  }

  const session = await mongoose.startSession();
  try {
    let sourceEvent;
    await session.withTransaction(async () => {
      const ledgerEntries = [];

      // Phase 17: pass warehouse context to FIFO engine
      const sourceWarehouseId = transfer.source_warehouse_id;
      const fifoOpts = sourceWarehouseId ? { warehouseId: sourceWarehouseId.toString() } : undefined;

      for (const item of transfer.line_items) {
        // Consume stock from source entity/warehouse
        let consumptionPlan;
        if (item.batch_lot_no) {
          const plan = await consumeSpecificBatch(
            transfer.source_entity_id, sourceBdmId,
            item.product_id, item.batch_lot_no, item.qty, fifoOpts
          );
          consumptionPlan = [plan];
        } else {
          consumptionPlan = await consumeFIFO(
            transfer.source_entity_id, sourceBdmId,
            item.product_id, item.qty, fifoOpts
          );
        }

        // Create TRANSFER_OUT ledger entries
        for (const consumed of consumptionPlan) {
          ledgerEntries.push({
            entity_id: transfer.source_entity_id,
            bdm_id: sourceBdmId,
            warehouse_id: sourceWarehouseId || undefined,
            product_id: item.product_id,
            batch_lot_no: consumed.batch_lot_no,
            expiry_date: consumed.expiry_date,
            transaction_type: 'TRANSFER_OUT',
            qty_in: 0,
            qty_out: consumed.qty_consumed,
            recorded_by: shippedBy
          });

          // Store batch info on the line item for receiving
          if (!item.batch_lot_no) {
            item.batch_lot_no = consumed.batch_lot_no;
            item.expiry_date = consumed.expiry_date;
          }
        }
      }

      // Create TransactionEvent for source
      const [event] = await TransactionEvent.create([{
        entity_id: transfer.source_entity_id,
        bdm_id: sourceBdmId,
        event_type: 'IC_SHIPMENT',
        event_date: new Date(),
        document_ref: transfer.transfer_ref,
        payload: {
          transfer_id: transfer._id,
          target_entity_id: transfer.target_entity_id,
          line_items: transfer.line_items
        },
        created_by: shippedBy
      }], { session });

      sourceEvent = event;

      // Create all ledger entries with event_id
      for (const entry of ledgerEntries) {
        entry.event_id = event._id;
        await InventoryLedger.create([entry], { session });
      }

      // Update transfer status
      transfer.status = 'SHIPPED';
      transfer.shipped_by = shippedBy;
      transfer.shipped_at = new Date();
      transfer.source_event_id = event._id;
      await transfer.save({ session });
    });

    await ErpAuditLog.logChange({
      entity_id: transfer.source_entity_id,
      bdm_id: sourceBdmId,
      log_type: 'STATUS_CHANGE',
      target_ref: transfer._id.toString(),
      target_model: 'InterCompanyTransfer',
      field_changed: 'status',
      old_value: 'APPROVED',
      new_value: 'SHIPPED',
      changed_by: shippedBy,
      note: `IC Transfer ${transfer.transfer_ref} shipped: ${transfer.line_items.length} item(s)`
    });

    return transfer;
  } finally {
    await session.endSession();
  }
};

/**
 * Receive a transfer — SHIPPED → RECEIVED
 * Creates TRANSFER_IN ledger entries in target entity.
 * Auto-creates ProductMaster in target entity if not exists (Phase 4B.6).
 */
const receiveTransfer = async (transferId, receivedBy) => {
  const transfer = await InterCompanyTransfer.findById(transferId);
  if (!transfer) throw new Error('Transfer not found');
  if (transfer.status !== 'SHIPPED') {
    throw new Error(`Cannot receive transfer in ${transfer.status} status. Must be SHIPPED.`);
  }

  // Use explicit target_bdm_id, fallback to first BDM in target entity
  let targetBdmId = transfer.target_bdm_id;
  if (!targetBdmId) {
    const targetBdm = await User.findOne({
      entity_id: transfer.target_entity_id,
      role: 'employee',
      isActive: true
    }).select('_id').lean();
    targetBdmId = targetBdm ? targetBdm._id : receivedBy;
  }

  const session = await mongoose.startSession();
  try {
    let targetEvent;
    await session.withTransaction(async () => {
      const ledgerEntries = [];

      // Phase 17: target warehouse context
      const targetWarehouseId = transfer.target_warehouse_id;

      for (const item of transfer.line_items) {
        // Phase 4B.6 — Auto-create product in target entity if not exists
        await syncProductToTargetEntity(
          item.product_id, transfer.source_entity_id,
          transfer.target_entity_id, item.transfer_price, receivedBy
        );

        // Resolve the product_id in target entity
        const sourceProduct = await ProductMaster.findById(item.product_id).lean();
        let targetProduct = await ProductMaster.findOne({
          entity_id: transfer.target_entity_id,
          item_key: sourceProduct?.item_key || item.item_key
        }).lean();

        const targetProductId = targetProduct ? targetProduct._id : item.product_id;

        // Create TRANSFER_IN ledger entry
        ledgerEntries.push({
          entity_id: transfer.target_entity_id,
          bdm_id: targetBdmId,
          warehouse_id: targetWarehouseId || undefined,
          product_id: targetProductId,
          batch_lot_no: item.batch_lot_no || 'TRANSFER',
          expiry_date: item.expiry_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          transaction_type: 'TRANSFER_IN',
          qty_in: item.qty,
          qty_out: 0,
          recorded_by: receivedBy
        });
      }

      // Create TransactionEvent for target
      const [event] = await TransactionEvent.create([{
        entity_id: transfer.target_entity_id,
        bdm_id: targetBdmId,
        event_type: 'IC_RECEIPT',
        event_date: new Date(),
        document_ref: transfer.transfer_ref,
        payload: {
          transfer_id: transfer._id,
          source_entity_id: transfer.source_entity_id,
          line_items: transfer.line_items
        },
        created_by: receivedBy
      }], { session });

      targetEvent = event;

      // Create all ledger entries
      for (const entry of ledgerEntries) {
        entry.event_id = event._id;
        await InventoryLedger.create([entry], { session });
      }

      // Update transfer status
      transfer.status = 'RECEIVED';
      transfer.received_by = receivedBy;
      transfer.received_at = new Date();
      transfer.target_event_id = event._id;
      await transfer.save({ session });
    });

    await ErpAuditLog.logChange({
      entity_id: transfer.target_entity_id,
      bdm_id: targetBdmId,
      log_type: 'STATUS_CHANGE',
      target_ref: transfer._id.toString(),
      target_model: 'InterCompanyTransfer',
      field_changed: 'status',
      old_value: 'SHIPPED',
      new_value: 'RECEIVED',
      changed_by: receivedBy,
      note: `IC Transfer ${transfer.transfer_ref} received: ${transfer.line_items.length} item(s)`
    });

    return transfer;
  } finally {
    await session.endSession();
  }
};

/**
 * Post a transfer — RECEIVED → POSTED (final, immutable)
 */
const postTransfer = async (transferId, postedBy) => {
  const transfer = await InterCompanyTransfer.findById(transferId);
  if (!transfer) throw new Error('Transfer not found');
  if (transfer.status !== 'RECEIVED') {
    throw new Error(`Cannot post transfer in ${transfer.status} status. Must be RECEIVED.`);
  }

  transfer.status = 'POSTED';
  transfer.posted_by = postedBy;
  transfer.posted_at = new Date();
  await transfer.save();

  // Generate AR/AP TransactionEvents — MG owes VIP for the transferred stock
  const sourceBdmId = transfer.source_bdm_id || postedBy;
  const targetBdmId = transfer.target_bdm_id || postedBy;

  // AR: source entity (VIP) is owed money by target entity (MG)
  await TransactionEvent.create({
    entity_id: transfer.source_entity_id,
    bdm_id: sourceBdmId,
    event_type: 'IC_AR',
    event_date: new Date(),
    document_ref: transfer.transfer_ref,
    payload: {
      transfer_id: transfer._id,
      amount: transfer.total_amount,
      debtor_entity_id: transfer.target_entity_id,
      line_items: transfer.line_items
    },
    created_by: postedBy
  });

  // AP: target entity (MG) owes money to source entity (VIP)
  await TransactionEvent.create({
    entity_id: transfer.target_entity_id,
    bdm_id: targetBdmId,
    event_type: 'IC_AP',
    event_date: new Date(),
    document_ref: transfer.transfer_ref,
    payload: {
      transfer_id: transfer._id,
      amount: transfer.total_amount,
      creditor_entity_id: transfer.source_entity_id,
      line_items: transfer.line_items
    },
    created_by: postedBy
  });

  await ErpAuditLog.logChange({
    entity_id: transfer.source_entity_id,
    log_type: 'STATUS_CHANGE',
    target_ref: transfer._id.toString(),
    target_model: 'InterCompanyTransfer',
    field_changed: 'status',
    old_value: 'RECEIVED',
    new_value: 'POSTED',
    changed_by: postedBy,
    note: `IC Transfer ${transfer.transfer_ref} posted (final) — AR/AP created for ₱${transfer.total_amount}`
  });

  return transfer;
};

/**
 * Cancel a transfer — DRAFT/APPROVED → CANCELLED
 * If SHIPPED: reverse by creating ADJUSTMENT entries to restore source stock.
 */
const cancelTransfer = async (transferId, cancelledBy, reason) => {
  const transfer = await InterCompanyTransfer.findById(transferId);
  if (!transfer) throw new Error('Transfer not found');

  if (['POSTED', 'CANCELLED'].includes(transfer.status)) {
    throw new Error(`Cannot cancel transfer in ${transfer.status} status`);
  }

  const oldStatus = transfer.status;

  // If SHIPPED, reverse the TRANSFER_OUT entries
  if (transfer.status === 'SHIPPED') {
    const sourceBdm = await User.findOne({
      entity_id: transfer.source_entity_id,
      role: 'employee',
      isActive: true
    }).select('_id').lean();
    const sourceBdmId = sourceBdm ? sourceBdm._id : cancelledBy;

    for (const item of transfer.line_items) {
      await InventoryLedger.create({
        entity_id: transfer.source_entity_id,
        bdm_id: sourceBdmId,
        warehouse_id: transfer.source_warehouse_id || undefined,
        product_id: item.product_id,
        batch_lot_no: item.batch_lot_no || 'REVERSAL',
        expiry_date: item.expiry_date || new Date(),
        transaction_type: 'ADJUSTMENT',
        qty_in: item.qty,
        qty_out: 0,
        recorded_by: cancelledBy
      });
    }
  }

  // If RECEIVED, also reverse the TRANSFER_IN entries in target
  if (transfer.status === 'RECEIVED') {
    const targetBdm = await User.findOne({
      entity_id: transfer.target_entity_id,
      role: 'employee',
      isActive: true
    }).select('_id').lean();
    const targetBdmId = targetBdm ? targetBdm._id : cancelledBy;

    for (const item of transfer.line_items) {
      // Reverse target TRANSFER_IN
      await InventoryLedger.create({
        entity_id: transfer.target_entity_id,
        bdm_id: targetBdmId,
        warehouse_id: transfer.target_warehouse_id || undefined,
        product_id: item.product_id,
        batch_lot_no: item.batch_lot_no || 'REVERSAL',
        expiry_date: item.expiry_date || new Date(),
        transaction_type: 'ADJUSTMENT',
        qty_in: 0,
        qty_out: item.qty,
        recorded_by: cancelledBy
      });
    }

    // Also reverse source TRANSFER_OUT
    const sourceBdm = await User.findOne({
      entity_id: transfer.source_entity_id,
      role: 'employee',
      isActive: true
    }).select('_id').lean();
    const sourceBdmId = sourceBdm ? sourceBdm._id : cancelledBy;

    for (const item of transfer.line_items) {
      await InventoryLedger.create({
        entity_id: transfer.source_entity_id,
        bdm_id: sourceBdmId,
        warehouse_id: transfer.source_warehouse_id || undefined,
        product_id: item.product_id,
        batch_lot_no: item.batch_lot_no || 'REVERSAL',
        expiry_date: item.expiry_date || new Date(),
        transaction_type: 'ADJUSTMENT',
        qty_in: item.qty,
        qty_out: 0,
        recorded_by: cancelledBy
      });
    }
  }

  transfer.status = 'CANCELLED';
  transfer.cancelled_by = cancelledBy;
  transfer.cancelled_at = new Date();
  transfer.cancel_reason = reason || '';
  await transfer.save();

  await ErpAuditLog.logChange({
    entity_id: transfer.source_entity_id,
    log_type: 'STATUS_CHANGE',
    target_ref: transfer._id.toString(),
    target_model: 'InterCompanyTransfer',
    field_changed: 'status',
    old_value: oldStatus,
    new_value: 'CANCELLED',
    changed_by: cancelledBy,
    note: `IC Transfer ${transfer.transfer_ref} cancelled: ${reason || 'No reason'}`
  });

  return transfer;
};

/**
 * Phase 4B.6 — Sync product to target entity on transfer receive.
 * If target entity doesn't have a ProductMaster record for this product, auto-create one.
 */
async function syncProductToTargetEntity(sourceProductId, sourceEntityId, targetEntityId, transferPrice, userId) {
  const sourceProduct = await ProductMaster.findById(sourceProductId).lean();
  if (!sourceProduct) return;

  // Check if product already exists in target entity
  const existing = await ProductMaster.findOne({
    entity_id: targetEntityId,
    item_key: sourceProduct.item_key
  }).lean();

  if (existing) {
    // Flag price discrepancy if transfer_price != purchase_price
    if (transferPrice && existing.purchase_price !== transferPrice) {
      await ErpAuditLog.logChange({
        entity_id: targetEntityId,
        log_type: 'PRICE_CHANGE',
        target_ref: existing._id.toString(),
        target_model: 'ProductMaster',
        field_changed: 'purchase_price_discrepancy',
        old_value: existing.purchase_price,
        new_value: transferPrice,
        changed_by: userId,
        note: `Transfer price (${transferPrice}) differs from target purchase_price (${existing.purchase_price})`
      });
    }
    return;
  }

  // Auto-create in target entity
  await ProductMaster.create({
    entity_id: targetEntityId,
    item_key: sourceProduct.item_key,
    brand_name: sourceProduct.brand_name,
    generic_name: sourceProduct.generic_name,
    dosage_strength: sourceProduct.dosage_strength,
    sold_per: sourceProduct.sold_per,
    unit_code: sourceProduct.unit_code,
    vat_status: sourceProduct.vat_status,
    category: sourceProduct.category,
    purchase_price: transferPrice || sourceProduct.selling_price,
    selling_price: transferPrice || sourceProduct.selling_price,
    added_by: userId
  });

  await ErpAuditLog.logChange({
    entity_id: targetEntityId,
    log_type: 'ITEM_CHANGE',
    target_model: 'ProductMaster',
    field_changed: 'auto_created',
    new_value: sourceProduct.item_key,
    changed_by: userId,
    note: `Product auto-created from IC transfer: ${sourceProduct.brand_name} (${sourceProduct.item_key})`
  });
}

module.exports = {
  shipTransfer,
  receiveTransfer,
  postTransfer,
  cancelTransfer,
  syncProductToTargetEntity
};
