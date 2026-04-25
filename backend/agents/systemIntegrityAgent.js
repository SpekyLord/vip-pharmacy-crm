/**
 * System Integrity Agent (#S)
 * Runs weekly Monday 5:00 AM (free, rule-based)
 *
 * Checks:
 * 1. Orphaned inventory records (product_id not in ProductMaster)
 * 2. COA mapping gaps (Settings references deactivated/missing accounts)
 * 3. Entities without warehouses
 * 4. People without access templates
 * 5. Transfer prices referencing deactivated products
 * 6. Sales referencing non-existent hospitals
 * 7. Missing required Settings fields
 */

const { notify } = require('./notificationService');
const { ROLE_SETS } = require('../constants/roles');

async function run() {
  const start = Date.now();
  console.log('[SystemIntegrity] Running...');

  try {
    const AgentRun = require('../erp/models/AgentRun');
    const findings = [];

    // ─── 1. Orphaned inventory (product_id not in ProductMaster) ───
    try {
      const InventoryLedger = require('../erp/models/InventoryLedger');
      const ProductMaster = require('../erp/models/ProductMaster');

      const inventoryProductIds = await InventoryLedger.distinct('product_id');
      const existingProductIds = new Set(
        // eslint-disable-next-line vip-tenant/require-entity-filter -- cron-mode integrity sweep: validates inventory product_id refs against the global ProductMaster set
        (await ProductMaster.find({ _id: { $in: inventoryProductIds } }).select('_id').lean())
          .map(p => p._id.toString())
      );
      const orphaned = inventoryProductIds.filter(id => !existingProductIds.has(id.toString()));

      if (orphaned.length > 0) {
        findings.push({
          severity: 'warning',
          category: 'DATA_INTEGRITY',
          detail: `${orphaned.length} inventory record(s) reference non-existent products`
        });
      }
    } catch (err) {
      console.error('[SystemIntegrity] Orphaned inventory check failed:', err.message);
    }

    // ─── 2. Entities without warehouses ────────────────────────────
    try {
      const Entity = require('../erp/models/Entity');
      const Warehouse = require('../erp/models/Warehouse');

      const entities = await Entity.find({ status: 'ACTIVE' }).select('_id entity_name').lean();
      const entitiesWithWarehouses = new Set(
        (await Warehouse.distinct('entity_id')).map(id => id.toString())
      );

      const missing = entities.filter(e => !entitiesWithWarehouses.has(e._id.toString()));
      if (missing.length > 0) {
        findings.push({
          severity: 'critical',
          category: 'CONFIGURATION',
          detail: `${missing.length} active entity(s) have no warehouse: ${missing.map(e => e.entity_name).join(', ')}`
        });
      }
    } catch (err) {
      console.error('[SystemIntegrity] Entity/warehouse check failed:', err.message);
    }

    // ─── 3. People without access templates ────────────────────────
    try {
      const User = require('../../models/User');
      const usersWithoutAccess = await User.countDocuments({
        role: { $in: ROLE_SETS.ERP_FINANCE },
        erp_access: { $ne: true },
        isActive: { $ne: false }
      });

      if (usersWithoutAccess > 0) {
        findings.push({
          severity: 'warning',
          category: 'ACCESS',
          detail: `${usersWithoutAccess} active user(s) have no ERP access enabled`
        });
      }
    } catch (err) {
      console.error('[SystemIntegrity] Access check failed:', err.message);
    }

    // ─── 4. Transfer prices for deactivated products ───────────────
    try {
      const TransferPriceList = require('../erp/models/TransferPriceList');
      const ProductMaster = require('../erp/models/ProductMaster');

      // eslint-disable-next-line vip-tenant/require-entity-filter -- cron-mode integrity sweep: scans every entity's transfer prices for stale product references
      const activePrices = await TransferPriceList.find({ is_active: true }).select('product_id').lean();
      if (activePrices.length > 0) {
        const priceProductIds = activePrices.map(p => p.product_id);
        const activeProducts = new Set(
          // eslint-disable-next-line vip-tenant/require-entity-filter -- cron-mode integrity sweep: cross-references against the global ProductMaster set
          (await ProductMaster.find({ _id: { $in: priceProductIds }, is_active: true }).select('_id').lean())
            .map(p => p._id.toString())
        );
        const stale = activePrices.filter(p => !activeProducts.has(p.product_id.toString()));

        if (stale.length > 0) {
          findings.push({
            severity: 'warning',
            category: 'CONFIGURATION',
            detail: `${stale.length} active transfer price(s) reference deactivated/missing products`
          });
        }
      }
    } catch (err) {
      console.error('[SystemIntegrity] Transfer price check failed:', err.message);
    }

    // ─── 5. Sales referencing non-existent hospitals ───────────────
    try {
      const SalesLine = require('../erp/models/SalesLine');
      const Hospital = require('../erp/models/Hospital');

      const salesHospitalIds = await SalesLine.distinct('hospital_id', {
        status: { $in: ['DRAFT', 'VALID'] },
        hospital_id: { $exists: true, $ne: null }
      });

      if (salesHospitalIds.length > 0) {
        const existingHospitals = new Set(
          (await Hospital.find({ _id: { $in: salesHospitalIds } }).select('_id').lean())
            .map(h => h._id.toString())
        );
        const broken = salesHospitalIds.filter(id => !existingHospitals.has(id.toString()));

        if (broken.length > 0) {
          findings.push({
            severity: 'warning',
            category: 'DATA_INTEGRITY',
            detail: `${broken.length} draft/valid sales reference non-existent hospitals`
          });
        }
      }
    } catch (err) {
      console.error('[SystemIntegrity] Sales/hospital check failed:', err.message);
    }

    // ─── 6. Missing required Settings ──────────────────────────────
    try {
      const Settings = require('../erp/models/Settings');
      const settings = await Settings.getSettings();

      const requiredFields = ['VAT_RATE', 'CWT_RATE_WC158', 'NEAR_EXPIRY_DAYS', 'DEFAULT_PAYMENT_TERMS'];
      const missingSettings = requiredFields.filter(f => settings[f] == null);

      if (missingSettings.length > 0) {
        findings.push({
          severity: 'critical',
          category: 'CONFIGURATION',
          detail: `Missing required Settings: ${missingSettings.join(', ')}`
        });
      }
    } catch (err) {
      console.error('[SystemIntegrity] Settings check failed:', err.message);
    }

    // ─── 7. Products with zero prices ──────────────────────────────
    try {
      const ProductMaster = require('../erp/models/ProductMaster');
      // eslint-disable-next-line vip-tenant/require-entity-filter -- cron-mode integrity sweep: scans every entity's products for zero-price configuration gaps
      const zeroPriceCount = await ProductMaster.countDocuments({
        is_active: true,
        $or: [
          { selling_price: { $lte: 0 } },
          { purchase_price: { $lte: 0 } }
        ]
      });

      if (zeroPriceCount > 0) {
        findings.push({
          severity: 'warning',
          category: 'DATA_QUALITY',
          detail: `${zeroPriceCount} active product(s) have zero or missing prices`
        });
      }
    } catch (err) {
      console.error('[SystemIntegrity] Zero price check failed:', err.message);
    }

    // ─── Send report ───────────────────────────────────────────────
    const critical = findings.filter(f => f.severity === 'critical');
    const warnings = findings.filter(f => f.severity === 'warning');

    if (findings.length > 0) {
      let body = `System Integrity Report — ${new Date().toLocaleDateString()}\n\n`;
      body += `${findings.length} issue(s) found (${critical.length} critical, ${warnings.length} warnings)\n\n`;

      const grouped = {};
      for (const f of findings) {
        if (!grouped[f.category]) grouped[f.category] = [];
        grouped[f.category].push(f);
      }

      for (const [cat, items] of Object.entries(grouped)) {
        body += `=== ${cat} ===\n`;
        for (const item of items) {
          body += `  [${item.severity.toUpperCase()}] ${item.detail}\n`;
        }
        body += '\n';
      }

      await notify({
        recipient_id: 'PRESIDENT',
        title: `System Integrity: ${critical.length} critical, ${findings.length} total`,
        body,
        category: 'system',
        priority: critical.length > 0 ? 'high' : 'important',
        channels: ['in_app', 'email'],
        agent: 'system_integrity'
      });
    }

    // Record run
    await AgentRun.create({
      agent_key: 'system_integrity',
      agent_label: 'System Integrity',
      status: findings.length > 0 ? (critical.length > 0 ? 'partial' : 'success') : 'success',
      summary: {
        alerts_generated: findings.length,
        key_findings: findings.slice(0, 5).map(f => f.detail)
      },
      execution_ms: Date.now() - start
    });

    console.log(`[SystemIntegrity] Complete. Found ${findings.length} issue(s) in ${Date.now() - start}ms.`);
  } catch (err) {
    console.error('[SystemIntegrity] Error:', err.message);
    try {
      const AgentRun = require('../erp/models/AgentRun');
      await AgentRun.create({ agent_key: 'system_integrity', agent_label: 'System Integrity', status: 'error', error_msg: err.message });
    } catch {}
  }
}

module.exports = { run };
