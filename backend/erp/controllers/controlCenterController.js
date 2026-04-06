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

  // Period locks for current month
  const lockedModules = periodLocksCurrent.filter(p => p.is_locked).length;
  const totalModules = 10; // SALES, COLLECTION, EXPENSE, JOURNAL, PAYROLL, PURCHASING, INVENTORY, BANKING, PETTY_CASH, IC_TRANSFER

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
      lookups: {
        categories_configured: lookupCategories.length,
        total_available: 16
      },
      settings: {
        last_updated: settings.updatedAt || null
      }
    }
  });
});
