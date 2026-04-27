/**
 * Executive Cockpit Service — Phase EC-1 (Apr 2026).
 *
 * Aggregator-only. **Reuses canonical KPI sources** — never duplicates a query
 * that already lives in arEngine, apService, monthEndClose, etc. The cockpit
 * is a roll-up surface, not a source of truth. If a tile's number disagrees
 * with the underlying detail page, the bug is here, not there.
 *
 * Tier-1 tiles (CFO/CEO/COO at-a-glance, all wired in v1):
 *   - cash               — Σ active BankAccount.current_balance + PettyCashFund.current_balance
 *   - ar_aging           — arEngine.getArAging() roll-up (5 buckets + total + > 90 d %)
 *   - ap_aging           — apService.getApAging() roll-up
 *   - period_close       — monthEndClose.getCloseProgress() %-complete + step counts
 *   - approval_sla       — pending count + count > 48 h + oldest age
 *   - agent_health       — last-run status per enabled agent + alerts roll-up
 *
 * Tier-2 tiles (depth/strategy):
 *   - margin             — dashboardService.getMtd().gross_margin (already computed)
 *   - inventory_turns    — InventoryLedger MTD outflow / avg-on-hand
 *   - partnership_funnel — Doctor.partnership_status counts (LEAD→CONTACTED→VISITED→PARTNER)
 *   - bir_calendar       — BirFilingStatus rows due in next 30 d / overdue
 *
 * Per-tile error containment: every aggregator runs under Promise.allSettled.
 * A tile that throws returns `{ status: 'error', message }` — the page still
 * renders the other 9 tiles. The user sees one X, not a dark page. Critical
 * for a CEO surface that has to be available even if one upstream is degraded.
 *
 * Entity scope: every tile gets `entityId` from req.entityId (tenantFilter
 * middleware). President with no working entity selected still gets data
 * because the helpers handle null entityId by returning multi-entity rolled
 * sums where safe — but most tiles will return 0/empty. Cockpit is most
 * useful with a working entity selected.
 *
 * SaaS spin-out readiness (per CLAUDE.md Rule #0d): all queries are scoped
 * by entity_id (the to-be `tenant_id`). Hardcoded role names appear ONLY in
 * defaults; subscriber-tunable role lists come from EXECUTIVE_COCKPIT_ROLES
 * lookup. Adding a new tile = adding a new entry to TILES below; no schema
 * change required. Removing a tile = same.
 */

const mongoose = require('mongoose');

// Models — direct query targets
const BankAccount = require('../models/BankAccount');
const PettyCashFund = require('../models/PettyCashFund');
const ApprovalRequest = require('../models/ApprovalRequest');
const AgentRun = require('../models/AgentRun');
const InventoryLedger = require('../models/InventoryLedger');
const Doctor = require('../../models/Doctor');
const BirFilingStatus = require('../models/BirFilingStatus');

// Existing canonical aggregators — DO NOT REPLACE
const arEngine = require('./arEngine');
const apService = require('./apService');
const monthEndClose = require('./monthEndClose');
const { getMtd } = require('./dashboardService');

// Lookup-driven SLA threshold (default 48 h, subscriber-tunable later)
const DEFAULT_APPROVAL_SLA_HOURS = 48;

// ─── Tier-1 ─────────────────────────────────────────────────────────────────

/**
 * Cash position — sum across active bank accounts + active petty cash funds.
 * No double-counting: bank balances and petty cash live in separate ledgers.
 */
async function getCash(entityId) {
  const filter = entityId ? { entity_id: new mongoose.Types.ObjectId(entityId), is_active: true } : { is_active: true };

  const [bankAccts, pettyFunds] = await Promise.all([
    BankAccount.find(filter).select('bank_name account_no current_balance').lean(),
    PettyCashFund.find(filter).select('fund_name current_balance balance_ceiling').lean(),
  ]);

  const bankTotal = bankAccts.reduce((s, a) => s + (a.current_balance || 0), 0);
  const pettyTotal = pettyFunds.reduce((s, f) => s + (f.current_balance || 0), 0);

  return {
    bank_total: Math.round(bankTotal * 100) / 100,
    petty_cash_total: Math.round(pettyTotal * 100) / 100,
    grand_total: Math.round((bankTotal + pettyTotal) * 100) / 100,
    bank_account_count: bankAccts.length,
    petty_fund_count: pettyFunds.length,
    // Top-3 bank accounts by balance — gives the CFO a quick "where's the cash"
    // view without forcing a click-through to /erp/banking. Not paginated;
    // intentional — if you have > 3 accounts the cockpit just shows the top 3.
    top_accounts: bankAccts
      .sort((a, b) => (b.current_balance || 0) - (a.current_balance || 0))
      .slice(0, 3)
      .map((a) => ({
        bank_name: a.bank_name,
        account_no: a.account_no,
        balance: Math.round((a.current_balance || 0) * 100) / 100,
      })),
  };
}

/**
 * AR aging roll-up — delegates to arEngine.getArAging() and reduces to a
 * cockpit-shape (total + > 90 d % + top 3 hospitals). Never re-bucketizes.
 */
async function getArAgingRollup(entityId, bdmId, isAdmin) {
  // Privileged users should see entity-wide AR (Rule #21). Pass null bdmId
  // unless the caller is an actual BDM — never silently fall back to user._id.
  const effectiveBdmId = isAdmin ? null : bdmId;
  const aging = await arEngine.getArAging(entityId, effectiveBdmId, null);

  const buckets = aging?.buckets || {};
  const total = Object.values(buckets).reduce((s, v) => s + (v || 0), 0);
  const over90 = (buckets.OVERDUE_90 || 0) + (buckets.OVERDUE_120 || 0);
  const over90Pct = total > 0 ? Math.round((over90 / total) * 10000) / 100 : 0;

  return {
    total: Math.round(total * 100) / 100,
    buckets: {
      current: Math.round((buckets.CURRENT || 0) * 100) / 100,
      d_30: Math.round((buckets.OVERDUE_30 || 0) * 100) / 100,
      d_60: Math.round((buckets.OVERDUE_60 || 0) * 100) / 100,
      d_90: Math.round((buckets.OVERDUE_90 || 0) * 100) / 100,
      d_120: Math.round((buckets.OVERDUE_120 || 0) * 100) / 100,
    },
    over_90_pct: over90Pct,
    top_overdue: (aging?.hospitals || [])
      .filter((h) => (h.total_outstanding || h.total || 0) > 0)
      .sort((a, b) => (b.total_outstanding || b.total || 0) - (a.total_outstanding || a.total || 0))
      .slice(0, 3)
      .map((h) => ({
        hospital_id: h.hospital_id || h._id,
        hospital_name: h.hospital_name || 'Unknown',
        outstanding: Math.round((h.total_outstanding || h.total || 0) * 100) / 100,
      })),
  };
}

/**
 * AP aging roll-up — delegates to apService.getApAging().
 */
async function getApAgingRollup(entityId) {
  const aging = await apService.getApAging(entityId);
  const buckets = aging?.buckets || {};
  const over90 = buckets.days_90_plus || 0;
  const total = aging?.total_outstanding || 0;
  const over90Pct = total > 0 ? Math.round((over90 / total) * 10000) / 100 : 0;

  return {
    total: Math.round(total * 100) / 100,
    buckets: {
      current: Math.round((buckets.current || 0) * 100) / 100,
      d_30: Math.round((buckets.days_1_30 || 0) * 100) / 100,
      d_60: Math.round((buckets.days_31_60 || 0) * 100) / 100,
      d_90: Math.round((buckets.days_61_90 || 0) * 100) / 100,
      d_120: Math.round((buckets.days_90_plus || 0) * 100) / 100,
    },
    over_90_pct: over90Pct,
    invoice_count: aging?.invoice_count || 0,
    top_overdue: (aging?.vendor_breakdown || [])
      .slice(0, 3)
      .map((v) => ({
        vendor_id: v.vendor_id,
        vendor_name: v.vendor_name || 'Unknown',
        outstanding: Math.round((v.total || 0) * 100) / 100,
      })),
  };
}

/**
 * Period-close status — current month progress.
 * Step states are PENDING / IN_PROGRESS / COMPLETED / ERROR (per
 * monthEndClose.STEPS contract).
 */
async function getPeriodCloseStatus(entityId) {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const progress = await monthEndClose.getCloseProgress(entityId, period);
  const steps = progress?.steps || [];
  const total = steps.length || (monthEndClose.STEPS?.length || 0);
  const completed = steps.filter((s) => s.status === 'COMPLETED').length;
  const inProgress = steps.filter((s) => s.status === 'IN_PROGRESS').length;
  const errored = steps.filter((s) => s.status === 'ERROR').length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    period,
    period_status: progress?.period_status || 'OPEN',
    pct_complete: pct,
    steps_total: total,
    steps_completed: completed,
    steps_in_progress: inProgress,
    steps_errored: errored,
  };
}

/**
 * Approval SLA — pending count, > 48 h count, oldest age in hours.
 * Reads ApprovalRequest directly (lightweight aggregation; the universal
 * approval service does heavy joins per row that we don't need for a tile).
 */
async function getApprovalSla(entityId) {
  const filter = { status: 'PENDING' };
  if (entityId) filter.entity_id = new mongoose.Types.ObjectId(entityId);

  const requests = await ApprovalRequest.find(filter)
    .select('createdAt requested_at module')
    .sort({ createdAt: 1 })
    .lean();

  const now = Date.now();
  const slaMs = DEFAULT_APPROVAL_SLA_HOURS * 60 * 60 * 1000;
  let breached = 0;
  let oldestAgeMs = 0;
  const byModule = {};

  for (const r of requests) {
    const submittedAt = new Date(r.requested_at || r.createdAt).getTime();
    const ageMs = now - submittedAt;
    if (ageMs > slaMs) breached++;
    if (ageMs > oldestAgeMs) oldestAgeMs = ageMs;
    byModule[r.module || 'UNKNOWN'] = (byModule[r.module || 'UNKNOWN'] || 0) + 1;
  }

  return {
    pending_count: requests.length,
    breached_sla: breached,
    sla_hours: DEFAULT_APPROVAL_SLA_HOURS,
    oldest_age_hours: Math.round((oldestAgeMs / 3600000) * 10) / 10,
    by_module: Object.entries(byModule)
      .map(([module, count]) => ({ module, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}

/**
 * Agent health — last-run status per agent_key. Mirrors
 * agentController.getStats() shape but reduced to a tile.
 */
async function getAgentHealth(entityId) {
  const match = {};
  if (entityId) match.entity_id = new mongoose.Types.ObjectId(entityId);

  // Last 30 d window — older runs aren't load-bearing for "is X red right now".
  match.run_date = { $gte: new Date(Date.now() - 30 * 86400000) };

  const agg = await AgentRun.aggregate([
    { $match: match },
    { $sort: { run_date: -1 } },
    {
      $group: {
        _id: '$agent_key',
        last_run: { $first: '$run_date' },
        last_status: { $first: '$status' },
        last_alerts: { $first: { $ifNull: ['$summary.alerts_generated', 0] } },
        total_runs: { $sum: 1 },
        success_count: {
          $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] },
        },
        failure_count: {
          $sum: { $cond: [{ $eq: ['$status', 'FAILURE'] }, 1, 0] },
        },
        total_alerts: { $sum: { $ifNull: ['$summary.alerts_generated', 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const total = agg.length;
  const failing = agg.filter((a) => a.last_status === 'FAILURE').length;
  const stale = agg.filter((a) => {
    const ageMs = Date.now() - new Date(a.last_run).getTime();
    return ageMs > 7 * 86400000; // no run in 7 d = stale
  }).length;

  return {
    agents_total: total,
    agents_failing: failing,
    agents_stale: stale,
    total_alerts_30d: agg.reduce((s, a) => s + (a.total_alerts || 0), 0),
    agents: agg.map((a) => ({
      agent_key: a._id,
      last_run: a.last_run,
      last_status: a.last_status,
      last_alerts: a.last_alerts,
      success_rate: a.total_runs > 0 ? Math.round((a.success_count / a.total_runs) * 100) : null,
    })),
  };
}

// ─── Tier-2 ─────────────────────────────────────────────────────────────────

/**
 * Margin tile — reuses dashboardService.getMtd().gross_margin so the
 * cockpit and the existing ERP dashboard agree.
 */
async function getMargin(entityId, bdmId, isAdmin) {
  const mtd = await getMtd(entityId, bdmId, isAdmin);
  return {
    gross_margin_pct: mtd?.gross_margin || 0,
    sales_mtd: mtd?.sales_mtd || 0,
    collection_rate: mtd?.collection_rate || 0,
    dso: mtd?.dso || 0,
  };
}

/**
 * Inventory turns — outflow MTD ÷ avg-on-hand. Coarse but actionable.
 * Computed from InventoryLedger qty_in/qty_out so it always matches the
 * stock figures the warehouse team sees.
 */
async function getInventoryTurns(entityId) {
  const filter = entityId ? { entity_id: new mongoose.Types.ObjectId(entityId) } : {};
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [allTime, mtdOut] = await Promise.all([
    InventoryLedger.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { product_id: '$product_id', batch_lot_no: '$batch_lot_no' },
          total_in: { $sum: '$qty_in' },
          total_out: { $sum: '$qty_out' },
        },
      },
      { $addFields: { available: { $subtract: ['$total_in', '$total_out'] } } },
      { $match: { available: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          on_hand_units: { $sum: '$available' },
        },
      },
    ]),
    InventoryLedger.aggregate([
      { $match: { ...filter, recorded_at: { $gte: monthStart } } },
      { $group: { _id: null, out: { $sum: '$qty_out' } } },
    ]),
  ]);

  const onHand = allTime[0]?.on_hand_units || 0;
  const out = mtdOut[0]?.out || 0;
  // Annualized turns: (MTD out × 12) / on-hand. Rough — but trend is what matters.
  const turns = onHand > 0 ? Math.round((out * 12 / onHand) * 100) / 100 : 0;
  // Days on hand = 30 × on-hand / MTD out. Capped at 9999 for display.
  const daysOnHand = out > 0 ? Math.min(9999, Math.round((onHand * 30 / out) * 10) / 10) : null;

  return {
    on_hand_units: onHand,
    mtd_outflow_units: out,
    annualized_turns: turns,
    days_on_hand: daysOnHand,
  };
}

/**
 * Partnership funnel — Doctor counts by partnership_status.
 * Cross-DB safe: Doctor lives in CRM DB, no $lookup to ERP collections.
 */
async function getPartnershipFunnel() {
  const counts = await Doctor.aggregate([
    { $match: { isActive: { $ne: false } } },
    { $group: { _id: '$partnership_status', count: { $sum: 1 } } },
  ]);

  const byStatus = {
    LEAD: 0, CONTACTED: 0, VISITED: 0, PARTNER: 0, INACTIVE: 0,
  };
  for (const row of counts) {
    if (row._id && byStatus[row._id] !== undefined) byStatus[row._id] = row.count;
  }
  const top = byStatus.LEAD + byStatus.CONTACTED + byStatus.VISITED;
  const conversionPct = top > 0 ? Math.round((byStatus.PARTNER / (top + byStatus.PARTNER)) * 10000) / 100 : 0;

  return {
    by_status: byStatus,
    total_active_pipeline: top,
    total_partners: byStatus.PARTNER,
    conversion_pct: conversionPct,
  };
}

/**
 * BIR calendar — overdue + due-in-30-days roll-up. Reuses the heatmap data.
 */
async function getBirCalendar(entityId) {
  if (!entityId) {
    return { overdue: 0, due_30d: 0, filed_this_quarter: 0, upcoming: [] };
  }

  const now = new Date();
  const in30d = new Date(now.getTime() + 30 * 86400000);
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

  const rows = await BirFilingStatus.find({
    entity_id: new mongoose.Types.ObjectId(entityId),
    period_year: { $gte: now.getFullYear() - 1 },
  })
    .select('form_code period_year period_month period_quarter status filed_at confirmed_at')
    .lean();

  // Compute due date from form_code + period (cockpit-side; canonical due-date
  // logic lives in birDeadlineService — keep this in sync if that file moves).
  function dueDateFor(row) {
    const y = row.period_year;
    const m = row.period_month;
    const q = row.period_quarter;
    if (m) {
      // Most monthly forms due 20th of next month (2550M, 1601-C, 1606)
      return new Date(y, m, 20);
    }
    if (q) {
      // Quarterly forms — due 25th of month following quarter end
      return new Date(y, q * 3, 25);
    }
    // Annual — Apr 15 of next year
    return new Date(y + 1, 3, 15);
  }

  let overdue = 0;
  let due30 = 0;
  let filedThisQuarter = 0;
  const upcoming = [];

  for (const r of rows) {
    const due = dueDateFor(r);
    const filed = ['FILED', 'CONFIRMED'].includes(r.status);
    if (filed) {
      const filedAt = r.filed_at || r.confirmed_at;
      if (filedAt && new Date(filedAt) >= quarterStart) filedThisQuarter++;
      continue;
    }
    if (due < now) overdue++;
    else if (due <= in30d) {
      due30++;
      upcoming.push({
        form_code: r.form_code,
        period: r.period_month
          ? `${r.period_year}-${String(r.period_month).padStart(2, '0')}`
          : r.period_quarter
          ? `${r.period_year} Q${r.period_quarter}`
          : `${r.period_year}`,
        due_date: due,
        status: r.status,
      });
    }
  }

  upcoming.sort((a, b) => a.due_date - b.due_date);

  return {
    overdue,
    due_30d: due30,
    filed_this_quarter: filedThisQuarter,
    upcoming: upcoming.slice(0, 5),
  };
}

// ─── Aggregator ─────────────────────────────────────────────────────────────

/**
 * Build the full cockpit payload. Uses Promise.allSettled so a single tile's
 * failure doesn't dark the page. Each tile returns either:
 *   - { status: 'ok', value: <data> }
 *   - { status: 'error', message: 'error text' }
 *
 * @param {Object} ctx { entityId, bdmId, isAdmin, isPresident, includeFinancial, includeOperational }
 */
async function getCockpit(ctx) {
  const { entityId, bdmId, isAdmin, isPresident, includeFinancial, includeOperational } = ctx;
  const adminLike = !!(isAdmin || isPresident);

  // Tile registry: code → { tier, scope, runner }. Adding a new tile = adding
  // a row here. Frontend does not need to be redeployed if the new tile is in
  // a scope the user already holds — it just shows up.
  const TILES = [
    // Tier-1
    { code: 'cash',             tier: 1, scope: 'financial',   run: () => getCash(entityId) },
    { code: 'ar_aging',         tier: 1, scope: 'financial',   run: () => getArAgingRollup(entityId, bdmId, adminLike) },
    { code: 'ap_aging',         tier: 1, scope: 'financial',   run: () => getApAgingRollup(entityId) },
    { code: 'period_close',     tier: 1, scope: 'financial',   run: () => getPeriodCloseStatus(entityId) },
    { code: 'approval_sla',     tier: 1, scope: 'operational', run: () => getApprovalSla(entityId) },
    { code: 'agent_health',     tier: 1, scope: 'operational', run: () => getAgentHealth(entityId) },
    // Tier-2
    { code: 'margin',           tier: 2, scope: 'financial',   run: () => getMargin(entityId, bdmId, adminLike) },
    { code: 'inventory_turns',  tier: 2, scope: 'operational', run: () => getInventoryTurns(entityId) },
    { code: 'partnership_funnel', tier: 2, scope: 'operational', run: () => getPartnershipFunnel() },
    { code: 'bir_calendar',     tier: 2, scope: 'operational', run: () => getBirCalendar(entityId) },
  ];

  const visible = TILES.filter((t) => {
    if (t.scope === 'financial' && !includeFinancial) return false;
    if (t.scope === 'operational' && !includeOperational) return false;
    return true;
  });

  const results = await Promise.allSettled(visible.map((t) => t.run()));

  const tiles = {};
  results.forEach((r, i) => {
    const tile = visible[i];
    if (r.status === 'fulfilled') {
      tiles[tile.code] = { status: 'ok', tier: tile.tier, scope: tile.scope, value: r.value };
    } else {
      tiles[tile.code] = {
        status: 'error',
        tier: tile.tier,
        scope: tile.scope,
        message: r.reason?.message || String(r.reason || 'unknown error'),
      };
    }
  });

  return {
    generated_at: new Date().toISOString(),
    entity_id: entityId || null,
    scopes: {
      financial: includeFinancial,
      operational: includeOperational,
    },
    tiles,
  };
}

module.exports = {
  getCockpit,
  // Exposed individually for unit tests / future tile-detail endpoints.
  getCash,
  getArAgingRollup,
  getApAgingRollup,
  getPeriodCloseStatus,
  getApprovalSla,
  getAgentHealth,
  getMargin,
  getInventoryTurns,
  getPartnershipFunnel,
  getBirCalendar,
};
