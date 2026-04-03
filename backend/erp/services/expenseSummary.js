/**
 * Expense Summary Service — Consolidates 5 expense categories per cycle
 *
 * Categories:
 * 1. SMER Reimbursables (excl. Gasoline Personal)
 * 2. Gasoline less Personal (from Car Logbook)
 * 3. Partners' Insurance (sum of partner rebate entries from Collections)
 * 4. ACCESS Total (company-mode expenses)
 * 5. CORE (commission earned from Collections)
 */

const SmerEntry = require('../models/SmerEntry');
const CarLogbookEntry = require('../models/CarLogbookEntry');
const ExpenseEntry = require('../models/ExpenseEntry');
const PrfCalf = require('../models/PrfCalf');
const Collection = require('../models/Collection');
const { computePeriodFuelSummary } = require('./fuelTracker');

/**
 * Generate expense summary for a BDM's period+cycle
 * @param {String} entityId
 * @param {String} bdmId
 * @param {String} period - "2026-04"
 * @param {String} cycle - "C1" | "C2" | "MONTHLY"
 * @returns {Object} Consolidated summary
 */
async function generateExpenseSummary(entityId, bdmId, period, cycle) {
  const filter = { entity_id: entityId, bdm_id: bdmId, period, cycle };

  // 1. SMER Reimbursables
  const smer = await SmerEntry.findOne(filter).lean();
  const smerReimbursable = smer ? smer.total_reimbursable : 0;

  // 2. Gasoline less Personal (Car Logbook)
  const logbookEntries = await CarLogbookEntry.find({ ...filter, status: 'POSTED' }).lean();
  const fuelSummary = computePeriodFuelSummary(logbookEntries);
  const gasolineLessPersonal = fuelSummary.official_gas_total;

  // 3. Partners' Insurance (rebates from POSTED Collections)
  const collections = await Collection.find({
    entity_id: entityId,
    bdm_id: bdmId,
    status: 'POSTED'
  }).lean();
  // Filter by period from cr_date
  const periodCollections = collections.filter(c => {
    if (!c.cr_date) return false;
    const d = new Date(c.cr_date);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return m === period;
  });
  let partnersInsurance = 0;
  for (const col of periodCollections) {
    partnersInsurance += col.total_partner_rebates || 0;
  }

  // 4. ACCESS Total
  const expenseEntry = await ExpenseEntry.findOne(filter).lean();
  const accessTotal = expenseEntry ? expenseEntry.total_access : 0;
  const oreTotal = expenseEntry ? expenseEntry.total_ore : 0;

  // 5. CORE Commission (from POSTED Collections)
  let coreCommission = 0;
  for (const col of periodCollections) {
    coreCommission += col.total_commission || 0;
  }

  // PRF/CALF summary
  const prfCount = await PrfCalf.countDocuments({ ...filter, doc_type: 'PRF' });
  const calfCount = await PrfCalf.countDocuments({ ...filter, doc_type: 'CALF' });
  const calfPending = await PrfCalf.countDocuments({ ...filter, doc_type: 'CALF', status: { $in: ['DRAFT', 'APPROVED'] } });

  const totalExpenses = Math.round((smerReimbursable + gasolineLessPersonal + partnersInsurance + accessTotal + oreTotal) * 100) / 100;

  return {
    period,
    cycle,
    categories: {
      smer_reimbursable: Math.round(smerReimbursable * 100) / 100,
      gasoline_less_personal: Math.round(gasolineLessPersonal * 100) / 100,
      partners_insurance: Math.round(partnersInsurance * 100) / 100,
      access_total: Math.round(accessTotal * 100) / 100,
      ore_total: Math.round(oreTotal * 100) / 100,
      core_commission: Math.round(coreCommission * 100) / 100
    },
    total_expenses: totalExpenses,
    fuel_summary: fuelSummary,
    prf_count: prfCount,
    calf_count: calfCount,
    calf_pending: calfPending,
    smer_status: smer?.status || 'NOT_STARTED',
    expense_status: expenseEntry?.status || 'NOT_STARTED'
  };
}

module.exports = { generateExpenseSummary };
