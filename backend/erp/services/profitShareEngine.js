/**
 * Profit Share Engine — Per-Product Eligibility + PS Computation
 *
 * PRD §9.2-9.3:
 *   Condition A: Product ordered by ≥ PROFIT_SHARE_MIN_HOSPITALS hospitals
 *   Condition B: ≥ 1 MD tagged per product per collection, max MD_MAX_PRODUCT_TAGS products per MD
 *   Condition C: A + B met for PS_CONSECUTIVE_MONTHS consecutive months → PS starts next month
 *
 * PS Computation: Net Territory Revenue (PS products only)
 *   = Collections(net VAT) − COGS − SMER − Gas − Partners Insurance − ACCESS − Sampling DR
 *   If Net > 0: BDM 30%, VIP 70%. If Net ≤ 0: deficit → revert to commission.
 */
const mongoose = require('mongoose');
const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');
const PnlReport = require('../models/PnlReport');
const Settings = require('../models/Settings');

/**
 * Get distinct hospital count per product from POSTED SalesLines in a period
 */
async function getProductHospitalCount(entityId, bdmId, periodStart, periodEnd) {
  const result = await SalesLine.aggregate([
    {
      $match: {
        entity_id: new mongoose.Types.ObjectId(entityId),
        bdm_id: new mongoose.Types.ObjectId(bdmId),
        status: 'POSTED',
        csi_date: { $gte: periodStart, $lt: periodEnd }
      }
    },
    { $unwind: '$line_items' },
    {
      $group: {
        _id: '$line_items.product_id',
        hospitals: { $addToSet: '$hospital_id' }
      }
    },
    {
      $project: {
        product_id: '$_id',
        hospital_count: { $size: '$hospitals' }
      }
    }
  ]);
  return new Map(result.map(r => [r.product_id.toString(), r.hospital_count]));
}

/**
 * Get MD tag count per product from POSTED Collections in a period.
 * Cross-references settled CSI → SalesLine to get product_id.
 * Enforces MD_MAX_PRODUCT_TAGS per MD.
 */
async function getProductMdTags(entityId, bdmId, periodStart, periodEnd, maxProductsPerMd) {
  const collections = await Collection.find({
    entity_id: new mongoose.Types.ObjectId(entityId),
    bdm_id: new mongoose.Types.ObjectId(bdmId),
    status: 'POSTED',
    cr_date: { $gte: periodStart, $lt: periodEnd }
  }).lean();

  // Collect all sales_line_ids from settled CSIs
  const salesLineIds = [];
  for (const col of collections) {
    for (const csi of (col.settled_csis || [])) {
      if (csi.sales_line_id) salesLineIds.push(csi.sales_line_id);
    }
  }

  // Lookup SalesLines to get product_ids per CSI
  const salesLines = await SalesLine.find({
    _id: { $in: salesLineIds }
  }).select('_id line_items.product_id').lean();

  const slProductMap = new Map();
  for (const sl of salesLines) {
    const productIds = (sl.line_items || []).map(li => li.product_id.toString());
    slProductMap.set(sl._id.toString(), productIds);
  }

  // Track MD → products tagged (enforce max)
  const mdProducts = new Map(); // doctor_id → Set<product_id>
  // Track product → unique MDs
  const productMds = new Map(); // product_id → Set<doctor_id>

  for (const col of collections) {
    for (const csi of (col.settled_csis || [])) {
      const productIds = slProductMap.get(csi.sales_line_id?.toString()) || [];
      for (const tag of (csi.partner_tags || [])) {
        if (!tag.doctor_id) continue;
        const docId = tag.doctor_id.toString();

        // Check MD_MAX_PRODUCT_TAGS limit
        if (!mdProducts.has(docId)) mdProducts.set(docId, new Set());
        const mdSet = mdProducts.get(docId);

        for (const pid of productIds) {
          if (mdSet.size >= maxProductsPerMd && !mdSet.has(pid)) continue;
          mdSet.add(pid);

          if (!productMds.has(pid)) productMds.set(pid, new Set());
          productMds.get(pid).add(docId);
        }
      }
    }
  }

  // Convert to count map
  const result = new Map();
  for (const [pid, docs] of productMds) {
    result.set(pid, docs.size);
  }
  return result;
}

/**
 * Get consecutive qualifying streak for a product looking back N months.
 * A product qualifies in a prior month if it exists in the PnlReport's
 * ps_products array with qualified = true.
 */
async function getConsecutiveStreak(entityId, bdmId, productId, currentPeriod, lookbackMonths) {
  const pidStr = productId.toString();
  let streak = 0;

  // Walk backwards from the month before currentPeriod
  let [year, month] = currentPeriod.split('-').map(Number);

  for (let i = 0; i < lookbackMonths + 1; i++) {
    // Go back one month
    month -= 1;
    if (month < 1) { month = 12; year -= 1; }
    const period = `${year}-${String(month).padStart(2, '0')}`;

    const pnl = await PnlReport.findOne({
      entity_id: new mongoose.Types.ObjectId(entityId),
      bdm_id: new mongoose.Types.ObjectId(bdmId),
      period
    }).select('profit_sharing.ps_products').lean();

    if (!pnl) break;

    const prod = (pnl.profit_sharing?.ps_products || []).find(
      p => p.product_id?.toString() === pidStr
    );

    // Phase 15.1: check conditions_met (A+B) for streak, fallback to qualified
    if (prod?.conditions_met || prod?.qualified) {
      streak++;
    } else {
      break; // streak broken
    }
  }

  return streak;
}

/**
 * Parse period string to start/end dates
 */
function periodToDates(period) {
  const [year, month] = period.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1); // first day of next month
  return { start, end };
}

/**
 * Evaluate profit sharing eligibility for a BDM in a given period.
 *
 * @param {String} entityId
 * @param {String} bdmId
 * @param {String} period - "2026-04"
 * @param {Object} [pnlData] - pre-computed PNL data (net_income) to avoid re-querying
 * @returns {{ eligible, ps_products, deficit_flag, bdm_share, vip_share }}
 */
async function evaluateEligibility(entityId, bdmId, period, pnlData) {
  const settings = await Settings.getSettings();
  const minHospitals = settings.PROFIT_SHARE_MIN_HOSPITALS || 2;
  const maxProductsPerMd = settings.MD_MAX_PRODUCT_TAGS || 3;
  const consecutiveMonths = settings.PS_CONSECUTIVE_MONTHS || 3;
  const bdmPct = settings.PROFIT_SHARE_BDM_PCT || 0.30;
  const vipPct = settings.PROFIT_SHARE_VIP_PCT || 0.70;

  const { start, end } = periodToDates(period);

  // Condition A: product hospital counts
  const hospitalCounts = await getProductHospitalCount(entityId, bdmId, start, end);

  // Condition B: product MD tags
  const mdCounts = await getProductMdTags(entityId, bdmId, start, end, maxProductsPerMd);

  // Get all unique product IDs
  const allProductIds = new Set([...hospitalCounts.keys(), ...mdCounts.keys()]);

  // Evaluate each product
  const psProducts = [];
  let hasQualified = false;

  for (const pid of allProductIds) {
    const hCount = hospitalCounts.get(pid) || 0;
    const mCount = mdCounts.get(pid) || 0;
    const passesA = hCount >= minHospitals;
    const passesB = mCount >= 1;

    let streak = 0;
    let qualified = false;

    if (passesA && passesB) {
      // Condition C: check consecutive months
      streak = await getConsecutiveStreak(entityId, bdmId, pid, period, consecutiveMonths);
      // PS starts when streak >= consecutiveMonths (i.e., after N months of qualifying)
      qualified = streak >= consecutiveMonths;
    }

    if (qualified) hasQualified = true;

    psProducts.push({
      product_id: new mongoose.Types.ObjectId(pid),
      product_name: '', // caller can populate
      hospital_count: hCount,
      md_count: mCount,
      consecutive_months: passesA && passesB ? streak + 1 : 0, // +1 for current month
      qualified,
      conditions_met: passesA && passesB  // Phase 15.1: track A+B regardless of streak
    });
  }

  // Compute PS amounts
  let eligible = false;
  let bdmShare = 0;
  let vipShare = 0;
  let deficitFlag = false;

  if (hasQualified) {
    const netIncome = pnlData?.net_income || 0;
    if (netIncome > 0) {
      eligible = true;
      bdmShare = Math.round(netIncome * bdmPct * 100) / 100;
      vipShare = Math.round(netIncome * vipPct * 100) / 100;
    } else {
      deficitFlag = true; // net <= 0, revert to commission
    }
  }

  return {
    eligible,
    bdm_share: bdmShare,
    vip_share: vipShare,
    ps_products: psProducts,
    deficit_flag: deficitFlag
  };
}

/**
 * Phase 15.1: Per-product streak detail for eligibility dashboard
 */
async function getProductStreakDetail(entityId, bdmId, period) {
  const settings = await Settings.getSettings();
  const minHospitals = settings.PROFIT_SHARE_MIN_HOSPITALS || 2;
  const maxProductsPerMd = settings.MD_MAX_PRODUCT_TAGS || 3;
  const consecutiveMonths = settings.PS_CONSECUTIVE_MONTHS || 3;

  const { start, end } = periodToDates(period);

  const hospitalCounts = await getProductHospitalCount(entityId, bdmId, start, end);
  const mdCounts = await getProductMdTags(entityId, bdmId, start, end, maxProductsPerMd);
  const allProductIds = new Set([...hospitalCounts.keys(), ...mdCounts.keys()]);

  const results = [];
  for (const pid of allProductIds) {
    const hCount = hospitalCounts.get(pid) || 0;
    const mCount = mdCounts.get(pid) || 0;
    const passesA = hCount >= minHospitals;
    const passesB = mCount >= 1;
    const conditionsMet = passesA && passesB;

    let streak = 0;
    if (conditionsMet) {
      streak = await getConsecutiveStreak(entityId, bdmId, pid, period, consecutiveMonths + 3);
    }

    // Count deficit months from PnlReport history
    let deficitMonths = 0;
    if (conditionsMet) {
      let [year, month] = period.split('-').map(Number);
      for (let i = 0; i < streak; i++) {
        month -= 1;
        if (month < 1) { month = 12; year -= 1; }
        const p = `${year}-${String(month).padStart(2, '0')}`;
        const pnl = await PnlReport.findOne({
          entity_id: new mongoose.Types.ObjectId(entityId),
          bdm_id: new mongoose.Types.ObjectId(bdmId),
          period: p
        }).select('net_income').lean();
        if (pnl && (pnl.net_income || 0) <= 0) deficitMonths++;
      }
    }

    results.push({
      product_id: pid,
      product_name: '',
      hospital_count: hCount,
      md_count: mCount,
      condition_a_met: passesA,
      condition_b_met: passesB,
      conditions_met: conditionsMet,
      consecutive_months: conditionsMet ? streak + 1 : 0,
      required_months: consecutiveMonths,
      qualified: conditionsMet && streak >= consecutiveMonths,
      deficit_months: deficitMonths
    });
  }

  return results;
}

module.exports = {
  evaluateEligibility,
  getProductHospitalCount,
  getProductMdTags,
  getConsecutiveStreak,
  getProductStreakDetail
};
