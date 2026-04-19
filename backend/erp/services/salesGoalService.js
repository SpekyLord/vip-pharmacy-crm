const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');
const Hospital = require('../models/Hospital');
const InventoryLedger = require('../models/InventoryLedger');
const ProductMaster = require('../models/ProductMaster');
const Visit = require('../../models/Visit');
const Doctor = require('../../models/Doctor');
const Lookup = require('../models/Lookup');
const SalesGoalTarget = require('../models/SalesGoalTarget');
const KpiSnapshot = require('../models/KpiSnapshot');
const ActionItem = require('../models/ActionItem');
const PeopleMaster = require('../models/PeopleMaster');
const CompProfile = require('../models/CompProfile');
const IncentivePayout = require('../models/IncentivePayout');
const SalesGoalPlan = require('../models/SalesGoalPlan');
const mongoose = require('mongoose');

/**
 * Sales Goal Service — Phase 28
 * KPI computation engine. Reads from existing ERP models (no data duplication).
 * All configuration from Lookup tables (zero hardcoding).
 */

// ═══ Config helpers ═══

/**
 * Read GOAL_CONFIG Lookup entries for entity, return as key→value map.
 */
async function getGoalConfig(entityId) {
  const entries = await Lookup.find({
    entity_id: entityId,
    category: 'GOAL_CONFIG',
    is_active: true,
  }).lean();
  const config = {};
  for (const e of entries) {
    config[e.code] = e.metadata?.value ?? e.label;
  }
  return config;
}

/**
 * Read INCENTIVE_TIER Lookup entries, sorted by attainment_min descending.
 *
 * SG-5 #25 — surfaces `accelerator_factor` (per-tier commission multiplier).
 * Absent metadata → 1.0 (no multiplier, backward compatible). Admins opt a tier
 * into acceleration by setting metadata.accelerator_factor > 1 in Control
 * Center → Lookup Tables; `applyTierAccelerator()` below folds it into the
 * accrued tier_budget. Zero-hardcoding: default factor lives here only because
 * a Lookup write failure must not crash incentive accrual.
 */
async function getIncentiveTiers(entityId) {
  const entries = await Lookup.find({
    entity_id: entityId,
    category: 'INCENTIVE_TIER',
    is_active: true,
  }).lean();
  return entries
    .map(e => ({
      code: e.code,
      label: e.label,
      attainment_min: e.metadata?.attainment_min ?? 0,
      budget_per_bdm: e.metadata?.budget_per_bdm ?? 0,
      accelerator_factor: normalizeAcceleratorFactor(e.metadata?.accelerator_factor),
      reward_description: e.metadata?.reward_description ?? '',
      bg_color: e.metadata?.bg_color ?? '',
      text_color: e.metadata?.text_color ?? '',
    }))
    .sort((a, b) => b.attainment_min - a.attainment_min); // highest first
}

/**
 * Coerce lookup accelerator_factor into a safe multiplier:
 *   - missing / null / non-numeric → 1.0 (no-op)
 *   - < 0 → 1.0 (negative would invert commissions; reject defensively)
 *   - >= 0 → as-is (0 is legal, lets admins explicitly freeze a tier's payout)
 *
 * Explicit null/undefined guard avoids the `Number(null) === 0` coercion trap —
 * we only trust an explicitly supplied 0 (e.g. Number(0), "0"), never an
 * absent value that coerces to 0.
 */
function normalizeAcceleratorFactor(raw) {
  if (raw === null || raw === undefined || raw === '') return 1.0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 1.0;
  return n;
}

/**
 * Apply a tier's accelerator factor to its budget.
 * Returns `{ accelerated_budget, accelerator_factor, base_budget }`.
 * Ledger rows should store both values so admins can see the multiplier's
 * contribution (transparency — mirrors the `uncapped_budget` pattern in
 * applyIncentiveCap).
 */
function applyTierAccelerator(tier) {
  if (!tier) return { accelerated_budget: 0, accelerator_factor: 1.0, base_budget: 0 };
  const factor = normalizeAcceleratorFactor(tier.accelerator_factor);
  const base = Number(tier.budget_per_bdm) || 0;
  return {
    accelerated_budget: Math.round(base * factor),
    accelerator_factor: factor,
    base_budget: base,
  };
}

// Hard-coded fallback used only when both the DB entries are missing AND the
// lazy-seed write fails (e.g. read-only secondary). Keeps the dashboard
// renderable on day zero — admins can override per-entity via Control Center.
const STATUS_PALETTE_FALLBACK = [
  { code: 'ON_TRACK',         label: 'On Track', bar_color: '#22c55e', bg_color: '#dcfce7', text_color: '#166534', sort_order: 1 },
  { code: 'NEEDS_ATTENTION',  label: 'At Risk',  bar_color: '#f59e0b', bg_color: '#fef3c7', text_color: '#92400e', sort_order: 2 },
  { code: 'AT_RISK',          label: 'Behind',   bar_color: '#ef4444', bg_color: '#fee2e2', text_color: '#991b1b', sort_order: 3 },
];

/**
 * Read STATUS_PALETTE Lookup entries — colors + labels for attainment buckets
 * (ON_TRACK / NEEDS_ATTENTION / AT_RISK). Lazy-seeds per entity on first read so
 * a fresh subsidiary dashboard renders without an admin opening Control Center
 * first. Mirrors the SALES_GOAL_ELIGIBLE_ROLES lazy-seed pattern in
 * salesGoalController.autoEnrollEligibleBdms().
 */
async function getStatusPalette(entityId) {
  let entries = await Lookup.find({
    entity_id: entityId,
    category: 'STATUS_PALETTE',
    is_active: true,
  }).lean();

  if (entries.length === 0 && entityId) {
    try {
      const ops = STATUS_PALETTE_FALLBACK.map(p => ({
        updateOne: {
          filter: { entity_id: entityId, category: 'STATUS_PALETTE', code: p.code },
          update: {
            $setOnInsert: {
              label: p.label,
              sort_order: p.sort_order,
              is_active: true,
              metadata: {
                bar_color: p.bar_color,
                bg_color: p.bg_color,
                text_color: p.text_color,
                sort_order: p.sort_order,
              },
            },
          },
          upsert: true,
        },
      }));
      await Lookup.bulkWrite(ops, { ordered: false });
      entries = await Lookup.find({
        entity_id: entityId,
        category: 'STATUS_PALETTE',
        is_active: true,
      }).lean();
    } catch (err) {
      console.error('[salesGoal] STATUS_PALETTE lazy-seed failed:', err.message);
      // Serve the fallback unmodified so the dashboard still renders.
      return STATUS_PALETTE_FALLBACK.map(p => ({ ...p }));
    }
  }

  return entries
    .map(e => ({
      code: e.code,
      label: e.label,
      bar_color: e.metadata?.bar_color ?? '',
      bg_color: e.metadata?.bg_color ?? '',
      text_color: e.metadata?.text_color ?? '',
      sort_order: e.metadata?.sort_order ?? e.sort_order ?? 0,
    }))
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

// Defaults applied when an entity has no KPI_VARIANCE_THRESHOLDS row.
// Kept aligned with kpiVarianceAgent.DEFAULT_WARNING_PCT / DEFAULT_CRITICAL_PCT.
const KPI_VARIANCE_GLOBAL_DEFAULT = {
  warning_pct: 20,
  critical_pct: 40,
};

/**
 * Ensure a fallback `KPI_VARIANCE_THRESHOLDS.GLOBAL` lookup row exists for the
 * given entity. Idempotent — safe to call repeatedly. Called lazily on plan
 * activation so day-1 subscribers see kpiVarianceAgent fire alerts without an
 * admin first opening Control Center. Mirrors the STATUS_PALETTE self-seed
 * pattern above.
 *
 * Passing `session` makes the write part of an open transaction (used by
 * salesGoalController.activatePlan).
 */
async function ensureKpiVarianceGlobalThreshold(entityId, session = null) {
  if (!entityId) return { seeded: false, reason: 'no_entity' };
  try {
    const filter = { entity_id: entityId, category: 'KPI_VARIANCE_THRESHOLDS', code: 'GLOBAL' };
    const existing = await Lookup.findOne(filter).session(session || null).lean();
    if (existing) return { seeded: false, reason: 'already_present' };

    await Lookup.updateOne(
      filter,
      {
        $setOnInsert: {
          label: 'Global KPI Variance Threshold',
          sort_order: 0,
          is_active: true,
          metadata: {
            warning_pct: KPI_VARIANCE_GLOBAL_DEFAULT.warning_pct,
            critical_pct: KPI_VARIANCE_GLOBAL_DEFAULT.critical_pct,
            note: 'Auto-seeded on first plan activation. Override per-KPI by adding rows with code=<KPI_CODE>.',
          },
        },
      },
      { upsert: true, ...(session ? { session } : {}) }
    );
    return { seeded: true };
  } catch (err) {
    console.error('[salesGoal] KPI_VARIANCE_THRESHOLDS.GLOBAL lazy-seed failed:', err.message);
    // Non-fatal — agent has in-memory fallback. Never blocks plan activation.
    return { seeded: false, reason: 'error', error: err.message };
  }
}

/**
 * Match attainment % to highest qualifying tier.
 */
function computeIncentiveTier(attainmentPct, tiers) {
  for (const tier of tiers) {
    if (attainmentPct >= tier.attainment_min) {
      return tier;
    }
  }
  return null;
}

/**
 * Project annualized attainment and match to tier.
 */
function computeProjectedTier(actual, target, monthsElapsed, totalMonths, tiers) {
  if (monthsElapsed <= 0 || target <= 0) return null;
  const annualized = (actual / monthsElapsed) * totalMonths;
  const projectedPct = Math.round((annualized / target) * 100);
  return computeIncentiveTier(projectedPct, tiers);
}

// ═══ Date helpers ═══

function fiscalYearRange(fiscalYear, fiscalStartMonth = 1) {
  const start = new Date(fiscalYear, fiscalStartMonth - 1, 1);
  const end = new Date(fiscalYear + (fiscalStartMonth > 1 ? 1 : 0), fiscalStartMonth === 1 ? 11 : fiscalStartMonth - 2, 31, 23, 59, 59, 999);
  if (fiscalStartMonth === 1) {
    end.setFullYear(fiscalYear);
    end.setMonth(11);
    end.setDate(31);
  }
  return { start, end };
}

function monthRange(period) {
  const [y, m] = period.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

// ═══ Auto KPI Computation ═══

/**
 * Compute auto KPI value based on kpi_code.
 * Reads from existing ERP models — zero data duplication.
 */
async function getAutoKpiValue(kpiCode, entityId, bdmId, startDate, endDate) {
  switch (kpiCode) {
    case 'PCT_HOSP_ACCREDITED': {
      const { buildHospitalAccessFilter } = require('../utils/hospitalAccess');
      const accessFilter = await buildHospitalAccessFilter({ _id: bdmId, role: 'contractor' });
      const tagged = await Hospital.find({
        status: 'ACTIVE',
        ...accessFilter,
      }).select('engagement_level').lean();
      if (tagged.length === 0) return 0;
      const config = await getGoalConfig(entityId);
      const threshold = config.ACCREDITATION_LEVEL;
      const accredited = tagged.filter(h => (h.engagement_level || 0) >= threshold).length;
      return Math.round((accredited / tagged.length) * 100);
    }

    case 'REV_PER_ACCREDITED_HOSP': {
      const { buildHospitalAccessFilter: buildFilter } = require('../utils/hospitalAccess');
      const hospAccessFilter = await buildFilter({ _id: bdmId, role: 'contractor' });
      const config = await getGoalConfig(entityId);
      const threshold = config.ACCREDITATION_LEVEL;
      const accreditedHosps = await Hospital.find({
        status: 'ACTIVE',
        ...hospAccessFilter,
        engagement_level: { $gte: threshold },
      }).select('_id').lean();
      if (accreditedHosps.length === 0) return 0;
      const hospIds = accreditedHosps.map(h => h._id);
      const salesAgg = await SalesLine.aggregate([
        { $match: { entity_id: entityId, bdm_id: bdmId, status: 'POSTED', hospital_id: { $in: hospIds }, csi_date: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: null, total: { $sum: '$invoice_total' } } },
      ]);
      return Math.round((salesAgg[0]?.total || 0) / accreditedHosps.length);
    }

    case 'SKUS_LISTED_PER_HOSP': {
      const agg = await SalesLine.aggregate([
        { $match: { entity_id: entityId, bdm_id: bdmId, status: 'POSTED', csi_date: { $gte: startDate, $lte: endDate } } },
        { $unwind: '$line_items' },
        { $group: { _id: '$hospital_id', skus: { $addToSet: '$line_items.product_id' } } },
        { $project: { skuCount: { $size: '$skus' } } },
        { $group: { _id: null, avgSkus: { $avg: '$skuCount' } } },
      ]);
      return Math.round(agg[0]?.avgSkus || 0);
    }

    case 'LOST_SALES_INCIDENTS': {
      const agg = await InventoryLedger.aggregate([
        { $match: { entity_id: entityId, transaction_date: { $gte: startDate, $lte: endDate }, running_balance: { $lte: 0 } } },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]);
      return agg[0]?.count || 0;
    }

    case 'INVENTORY_TURNOVER': {
      const cogsAgg = await SalesLine.aggregate([
        { $match: { entity_id: entityId, bdm_id: bdmId, status: 'POSTED', csi_date: { $gte: startDate, $lte: endDate } } },
        { $unwind: '$line_items' },
        { $group: { _id: null, cogs: { $sum: { $multiply: ['$line_items.qty', { $ifNull: ['$line_items.purchase_price', 0] }] } } } },
      ]);
      const cogs = cogsAgg[0]?.cogs || 0;
      const invAgg = await InventoryLedger.aggregate([
        { $match: { entity_id: entityId } },
        { $group: { _id: '$product_id', avgVal: { $avg: { $multiply: ['$running_balance', { $ifNull: ['$unit_cost', 0] }] } } } },
        { $group: { _id: null, totalAvgInv: { $sum: '$avgVal' } } },
      ]);
      const avgInv = invAgg[0]?.totalAvgInv || 1;
      return Math.round((cogs / avgInv) * 100) / 100;
    }

    case 'MD_ENGAGEMENT_COVERAGE': {
      const assigned = await Doctor.countDocuments({ assignedTo: bdmId, isActive: true });
      if (assigned === 0) return 0;
      const visited = await Visit.distinct('doctor', {
        user: bdmId,
        visitDate: { $gte: startDate, $lte: endDate },
      });
      return Math.min(100, Math.round((visited.length / assigned) * 100));
    }

    case 'MONTHLY_REORDER_FREQ': {
      const agg = await SalesLine.aggregate([
        { $match: { entity_id: entityId, bdm_id: bdmId, status: 'POSTED', csi_date: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: { hospital: '$hospital_id', month: { $month: '$csi_date' } } } },
        { $group: { _id: '$_id.hospital', monthCount: { $sum: 1 } } },
        { $match: { monthCount: { $gte: 2 } } },
        { $count: 'repeatHospitals' },
      ]);
      return agg[0]?.repeatHospitals || 0;
    }

    case 'EXPIRY_RETURNS': {
      const agg = await InventoryLedger.aggregate([
        { $match: { entity_id: entityId, transaction_type: 'RETURN_IN', transaction_date: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: null, total: { $sum: '$qty_in' } } },
      ]);
      return agg[0]?.total || 0;
    }

    case 'GROSS_MARGIN_PER_SKU': {
      const products = await ProductMaster.find({
        entity_id: entityId,
        is_active: true,
        selling_price: { $gt: 0 },
      }).select('selling_price purchase_price').lean();
      if (products.length === 0) return 0;
      const totalMargin = products.reduce((sum, p) => {
        const margin = ((p.selling_price - (p.purchase_price || 0)) / p.selling_price) * 100;
        return sum + margin;
      }, 0);
      return Math.round((totalMargin / products.length) * 10) / 10;
    }

    case 'VOLUME_RETENTION_POST_INCREASE': {
      // Compare current period qty vs prior period for products with price > purchase
      return 0; // Complex — requires price change history, return 0 for now (manual entry fallback)
    }

    default:
      return 0;
  }
}

// ═══ Incentive Accrual (Phase SG-Q2 W2) ═══

/**
 * Apply CompProfile.incentive_cap to a proposed tier_budget.
 *
 * Cap only bites when:
 *   - profile.incentive_type === 'CASH'  (in-kind / commission tracked elsewhere)
 *   - profile.incentive_cap > 0          (0 or missing = no cap)
 *
 * Returns `{ capped, uncapped }`. `capped` is what lands on IncentivePayout.
 * tier_budget; `uncapped` is what the tier originally offered so the ledger
 * row can surface "₱X reduced to ₱Y by cap" for transparency.
 */
async function applyIncentiveCap(personId, entityId, tierBudget) {
  const uncapped = Number(tierBudget) || 0;
  if (!personId) return { capped: uncapped, uncapped };
  const profile = await CompProfile.getActiveProfile(personId);
  if (!profile) return { capped: uncapped, uncapped };
  if (profile.incentive_type !== 'CASH') return { capped: uncapped, uncapped };
  const cap = Number(profile.incentive_cap) || 0;
  if (cap <= 0) return { capped: uncapped, uncapped };
  return { capped: Math.min(uncapped, cap), uncapped };
}

/**
 * Upsert an IncentivePayout row for a qualified tier + post the accrual journal.
 *
 * Idempotency: upsert keyed by (plan_id, bdm_id, period, period_type, program_code).
 * Re-running computeBdmSnapshot for the same period MUST NOT create a duplicate
 * accrual or duplicate journal. If an existing row is already APPROVED/PAID/REVERSED,
 * we leave it alone (authority has taken over the lifecycle). Only ACCRUED rows
 * get their tier_budget / attainment_pct refreshed on re-compute.
 *
 * If the journal post fails we DELETE the just-created ACCRUED row (or leave the
 * existing one unchanged) so no payout exists without its backing journal — the
 * ledger and payout ledger stay in lockstep. Failure is logged; the outer snapshot
 * continues (we don't want one BDM's ledger issue to halt the whole batch).
 *
 * Params
 *  - entityId, plan, bdmId, personId, period, periodType
 *  - incentiveRow: the computed entry from snap.incentive_status[0] (first program);
 *                  must have tier_code, tier_label, tier_budget, attainment_pct,
 *                  qualified (bool)
 *  - userId: who triggered the snapshot (credited as created_by on fresh rows)
 *
 * Returns the IncentivePayout document (or null when nothing to do).
 */
async function accrueIncentive({
  entityId, plan, bdmId, personId, period, periodType,
  incentiveRow, userId,
}) {
  if (!incentiveRow || !incentiveRow.qualified || !incentiveRow.tier_code) return null;
  if (!bdmId) return null;                              // no user ⇒ nowhere to attribute
  const rawBudget = Number(incentiveRow.tier_budget) || 0;
  if (rawBudget <= 0) return null;                       // zero-budget tiers (Participant) — skip ledger noise

  // CompProfile cap enforcement (Phase SG-Q2 W2 item 12).
  const { capped, uncapped } = await applyIncentiveCap(personId, entityId, rawBudget);
  if (capped <= 0) return null;

  const upsertKey = {
    plan_id: plan._id,
    bdm_id: bdmId,
    period,
    period_type: periodType,
    program_code: incentiveRow.program_code || '',
  };

  // Idempotency: once a row exists for this (plan, bdm, period, period_type,
  // program) key, we never auto-mutate the backing journal. Reasons:
  //   - APPROVED/PAID/REVERSED → authority has taken over the lifecycle.
  //   - ACCRUED, same numbers    → nothing to do.
  //   - ACCRUED, different tier  → auto-updating would require reversing the
  //     old JE AND posting a new one to keep expense in sync with tier_budget.
  //     Doing that silently inside a batch snapshot recompute is unsafe (no
  //     audit visibility). Instead we log a warning; admin reverses the
  //     ACCRUED row via the ledger UI, then the next compute re-accrues at
  //     the new tier. This matches the SAP Commissions "events are immutable"
  //     philosophy and keeps the ledger in lockstep with the payout row.
  const existing = await IncentivePayout.findOne(upsertKey).lean();
  if (existing) {
    if (existing.status === 'ACCRUED'
        && (Number(existing.tier_budget) !== capped
            || existing.tier_code !== incentiveRow.tier_code)) {
      console.warn(
        `[accrueIncentive] Tier/budget drift on ACCRUED payout ${existing._id} `
        + `(${existing.tier_code} ₱${existing.tier_budget} → ${incentiveRow.tier_code} ₱${capped}). `
        + `Skipping auto-update — admin must reverse this payout + recompute to adopt the new tier.`
      );
    }
    return existing;
  }

  // Resolve a BDM label once for the JE description
  const person = personId ? await PeopleMaster.findById(personId).select('full_name bdm_code').lean() : null;
  const bdmLabel = person ? `${person.full_name}${person.bdm_code ? ` (${person.bdm_code})` : ''}` : 'BDM';

  // ── Phase SG-Q2 W3 — Per-accrual transaction wrap ───────────────────────
  // Wrap (a) accrual JE create+post, (b) IncentivePayout upsert in a single
  // mongoose transaction so a partial failure leaves nothing behind. Without
  // this wrap, two parallel snapshot computes (e.g. cron + manual Run Now)
  // could each post a JE, then race on the upsert and one would lose its
  // backing row — orphan JE in the GL with no payout to point at.
  //
  // The transaction also threads through generateJeNumber → DocSequence so
  // the sequence bump rolls back if anything downstream fails.
  //
  // Best-effort: if the txn fails we log + return null so the outer snapshot
  // batch still completes for the other BDMs. The next run picks it up.
  let doc = null;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Re-check inside the txn to catch the race where a parallel run won.
      const raceCheck = await IncentivePayout.findOne(upsertKey).session(session).lean();
      if (raceCheck) {
        doc = raceCheck;
        return;
      }

      // Build a pseudo payout object so journalFromIncentive has enough context.
      // The real IncentivePayout row is upserted after so we can store the JE id.
      const pseudo = {
        _id: new mongoose.Types.ObjectId(),
        entity_id: entityId,
        plan_id: plan._id,
        bdm_id: bdmId,
        period,
        tier_code: incentiveRow.tier_code,
        tier_label: incentiveRow.tier_label || incentiveRow.tier_code,
        tier_budget: capped,
      };
      const { postAccrualJournal } = require('./journalFromIncentive');
      const journal = await postAccrualJournal(pseudo, plan.reference, bdmLabel, userId || null, { session });

      doc = await IncentivePayout.findOneAndUpdate(
        upsertKey,
        {
          $set: {
            entity_id: entityId,
            plan_id: plan._id,
            bdm_id: bdmId,
            person_id: personId || null,
            fiscal_year: plan.fiscal_year,
            period,
            period_type: periodType,
            program_code: incentiveRow.program_code || '',
            tier_code: incentiveRow.tier_code,
            tier_label: incentiveRow.tier_label || incentiveRow.tier_code,
            tier_budget: capped,
            uncapped_budget: uncapped,
            attainment_pct: Number(incentiveRow.attainment_pct) || 0,
            sales_target: Number(incentiveRow.qualifying_amount) || 0,
            sales_actual: Number(incentiveRow.actual_amount) || 0,
            status: 'ACCRUED',
            journal_id: journal._id,
            journal_number: journal.je_number,
          },
          $setOnInsert: {
            created_by: userId || null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session }
      );
    });
  } catch (err) {
    // Duplicate-key races resolve to "the other run won" — treat as success.
    if (err && err.code === 11000) {
      try {
        doc = await IncentivePayout.findOne(upsertKey).lean();
      } catch (_) { /* fall through to null */ }
      console.warn(
        `[salesGoal.accrueIncentive] Concurrent accrual race for plan ${plan._id} `
        + `bdm ${bdmId} period ${period} — kept existing payout, JE rolled back.`
      );
    } else {
      console.error('[salesGoal.accrueIncentive] Atomic accrual failed — payout NOT created:', err.message);
      doc = null;
    }
  } finally {
    session.endSession();
  }

  // Fire tier-reached notification (non-blocking; outside the txn so an email
  // hiccup never reverts a posted accrual). Only on a fresh accrual (not a
  // race-recovery hit on an existing row).
  if (doc && String(doc._id) !== String(existing?._id) && bdmId) {
    try {
      const { notifyTierReached } = require('./erpNotificationService');
      // Caller (snapshot agent) doesn't await — we don't either.
      notifyTierReached({
        entityId,
        bdmId,
        bdmLabel,
        planRef: plan.reference || plan.plan_name,
        fiscalYear: plan.fiscal_year,
        period,
        periodType,
        tierCode: incentiveRow.tier_code,
        tierLabel: incentiveRow.tier_label || incentiveRow.tier_code,
        tierBudget: capped,
        attainmentPct: Number(incentiveRow.attainment_pct) || 0,
      }).catch(e => console.error('[notifyTierReached] failed:', e.message));
    } catch (e) {
      console.error('[notifyTierReached] dispatch error:', e.message);
    }
  }

  return doc;
}

// ═══ Snapshot Computation ═══

/**
 * Compute KPI snapshot for a single BDM in a period.
 *
 * @param {Object} [options]
 * @param {String|ObjectId} [options.userId] — triggers incentive accrual attribution
 * @param {Boolean} [options.accrueIncentives=true] — set false to skip accrual
 *   (e.g. historical re-computes). Default behavior is to accrue on YTD qualifications.
 */
async function computeBdmSnapshot(entityId, plan, bdmId, personId, territoryId, period, periodType, options = {}) {
  const isYTD = periodType === 'YTD';
  const config = await getGoalConfig(entityId);
  const fiscalStart = config.FISCAL_START_MONTH;

  let startDate, endDate;
  if (isYTD) {
    const range = fiscalYearRange(plan.fiscal_year, fiscalStart);
    startDate = range.start;
    endDate = new Date(); // up to now
  } else {
    const range = monthRange(period);
    startDate = range.start;
    endDate = range.end;
  }

  // Get target for this BDM
  const target = await SalesGoalTarget.findOne({
    plan_id: plan._id,
    target_type: 'BDM',
    bdm_id: bdmId,
    status: 'ACTIVE',
  }).lean();

  const salesTarget = target?.sales_target || 0;
  const collectionTarget = target?.collection_target || 0;

  // Sales actual
  const salesAgg = await SalesLine.aggregate([
    { $match: { entity_id: entityId, bdm_id: bdmId, status: 'POSTED', csi_date: { $gte: startDate, $lte: endDate } } },
    { $group: { _id: null, total: { $sum: '$invoice_total' }, count: { $sum: 1 } } },
  ]);
  const salesActual = salesAgg[0]?.total || 0;

  // Collections actual
  const collAgg = await Collection.aggregate([
    { $match: { entity_id: entityId, bdm_id: bdmId, status: 'POSTED', cr_date: { $gte: startDate, $lte: endDate } } },
    { $group: { _id: null, total: { $sum: '$cr_amount' } } },
  ]);
  const collectionsActual = collAgg[0]?.total || 0;

  const salesAttainmentPct = salesTarget > 0 ? Math.round((salesActual / salesTarget) * 100) : 0;
  const collectionAttainmentPct = collectionTarget > 0 ? Math.round((collectionsActual / collectionTarget) * 100) : 0;
  const collectionRatePct = salesActual > 0 ? Math.round((collectionsActual / salesActual) * 100) : 0;

  // Per-driver KPIs
  const driverKpis = [];
  for (const driver of (plan.growth_drivers || [])) {
    const kpis = [];
    for (const kpiDef of (driver.kpi_definitions || [])) {
      let actualValue = 0;
      if (kpiDef.computation === 'auto') {
        actualValue = await getAutoKpiValue(kpiDef.kpi_code, entityId, bdmId, startDate, endDate);
      }
      // For manual KPIs, check if there's an existing snapshot with manual data
      if (kpiDef.computation === 'manual') {
        const existing = await KpiSnapshot.findOne({
          plan_id: plan._id, bdm_id: bdmId, period, period_type: periodType,
        }).lean();
        const existingDriver = existing?.driver_kpis?.find(d => d.driver_code === driver.driver_code);
        const existingKpi = existingDriver?.kpis?.find(k => k.kpi_code === kpiDef.kpi_code && k.data_source === 'manual');
        if (existingKpi) actualValue = existingKpi.actual_value;
      }

      const targetVal = kpiDef.target_value || 0;
      const attainment = targetVal > 0
        ? (kpiDef.direction === 'lower_better'
          ? Math.round((targetVal / Math.max(actualValue, 1)) * 100)
          : Math.round((actualValue / targetVal) * 100))
        : 0;

      kpis.push({
        kpi_code: kpiDef.kpi_code,
        kpi_label: kpiDef.kpi_label || '',
        target_value: targetVal,
        actual_value: actualValue,
        attainment_pct: attainment,
        data_source: kpiDef.computation,
      });
    }
    driverKpis.push({ driver_code: driver.driver_code, kpis });
  }

  // Incentive tier computation
  const tiers = await getIncentiveTiers(entityId);
  const incentiveStatus = [];
  for (const prog of (plan.incentive_programs || [])) {
    let qualifyingAmount = salesTarget;
    let actualAmount = salesActual;
    if (prog.qualification_metric === 'collections') {
      qualifyingAmount = collectionTarget;
      actualAmount = collectionsActual;
    }
    const attainmentPct = qualifyingAmount > 0 ? Math.round((actualAmount / qualifyingAmount) * 100) : 0;

    let currentTier = null;
    let projectedTier = null;
    if (prog.use_tiers && tiers.length > 0) {
      currentTier = computeIncentiveTier(attainmentPct, tiers);
      // Projected: how many months have elapsed in fiscal year?
      const now = new Date();
      const fyStart = new Date(plan.fiscal_year, (config.FISCAL_START_MONTH) - 1, 1);
      const monthsElapsed = Math.max(1, (now.getFullYear() - fyStart.getFullYear()) * 12 + now.getMonth() - fyStart.getMonth() + 1);
      projectedTier = computeProjectedTier(actualAmount, qualifyingAmount, monthsElapsed, 12, tiers);
    }

    // SG-5 #25 — Commission accelerator applied to tier budget.
    // Base budget is preserved in the ledger on IncentivePayout.uncapped_budget
    // (set inside accrueIncentive via applyIncentiveCap); the accelerated
    // amount is what gets written to tier_budget + journaled.
    const currentAccel = applyTierAccelerator(currentTier);
    const projectedAccel = applyTierAccelerator(projectedTier);
    incentiveStatus.push({
      program_code: prog.program_code,
      qualifying_amount: qualifyingAmount,
      actual_amount: actualAmount,
      attainment_pct: attainmentPct,
      tier_code: currentTier?.code || '',
      tier_label: currentTier?.label || '',
      tier_budget: currentAccel.accelerated_budget,
      tier_base_budget: currentAccel.base_budget,
      tier_accelerator_factor: currentAccel.accelerator_factor,
      projected_tier_code: projectedTier?.code || '',
      projected_tier_label: projectedTier?.label || '',
      projected_tier_budget: projectedAccel.accelerated_budget,
      projected_tier_accelerator_factor: projectedAccel.accelerator_factor,
      qualified: attainmentPct >= 100,
    });
  }

  // Action items summary
  const actionsTotal = await ActionItem.countDocuments({ plan_id: plan._id, bdm_id: bdmId, status: { $nin: ['CANCELLED'] } });
  const actionsCompleted = await ActionItem.countDocuments({ plan_id: plan._id, bdm_id: bdmId, status: 'DONE' });

  // Upsert snapshot
  const snapshot = await KpiSnapshot.findOneAndUpdate(
    { entity_id: entityId, plan_id: plan._id, bdm_id: bdmId, period, period_type: periodType },
    {
      $set: {
        fiscal_year: plan.fiscal_year,
        person_id: personId,
        territory_id: territoryId,
        sales_actual: salesActual,
        collections_actual: collectionsActual,
        collection_rate_pct: collectionRatePct,
        sales_target: salesTarget,
        sales_attainment_pct: salesAttainmentPct,
        collection_target: collectionTarget,
        collection_attainment_pct: collectionAttainmentPct,
        driver_kpis: driverKpis,
        incentive_status: incentiveStatus,
        actions_total: actionsTotal,
        actions_completed: actionsCompleted,
        computed_at: new Date(),
        computed_by: 'system',
      },
    },
    { upsert: true, new: true }
  );

  // ── Phase SG-Q2 W2 — Incentive accrual trigger ───────────────────────────
  // Only accrue on YTD snapshots. Monthly snapshots drive coaching / alerts;
  // accruing monthly would double-count (YTD already includes the month).
  // Accrual is best-effort: failures are logged inside accrueIncentive, the
  // outer snapshot still returns so the dashboard renders.
  if (periodType === 'YTD' && options.accrueIncentives !== false && incentiveStatus[0]) {
    await accrueIncentive({
      entityId,
      plan,
      bdmId,
      personId,
      period,
      periodType,
      incentiveRow: incentiveStatus[0],
      userId: options.userId || null,
    });
  }

  return snapshot;
}

/**
 * Compute snapshots for all BDMs in a plan.
 * Filters out targets whose PeopleMaster record is_active=false — deactivated
 * BDMs do not belong in leaderboards, incentive tiers, or projected-budget math.
 *
 * @param {Object} [options] — forwarded to computeBdmSnapshot (userId, accrueIncentives)
 */
async function computeAllSnapshots(plan, period, periodType, options = {}) {
  const targets = await SalesGoalTarget.find({
    plan_id: plan._id,
    target_type: 'BDM',
    status: 'ACTIVE',
  }).lean();

  // SG-Q2 W1 — resolve active PeopleMaster once, then filter targets. Targets
  // with no person_id still run (legacy data / direct-user-only enrollment);
  // targets whose person_id points to an inactive person are skipped.
  const personIds = targets.map(t => t.person_id).filter(Boolean);
  let activePersonIds = new Set();
  if (personIds.length > 0) {
    const activePeople = await PeopleMaster.find({
      _id: { $in: personIds },
      is_active: true,
    }).select('_id').lean();
    activePersonIds = new Set(activePeople.map(p => p._id.toString()));
  }

  const results = [];
  for (const t of targets) {
    if (!t.bdm_id) continue;
    if (t.person_id && !activePersonIds.has(t.person_id.toString())) continue;
    const snap = await computeBdmSnapshot(
      t.entity_id, plan, t.bdm_id, t.person_id, t.territory_id, period, periodType, options
    );
    results.push({
      bdm_id: t.bdm_id,
      target_label: t.target_label,
      sales_attainment_pct: snap.sales_attainment_pct,
    });
  }
  return results;
}

/**
 * Get incentive budget advisor data (P&L-based).
 */
async function getIncentiveBudgetAdvisor(entityId, plan) {
  const config = await getGoalConfig(entityId);
  const tiers = await getIncentiveTiers(entityId);
  const { start, end } = fiscalYearRange(plan.fiscal_year, config.FISCAL_START_MONTH);

  // Total sales YTD
  const salesAgg = await SalesLine.aggregate([
    { $match: { entity_id: entityId, status: 'POSTED', csi_date: { $gte: start, $lte: new Date() } } },
    { $group: { _id: null, revenue: { $sum: '$invoice_total' } } },
  ]);
  const revenueYTD = salesAgg[0]?.revenue || 0;

  // Compute each BDM's current tier
  const snapshots = await KpiSnapshot.find({
    plan_id: plan._id,
    period_type: 'YTD',
  }).lean();

  let totalIncentiveSpend = 0;
  for (const snap of snapshots) {
    const is = snap.incentive_status?.[0];
    if (is) totalIncentiveSpend += is.tier_budget;
  }

  const incentiveToRevenueRatio = revenueYTD > 0
    ? Math.round((totalIncentiveSpend / revenueYTD) * 10000) / 100
    : 0;

  return {
    revenue_ytd: revenueYTD,
    total_incentive_spend: totalIncentiveSpend,
    incentive_to_revenue_pct: incentiveToRevenueRatio,
    bdm_count: snapshots.length,
    tiers: tiers.map(t => ({
      ...t,
      bdm_count: snapshots.filter(s => s.incentive_status?.[0]?.tier_code === t.code).length,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SG-5 #26 — What-if / scenario modeling
//
// `simulatePlanSnapshots(plan, overrides)` returns projected snapshots +
// incentive accrual forecast WITHOUT persisting to the DB. The input `plan`
// is used read-only; overrides are applied in-memory. Re-uses the same
// computeIncentiveTier / applyTierAccelerator / applyIncentiveCap math so
// scenarios match production accrual behavior one-for-one.
//
// Overrides (all optional; unspecified = use current plan value):
//   target_revenue_override   — replaces plan.target_revenue (number, PHP)
//   baseline_override         — replaces plan.baseline_revenue (number, PHP)
//   driver_weight_overrides   — { [driver_code]: weight_pct }
//   tier_attainment_overrides — { [bdm_id]: attainment_pct } — force a BDM's
//                               incentive attainment% irrespective of live sales
//
// Returns `{ current, scenario, diff, plan_overrides }` — side-by-side totals
// per BDM (tier, tier_budget, accelerator) plus aggregate company-level
// revenue / attainment projections.
//
// Design notes:
//   - No DB writes. Safe to call from any role with plan VIEW.
//   - Each BDM snapshot is read once (YTD period for current fiscal_year) then
//     the scenario row is derived in-memory. If no snapshot exists yet, the
//     scenario falls back to the BDM's SalesGoalTarget.
//   - Incentive cap still applied (CompProfile.incentive_cap) so the forecast
//     reflects what would actually be accrued.
// ═══════════════════════════════════════════════════════════════════════════
async function simulatePlanSnapshots(plan, overrides = {}) {
  if (!plan) throw new Error('simulatePlanSnapshots: plan is required');
  const entityId = plan.entity_id;
  const fiscalYear = plan.fiscal_year;

  const tiers = await getIncentiveTiers(entityId);
  const config = await getGoalConfig(entityId);

  // Coerce overrides
  const targetRevOverride = Number(overrides.target_revenue_override);
  const baselineOverride = Number(overrides.baseline_override);
  const driverWeights = overrides.driver_weight_overrides || {};
  const tierAttOverrides = overrides.tier_attainment_overrides || {};

  const scenarioTargetRevenue = Number.isFinite(targetRevOverride) && targetRevOverride > 0
    ? targetRevOverride
    : Number(plan.target_revenue) || 0;
  const scenarioBaseline = Number.isFinite(baselineOverride) && baselineOverride >= 0
    ? baselineOverride
    : Number(plan.baseline_revenue) || 0;

  // Scale factor applied to each BDM's sales_target when the company target is
  // overridden (proportional distribution). If the current plan target is 0 we
  // skip scaling — nothing to scale from.
  const baseTarget = Number(plan.target_revenue) || 0;
  const targetScale = (baseTarget > 0 && scenarioTargetRevenue > 0)
    ? scenarioTargetRevenue / baseTarget
    : 1.0;

  // Pull ACTIVE BDM targets + their latest YTD snapshot (if any)
  const targets = await SalesGoalTarget.find({
    plan_id: plan._id,
    target_type: 'BDM',
    status: 'ACTIVE',
  }).populate('person_id', 'full_name bdm_code is_active').lean();

  const personIds = targets.map(t => t.person_id?._id).filter(Boolean);
  const activeTargets = targets.filter(t => !t.person_id || t.person_id.is_active !== false);

  const snapshotRows = await KpiSnapshot.find({
    plan_id: plan._id,
    period_type: 'YTD',
    period: String(fiscalYear),
  }).lean();
  const snapByBdm = new Map(snapshotRows.map(s => [String(s.bdm_id), s]));

  let scenarioTotalBudget = 0;
  let currentTotalBudget = 0;
  let scenarioActualRevenue = 0;
  let currentActualRevenue = 0;

  const rows = [];
  for (const t of activeTargets) {
    const bdmKey = String(t.bdm_id || '');
    const snap = bdmKey ? snapByBdm.get(bdmKey) : null;

    const currentAttainment = Number(snap?.sales_attainment_pct) || 0;
    const currentActual = Number(snap?.sales_actual) || 0;
    const currentTargetVal = Number(t.sales_target) || 0;

    const scenarioTargetVal = Math.round(currentTargetVal * targetScale);
    // Apply per-BDM attainment override if supplied; otherwise preserve actual.
    const overrideAtt = Number(tierAttOverrides[bdmKey]);
    const scenarioAttainment = Number.isFinite(overrideAtt) && overrideAtt >= 0
      ? overrideAtt
      // Scaling the target changes the attainment % against the new target
      // (actual stays the same — we're not asking "what if I sold more", we're
      // asking "what if the bar was set here"). If target_scale is 1.0 the
      // attainment is unchanged.
      : (scenarioTargetVal > 0 ? Math.round((currentActual / scenarioTargetVal) * 100) : 0);

    const currentTier = computeIncentiveTier(currentAttainment, tiers);
    const scenarioTier = computeIncentiveTier(scenarioAttainment, tiers);
    const currentAccel = applyTierAccelerator(currentTier);
    const scenarioAccel = applyTierAccelerator(scenarioTier);

    // Incentive cap forecast — apply the same CompProfile.incentive_cap math
    // that would fire in production. Skipped when no person_id (legacy rows).
    let currentCapped = currentAccel.accelerated_budget;
    let scenarioCapped = scenarioAccel.accelerated_budget;
    if (t.person_id?._id) {
      const curCap = await applyIncentiveCap(t.person_id._id, entityId, currentAccel.accelerated_budget);
      currentCapped = curCap.capped;
      const scCap = await applyIncentiveCap(t.person_id._id, entityId, scenarioAccel.accelerated_budget);
      scenarioCapped = scCap.capped;
    }

    currentTotalBudget += currentCapped;
    scenarioTotalBudget += scenarioCapped;
    currentActualRevenue += currentActual;
    scenarioActualRevenue += currentActual;

    rows.push({
      bdm_id: t.bdm_id,
      bdm_name: t.person_id?.full_name || t.target_label || 'BDM',
      bdm_code: t.person_id?.bdm_code || '',
      sales_target_current: currentTargetVal,
      sales_target_scenario: scenarioTargetVal,
      sales_actual: currentActual,
      attainment_current: currentAttainment,
      attainment_scenario: scenarioAttainment,
      tier_current: currentTier?.label || '',
      tier_scenario: scenarioTier?.label || '',
      tier_budget_current: currentCapped,
      tier_budget_scenario: scenarioCapped,
      accelerator_current: currentAccel.accelerator_factor,
      accelerator_scenario: scenarioAccel.accelerator_factor,
      budget_delta: scenarioCapped - currentCapped,
      attainment_delta: scenarioAttainment - currentAttainment,
    });
  }

  // Company-level driver overrides: report the new weights + recomputed driver
  // target pool. We don't re-run auto KPI calculations (that would require live
  // queries and defeat the "fast dry-run" goal); surfacing the weight change is
  // enough for a forecast. Admins rerun "Compute KPIs" after the plan is edited
  // if they want the full refresh.
  const scenarioDrivers = (plan.growth_drivers || []).map(d => {
    const currentWeight = Number(d.weight_pct) || 0;
    const override = Number(driverWeights[d.driver_code]);
    const scenarioWeight = Number.isFinite(override) && override >= 0 ? override : currentWeight;
    return {
      driver_code: d.driver_code,
      driver_label: d.driver_label || d.driver_code,
      weight_current: currentWeight,
      weight_scenario: scenarioWeight,
      revenue_share_current: Math.round((currentWeight / 100) * (Number(plan.target_revenue) || 0)),
      revenue_share_scenario: Math.round((scenarioWeight / 100) * scenarioTargetRevenue),
    };
  });

  const totalWeightScenario = scenarioDrivers.reduce((sum, d) => sum + d.weight_scenario, 0);

  return {
    plan_overrides: {
      target_revenue_current: Number(plan.target_revenue) || 0,
      target_revenue_scenario: scenarioTargetRevenue,
      baseline_current: Number(plan.baseline_revenue) || 0,
      baseline_scenario: scenarioBaseline,
      target_scale: Math.round(targetScale * 10000) / 10000,
      total_weight_scenario: totalWeightScenario,
      weight_warning: totalWeightScenario !== 100,
    },
    rows,
    drivers: scenarioDrivers,
    summary: {
      bdm_count: rows.length,
      current: {
        total_incentive_budget: currentTotalBudget,
        total_actual_revenue: currentActualRevenue,
        attainment_pct: (Number(plan.target_revenue) || 0) > 0
          ? Math.round((currentActualRevenue / plan.target_revenue) * 100)
          : 0,
      },
      scenario: {
        total_incentive_budget: scenarioTotalBudget,
        total_actual_revenue: scenarioActualRevenue,
        attainment_pct: scenarioTargetRevenue > 0
          ? Math.round((scenarioActualRevenue / scenarioTargetRevenue) * 100)
          : 0,
      },
      diff: {
        total_incentive_budget: scenarioTotalBudget - currentTotalBudget,
      },
    },
    config: {
      attainment_green: config.ATTAINMENT_GREEN,
      attainment_yellow: config.ATTAINMENT_YELLOW,
      attainment_red: config.ATTAINMENT_RED,
    },
    tiers: tiers.map(t => ({
      code: t.code,
      label: t.label,
      attainment_min: t.attainment_min,
      budget_per_bdm: t.budget_per_bdm,
      accelerator_factor: t.accelerator_factor,
      effective_budget: Math.round(t.budget_per_bdm * t.accelerator_factor),
    })),
  };
}

module.exports = {
  getGoalConfig,
  getIncentiveTiers,
  getStatusPalette,
  ensureKpiVarianceGlobalThreshold,
  KPI_VARIANCE_GLOBAL_DEFAULT,
  computeIncentiveTier,
  computeProjectedTier,
  computeBdmSnapshot,
  computeAllSnapshots,
  getAutoKpiValue,
  getIncentiveBudgetAdvisor,
  applyIncentiveCap,
  accrueIncentive,
  applyTierAccelerator,
  normalizeAcceleratorFactor,
  fiscalYearRange,
  monthRange,
  simulatePlanSnapshots,
};
