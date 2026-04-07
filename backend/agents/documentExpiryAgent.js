/**
 * Document Expiry Agent (#10)
 * Runs daily at 7:30 AM
 *
 * Checks:
 * 1. CSI Booklet exhaustion (remaining < 20 numbers)
 * 2. Product batch expiry within 90 days (from InventoryLedger)
 * 3. Consignment products approaching expiry within 60 days
 *
 * TODO: Create a DocumentExpiry model for tracking BIR permits,
 * business licenses, SEC registration, FDA product registrations,
 * insurance policies, and other compliance documents. The model should
 * have fields: entity_id, document_type, document_name, expiry_date,
 * renewal_lead_days, responsible_user, status, reminder_sent_at.
 */

const { notify } = require('./notificationService');

async function run() {
  console.log('[DocumentExpiry] Running...');
  try {
    const alerts = [];
    const now = new Date();

    // ─── 1. CSI Booklet exhaustion ─────────────────────────────────
    try {
      const CsiBooklet = require('../erp/models/CsiBooklet');

      const lowBooklets = await CsiBooklet.find({
        status: 'ACTIVE',
        remaining_count: { $lt: 20, $gt: 0 }
      }).lean();

      for (const booklet of lowBooklets) {
        alerts.push({
          type: 'CSI_BOOKLET_LOW',
          severity: 'warning',
          detail: `CSI Booklet "${booklet.booklet_code}" almost full — ${booklet.remaining_count} numbers remaining (series ${booklet.series_start}-${booklet.series_end})`
        });
      }

      // Also check exhausted booklets still marked ACTIVE (edge case)
      const exhaustedBooklets = await CsiBooklet.find({
        status: 'ACTIVE',
        remaining_count: { $lte: 0 }
      }).lean();

      for (const booklet of exhaustedBooklets) {
        alerts.push({
          type: 'CSI_BOOKLET_EXHAUSTED',
          severity: 'critical',
          detail: `CSI Booklet "${booklet.booklet_code}" is EXHAUSTED — 0 numbers remaining. Needs replacement.`
        });
      }
    } catch (err) {
      // CsiBooklet model may not exist yet
      if (err.code !== 'MODULE_NOT_FOUND') {
        console.error('[DocumentExpiry] CSI Booklet check failed:', err.message);
      }
    }

    // ─── 2. Product batch expiry within 90 days ────────────────────
    try {
      const InventoryLedger = require('../erp/models/InventoryLedger');

      const ninetyDaysFromNow = new Date(now);
      ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

      // Find batches with positive stock that expire within 90 days
      const expiringBatches = await InventoryLedger.aggregate([
        {
          $match: {
            expiry_date: { $lte: ninetyDaysFromNow, $gte: now }
          }
        },
        {
          $group: {
            _id: { product_id: '$product_id', batch_lot_no: '$batch_lot_no' },
            total_in: { $sum: '$qty_in' },
            total_out: { $sum: '$qty_out' },
            expiry_date: { $first: '$expiry_date' },
            bdm_ids: { $addToSet: '$bdm_id' },
            warehouse_ids: { $addToSet: '$warehouse_id' }
          }
        },
        {
          $addFields: {
            current_stock: { $subtract: ['$total_in', '$total_out'] }
          }
        },
        { $match: { current_stock: { $gt: 0 } } },
        {
          $lookup: {
            from: 'erp_product_master',
            localField: '_id.product_id',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        { $sort: { expiry_date: 1 } },
        { $limit: 100 }
      ]);

      for (const batch of expiringBatches) {
        const productName = batch.product ? `${batch.product.brand_name} ${batch.product.dosage_strength || ''}`.trim() : String(batch._id.product_id);
        const daysToExpiry = Math.floor((new Date(batch.expiry_date) - now) / (1000 * 60 * 60 * 24));
        const severity = daysToExpiry <= 30 ? 'critical' : 'warning';

        alerts.push({
          type: 'PRODUCT_EXPIRY',
          severity,
          detail: `${productName} batch ${batch._id.batch_lot_no} — expires in ${daysToExpiry} days (${new Date(batch.expiry_date).toLocaleDateString()}), stock: ${batch.current_stock} units`,
          bdm_ids: batch.bdm_ids,
          product: productName,
          batch: batch._id.batch_lot_no,
          days_to_expiry: daysToExpiry
        });
      }

      // Also check already-expired batches with remaining stock
      const expiredWithStock = await InventoryLedger.aggregate([
        {
          $match: {
            expiry_date: { $lt: now }
          }
        },
        {
          $group: {
            _id: { product_id: '$product_id', batch_lot_no: '$batch_lot_no' },
            total_in: { $sum: '$qty_in' },
            total_out: { $sum: '$qty_out' },
            expiry_date: { $first: '$expiry_date' },
            bdm_ids: { $addToSet: '$bdm_id' }
          }
        },
        {
          $addFields: {
            current_stock: { $subtract: ['$total_in', '$total_out'] }
          }
        },
        { $match: { current_stock: { $gt: 0 } } },
        {
          $lookup: {
            from: 'erp_product_master',
            localField: '_id.product_id',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        { $limit: 50 }
      ]);

      for (const batch of expiredWithStock) {
        const productName = batch.product ? `${batch.product.brand_name} ${batch.product.dosage_strength || ''}`.trim() : String(batch._id.product_id);
        const daysExpired = Math.floor((now - new Date(batch.expiry_date)) / (1000 * 60 * 60 * 24));

        alerts.push({
          type: 'PRODUCT_EXPIRED',
          severity: 'critical',
          detail: `EXPIRED: ${productName} batch ${batch._id.batch_lot_no} — expired ${daysExpired} days ago, ${batch.current_stock} units still in stock. Requires disposal/return.`,
          bdm_ids: batch.bdm_ids,
          product: productName
        });
      }
    } catch (err) {
      console.error('[DocumentExpiry] Product expiry check failed:', err.message);
    }

    // ─── 3. Consignment products approaching expiry ────────────────
    try {
      const ConsignmentTracker = require('../erp/models/ConsignmentTracker');

      const sixtyDaysFromNow = new Date(now);
      sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

      // Check consignments with batches expiring within 60 days
      // ConsignmentTracker has batch_lot_no but not expiry_date directly;
      // cross-reference with InventoryLedger for expiry info
      const activeConsignments = await ConsignmentTracker.find({
        status: 'ACTIVE',
        batch_lot_no: { $exists: true, $ne: null }
      }).select('product_id batch_lot_no hospital_name dr_ref qty_remaining bdm_id').lean();

      if (activeConsignments.length > 0) {
        // Get expiry dates from InventoryLedger for these batches
        const batchKeys = activeConsignments.map(c => ({
          product_id: c.product_id,
          batch_lot_no: c.batch_lot_no
        }));

        // Build OR query for each batch
        const orConditions = batchKeys.map(k => ({
          product_id: k.product_id,
          batch_lot_no: k.batch_lot_no
        }));

        if (orConditions.length > 0) {
          const InventoryLedger = require('../erp/models/InventoryLedger');
          const batchExpiries = await InventoryLedger.aggregate([
            { $match: { $or: orConditions.slice(0, 100) } }, // Limit for performance
            {
              $group: {
                _id: { product_id: '$product_id', batch_lot_no: '$batch_lot_no' },
                expiry_date: { $first: '$expiry_date' }
              }
            },
            {
              $match: {
                expiry_date: { $lte: sixtyDaysFromNow, $gte: now }
              }
            }
          ]);

          const expiryMap = new Map();
          for (const b of batchExpiries) {
            expiryMap.set(`${b._id.product_id}_${b._id.batch_lot_no}`, b.expiry_date);
          }

          for (const c of activeConsignments) {
            const key = `${c.product_id}_${c.batch_lot_no}`;
            const expiryDate = expiryMap.get(key);
            if (expiryDate && c.qty_remaining > 0) {
              const daysToExpiry = Math.floor((new Date(expiryDate) - now) / (1000 * 60 * 60 * 24));
              alerts.push({
                type: 'CONSIGNMENT_EXPIRY',
                severity: daysToExpiry <= 30 ? 'critical' : 'warning',
                detail: `Consignment at ${c.hospital_name || 'Unknown'} (DR# ${c.dr_ref}): batch ${c.batch_lot_no} expires in ${daysToExpiry} days, ${c.qty_remaining} units remaining`,
                bdm_ids: c.bdm_id ? [c.bdm_id] : []
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('[DocumentExpiry] Consignment expiry check failed:', err.message);
    }

    // ─── Send notifications ────────────────────────────────────────
    if (alerts.length > 0) {
      const critical = alerts.filter(a => a.severity === 'critical');
      const warnings = alerts.filter(a => a.severity === 'warning');

      let body = `Document & Expiry Report — ${now.toLocaleDateString()}\n\n`;
      body += `Total alerts: ${alerts.length} (${critical.length} critical, ${warnings.length} warnings)\n\n`;

      // Group by type
      const grouped = {};
      for (const a of alerts) {
        if (!grouped[a.type]) grouped[a.type] = [];
        grouped[a.type].push(a);
      }

      for (const [type, items] of Object.entries(grouped)) {
        body += `=== ${type} (${items.length}) ===\n`;
        for (const item of items) {
          body += `  [${item.severity.toUpperCase()}] ${item.detail}\n`;
        }
        body += '\n';
      }

      // Notify PRESIDENT
      await notify({
        recipient_id: 'PRESIDENT',
        title: `Expiry Alerts: ${critical.length} critical, ${alerts.length} total`,
        body,
        category: 'system',
        priority: critical.length > 0 ? 'high' : 'important',
        channels: ['in_app', 'email'],
        agent: 'document_expiry'
      });

      // Notify individual BDMs for product expiry alerts
      const bdmAlerts = {};
      for (const a of alerts) {
        const bdmIds = a.bdm_ids || [];
        for (const bdmId of bdmIds) {
          const key = String(bdmId);
          if (!bdmAlerts[key]) bdmAlerts[key] = [];
          bdmAlerts[key].push(a.detail);
        }
      }

      for (const [bdmId, details] of Object.entries(bdmAlerts)) {
        try {
          await notify({
            recipient_id: bdmId,
            title: `Product Expiry Alert: ${details.length} item(s)`,
            body: `The following products in your inventory are approaching or past expiry:\n\n${details.map(d => `- ${d}`).join('\n')}`,
            category: 'system',
            priority: 'important',
            channels: ['in_app'],
            agent: 'document_expiry'
          });
        } catch (err) {
          // Skip individual BDM notification errors
        }
      }
    }

    console.log(`[DocumentExpiry] Complete. Found ${alerts.length} alerts.`);
  } catch (err) {
    console.error('[DocumentExpiry] Error:', err.message);
  }
}

module.exports = { run };
