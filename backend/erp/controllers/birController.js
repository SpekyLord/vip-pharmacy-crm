/**
 * BIR Compliance Controller — Phase VIP-1.J (Apr 2026).
 *
 * Endpoints for /erp/bir dashboard + filing-status lifecycle. Per Rule #20,
 * lifecycle state transitions are gated by lookup-driven BIR_ROLES via
 * birAccess.userHasBirRole(); per Rule #19, every read/write is entity-scoped.
 *
 * Endpoints:
 *   GET    /api/erp/bir/dashboard?year=2026
 *   POST   /api/erp/bir/data-quality/run              — trigger scan ad-hoc
 *   GET    /api/erp/bir/data-quality/latest           — last scan run
 *   GET    /api/erp/bir/data-quality/findings         — drill-down list
 *   GET    /api/erp/bir/forms                         — filings for current year
 *   GET    /api/erp/bir/forms/:formCode/:year/:period — form detail
 *   POST   /api/erp/bir/forms/:id/mark-reviewed
 *   POST   /api/erp/bir/forms/:id/mark-filed
 *   POST   /api/erp/bir/forms/:id/mark-confirmed
 *   POST   /api/erp/bir/inbound-email                  — confirmation parser
 *   GET    /api/erp/bir/entity-config                  — current tax-config
 *   PATCH  /api/erp/bir/entity-config                  — update tax-config
 */

const { catchAsync } = require('../../middleware/errorHandler');
const Entity = require('../models/Entity');
const BirFilingStatus = require('../models/BirFilingStatus');
const BirDataQualityRun = require('../models/BirDataQualityRun');
const birDashboardService = require('../services/birDashboardService');
const birDataQualityAgent = require('../../agents/birDataQualityAgent');
const { userHasBirRole } = require('../../utils/birAccess');

function requireEntity(req, res) {
  if (!req.entityId) {
    res.status(400).json({ success: false, message: 'Entity context required.' });
    return false;
  }
  return true;
}

async function ensureRole(req, res, code) {
  const allowed = await userHasBirRole(req, code);
  if (!allowed) {
    res.status(403).json({
      success: false,
      message: `Forbidden — BIR ${code} permission required.`,
      required_scope: code,
    });
    return false;
  }
  return true;
}

// ── Dashboard ─────────────────────────────────────────────────────────
exports.getDashboard = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const data = await birDashboardService.buildDashboard({ entityId: req.entityId, year });
  res.json({ success: true, data });
});

// ── Data Quality Agent ────────────────────────────────────────────────
exports.runDataQuality = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'RUN_DATA_AUDIT'))) return;
  const result = await birDataQualityAgent.runScan({
    entityId: req.entityId,
    triggeredBy: 'ON_DEMAND',
    triggeredUserId: req.user?._id,
  });
  // Bust dashboard cache so the next view reflects the fresh run.
  birDashboardService.invalidate(req.entityId);
  res.json({
    success: true,
    data: {
      run_id: result._id,
      status: result.status,
      summary: result.summary,
      findings_count: (result.findings || []).length,
      blocked_forms_due_within_7d: result.blocked_forms_due_within_7d,
      duration_ms: result.duration_ms,
    },
  });
});

exports.getLatestDataQuality = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const run = await BirDataQualityRun
    .findOne({ entity_id: req.entityId })
    .sort({ started_at: -1 })
    .lean();
  res.json({ success: true, data: run || null });
});

exports.getDataQualityFindings = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const run = await BirDataQualityRun
    .findOne({ entity_id: req.entityId })
    .sort({ started_at: -1 })
    .lean();
  const findings = (run?.findings || []);
  // Optional filter ?kind=Hospital
  const filtered = req.query.kind
    ? findings.filter(f => f.collection_kind === req.query.kind)
    : findings;
  res.json({
    success: true,
    data: {
      run_id: run?._id || null,
      started_at: run?.started_at || null,
      findings: filtered,
      total: filtered.length,
    },
  });
});

// ── Filings ───────────────────────────────────────────────────────────
exports.listFilings = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const filter = { entity_id: req.entityId, period_year: year };
  if (req.query.form_code) filter.form_code = req.query.form_code;
  const rows = await BirFilingStatus.find(filter).sort({ form_code: 1, period_month: 1, period_quarter: 1 }).lean();
  res.json({ success: true, data: rows });
});

exports.getFiling = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const row = await BirFilingStatus.findOne({ _id: req.params.id, entity_id: req.entityId }).lean();
  if (!row) return res.status(404).json({ success: false, message: 'Filing row not found.' });
  res.json({ success: true, data: row });
});

exports.markReviewed = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'MARK_REVIEWED'))) return;
  const row = await BirFilingStatus.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!row) return res.status(404).json({ success: false, message: 'Filing row not found.' });
  if (row.status === 'CONFIRMED') return res.status(409).json({ success: false, message: 'Already CONFIRMED — cannot revert to REVIEWED.' });
  row.status = 'REVIEWED';
  row.reviewed_at = new Date();
  row.reviewed_by = req.user._id;
  await row.save();
  birDashboardService.invalidate(req.entityId);
  res.json({ success: true, data: row });
});

exports.markFiled = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'MARK_FILED'))) return;
  const { bir_reference_number, notes } = req.body;
  const row = await BirFilingStatus.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!row) return res.status(404).json({ success: false, message: 'Filing row not found.' });
  if (row.status === 'CONFIRMED') return res.status(409).json({ success: false, message: 'Already CONFIRMED.' });
  row.status = 'FILED';
  row.filed_at = new Date();
  row.filed_by = req.user._id;
  if (bir_reference_number) row.bir_reference_number = bir_reference_number.trim();
  if (notes) row.notes = notes;
  await row.save();
  birDashboardService.invalidate(req.entityId);
  res.json({ success: true, data: row });
});

exports.markConfirmed = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'MARK_CONFIRMED'))) return;
  const { bir_reference_number, confirmation_email_id } = req.body;
  const row = await BirFilingStatus.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!row) return res.status(404).json({ success: false, message: 'Filing row not found.' });
  if (!bir_reference_number && !row.bir_reference_number) {
    return res.status(400).json({ success: false, message: 'BIR reference number required to confirm.' });
  }
  row.status = 'CONFIRMED';
  row.confirmed_at = new Date();
  row.confirmed_by = req.user._id;
  if (bir_reference_number) row.bir_reference_number = bir_reference_number.trim();
  if (confirmation_email_id) row.confirmation_email_id = confirmation_email_id;
  await row.save();
  birDashboardService.invalidate(req.entityId);
  res.json({ success: true, data: row });
});

// Manual draft creation — admin/finance can pre-stage rows for early review.
// Most rows will be auto-created when J1+ aggregation services run; this
// endpoint exists for the early-J0 workflow where dashboards are populated
// before the form aggregators ship.
exports.createOrUpdateDraft = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'MARK_REVIEWED'))) return;
  const { form_code, period_year, period_month, period_quarter, period_payee_id, period_payee_kind, totals_snapshot, notes } = req.body;
  if (!form_code || !period_year) {
    return res.status(400).json({ success: false, message: 'form_code and period_year required.' });
  }
  const filter = {
    entity_id: req.entityId,
    form_code,
    period_year,
    period_month: period_month || null,
    period_quarter: period_quarter || null,
    period_payee_id: period_payee_id || null,
  };
  let row = await BirFilingStatus.findOne(filter);
  if (!row) {
    row = await BirFilingStatus.create({
      ...filter,
      period_payee_kind: period_payee_kind || null,
      status: 'DRAFT',
      totals_snapshot: totals_snapshot || null,
      notes: notes || '',
    });
  } else {
    if (totals_snapshot !== undefined) row.totals_snapshot = totals_snapshot;
    if (notes !== undefined) row.notes = notes;
    await row.save();
  }
  birDashboardService.invalidate(req.entityId);
  res.json({ success: true, data: row });
});

// ── Inbound email confirmation parser (J0.7 scaffold) ──────────────────
// Webhook receives a forwarded BIR confirmation email. Body shape mirrors
// SendGrid Inbound Parse / Cloudflare Email Workers / Mailgun POST so we
// can swap providers without changing the parser. Parsing logic lives here
// so it's testable; the webhook is auth-bypassed via a shared-secret header.
exports.inboundEmail = catchAsync(async (req, res) => {
  const sharedSecret = process.env.BIR_INBOUND_EMAIL_SECRET;
  if (sharedSecret && req.get('X-Webhook-Secret') !== sharedSecret) {
    return res.status(401).json({ success: false, message: 'Invalid webhook secret.' });
  }
  const { from, subject, text, html, to } = req.body || {};
  if (!from || !subject || !(text || html)) {
    return res.status(400).json({ success: false, message: 'Missing required fields: from, subject, text|html.' });
  }

  // Parse
  const body = String(text || html);
  const parsed = parseBirConfirmation({ from, subject, body, to });
  if (!parsed.ok) {
    return res.json({ success: true, data: { matched: false, reason: parsed.reason, parsed } });
  }

  // Match a filing row
  const filter = {
    form_code: parsed.form_code,
    period_year: parsed.period_year,
  };
  if (parsed.period_month) filter.period_month = parsed.period_month;
  if (parsed.period_quarter) filter.period_quarter = parsed.period_quarter;

  // Tax filing email is per-entity — find which entity this email is for.
  // Strategy: match `to` against any Entity.tax_filing_email; fall back to TIN
  // match in the email body.
  const entities = await Entity.find({ status: 'ACTIVE' }).lean();
  let targetEntity = entities.find(e => e.tax_filing_email && to && to.toLowerCase().includes(e.tax_filing_email.toLowerCase()));
  if (!targetEntity && parsed.tin) {
    targetEntity = entities.find(e => e.tin && e.tin.replace(/\D/g, '') === parsed.tin.replace(/\D/g, ''));
  }
  if (!targetEntity) {
    return res.json({ success: true, data: { matched: false, reason: 'NO_ENTITY_MATCH', parsed } });
  }
  filter.entity_id = targetEntity._id;

  const row = await BirFilingStatus.findOne(filter);
  if (!row) {
    return res.json({ success: true, data: { matched: false, reason: 'NO_FILING_ROW', parsed, entity_id: targetEntity._id } });
  }

  row.status = 'CONFIRMED';
  row.confirmed_at = new Date();
  row.bir_reference_number = parsed.reference_number;
  await row.save();
  birDashboardService.invalidate(targetEntity._id);

  res.json({
    success: true,
    data: {
      matched: true,
      filing_id: row._id,
      form_code: row.form_code,
      reference_number: parsed.reference_number,
      entity_id: targetEntity._id,
    },
  });
});

/**
 * Parser for BIR / eBIR Forms confirmation emails. Returns:
 *   { ok: true, form_code, period_year, period_month?, period_quarter?, reference_number, tin }
 * or { ok: false, reason }
 *
 * Heuristic and conservative — when in doubt, return ok:false so the email
 * goes to the unmatched queue for human review.
 */
function parseBirConfirmation({ subject, body }) {
  const sub = String(subject || '');
  const bod = String(body || '');
  const text = `${sub}\n${bod}`.toUpperCase();

  // Form code
  const formMatchers = [
    { code: '2550M', regex: /\b2550M\b/ },
    { code: '2550Q', regex: /\b2550Q\b/ },
    { code: '1601-EQ', regex: /\b1601[-\s]?EQ\b/ },
    { code: '1601-C', regex: /\b1601[-\s]?C\b/ },
    { code: '1606', regex: /\b1606\b/ },
    { code: '1604-CF', regex: /\b1604[-\s]?CF\b/ },
    { code: '1604-E', regex: /\b1604[-\s]?E\b/ },
    { code: '1702', regex: /\b1702\b/ },
    { code: '1701', regex: /\b1701\b/ },
  ];
  const formHit = formMatchers.find(f => f.regex.test(text));
  if (!formHit) return { ok: false, reason: 'NO_FORM_CODE' };

  // Reference number — eBIR Forms uses 22-char alphanumeric; eFPS varies.
  // Look for "Reference No." or "Filing Reference" or "Confirmation Number".
  const refMatch = text.match(/(?:REFERENCE\s*(?:NO\.?|NUMBER)|CONFIRMATION\s*(?:NO\.?|NUMBER)|FILING\s*REF(?:ERENCE)?)[\s:]+([A-Z0-9-]{8,40})/);
  const reference_number = refMatch ? refMatch[1] : null;
  if (!reference_number) return { ok: false, reason: 'NO_REFERENCE_NUMBER' };

  // TIN — XXX-XXX-XXX-XXXXX or 9/14 digits
  const tinMatch = text.match(/\b(\d{3}-\d{3}-\d{3}(?:-\d{5})?)\b/);
  const tin = tinMatch ? tinMatch[1] : null;

  // Period — try YYYY-MM, YYYY-QN, YYYY
  let period_year = null;
  let period_month = null;
  let period_quarter = null;
  const periodMonth = text.match(/\b(20\d{2})[-/](\d{1,2})\b/);
  const periodQuarter = text.match(/\b(20\d{2})[-\s]+Q([1-4])\b/);
  const periodYear = text.match(/\b(20\d{2})\b/);
  if (periodMonth) {
    period_year = parseInt(periodMonth[1], 10);
    period_month = parseInt(periodMonth[2], 10);
  } else if (periodQuarter) {
    period_year = parseInt(periodQuarter[1], 10);
    period_quarter = parseInt(periodQuarter[2], 10);
  } else if (periodYear) {
    period_year = parseInt(periodYear[1], 10);
  } else {
    return { ok: false, reason: 'NO_PERIOD' };
  }

  return {
    ok: true,
    form_code: formHit.code,
    period_year,
    period_month,
    period_quarter,
    reference_number,
    tin,
  };
}

// ── Entity tax-config ──────────────────────────────────────────────────
exports.getEntityConfig = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const e = await Entity.findById(req.entityId).lean();
  if (!e) return res.status(404).json({ success: false, message: 'Entity not found.' });
  res.json({
    success: true,
    data: {
      _id: e._id,
      entity_name: e.entity_name,
      short_name: e.short_name,
      tin: e.tin || '',
      address: e.address || '',
      rdo_code: e.rdo_code || '',
      tax_type: e.tax_type || 'CORP',
      business_style: e.business_style || '',
      vat_registered: !!e.vat_registered,
      top_withholding_agent: !!e.top_withholding_agent,
      withholding_active: !!e.withholding_active,
      rent_withholding_active: !!e.rent_withholding_active,
      tax_filing_email: e.tax_filing_email || '',
      vat_exempt_categories: e.vat_exempt_categories || [],
      config_completeness: birDashboardService.computeConfigCompleteness(e),
    },
  });
});

exports.updateEntityConfig = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'MANAGE_TAX_CONFIG'))) return;

  const allowed = [
    'tin', 'address', 'rdo_code', 'tax_type', 'business_style',
    'vat_registered', 'top_withholding_agent', 'withholding_active',
    'rent_withholding_active', 'tax_filing_email', 'vat_exempt_categories',
  ];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  // findById + save (rather than findOneAndUpdate) so the pre('validate') TIN
  // normalizer fires.
  const e = await Entity.findById(req.entityId);
  if (!e) return res.status(404).json({ success: false, message: 'Entity not found.' });
  Object.assign(e, updates);
  await e.save();

  birDashboardService.invalidate(req.entityId);
  // After tax-config change, the data-quality posture might have shifted —
  // queue a fresh scan so the dashboard reflects the new state quickly.
  // Fire and forget; the dashboard will pick up the new run on next refresh.
  birDataQualityAgent.runScan({
    entityId: req.entityId,
    triggeredBy: 'ON_DEMAND',
    triggeredUserId: req.user?._id,
  }).catch(err => console.warn('[birController] post-update scan failed:', err.message));

  res.json({
    success: true,
    data: {
      _id: e._id,
      entity_name: e.entity_name,
      tin: e.tin,
      rdo_code: e.rdo_code,
      tax_type: e.tax_type,
      business_style: e.business_style,
      vat_registered: e.vat_registered,
      top_withholding_agent: e.top_withholding_agent,
      withholding_active: e.withholding_active,
      rent_withholding_active: e.rent_withholding_active,
      tax_filing_email: e.tax_filing_email,
      vat_exempt_categories: e.vat_exempt_categories,
      config_completeness: birDashboardService.computeConfigCompleteness(e),
    },
  });
});

exports._test = { parseBirConfirmation };
