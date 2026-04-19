const VarianceAlert = require('../models/VarianceAlert');
const PeopleMaster = require('../models/PeopleMaster');
const { catchAsync } = require('../../middleware/errorHandler');

/**
 * Variance Alert Controller — Phase SG-5 #27
 *
 * Read + resolve alerts persisted by kpiVarianceAgent. BDM scope enforced
 * per Rule #21: contractors see only their own alerts; admin/finance/
 * president see all (entity-scoped — `req.entityId` always applies unless
 * president explicitly passes `?entity_id=` to cross entities).
 */

// GET /variance-alerts?status=&severity=&kpi_code=&bdm_id=&fiscal_year=&period=&limit=&page=
exports.listVarianceAlerts = catchAsync(async (req, res) => {
  const canSeeAll = req.isPresident || req.isAdmin || req.isFinance;

  const filter = {};
  // Entity scoping — president can cross entities with ?entity_id=, else pin
  // to req.entityId (so each entity's admin only sees their own queue).
  if (req.isPresident && req.query.entity_id) {
    filter.entity_id = req.query.entity_id;
  } else {
    filter.entity_id = req.entityId;
  }

  // BDM scoping — rule #21: privileged users ALL, others self.
  if (canSeeAll) {
    if (req.query.bdm_id) filter.bdm_id = req.query.bdm_id;
  } else {
    filter.bdm_id = req.user._id;
  }

  if (req.query.status) filter.status = String(req.query.status).toUpperCase();
  if (req.query.severity) filter.severity = String(req.query.severity).toLowerCase();
  if (req.query.kpi_code) filter.kpi_code = String(req.query.kpi_code).toUpperCase();
  if (req.query.fiscal_year) filter.fiscal_year = Number(req.query.fiscal_year);
  if (req.query.period) filter.period = String(req.query.period);

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    VarianceAlert.find(filter)
      .populate('person_id', 'full_name bdm_code')
      .populate('plan_id', 'plan_name fiscal_year reference')
      .populate('resolved_by', 'name email')
      .sort({ fired_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    VarianceAlert.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// GET /variance-alerts/stats?fiscal_year=
exports.getVarianceAlertStats = catchAsync(async (req, res) => {
  const filter = {};
  if (req.isPresident && req.query.entity_id) filter.entity_id = req.query.entity_id;
  else filter.entity_id = req.entityId;

  if (!(req.isPresident || req.isAdmin || req.isFinance)) {
    filter.bdm_id = req.user._id;
  } else if (req.query.bdm_id) {
    filter.bdm_id = req.query.bdm_id;
  }

  if (req.query.fiscal_year) filter.fiscal_year = Number(req.query.fiscal_year);

  const agg = await VarianceAlert.aggregate([
    { $match: filter },
    { $group: {
      _id: { status: '$status', severity: '$severity' },
      count: { $sum: 1 },
    } },
  ]);

  const stats = { open: { warning: 0, critical: 0 }, resolved: { warning: 0, critical: 0 }, total_open: 0, total_resolved: 0 };
  for (const row of agg) {
    const status = String(row._id.status || '').toLowerCase();
    const severity = String(row._id.severity || '').toLowerCase();
    if (status === 'open') {
      if (severity === 'warning') stats.open.warning += row.count;
      else if (severity === 'critical') stats.open.critical += row.count;
      stats.total_open += row.count;
    } else if (status === 'resolved') {
      if (severity === 'warning') stats.resolved.warning += row.count;
      else if (severity === 'critical') stats.resolved.critical += row.count;
      stats.total_resolved += row.count;
    }
  }

  res.json({ success: true, data: stats });
});

// POST /variance-alerts/:id/resolve
exports.resolveVarianceAlert = catchAsync(async (req, res) => {
  const alert = await VarianceAlert.findById(req.params.id);
  if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });

  // Entity guard — only president can cross entities.
  if (!req.isPresident && String(alert.entity_id) !== String(req.entityId)) {
    return res.status(403).json({ success: false, message: 'Alert is in a different entity' });
  }

  // Only the BDM themselves, their reports_to chain, admin/finance/president
  // may resolve. Contractor-level users can only resolve their own alerts.
  const canResolve = req.isPresident || req.isAdmin || req.isFinance
    || String(alert.bdm_id) === String(req.user._id);
  if (!canResolve) {
    // Check reports_to chain — if this requester is the BDM's manager, allow.
    let managerAllowed = false;
    if (alert.person_id) {
      try {
        const p = await PeopleMaster.findById(alert.person_id).select('reports_to').lean();
        if (p?.reports_to) {
          const managerPerson = await PeopleMaster.findById(p.reports_to).select('user_id').lean();
          if (managerPerson?.user_id && String(managerPerson.user_id) === String(req.user._id)) {
            managerAllowed = true;
          }
        }
      } catch (_) { /* managerAllowed stays false */ }
    }
    if (!managerAllowed) {
      return res.status(403).json({ success: false, message: 'Not authorized to resolve this alert' });
    }
  }

  if (alert.status === 'RESOLVED') {
    return res.status(400).json({ success: false, message: 'Alert already resolved' });
  }

  alert.status = 'RESOLVED';
  alert.resolved_at = new Date();
  alert.resolved_by = req.user._id;
  alert.resolution_note = String(req.body?.note || '').slice(0, 500);
  await alert.save();

  res.json({ success: true, data: alert });
});
