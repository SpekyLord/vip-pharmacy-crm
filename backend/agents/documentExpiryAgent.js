/**
 * Document Expiry Agent (#10)
 */

const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

async function run() {
  console.log('[DocumentExpiry] Running...');

  const alerts = [];
  const now = new Date();

  try {
    const CsiBooklet = require('../erp/models/CsiBooklet');

    const lowBooklets = await CsiBooklet.find({
      status: 'ACTIVE',
      remaining_count: { $lt: 20, $gt: 0 },
    }).lean();

    for (const booklet of lowBooklets) {
      alerts.push({
        type: 'CSI_BOOKLET_LOW',
        severity: 'warning',
        detail: `CSI Booklet "${booklet.booklet_code}" almost full - ${booklet.remaining_count} numbers remaining (series ${booklet.series_start}-${booklet.series_end})`,
      });
    }

    const exhaustedBooklets = await CsiBooklet.find({
      status: 'ACTIVE',
      remaining_count: { $lte: 0 },
    }).lean();

    for (const booklet of exhaustedBooklets) {
      alerts.push({
        type: 'CSI_BOOKLET_EXHAUSTED',
        severity: 'critical',
        detail: `CSI Booklet "${booklet.booklet_code}" is exhausted - 0 numbers remaining. Needs replacement.`,
      });
    }
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') {
      console.error('[DocumentExpiry] CSI Booklet check failed:', err.message);
    }
  }

  try {
    const InventoryLedger = require('../erp/models/InventoryLedger');
    const ninetyDaysFromNow = new Date(now);
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

    const expiringBatches = await InventoryLedger.aggregate([
      { $match: { expiry_date: { $lte: ninetyDaysFromNow, $gte: now } } },
      {
        $group: {
          _id: { product_id: '$product_id', batch_lot_no: '$batch_lot_no' },
          total_in: { $sum: '$qty_in' },
          total_out: { $sum: '$qty_out' },
          expiry_date: { $first: '$expiry_date' },
          bdm_ids: { $addToSet: '$bdm_id' },
        },
      },
      { $addFields: { current_stock: { $subtract: ['$total_in', '$total_out'] } } },
      { $match: { current_stock: { $gt: 0 } } },
      {
        $lookup: {
          from: 'erp_product_master',
          localField: '_id.product_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      { $sort: { expiry_date: 1 } },
      { $limit: 100 },
    ]);

    for (const batch of expiringBatches) {
      const productName = batch.product ? `${batch.product.brand_name} ${batch.product.dosage_strength || ''}`.trim() : String(batch._id.product_id);
      const daysToExpiry = Math.floor((new Date(batch.expiry_date) - now) / (1000 * 60 * 60 * 24));

      alerts.push({
        type: 'PRODUCT_EXPIRY',
        severity: daysToExpiry <= 30 ? 'critical' : 'warning',
        detail: `${productName} batch ${batch._id.batch_lot_no} - expires in ${daysToExpiry} days (${new Date(batch.expiry_date).toLocaleDateString()}), stock: ${batch.current_stock} units`,
        bdm_ids: batch.bdm_ids,
      });
    }

    const expiredWithStock = await InventoryLedger.aggregate([
      { $match: { expiry_date: { $lt: now } } },
      {
        $group: {
          _id: { product_id: '$product_id', batch_lot_no: '$batch_lot_no' },
          total_in: { $sum: '$qty_in' },
          total_out: { $sum: '$qty_out' },
          expiry_date: { $first: '$expiry_date' },
          bdm_ids: { $addToSet: '$bdm_id' },
        },
      },
      { $addFields: { current_stock: { $subtract: ['$total_in', '$total_out'] } } },
      { $match: { current_stock: { $gt: 0 } } },
      {
        $lookup: {
          from: 'erp_product_master',
          localField: '_id.product_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      { $limit: 50 },
    ]);

    for (const batch of expiredWithStock) {
      const productName = batch.product ? `${batch.product.brand_name} ${batch.product.dosage_strength || ''}`.trim() : String(batch._id.product_id);
      const daysExpired = Math.floor((now - new Date(batch.expiry_date)) / (1000 * 60 * 60 * 24));

      alerts.push({
        type: 'PRODUCT_EXPIRED',
        severity: 'critical',
        detail: `EXPIRED: ${productName} batch ${batch._id.batch_lot_no} - expired ${daysExpired} days ago, ${batch.current_stock} units still in stock. Requires disposal/return.`,
        bdm_ids: batch.bdm_ids,
      });
    }
  } catch (err) {
    console.error('[DocumentExpiry] Product expiry check failed:', err.message);
  }

  try {
    const ConsignmentTracker = require('../erp/models/ConsignmentTracker');
    const sixtyDaysFromNow = new Date(now);
    sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

    const activeConsignments = await ConsignmentTracker.find({
      status: 'ACTIVE',
      batch_lot_no: { $exists: true, $ne: null },
    }).select('product_id batch_lot_no hospital_name dr_ref qty_remaining bdm_id').lean();

    if (activeConsignments.length > 0) {
      const orConditions = activeConsignments.slice(0, 100).map((consignment) => ({
        product_id: consignment.product_id,
        batch_lot_no: consignment.batch_lot_no,
      }));

      if (orConditions.length > 0) {
        const InventoryLedger = require('../erp/models/InventoryLedger');
        const batchExpiries = await InventoryLedger.aggregate([
          { $match: { $or: orConditions } },
          {
            $group: {
              _id: { product_id: '$product_id', batch_lot_no: '$batch_lot_no' },
              expiry_date: { $first: '$expiry_date' },
            },
          },
          { $match: { expiry_date: { $lte: sixtyDaysFromNow, $gte: now } } },
        ]);

        const expiryMap = new Map();
        for (const batch of batchExpiries) {
          expiryMap.set(`${batch._id.product_id}_${batch._id.batch_lot_no}`, batch.expiry_date);
        }

        for (const consignment of activeConsignments) {
          const expiryDate = expiryMap.get(`${consignment.product_id}_${consignment.batch_lot_no}`);
          if (!expiryDate || consignment.qty_remaining <= 0) continue;
          const daysToExpiry = Math.floor((new Date(expiryDate) - now) / (1000 * 60 * 60 * 24));
          alerts.push({
            type: 'CONSIGNMENT_EXPIRY',
            severity: daysToExpiry <= 30 ? 'critical' : 'warning',
            detail: `Consignment at ${consignment.hospital_name || 'Unknown'} (DR# ${consignment.dr_ref}): batch ${consignment.batch_lot_no} expires in ${daysToExpiry} days, ${consignment.qty_remaining} units remaining`,
            bdm_ids: consignment.bdm_id ? [consignment.bdm_id] : [],
          });
        }
      }
    }
  } catch (err) {
    console.error('[DocumentExpiry] Consignment expiry check failed:', err.message);
  }

  const notificationResults = [];
  if (alerts.length > 0) {
    const critical = alerts.filter((alert) => alert.severity === 'critical');
    const warnings = alerts.filter((alert) => alert.severity === 'warning');

    let body = `Document & Expiry Report - ${now.toLocaleDateString()}\n\n`;
    body += `Total alerts: ${alerts.length} (${critical.length} critical, ${warnings.length} warnings)\n\n`;

    const grouped = {};
    for (const alert of alerts) {
      if (!grouped[alert.type]) grouped[alert.type] = [];
      grouped[alert.type].push(alert);
    }

    for (const [type, items] of Object.entries(grouped)) {
      body += `=== ${type} (${items.length}) ===\n`;
      for (const item of items) {
        body += `  [${item.severity.toUpperCase()}] ${item.detail}\n`;
      }
      body += '\n';
    }

    notificationResults.push(
      ...(await notify({
        recipient_id: 'PRESIDENT',
        title: `Expiry Alerts: ${critical.length} critical, ${alerts.length} total`,
        body,
        category: 'system',
        priority: critical.length > 0 ? 'high' : 'important',
        channels: ['in_app', 'email'],
        agent: 'document_expiry',
      }))
    );

    const bdmAlerts = {};
    for (const alert of alerts) {
      for (const bdmId of alert.bdm_ids || []) {
        const key = String(bdmId);
        if (!bdmAlerts[key]) bdmAlerts[key] = [];
        bdmAlerts[key].push(alert.detail);
      }
    }

    for (const [bdmId, details] of Object.entries(bdmAlerts)) {
      notificationResults.push(
        ...(await notify({
          recipient_id: bdmId,
          title: `Product Expiry Alert: ${details.length} item(s)`,
          body: `The following products in your inventory are approaching or past expiry:\n\n${details.map((detail) => `- ${detail}`).join('\n')}`,
          category: 'system',
          priority: 'important',
          channels: ['in_app'],
          agent: 'document_expiry',
        }))
      );
    }
  }

  console.log(`[DocumentExpiry] Complete. Found ${alerts.length} alerts.`);

  const uniqueBdmIds = new Set(
    alerts.flatMap((alert) => (alert.bdm_ids || []).map((bdmId) => String(bdmId)))
  );

  return {
    status: 'success',
    summary: {
      bdms_processed: uniqueBdmIds.size,
      alerts_generated: alerts.length,
      messages_sent: countSuccessfulChannels(notificationResults, 'in_app'),
      key_findings: alerts.length ? alerts.slice(0, 5).map((alert) => alert.detail) : ['No document or expiry alerts detected.'],
    },
    message_ids: getInAppMessageIds(notificationResults),
  };
}

module.exports = { run };
