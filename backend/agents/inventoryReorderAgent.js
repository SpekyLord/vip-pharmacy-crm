/**
 * Inventory Reorder Agent (#6)
 */

const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

/**
 * Lookup-driven recipient routing for the entity-wide inventory roll-up.
 *
 * Returns the union of sub-permission codes from INVENTORY_ALERT_RECIPIENTS
 * across all entities (this agent runs globally, not per-entity). Admin edits
 * the lookup in Control Center to redirect alerts away from PRESIDENT to a
 * purchasing officer / inventory manager / eBDM-with-purchasing-add-on.
 *
 * Tenant-scoping caveat: the entity-wide roll-up message currently aggregates
 * alerts from every entity into one body. As long as recipient routing pulls
 * in a centralized purchasing function (typical for VIP today — purchasing
 * sits at the parent entity with multi-entity access), no tenant data leaks.
 * For subsidiary purchasing officers with single-entity access, the next
 * refactor groups alerts by entity_id and sends one message per entity (so
 * the recipient resolver's entityId filter can clamp visibility). Tracked
 * as a follow-up — non-blocking for VIP today.
 */
async function loadAlertRecipients() {
  try {
    const Lookup = require('../erp/models/Lookup');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- global cron: union sub-perm codes across all entities
    const rows = await Lookup.find({
      category: 'INVENTORY_ALERT_RECIPIENTS',
      is_active: true,
    }).select('code').lean();
    return [...new Set(rows.map((r) => r.code).filter(Boolean))];
  } catch (err) {
    console.warn('[InventoryReorder] loadAlertRecipients failed, falling back to PRESIDENT:', err.message);
    return [];
  }
}

async function run() {
  console.log('[InventoryReorder] Running...');

  const InventoryLedger = require('../erp/models/InventoryLedger');
  const ConsignmentTracker = require('../erp/models/ConsignmentTracker');

  const REORDER_LEVEL = 20;
  const alerts = [];

  try {
    // eslint-disable-next-line vip-tenant/require-entity-filter -- global cron: scans stock levels per (product, warehouse) across all entities for low-stock/reorder alerts
    const stockLevels = await InventoryLedger.aggregate([
      {
        $group: {
          _id: { product_id: '$product_id', warehouse_id: '$warehouse_id' },
          total_in: { $sum: '$qty_in' },
          total_out: { $sum: '$qty_out' },
          bdm_id: { $first: '$bdm_id' },
        },
      },
      {
        $addFields: {
          current_stock: { $subtract: ['$total_in', '$total_out'] },
        },
      },
      { $match: { current_stock: { $lte: REORDER_LEVEL } } },
      {
        $lookup: {
          from: 'erp_product_master',
          localField: '_id.product_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'erp_warehouses',
          localField: '_id.warehouse_id',
          foreignField: '_id',
          as: 'warehouse',
        },
      },
      { $unwind: { path: '$warehouse', preserveNullAndEmptyArrays: true } },
      { $sort: { current_stock: 1 } },
      { $limit: 100 },
    ]);

    for (const item of stockLevels) {
      const productName = item.product ? `${item.product.brand_name} ${item.product.dosage_strength || ''}`.trim() : String(item._id.product_id);
      const warehouseName = item.warehouse?.warehouse_name || 'Unknown warehouse';
      const stock = item.current_stock;

      if (stock <= 0) {
        alerts.push({
          type: 'STOCKOUT',
          severity: 'critical',
          detail: `STOCKOUT: ${productName} at ${warehouseName} - stock: ${stock}`,
          bdm_id: item.bdm_id,
        });
      } else {
        alerts.push({
          type: 'LOW_STOCK',
          severity: 'warning',
          detail: `LOW STOCK: ${productName} at ${warehouseName} - stock: ${stock} (reorder at ${REORDER_LEVEL})`,
          bdm_id: item.bdm_id,
        });
      }
    }
  } catch (err) {
    console.error('[InventoryReorder] Stock level check failed:', err.message);
  }

  try {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // eslint-disable-next-line vip-tenant/require-entity-filter -- global cron: scans slow consignment conversions across all entities/hospitals
    const slowConsignments = await ConsignmentTracker.aggregate([
      {
        $match: {
          status: 'ACTIVE',
          created_at: { $lt: sixtyDaysAgo },
        },
      },
      {
        $addFields: {
          conversion_ratio: {
            $cond: [{ $gt: ['$qty_delivered', 0] }, { $divide: ['$qty_consumed', '$qty_delivered'] }, 0],
          },
        },
      },
      { $match: { conversion_ratio: { $lt: 0.5 } } },
      {
        $lookup: {
          from: 'erp_product_master',
          localField: 'product_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      { $sort: { created_at: 1 } },
      { $limit: 50 },
    ]);

    for (const consignment of slowConsignments) {
      const productName = consignment.product ? `${consignment.product.brand_name} ${consignment.product.dosage_strength || ''}`.trim() : String(consignment.product_id);
      const daysOpen = Math.floor((Date.now() - new Date(consignment.created_at).getTime()) / (1000 * 60 * 60 * 24));
      const pct = ((consignment.qty_consumed / consignment.qty_delivered) * 100).toFixed(0);

      alerts.push({
        type: 'SLOW_CONVERSION',
        severity: 'warning',
        detail: `SLOW CONVERSION: ${productName} at ${consignment.hospital_name || 'Unknown hospital'} - DR# ${consignment.dr_ref}, ${daysOpen} days open, ${pct}% consumed (${consignment.qty_consumed}/${consignment.qty_delivered})`,
        bdm_id: consignment.bdm_id,
      });
    }
  } catch (err) {
    console.error('[InventoryReorder] Slow conversion check failed:', err.message);
  }

  try {
    const OfficeSupply = require('../erp/models/OfficeSupply');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- global cron: scans office supplies across all entities for reorder-level alerts
    const lowSupplies = await OfficeSupply.find({
      is_active: true,
      $expr: { $lte: ['$qty_on_hand', '$reorder_level'] },
    }).lean();

    for (const supply of lowSupplies) {
      alerts.push({
        type: 'OFFICE_SUPPLY_REORDER',
        severity: 'info',
        detail: `OFFICE SUPPLY: ${supply.item_name} (${supply.item_code || 'no code'}) - on hand: ${supply.qty_on_hand}, reorder level: ${supply.reorder_level}`,
      });
    }
  } catch (err) {
    console.error('[InventoryReorder] Office supply check failed:', err.message);
  }

  const notificationResults = [];
  if (alerts.length > 0) {
    const critical = alerts.filter((alert) => alert.severity === 'critical');
    const warnings = alerts.filter((alert) => alert.severity === 'warning');
    const info = alerts.filter((alert) => alert.severity === 'info');

    let body = `Inventory Reorder Report - ${new Date().toLocaleDateString()}\n\n`;
    body += `Total alerts: ${alerts.length} (${critical.length} critical, ${warnings.length} warnings, ${info.length} info)\n\n`;

    if (critical.length > 0) {
      body += '=== CRITICAL - STOCKOUTS ===\n';
      for (const alert of critical) body += `  - ${alert.detail}\n`;
      body += '\n';
    }
    if (warnings.length > 0) {
      body += '=== WARNINGS ===\n';
      for (const alert of warnings) body += `  - ${alert.detail}\n`;
      body += '\n';
    }
    if (info.length > 0) {
      body += '=== INFO - OFFICE SUPPLIES ===\n';
      for (const alert of info) body += `  - ${alert.detail}\n`;
      body += '\n';
    }

    // Lookup-driven recipient resolution. Probe-then-route so we don't silently
    // send to nobody when the lookup is configured but no user yet holds the
    // sub-permissions — fall back to PRESIDENT in that case (same audience as
    // pre-Apr 2026 behavior).
    const subPermCodes = await loadAlertRecipients();
    let primaryRecipient = 'PRESIDENT';
    if (subPermCodes.length) {
      const User = require('../models/User');
      const probeQuery = {
        isActive: true,
        'erp_access.enabled': true,
        $or: subPermCodes
          .filter((code) => /^[A-Z]+__[A-Z0-9_]+$/.test(code))
          .map((code) => {
            const [moduleKey, ...rest] = code.toLowerCase().split('__');
            const subKey = rest.join('__');
            return { [`erp_access.sub_permissions.${moduleKey}.${subKey}`]: true };
          }),
      };
      const probeCount = probeQuery.$or.length ? await User.countDocuments(probeQuery) : 0;
      if (probeCount > 0) {
        primaryRecipient = `BY_SUB_PERMISSION:${subPermCodes.join(',')}`;
        console.log(`[InventoryReorder] Routing entity-wide roll-up to ${probeCount} sub-permission holder(s) — codes: ${subPermCodes.join(', ')}`);
      } else {
        console.log('[InventoryReorder] INVENTORY_ALERT_RECIPIENTS configured but no user holds the sub-permissions — falling back to PRESIDENT');
      }
    }

    notificationResults.push(
      ...(await notify({
        recipient_id: primaryRecipient,
        title: `Inventory Alerts (${critical.length} critical, ${alerts.length} total)`,
        body,
        category: 'system',
        priority: critical.length > 0 ? 'high' : 'important',
        channels: ['in_app', 'email'],
        agent: 'inventory_reorder',
      }))
    );

    const bdmAlerts = {};
    for (const alert of alerts) {
      if (!alert.bdm_id) continue;
      const key = String(alert.bdm_id);
      if (!bdmAlerts[key]) bdmAlerts[key] = [];
      bdmAlerts[key].push(alert.detail);
    }

    for (const [bdmId, details] of Object.entries(bdmAlerts)) {
      notificationResults.push(
        ...(await notify({
          recipient_id: bdmId,
          title: `Inventory Alert: ${details.length} item(s) need attention`,
          body: `Inventory alerts for your warehouse:\n\n${details.map((detail) => `- ${detail}`).join('\n')}`,
          category: 'system',
          priority: 'important',
          channels: ['in_app'],
          agent: 'inventory_reorder',
        }))
      );
    }
  }

  console.log(`[InventoryReorder] Complete. Found ${alerts.length} alerts.`);

  const uniqueBdmIds = new Set(alerts.map((alert) => alert.bdm_id?.toString()).filter(Boolean));
  return {
    status: 'success',
    summary: {
      bdms_processed: uniqueBdmIds.size,
      alerts_generated: alerts.length,
      messages_sent: countSuccessfulChannels(notificationResults, 'in_app'),
      key_findings: alerts.length ? alerts.slice(0, 5).map((alert) => alert.detail) : ['No inventory reorder alerts detected.'],
    },
    message_ids: getInAppMessageIds(notificationResults),
  };
}

module.exports = { run };
