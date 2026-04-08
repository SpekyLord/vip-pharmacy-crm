/**
 * System Integrity Agent (#S)
 */

const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

async function run() {
  console.log('[SystemIntegrity] Running...');
  const findings = [];

  try {
    const InventoryLedger = require('../erp/models/InventoryLedger');
    const ProductMaster = require('../erp/models/ProductMaster');

    const inventoryProductIds = await InventoryLedger.distinct('product_id');
    const existingProductIds = new Set(
      (await ProductMaster.find({ _id: { $in: inventoryProductIds } }).select('_id').lean()).map((product) => product._id.toString())
    );
    const orphaned = inventoryProductIds.filter((id) => !existingProductIds.has(id.toString()));

    if (orphaned.length > 0) {
      findings.push({
        severity: 'warning',
        category: 'DATA_INTEGRITY',
        detail: `${orphaned.length} inventory record(s) reference non-existent products`,
      });
    }
  } catch (err) {
    console.error('[SystemIntegrity] Orphaned inventory check failed:', err.message);
  }

  try {
    const Entity = require('../erp/models/Entity');
    const Warehouse = require('../erp/models/Warehouse');

    const entities = await Entity.find({ status: 'ACTIVE' }).select('_id entity_name').lean();
    const entitiesWithWarehouses = new Set((await Warehouse.distinct('entity_id')).map((id) => id.toString()));
    const missing = entities.filter((entity) => !entitiesWithWarehouses.has(entity._id.toString()));

    if (missing.length > 0) {
      findings.push({
        severity: 'critical',
        category: 'CONFIGURATION',
        detail: `${missing.length} active entity(s) have no warehouse: ${missing.map((entity) => entity.entity_name).join(', ')}`,
      });
    }
  } catch (err) {
    console.error('[SystemIntegrity] Entity/warehouse check failed:', err.message);
  }

  try {
    const User = require('../models/User');
    const usersWithoutAccess = await User.countDocuments({
      role: { $in: ['employee', 'admin', 'finance'] },
      erp_access: { $ne: true },
      isActive: { $ne: false },
    });

    if (usersWithoutAccess > 0) {
      findings.push({
        severity: 'warning',
        category: 'ACCESS',
        detail: `${usersWithoutAccess} active user(s) have no ERP access enabled`,
      });
    }
  } catch (err) {
    console.error('[SystemIntegrity] Access check failed:', err.message);
  }

  try {
    const TransferPriceList = require('../erp/models/TransferPriceList');
    const ProductMaster = require('../erp/models/ProductMaster');

    const activePrices = await TransferPriceList.find({ is_active: true }).select('product_id').lean();
    if (activePrices.length > 0) {
      const priceProductIds = activePrices.map((price) => price.product_id);
      const activeProducts = new Set(
        (await ProductMaster.find({ _id: { $in: priceProductIds }, is_active: true }).select('_id').lean()).map((product) => product._id.toString())
      );
      const stale = activePrices.filter((price) => !activeProducts.has(price.product_id.toString()));

      if (stale.length > 0) {
        findings.push({
          severity: 'warning',
          category: 'CONFIGURATION',
          detail: `${stale.length} active transfer price(s) reference deactivated/missing products`,
        });
      }
    }
  } catch (err) {
    console.error('[SystemIntegrity] Transfer price check failed:', err.message);
  }

  try {
    const SalesLine = require('../erp/models/SalesLine');
    const Hospital = require('../erp/models/Hospital');

    const salesHospitalIds = await SalesLine.distinct('hospital_id', {
      status: { $in: ['DRAFT', 'VALID'] },
      hospital_id: { $exists: true, $ne: null },
    });

    if (salesHospitalIds.length > 0) {
      const existingHospitals = new Set(
        (await Hospital.find({ _id: { $in: salesHospitalIds } }).select('_id').lean()).map((hospital) => hospital._id.toString())
      );
      const broken = salesHospitalIds.filter((id) => !existingHospitals.has(id.toString()));

      if (broken.length > 0) {
        findings.push({
          severity: 'warning',
          category: 'DATA_INTEGRITY',
          detail: `${broken.length} draft/valid sales reference non-existent hospitals`,
        });
      }
    }
  } catch (err) {
    console.error('[SystemIntegrity] Sales/hospital check failed:', err.message);
  }

  try {
    const Settings = require('../erp/models/Settings');
    const settings = await Settings.getSettings();
    const requiredFields = ['VAT_RATE', 'CWT_RATE_WC158', 'NEAR_EXPIRY_DAYS', 'DEFAULT_PAYMENT_TERMS'];
    const missingSettings = requiredFields.filter((field) => settings[field] == null);

    if (missingSettings.length > 0) {
      findings.push({
        severity: 'critical',
        category: 'CONFIGURATION',
        detail: `Missing required Settings: ${missingSettings.join(', ')}`,
      });
    }
  } catch (err) {
    console.error('[SystemIntegrity] Settings check failed:', err.message);
  }

  try {
    const ProductMaster = require('../erp/models/ProductMaster');
    const zeroPriceCount = await ProductMaster.countDocuments({
      is_active: true,
      $or: [{ selling_price: { $lte: 0 } }, { purchase_price: { $lte: 0 } }],
    });

    if (zeroPriceCount > 0) {
      findings.push({
        severity: 'warning',
        category: 'DATA_QUALITY',
        detail: `${zeroPriceCount} active product(s) have zero or missing prices`,
      });
    }
  } catch (err) {
    console.error('[SystemIntegrity] Zero price check failed:', err.message);
  }

  const critical = findings.filter((finding) => finding.severity === 'critical');
  const warnings = findings.filter((finding) => finding.severity === 'warning');
  const notificationResults = [];

  if (findings.length > 0) {
    let body = `System Integrity Report - ${new Date().toLocaleDateString()}\n\n`;
    body += `${findings.length} issue(s) found (${critical.length} critical, ${warnings.length} warnings)\n\n`;

    const grouped = {};
    for (const finding of findings) {
      if (!grouped[finding.category]) grouped[finding.category] = [];
      grouped[finding.category].push(finding);
    }

    for (const [category, items] of Object.entries(grouped)) {
      body += `=== ${category} ===\n`;
      for (const item of items) {
        body += `  [${item.severity.toUpperCase()}] ${item.detail}\n`;
      }
      body += '\n';
    }

    notificationResults.push(
      ...(await notify({
        recipient_id: 'PRESIDENT',
        title: `System Integrity: ${critical.length} critical, ${findings.length} total`,
        body,
        category: 'system',
        priority: critical.length > 0 ? 'high' : 'important',
        channels: ['in_app', 'email'],
        agent: 'system_integrity',
      }))
    );
  }

  console.log(`[SystemIntegrity] Complete. Found ${findings.length} issue(s).`);

  return {
    status: findings.length > 0 && critical.length > 0 ? 'partial' : 'success',
    summary: {
      bdms_processed: 0,
      alerts_generated: findings.length,
      messages_sent: countSuccessfulChannels(notificationResults, 'in_app'),
      key_findings: findings.length ? findings.slice(0, 5).map((finding) => finding.detail) : ['No system integrity issues found.'],
    },
    message_ids: getInAppMessageIds(notificationResults),
  };
}

module.exports = { run };
