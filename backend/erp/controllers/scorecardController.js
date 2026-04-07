const PartnerScorecard = require('../models/PartnerScorecard');
const PeopleMaster = require('../models/PeopleMaster');
const ErpSettings = require('../models/Settings');
const AgentRun = require('../models/AgentRun');
const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');
const ExpenseEntry = require('../models/ExpenseEntry');
const Visit = require('../../models/Visit');
const Doctor = require('../../models/Doctor');
const Entity = require('../models/Entity');
const { catchAsync } = require('../../middleware/errorHandler');

/**
 * Scorecard Controller — Phase 24B
 * Aggregates CRM + ERP data into monthly partner scorecards.
 */

// ═══ Helpers ═══

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthStartEnd(period) {
  const [y, m] = period.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}



// ═══ Compute all scorecards ═══

exports.compute = catchAsync(async (req, res) => {
  const period = req.query.period || currentPeriod();
  const { start, end } = monthStartEnd(period);

  // Get entities — president computes all, others compute their own
  let entityIds;
  if (req.isPresident) {
    const entities = await Entity.find({ status: 'ACTIVE' }).select('_id').lean();
    entityIds = entities.map(e => e._id);
  } else {
    entityIds = [req.entityId];
  }

  // Get graduation criteria from settings
  const settings = await ErpSettings.getSettings();
  const gradCriteria = settings.GRADUATION_CRITERIA || [];
  const weights = settings.SCORECARD_WEIGHTS || { visits: 25, sales: 25, collections: 20, efficiency: 15, engagement: 15 };

  // Get all active partners across entities
  const partners = await PeopleMaster.find({
    entity_id: { $in: entityIds },
    person_type: { $in: ['BDM', 'ECOMMERCE_BDM', 'CONSULTANT'] },
    is_active: true,
  }).lean();

  // Compute org-wide averages for normalization
  const allSales = await SalesLine.aggregate([
    { $match: { entity_id: { $in: entityIds }, status: 'POSTED', csi_date: { $gte: start, $lte: end } } },
    { $group: { _id: null, total: { $sum: '$invoice_total' }, count: { $sum: 1 } } },
  ]);
  const orgAvgSales = partners.length > 0 ? (allSales[0]?.total || 0) / partners.length : 1;

  const results = [];

  for (const partner of partners) {
    const userId = partner.user_id;
    if (!userId) continue; // skip partners without CRM user link

    // ── Visits (CRM) ──
    const visitAgg = await Visit.aggregate([
      { $match: { user: userId, visitDate: { $gte: start, $lte: end } } },
      { $group: { _id: null, count: { $sum: 1 }, uniqueDoctors: { $addToSet: '$doctor' } } },
    ]);
    const visitsCompleted = visitAgg[0]?.count || 0;
    const uniqueClients = visitAgg[0]?.uniqueDoctors?.length || 0;

    // Expected visits = sum of assigned doctors' frequencies
    const doctors = await Doctor.find({ assignedTo: userId, isActive: true })
      .select('visitFrequency levelOfEngagement')
      .lean();
    const visitsExpected = doctors.reduce((sum, d) => sum + (d.visitFrequency || 2), 0);
    const visitCompliancePct = visitsExpected > 0 ? Math.min(100, Math.round((visitsCompleted / visitsExpected) * 100)) : 0;
    const avgEngagement = doctors.length > 0
      ? Math.round((doctors.reduce((s, d) => s + (d.levelOfEngagement || 1), 0) / doctors.length) * 10) / 10
      : 0;

    // ── Sales (ERP) ──
    const salesAgg = await SalesLine.aggregate([
      { $match: { entity_id: partner.entity_id, bdm_id: userId, status: 'POSTED', csi_date: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: '$invoice_total' }, count: { $sum: 1 } } },
    ]);
    const salesTotal = salesAgg[0]?.total || 0;
    const salesCount = salesAgg[0]?.count || 0;
    const avgInvoice = salesCount > 0 ? Math.round(salesTotal / salesCount) : 0;

    // ── Collections (ERP) ──
    const collAgg = await Collection.aggregate([
      { $match: { entity_id: partner.entity_id, bdm_id: userId, status: 'POSTED', cr_date: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: '$cr_amount' }, count: { $sum: 1 } } },
    ]);
    const collTotal = collAgg[0]?.total || 0;
    const collCount = collAgg[0]?.count || 0;
    const collRatePct = salesTotal > 0 ? Math.min(100, Math.round((collTotal / salesTotal) * 100)) : 0;

    // ── Expenses (ERP) ──
    const expAgg = await ExpenseEntry.aggregate([
      { $match: { entity_id: partner.entity_id, bdm_id: userId, status: { $in: ['POSTED', 'VALID'] }, period } },
      { $group: { _id: null, total: { $sum: '$total_amount' } } },
    ]);
    const expTotal = expAgg[0]?.total || 0;
    const expRatio = salesTotal > 0 ? Math.round((expTotal / salesTotal) * 100) : 0;

    // ── Clients at risk (doctors with low engagement or no recent visit) ──
    const thirtyDaysAgo = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentVisitDoctors = await Visit.distinct('doctor', {
      user: userId,
      visitDate: { $gte: thirtyDaysAgo },
    });
    const clientsAtRisk = Math.max(0, doctors.length - recentVisitDoctors.length);

    // ── Composite Scores (0-100) ──
    const scoreVisits = visitCompliancePct;
    const scoreSales = orgAvgSales > 0 ? Math.min(100, Math.round((salesTotal / orgAvgSales) * 50)) : 0;
    const scoreColl = collRatePct;
    const scoreEff = Math.max(0, Math.round(100 - expRatio * 2)); // 50% ratio = 0 score
    const scoreEng = Math.round((avgEngagement / 5) * 100);

    const scoreOverall = Math.round(
      (scoreVisits * weights.visits +
       scoreSales * weights.sales +
       scoreColl * weights.collections +
       scoreEff * weights.efficiency +
       scoreEng * weights.engagement) / 100
    );

    // ── Graduation criteria ──
    const monthsActive = partner.date_hired
      ? Math.floor((end - new Date(partner.date_hired)) / (30.44 * 24 * 60 * 60 * 1000))
      : 0;

    const criteriaActuals = {
      min_months_active: monthsActive,
      min_clients: doctors.length,
      min_monthly_sales: salesTotal,
      min_collection_rate: collRatePct,
      max_expense_ratio: expRatio,
      min_compliance: visitCompliancePct,
      min_engagement: avgEngagement,
    };

    const gradResults = gradCriteria.map(c => {
      const actual = criteriaActuals[c.key] ?? 0;
      const met = c.comparator === 'lte' ? actual <= c.target : actual >= c.target;
      return { key: c.key, label: c.label, target: c.target, actual: Math.round(actual * 100) / 100, comparator: c.comparator, met };
    });

    const checklistMet = gradResults.filter(c => c.met).length;
    const checklistTotal = gradResults.length || 7;

    // ── AI Insights (latest from each agent) ──
    const agentKeys = ['performance_coach', 'visit_compliance', 'engagement_decay'];
    const insights = [];
    for (const agentKey of agentKeys) {
      const run = await AgentRun.findOne({ agent_key: agentKey, status: 'success' })
        .sort({ run_date: -1 })
        .select('agent_label summary.key_findings run_date')
        .lean();
      if (run && run.summary?.key_findings?.length > 0) {
        // Find findings mentioning this partner
        const partnerName = partner.full_name?.split(' ')[0]; // first name match
        const relevant = run.summary.key_findings.find(f =>
          f.toLowerCase().includes(partnerName?.toLowerCase() || '___')
        );
        if (relevant) {
          insights.push({
            agent: agentKey,
            message: relevant,
            severity: relevant.toLowerCase().includes('critical') || relevant.toLowerCase().includes('low') ? 'warning' : 'info',
            run_date: run.run_date,
          });
        }
      }
    }

    // ── Upsert ──
    const scorecard = await PartnerScorecard.findOneAndUpdate(
      { entity_id: partner.entity_id, person_id: partner._id, period },
      {
        $set: {
          user_id: userId,
          track: 'PARTNER',
          visits_completed: visitsCompleted,
          visits_expected: visitsExpected,
          visit_compliance_pct: visitCompliancePct,
          unique_clients_visited: uniqueClients,
          sales_total: salesTotal,
          sales_count: salesCount,
          avg_invoice_value: avgInvoice,
          collections_total: collTotal,
          collections_count: collCount,
          collection_rate_pct: collRatePct,
          expenses_total: expTotal,
          expense_sales_ratio_pct: expRatio,
          total_clients_assigned: doctors.length,
          clients_at_risk: clientsAtRisk,
          avg_engagement_level: avgEngagement,
          score_visits: scoreVisits,
          score_sales: scoreSales,
          score_collections: scoreColl,
          score_efficiency: scoreEff,
          score_engagement: scoreEng,
          score_overall: scoreOverall,
          graduation: {
            criteria: gradResults,
            checklist_met: checklistMet,
            checklist_total: checklistTotal,
            readiness_pct: Math.round((checklistMet / checklistTotal) * 100),
            ready: checklistMet === checklistTotal,
          },
          ai_insights: insights,
          computed_at: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    results.push({
      person: partner.full_name,
      score_overall: scoreOverall,
      graduation: `${checklistMet}/${checklistTotal}`,
    });
  }

  res.json({
    success: true,
    message: `Computed ${results.length} scorecards for ${period}`,
    data: { period, computed: results.length, scorecards: results },
  });
});

// ═══ List scorecards ═══

exports.list = catchAsync(async (req, res) => {
  const period = req.query.period || currentPeriod();
  const filter = { period };

  if (req.isPresident) {
    // President sees all entities
    if (req.query.entity_id) filter.entity_id = req.query.entity_id;
  } else {
    filter.entity_id = req.entityId;
  }

  const scorecards = await PartnerScorecard.find(filter)
    .populate('person_id', 'full_name person_type position department bdm_code entity_id')
    .populate('entity_id', 'entity_name short_name entity_type')
    .sort({ score_overall: -1 })
    .lean();

  res.json({ success: true, data: scorecards });
});

// ═══ Rankings ═══

exports.rankings = catchAsync(async (req, res) => {
  const period = req.query.period || currentPeriod();
  const filter = { period };
  if (!req.isPresident) filter.entity_id = req.entityId;

  const scorecards = await PartnerScorecard.find(filter)
    .populate('person_id', 'full_name person_type position bdm_code')
    .populate('entity_id', 'short_name')
    .sort({ score_overall: -1 })
    .lean();

  const ranked = scorecards.map((s, i) => ({
    rank: i + 1,
    name: s.person_id?.full_name,
    type: s.person_id?.person_type,
    entity: s.entity_id?.short_name,
    score_overall: s.score_overall,
    score_visits: s.score_visits,
    score_sales: s.score_sales,
    score_collections: s.score_collections,
    graduation_pct: s.graduation?.readiness_pct || 0,
    graduation_ready: s.graduation?.ready || false,
  }));

  res.json({ success: true, data: ranked });
});

// ═══ Group summary (cross-entity) ═══

exports.groupSummary = catchAsync(async (req, res) => {
  const period = req.query.period || currentPeriod();

  const pipeline = [
    { $match: { period } },
    { $lookup: { from: 'entities', localField: 'entity_id', foreignField: '_id', as: 'entity' } },
    { $unwind: { path: '$entity', preserveNullAndEmptyArrays: true } },
    { $group: {
      _id: '$entity_id',
      entity_name: { $first: '$entity.short_name' },
      entity_type: { $first: '$entity.entity_type' },
      count: { $sum: 1 },
      avg_score: { $avg: '$score_overall' },
      near_graduation: { $sum: { $cond: [{ $gte: ['$graduation.readiness_pct', 85] }, 1, 0] } },
      at_risk: { $sum: { $cond: [{ $lt: ['$score_overall', 40] }, 1, 0] } },
      total_sales: { $sum: '$sales_total' },
      total_collections: { $sum: '$collections_total' },
    }},
    { $sort: { entity_type: 1, entity_name: 1 } },
  ];

  const summary = await PartnerScorecard.aggregate(pipeline);

  // Org-wide totals
  const totals = summary.reduce((acc, s) => ({
    total_partners: acc.total_partners + s.count,
    avg_score: 0, // computed below
    near_graduation: acc.near_graduation + s.near_graduation,
    at_risk: acc.at_risk + s.at_risk,
  }), { total_partners: 0, avg_score: 0, near_graduation: 0, at_risk: 0 });

  if (totals.total_partners > 0) {
    totals.avg_score = Math.round(summary.reduce((s, e) => s + e.avg_score * e.count, 0) / totals.total_partners);
  }

  res.json({ success: true, data: { period, entities: summary, totals } });
});

// ═══ Single partner scorecard + history ═══

exports.getByPerson = catchAsync(async (req, res) => {
  const { personId } = req.params;
  const period = req.query.period || currentPeriod();

  const current = await PartnerScorecard.findOne({ person_id: personId, period })
    .populate('person_id', 'full_name person_type position department bdm_code date_hired')
    .populate('entity_id', 'entity_name short_name')
    .lean();

  // Last 6 months history
  const history = await PartnerScorecard.find({ person_id: personId })
    .sort({ period: -1 })
    .limit(6)
    .select('period score_overall score_visits score_sales score_collections score_efficiency score_engagement graduation.readiness_pct')
    .lean();

  res.json({ success: true, data: { current, history } });
});
