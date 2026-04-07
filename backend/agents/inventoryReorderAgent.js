/**
 * Inventory Reorder Agent (#6)
 * Runs daily at 6:30 AM
 *
 * Checks:
 * 1. Low stock alerts (stock <= 20 units per product per warehouse)
 * 2. Stockout alerts (stock <= 0)
 * 3. Slow consignment conversion (ACTIVE > 60 days, < 50% consumed)
 * 4. Office supply reorder alerts (qty_on_hand <= reorder_level)
 */

const { notify } = require('./notificationService');

async function run() {
  console.log('[InventoryReorder] Running...');
  try {
    const InventoryLedger = require('../erp/models/InventoryLedger');
    const ConsignmentTracker = require('../erp/models/ConsignmentTracker');
    const User = require('../models/User');

    const REORDER_LEVEL = 20;
    const alerts = [];

    // ─── 1 & 2. Stock levels per product per warehouse ─────────────
    try {
      const stockLevels = await InventoryLedger.aggregate([
        {
          $group: {
            _id: { product_id: '$product_id', warehouse_id: '$warehouse_id' },
            total_in: { $sum: '$qty_in' },
            total_out: { $sum: '$qty_out' },
            bdm_id: { $first: '$bdm_id' }
          }
        },
        {
          $addFields: {
            current_stock: { $subtract: ['$total_in', '$total_out'] }
          }
        },
        { $match: { current_stock: { $lte: REORDER_LEVEL } } },
        {
          $lookup: {
            from: 'erp_product_master',
            localField: '_id.product_id',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'erp_warehouses',
            localField: '_id.warehouse_id',
            foreignField: '_id',
            as: 'warehouse'
          }
        },
        { $unwind: { path: '$warehouse', preserveNullAndEmptyArrays: true } },
        { $sort: { current_stock: 1 } },
        { $limit: 100 }
      ]);

      for (const item of stockLevels) {
        const productName = item.product?.brand_name || item.product?.generic_name || String(item._id.product_id);
        const warehouseName = item.warehouse?.name || String(item._id.warehouse_id || 'Unknown');
        const stock = item.current_stock;

        if (stock <= 0) {
          alerts.push({
            type: 'STOCKOUT',
            severity: 'critical',
            detail: `STOCKOUT: ${productName} at ${warehouseName} — stock: ${stock}`,
            bdm_id: item.bdm_id,
            product: productName,
            warehouse: warehouseName
          });
        } else {
          alerts.push({
            type: 'LOW_STOCK',
            severity: 'warning',
            detail: `LOW STOCK: ${productName} at ${warehouseName} — stock: ${stock} (reorder at ${REORDER_LEVEL})`,
            bdm_id: item.bdm_id,
            product: productName,
            warehouse: warehouseName
          });
        }
      }
    } catch (err) {
      console.error('[InventoryReorder] Stock level check failed:', err.message);
    }

    // ─── 3. Slow consignment conversion ────────────────────────────
    try {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const slowConsignments = await ConsignmentTracker.aggregate([
        {
          $match: {
            status: 'ACTIVE',
            created_at: { $lt: sixtyDaysAgo }
          }
        },
        {
          $addFields: {
            conversion_ratio: {
              $cond: [
                { $gt: ['$qty_delivered', 0] },
                { $divide: ['$qty_consumed', '$qty_delivered'] },
                0
              ]
            }
          }
        },
        { $match: { conversion_ratio: { $lt: 0.5 } } },
        {
          $lookup: {
            from: 'erp_product_master',
            localField: 'product_id',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        { $sort: { created_at: 1 } },
        { $limit: 50 }
      ]);

      for (const c of slowConsignments) {
        const productName = c.product?.brand_name || c.product?.generic_name || String(c.product_id);
        const daysOpen = Math.floor((Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24));
        const pct = ((c.qty_consumed / c.qty_delivered) * 100).toFixed(0);

        alerts.push({
          type: 'SLOW_CONVERSION',
          severity: 'warning',
          detail: `SLOW CONVERSION: ${productName} at ${c.hospital_name || 'Unknown hospital'} — DR# ${c.dr_ref}, ${daysOpen} days open, ${pct}% consumed (${c.qty_consumed}/${c.qty_delivered})`,
          bdm_id: c.bdm_id,
          product: productName
        });
      }
    } catch (err) {
      console.error('[InventoryReorder] Slow conversion check failed:', err.message);
    }

    // ─── 4. Office supply reorder ──────────────────────────────────
    try {
      const OfficeSupply = require('../erp/models/OfficeSupply');

      const lowSupplies = await OfficeSupply.find({
        is_active: true,
        $expr: { $lte: ['$qty_on_hand', '$reorder_level'] }
      }).lean();

      for (const supply of lowSupplies) {
        alerts.push({
          type: 'OFFICE_SUPPLY_REORDER',
          severity: 'info',
          detail: `OFFICE SUPPLY: ${supply.item_name} (${supply.item_code || 'no code'}) — on hand: ${supply.qty_on_hand}, reorder level: ${supply.reorder_level}`,
          product: supply.item_name
        });
      }
    } catch (err) {
      console.error('[InventoryReorder] Office supply check failed:', err.message);
    }

    // ─── Send notifications ────────────────────────────────────────
    if (alerts.length > 0) {
      // Summary to PRESIDENT
      const critical = alerts.filter(a => a.severity === 'critical');
      const warnings = alerts.filter(a => a.severity === 'warning');
      const info = alerts.filter(a => a.severity === 'info');

      let body = `Inventory Reorder Report — ${new Date().toLocaleDateString()}\n\n`;
      body += `Total alerts: ${alerts.length} (${critical.length} critical, ${warnings.length} warnings, ${info.length} info)\n\n`;

      if (critical.length > 0) {
        body += '=== CRITICAL — STOCKOUTS ===\n';
        for (const a of critical) body += `  - ${a.detail}\n`;
        body += '\n';
      }
      if (warnings.length > 0) {
        body += '=== WARNINGS ===\n';
        for (const a of warnings) body += `  - ${a.detail}\n`;
        body += '\n';
      }
      if (info.length > 0) {
        body += '=== INFO — OFFICE SUPPLIES ===\n';
        for (const a of info) body += `  - ${a.detail}\n`;
        body += '\n';
      }

      await notify({
        recipient_id: 'PRESIDENT',
        title: `Inventory Alerts (${critical.length} critical, ${alerts.length} total)`,
        body,
        category: 'system',
        priority: critical.length > 0 ? 'high' : 'important',
        channels: ['in_app', 'email'],
        agent: 'inventory_reorder'
      });

      // Individual alerts to BDMs responsible for each warehouse
      const bdmAlerts = {};
      for (const a of alerts) {
        if (a.bdm_id) {
          const key = String(a.bdm_id);
          if (!bdmAlerts[key]) bdmAlerts[key] = [];
          bdmAlerts[key].push(a.detail);
        }
      }

      for (const [bdmId, details] of Object.entries(bdmAlerts)) {
        try {
          const alertBody = `Inventory alerts for your warehouse:\n\n${details.map(d => `- ${d}`).join('\n')}`;
          await notify({
            recipient_id: bdmId,
            title: `Inventory Alert: ${details.length} item(s) need attention`,
            body: alertBody,
            category: 'system',
            priority: 'important',
            channels: ['in_app'],
            agent: 'inventory_reorder'
          });
        } catch (err) {
          // Skip individual BDM notification errors
        }
      }
    }

    console.log(`[InventoryReorder] Complete. Found ${alerts.length} alerts.`);
  } catch (err) {
    console.error('[InventoryReorder] Error:', err.message);
  }
}

module.exports = { run };
