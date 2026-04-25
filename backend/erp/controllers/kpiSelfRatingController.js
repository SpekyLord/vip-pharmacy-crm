/**
 * KPI Self-Rating Controller — Phase 32
 *
 * Universal KPI self-rating & performance review.
 * 10 endpoints covering the full self → manager → approval workflow.
 *
 * Auto-draft creation logic:
 *   1. Find person's FunctionalRoleAssignment(s) → get their functional_roles
 *   2. Fetch KPI_CODE lookup → filter by functional_roles matching OR 'ALL'
 *   3. Fetch COMPETENCY lookup → all (apply to everyone)
 *   4. If existing DRAFT found → return it
 *   5. Else create new DRAFT with pre-filled kpi_ratings + competency_ratings
 */

const KpiSelfRating = require('../models/KpiSelfRating');
const FunctionalRoleAssignment = require('../models/FunctionalRoleAssignment');
const PeopleMaster = require('../models/PeopleMaster');
const Lookup = require('../models/Lookup');
const { catchAsync } = require('../../middleware/errorHandler');
const { isAdminLike } = require('../../constants/roles');

// ─── Helpers ──────────────────────────────────────────────────────

const POPULATE_PERSON = { path: 'person_id', select: 'full_name position department person_type reports_to' };
const POPULATE_REVIEWER = { path: 'reviewer_id', select: 'full_name position department' };
const POPULATE_APPROVER = { path: 'approved_by', select: 'name' };

async function findPersonForUser(req) {
  return PeopleMaster.findOne({
    linked_user_id: req.user._id,
    entity_id: req.entityId,
    is_active: true,
  }).lean();
}

function buildPeriod(periodType, year, month) {
  const y = year || new Date().getFullYear();
  const m = month || (new Date().getMonth() + 1);
  switch (periodType) {
    case 'MONTHLY':     return `${y}-${String(m).padStart(2, '0')}`;
    case 'QUARTERLY':   return `${y}-Q${Math.ceil(m / 3)}`;
    case 'SEMI_ANNUAL': return `${y}-H${m <= 6 ? 1 : 2}`;
    case 'ANNUAL':      return `${y}`;
    default:            return `${y}`;
  }
}

async function getKpisForPerson(personId, entityId) {
  // Get person's functional roles from active assignments
  const assignments = await FunctionalRoleAssignment.find({
    entity_id: entityId,
    person_id: personId,
    is_active: true,
    status: 'ACTIVE',
  }).select('functional_role').lean();

  const personRoles = [...new Set(assignments.map(a => a.functional_role))];

  // Fetch all KPI_CODE lookups for this entity
  const kpiLookups = await Lookup.find({
    entity_id: entityId,
    category: 'KPI_CODE',
    is_active: true,
  }).sort({ sort_order: 1 }).lean();

  // Filter KPIs: match person's functional_roles OR 'ALL'
  return kpiLookups.filter(kpi => {
    const fr = kpi.metadata?.functional_roles;
    if (!fr || fr.length === 0) return true; // No restriction = available to all
    if (fr.includes('ALL')) return true;
    return fr.some(r => personRoles.includes(r));
  });
}

async function getCompetencies(entityId) {
  return Lookup.find({
    entity_id: entityId,
    category: 'COMPETENCY',
    is_active: true,
  }).sort({ sort_order: 1 }).lean();
}

// ═══ 1. getMyRatings — Own ratings history ═══

const getMyRatings = catchAsync(async (req, res) => {
  const person = await findPersonForUser(req);
  if (!person) return res.status(404).json({ success: false, message: 'No PeopleMaster record linked to your account' });

  const filter = { entity_id: req.entityId, person_id: person._id };
  if (req.query.fiscal_year) filter.fiscal_year = Number(req.query.fiscal_year);
  if (req.query.period_type) filter.period_type = req.query.period_type;

  const ratings = await KpiSelfRating.find(filter)
    .populate(POPULATE_REVIEWER)
    .sort({ fiscal_year: -1, period: -1 })
    .lean();

  res.json({ success: true, data: ratings });
});

// ═══ 2. getMyCurrentDraft — Get or auto-create DRAFT for current period ═══

const getMyCurrentDraft = catchAsync(async (req, res) => {
  const person = await findPersonForUser(req);
  if (!person) return res.status(404).json({ success: false, message: 'No PeopleMaster record linked to your account' });

  const periodType = req.query.period_type || 'QUARTERLY';
  const year = Number(req.query.fiscal_year) || new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const period = buildPeriod(periodType, year, month);

  // Check for existing draft or in-progress rating
  let rating = await KpiSelfRating.findOne({
    entity_id: req.entityId,
    person_id: person._id,
    period,
    period_type: periodType,
  }).populate(POPULATE_REVIEWER).lean();

  if (rating) return res.json({ success: true, data: rating });

  // Auto-create new draft
  const [kpis, competencies] = await Promise.all([
    getKpisForPerson(person._id, req.entityId),
    getCompetencies(req.entityId),
  ]);

  const kpi_ratings = kpis.map(k => ({
    kpi_code: k.code,
    kpi_label: k.label,
    unit: k.metadata?.unit || '',
    direction: k.metadata?.direction || 'higher_better',
    target_value: k.metadata?.default_target || null,
    actual_value: null,
    self_score: null,
    self_comment: '',
    manager_score: null,
    manager_comment: '',
  }));

  const competency_ratings = competencies.map(c => ({
    competency_code: c.code,
    competency_label: c.label,
    self_score: null,
    self_comment: '',
    manager_score: null,
    manager_comment: '',
  }));

  // Resolve reviewer from reports_to
  const reviewer_id = person.reports_to || null;

  rating = await KpiSelfRating.create({
    entity_id: req.entityId,
    person_id: person._id,
    reviewer_id,
    fiscal_year: year,
    period,
    period_type: periodType,
    kpi_ratings,
    competency_ratings,
    status: 'DRAFT',
    created_by: req.user._id,
  });

  // Re-fetch with population
  // eslint-disable-next-line vip-tenant/require-entity-filter -- by-key re-fetch for populate immediately after KpiSelfRating.create above; entity_id was stamped on create
  rating = await KpiSelfRating.findById(rating._id).populate(POPULATE_REVIEWER).lean();

  res.status(201).json({ success: true, data: rating, message: 'Draft created' });
});

// ═══ 3. getRatingById — Single rating ═══

const getRatingById = catchAsync(async (req, res) => {
  const rating = await KpiSelfRating.findOne({
    _id: req.params.id,
    entity_id: req.entityId,
  })
    .populate(POPULATE_PERSON)
    .populate(POPULATE_REVIEWER)
    .populate(POPULATE_APPROVER)
    .lean();

  if (!rating) return res.status(404).json({ success: false, message: 'Rating not found' });

  // Access check: self, reviewer, or admin
  const person = await findPersonForUser(req);
  const isSelf = person && rating.person_id?._id?.toString() === person._id.toString();
  const isReviewer = person && rating.reviewer_id?._id?.toString() === person._id.toString();
  const isAdmin = isAdminLike(req.user.role);

  if (!isSelf && !isReviewer && !isAdmin) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  res.json({ success: true, data: rating });
});

// ═══ 4. getRatingsForReview — Manager's pending reviews from direct reports ═══

const getRatingsForReview = catchAsync(async (req, res) => {
  const person = await findPersonForUser(req);
  if (!person && !isAdminLike(req.user.role)) {
    return res.status(404).json({ success: false, message: 'No PeopleMaster record linked to your account' });
  }

  const filter = { entity_id: req.entityId };

  if (isAdminLike(req.user.role)) {
    // Admin sees all submitted/reviewed ratings
    if (req.query.status) filter.status = req.query.status;
    else filter.status = { $in: ['SUBMITTED', 'REVIEWED'] };
  } else {
    // Manager sees only their direct reports
    filter.reviewer_id = person._id;
    filter.status = req.query.status || 'SUBMITTED';
  }

  if (req.query.fiscal_year) filter.fiscal_year = Number(req.query.fiscal_year);
  if (req.query.period_type) filter.period_type = req.query.period_type;

  const ratings = await KpiSelfRating.find(filter)
    .populate(POPULATE_PERSON)
    .populate(POPULATE_REVIEWER)
    .sort({ submitted_at: -1 })
    .lean();

  res.json({ success: true, data: ratings });
});

// ═══ 5. getRatingsByPerson — Admin: all ratings for a specific person ═══

const getRatingsByPerson = catchAsync(async (req, res) => {
  const filter = { person_id: req.params.personId };
  // President can see cross-entity; others scoped
  if (!req.isPresident) filter.entity_id = req.entityId;
  if (req.query.fiscal_year) filter.fiscal_year = Number(req.query.fiscal_year);

  const ratings = await KpiSelfRating.find(filter)
    .populate(POPULATE_PERSON)
    .populate(POPULATE_REVIEWER)
    .populate(POPULATE_APPROVER)
    .sort({ fiscal_year: -1, period: -1 })
    .lean();

  res.json({ success: true, data: ratings });
});

// ═══ 6. saveDraft — Create or update DRAFT ═══

const saveDraft = catchAsync(async (req, res) => {
  const person = await findPersonForUser(req);
  if (!person) return res.status(404).json({ success: false, message: 'No PeopleMaster record linked to your account' });

  const { kpi_ratings, competency_ratings, overall_self_score, overall_self_comment,
    period, period_type, fiscal_year } = req.body;

  // Find existing draft for this period
  let rating = await KpiSelfRating.findOne({
    entity_id: req.entityId,
    person_id: person._id,
    period,
    period_type,
  });

  if (rating) {
    // Can only update if DRAFT or RETURNED
    if (!['DRAFT', 'RETURNED'].includes(rating.status)) {
      return res.status(400).json({ success: false, message: `Cannot edit rating in ${rating.status} status` });
    }

    if (kpi_ratings) rating.kpi_ratings = kpi_ratings;
    if (competency_ratings) rating.competency_ratings = competency_ratings;
    if (overall_self_score != null) rating.overall_self_score = overall_self_score;
    if (overall_self_comment != null) rating.overall_self_comment = overall_self_comment;
    if (rating.status === 'RETURNED') rating.status = 'DRAFT';
    rating.return_reason = '';

    await rating.save();
  } else {
    // Create new
    rating = await KpiSelfRating.create({
      entity_id: req.entityId,
      person_id: person._id,
      reviewer_id: person.reports_to || null,
      fiscal_year: fiscal_year || new Date().getFullYear(),
      period,
      period_type,
      kpi_ratings: kpi_ratings || [],
      competency_ratings: competency_ratings || [],
      overall_self_score: overall_self_score || null,
      overall_self_comment: overall_self_comment || '',
      status: 'DRAFT',
      created_by: req.user._id,
    });
  }

  res.json({ success: true, data: rating, message: 'Draft saved' });
});

// ═══ 7. submitRating — DRAFT → SUBMITTED ═══

const submitRating = catchAsync(async (req, res) => {
  const person = await findPersonForUser(req);
  if (!person) return res.status(404).json({ success: false, message: 'No PeopleMaster record linked to your account' });

  const rating = await KpiSelfRating.findOne({
    _id: req.params.id,
    entity_id: req.entityId,
    person_id: person._id,
  });

  if (!rating) return res.status(404).json({ success: false, message: 'Rating not found' });
  if (!['DRAFT', 'RETURNED'].includes(rating.status)) {
    return res.status(400).json({ success: false, message: `Cannot submit rating in ${rating.status} status` });
  }

  rating.status = 'SUBMITTED';
  rating.submitted_at = new Date();
  rating.return_reason = '';
  await rating.save();

  res.json({ success: true, data: rating, message: 'Rating submitted for review' });
});

// ═══ 8. reviewRating — Manager adds scores, SUBMITTED → REVIEWED ═══

const reviewRating = catchAsync(async (req, res) => {
  const person = await findPersonForUser(req);

  const rating = await KpiSelfRating.findOne({
    _id: req.params.id,
    entity_id: req.entityId,
  });

  if (!rating) return res.status(404).json({ success: false, message: 'Rating not found' });

  // Access: must be reviewer or admin
  const isReviewer = person && rating.reviewer_id?.toString() === person._id.toString();
  const isAdmin = isAdminLike(req.user.role);
  if (!isReviewer && !isAdmin) {
    return res.status(403).json({ success: false, message: 'Only the assigned reviewer or admin can review' });
  }

  if (rating.status !== 'SUBMITTED') {
    return res.status(400).json({ success: false, message: `Cannot review rating in ${rating.status} status` });
  }

  const { kpi_ratings, competency_ratings, overall_manager_score, overall_manager_comment } = req.body;

  // Merge manager scores into existing items
  if (kpi_ratings && Array.isArray(kpi_ratings)) {
    for (const incoming of kpi_ratings) {
      const existing = rating.kpi_ratings.find(k => k.kpi_code === incoming.kpi_code);
      if (existing) {
        if (incoming.manager_score != null) existing.manager_score = incoming.manager_score;
        if (incoming.manager_comment != null) existing.manager_comment = incoming.manager_comment;
      }
    }
  }

  if (competency_ratings && Array.isArray(competency_ratings)) {
    for (const incoming of competency_ratings) {
      const existing = rating.competency_ratings.find(c => c.competency_code === incoming.competency_code);
      if (existing) {
        if (incoming.manager_score != null) existing.manager_score = incoming.manager_score;
        if (incoming.manager_comment != null) existing.manager_comment = incoming.manager_comment;
      }
    }
  }

  if (overall_manager_score != null) rating.overall_manager_score = overall_manager_score;
  if (overall_manager_comment != null) rating.overall_manager_comment = overall_manager_comment;

  rating.status = 'REVIEWED';
  rating.reviewed_at = new Date();
  await rating.save();

  res.json({ success: true, data: rating, message: 'Review completed' });
});

// ═══ 9. approveRating — REVIEWED → APPROVED (admin only) ═══

const approveRating = catchAsync(async (req, res) => {
  const rating = await KpiSelfRating.findOne({
    _id: req.params.id,
    entity_id: req.entityId,
  });

  if (!rating) return res.status(404).json({ success: false, message: 'Rating not found' });
  if (rating.status !== 'REVIEWED') {
    return res.status(400).json({ success: false, message: `Cannot approve rating in ${rating.status} status` });
  }

  rating.status = 'APPROVED';
  rating.approved_at = new Date();
  rating.approved_by = req.user._id;
  await rating.save();

  res.json({ success: true, data: rating, message: 'Rating approved' });
});

// ═══ 10. returnRating — SUBMITTED/REVIEWED → RETURNED (manager/admin) ═══

const returnRating = catchAsync(async (req, res) => {
  const person = await findPersonForUser(req);

  const rating = await KpiSelfRating.findOne({
    _id: req.params.id,
    entity_id: req.entityId,
  });

  if (!rating) return res.status(404).json({ success: false, message: 'Rating not found' });

  const isReviewer = person && rating.reviewer_id?.toString() === person._id.toString();
  const isAdmin = isAdminLike(req.user.role);
  if (!isReviewer && !isAdmin) {
    return res.status(403).json({ success: false, message: 'Only the assigned reviewer or admin can return' });
  }

  if (!['SUBMITTED', 'REVIEWED'].includes(rating.status)) {
    return res.status(400).json({ success: false, message: `Cannot return rating in ${rating.status} status` });
  }

  rating.status = 'RETURNED';
  rating.return_reason = req.body.return_reason || '';
  await rating.save();

  res.json({ success: true, data: rating, message: 'Rating returned for revision' });
});

module.exports = {
  getMyRatings,
  getMyCurrentDraft,
  getRatingById,
  getRatingsForReview,
  getRatingsByPerson,
  saveDraft,
  submitRating,
  reviewRating,
  approveRating,
  returnRating,
};
