const Entity = require('../models/Entity');
const PeopleMaster = require('../models/PeopleMaster');
const AccessTemplate = require('../models/AccessTemplate');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const BankAccount = require('../models/BankAccount');
const CreditCard = require('../models/CreditCard');
const GovernmentRates = require('../models/GovernmentRates');
const Warehouse = require('../models/Warehouse');
const PeriodLock = require('../models/PeriodLock');
const Lookup = require('../models/Lookup');
const Settings = require('../models/Settings');
const { catchAsync } = require('../../middleware/errorHandler');

/**
 * Control Center Health Endpoint — Phase 24
 * Returns aggregated counts for the Foundation Health dashboard.
 */
exports.getHealth = catchAsync(async (req, res) => {
  const entityFilter = req.entityId ? { entity_id: req.entityId } : {};

  // Run all counts in parallel
  const [
    entities,
    peopleTotal,
    peopleActive,
    accessTemplates,
    coaCounts,
    bankAccounts,
    creditCards,
    govRateCounts,
    warehouses,
    periodLocksCurrent,
    lookupCategories,
    settings
  ] = await Promise.all([
    Entity.find({ status: 'ACTIVE' }).select('entity_name entity_type short_name').lean(),
    PeopleMaster.countDocuments({ ...entityFilter }),
    PeopleMaster.countDocuments({ ...entityFilter, is_active: true }),
    AccessTemplate.countDocuments({ ...entityFilter }),
    ChartOfAccounts.aggregate([
      { $match: { ...entityFilter, is_active: true } },
      { $group: { _id: '$account_type', count: { $sum: 1 } } }
    ]),
    BankAccount.countDocuments({ ...entityFilter, is_active: true }),
    CreditCard.countDocuments({ ...entityFilter, is_active: true }),
    GovernmentRates.aggregate([
      { $group: { _id: '$rate_type', count: { $sum: 1 } } }
    ]),
    Warehouse.countDocuments({ ...entityFilter, is_active: true }),
    (() => {
      const now = new Date();
      return PeriodLock.find({
        ...entityFilter,
        year: now.getFullYear(),
        month: now.getMonth() + 1
      }).lean();
    })(),
    Lookup.distinct('category', entityFilter),
    Settings.getSettings()
  ]);

  // Format COA breakdown
  const coaBreakdown = {};
  let coaTotal = 0;
  for (const row of coaCounts) {
    coaBreakdown[row._id] = row.count;
    coaTotal += row.count;
  }

  // Format government rates
  const govRates = {};
  for (const row of govRateCounts) {
    govRates[row._id] = row.count;
  }

  // Period locks for current month — derive total from PeriodLock enum so the
  // count never drifts when modules are added (Phase SG-Q2 W4 added 3 new keys).
  const lockedModules = periodLocksCurrent.filter(p => p.is_locked).length;
  const totalModules = PeriodLock.schema.path('module').enumValues.length;

  res.json({
    success: true,
    data: {
      entities: {
        count: entities.length,
        items: entities
      },
      people: {
        total: peopleTotal,
        active: peopleActive
      },
      access_templates: accessTemplates,
      coa: {
        total: coaTotal,
        breakdown: coaBreakdown
      },
      bank_accounts: bankAccounts,
      credit_cards: creditCards,
      government_rates: govRates,
      warehouses,
      period_locks: {
        current_month_locked: lockedModules,
        current_month_open: totalModules - lockedModules,
        total_modules: totalModules
      },
      lookups: (() => {
        // Denominator is the union of SEED_DEFAULTS keys + live DB categories so
        // runtime lazy-seeded categories (e.g. NOTIFICATION_CHANNELS, PDF_RENDERER)
        // never push the card above 100%. Numerator stays as live DB categories
        // for the entity. Matches the same union already used by lookupGenericController
        // when building the category picker list (line ~2035).
        //
        // SEED_DEFAULTS entries declared as empty arrays (e.g. PAYSLIP_PROXY_ROSTER —
        // admin populates one row per clerk on-demand, no canonical defaults) are
        // EXCLUDED from the denominator. They have nothing to seed, so they are not
        // "available to configure" until admin actually creates a row — at which
        // point they join the union via the live-DB side. Without this filter,
        // every entity that hasn't yet had admin add an on-demand row shows
        // Incomplete on the card (cosmetic-only, but bad first impression for
        // SaaS subscribers per Rule #19).
        const seedDefaults = require('./lookupGenericController').SEED_DEFAULTS || {};
        const seedKeys = Object.keys(seedDefaults).filter(k => Array.isArray(seedDefaults[k]) && seedDefaults[k].length > 0);
        const unionSize = new Set([...seedKeys, ...lookupCategories]).size;
        return {
          categories_configured: lookupCategories.length,
          total_available: unionSize || lookupCategories.length || seedKeys.length
        };
      })(),
      settings: {
        last_updated: settings.updatedAt || null
      }
    }
  });
});
