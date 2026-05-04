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
const vatReturnService = require('../services/vatReturnService');
// Phase VIP-1.J / J2 — Withholding (1601-EQ + 1606 + 2307-OUT + SAWT).
const withholdingReturnService = require('../services/withholdingReturnService');
const withholdingService = require('../services/withholdingService');
// Phase VIP-1.J / J5 — Books of Accounts (Loose-Leaf PDFs).
const bookOfAccountsService = require('../services/bookOfAccountsService');
// Phase VIP-1.J / J6 — Inbound 2307 reconciliation + 1702 credit rollup.
const cwt2307ReconciliationService = require('../services/cwt2307ReconciliationService');
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

// ── Phase J1 — 2550M / 2550Q VAT return aggregator + CSV export ────────
//
// VIEW_DASHBOARD gates the compute endpoints (read-only aggregation).
// EXPORT_FORM gates the CSV download because it appends a SHA-256 hash
// to BirFilingStatus.export_audit_log; the row mutation must be tied to
// an accountable role per Rule #20.
//
// Period encoding mirrors the BirFilingStatus model:
//   2550M → period_year + period_month (1-12)
//   2550Q → period_year + period_quarter (1-4)

function parseYear(v) {
  const y = parseInt(v, 10);
  return Number.isInteger(y) && y >= 2024 && y <= 2099 ? y : null;
}

function parseMonth(v) {
  const m = parseInt(v, 10);
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m : null;
}

function parseQuarter(v) {
  const q = parseInt(v, 10);
  return Number.isInteger(q) && q >= 1 && q <= 4 ? q : null;
}

exports.compute2550M = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseYear(req.params.year);
  const month = parseMonth(req.params.month);
  if (!year || !month) {
    return res.status(400).json({ success: false, message: 'Invalid year/month. Year ≥ 2024, month 1-12.' });
  }
  const result = await vatReturnService.compute2550M({ entityId: req.entityId, year, month });
  // Surface stored filing-row status alongside the live computation so the
  // frontend can render the lifecycle pill without a second round trip.
  const row = await BirFilingStatus.findOne({
    entity_id: req.entityId, form_code: '2550M',
    period_year: year, period_month: month, period_quarter: null, period_payee_id: null,
  }).lean();
  res.json({
    success: true,
    data: {
      ...result,
      filing_row: row || null,
    },
  });
});

exports.compute2550Q = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseYear(req.params.year);
  const quarter = parseQuarter(req.params.quarter);
  if (!year || !quarter) {
    return res.status(400).json({ success: false, message: 'Invalid year/quarter. Year ≥ 2024, quarter 1-4.' });
  }
  const result = await vatReturnService.compute2550Q({ entityId: req.entityId, year, quarter });
  const row = await BirFilingStatus.findOne({
    entity_id: req.entityId, form_code: '2550Q',
    period_year: year, period_quarter: quarter, period_month: null, period_payee_id: null,
  }).lean();
  res.json({
    success: true,
    data: {
      ...result,
      filing_row: row || null,
    },
  });
});

/**
 * CSV export for 2550M and 2550Q. Streams the CSV with Content-Disposition
 * attachment + appends an export entry (SHA-256 hash + byte length + user)
 * to BirFilingStatus.export_audit_log per Rule #20 audit posture.
 *
 * Side-effect: also REFRESHES totals_snapshot on the BirFilingStatus row so
 * the dashboard heatmap reflects the latest numbers without waiting for
 * mark-reviewed. Status itself is NOT changed.
 */
exports.exportVatReturnCsv = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'EXPORT_FORM'))) return;

  const formCode = req.params.formCode;
  if (formCode !== '2550M' && formCode !== '2550Q') {
    return res.status(400).json({ success: false, message: `Export not implemented for ${formCode}. Phase J1 supports 2550M / 2550Q only.` });
  }

  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ success: false, message: 'Invalid year. Must be ≥ 2024.' });

  let periodMonthOrQuarter;
  if (formCode === '2550M') {
    periodMonthOrQuarter = parseMonth(req.params.period);
    if (!periodMonthOrQuarter) return res.status(400).json({ success: false, message: 'Invalid month. Must be 1-12.' });
  } else {
    periodMonthOrQuarter = parseQuarter(req.params.period);
    if (!periodMonthOrQuarter) return res.status(400).json({ success: false, message: 'Invalid quarter. Must be 1-4.' });
  }

  const entity = await Entity.findById(req.entityId).lean();
  if (!entity) return res.status(404).json({ success: false, message: 'Entity not found.' });

  const { csvContent, contentHash, filename } = await vatReturnService.exportFormCsv({
    formCode,
    entityId: req.entityId,
    year,
    periodMonthOrQuarter,
    userId: req.user?._id,
    entity,
  });

  birDashboardService.invalidate(req.entityId);

  // Server-side audit trail for ops monitoring (mirror SCPWD pattern).
  console.log('[BIR_EXPORT_VAT_RETURN]', JSON.stringify({
    user: req.user?.email,
    role: req.user?.role,
    entity_id: String(req.entityId),
    form_code: formCode,
    year,
    period: periodMonthOrQuarter,
    content_hash: contentHash,
    byte_length: Buffer.byteLength(csvContent, 'utf8'),
    ip: req.ip,
    ts: new Date().toISOString(),
  }));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Content-Hash', contentHash);
  res.send(csvContent);
});

// ── Phase J2 — 1601-EQ + 1606 EWT aggregator + CSV / PDF / .dat export ─
//
// VIEW_DASHBOARD gates compute endpoints (read-only).
// EXPORT_FORM gates every export path (CSV + PDF + .dat) because each one
// appends a SHA-256 hash to BirFilingStatus.export_audit_log per Rule #20.
// listEwtPayees is a thin compute-style read; gated by VIEW_DASHBOARD.

exports.compute1601EQ = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseYear(req.params.year);
  const quarter = parseQuarter(req.params.quarter);
  if (!year || !quarter) {
    return res.status(400).json({ success: false, message: 'Invalid year/quarter. Year ≥ 2024, quarter 1-4.' });
  }
  const result = await withholdingReturnService.compute1601EQ({ entityId: req.entityId, year, quarter });
  const row = await BirFilingStatus.findOne({
    entity_id: req.entityId, form_code: '1601-EQ',
    period_year: year, period_quarter: quarter, period_month: null, period_payee_id: null,
  }).lean();
  res.json({ success: true, data: { ...result, filing_row: row || null } });
});

exports.compute1606 = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseYear(req.params.year);
  const month = parseMonth(req.params.month);
  if (!year || !month) {
    return res.status(400).json({ success: false, message: 'Invalid year/month. Year ≥ 2024, month 1-12.' });
  }
  const result = await withholdingReturnService.compute1606({ entityId: req.entityId, year, month });
  const row = await BirFilingStatus.findOne({
    entity_id: req.entityId, form_code: '1606',
    period_year: year, period_month: month, period_quarter: null, period_payee_id: null,
  }).lean();
  res.json({ success: true, data: { ...result, filing_row: row || null } });
});

// Phase VIP-1.J / J3 — 1601-C Monthly Compensation Withholding aggregator.
// Mirrors compute1606's shape (monthly form, lookup by (entity, form_code,
// year, month)). Reads COMPENSATION-direction WithholdingLedger rows that
// the payroll-post bridge emits per Rule #20.
exports.compute1601C = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseYear(req.params.year);
  const month = parseMonth(req.params.month);
  if (!year || !month) {
    return res.status(400).json({ success: false, message: 'Invalid year/month. Year ≥ 2024, month 1-12.' });
  }
  const result = await withholdingReturnService.compute1601C({ entityId: req.entityId, year, month });
  const row = await BirFilingStatus.findOne({
    entity_id: req.entityId, form_code: '1601-C',
    period_year: year, period_month: month, period_quarter: null, period_payee_id: null,
  }).lean();
  res.json({ success: true, data: { ...result, filing_row: row || null } });
});

// Phase VIP-1.J / J3 — Compensation withholding posture (1601-C dashboard
// card). Surfaces YTD comp totals + per-employee breakdown. Sibling to
// getWithholdingPosture (which is OUTBOUND-only).
exports.getCompensationPosture = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseYear(req.query.year) || new Date().getFullYear();
  const posture = await withholdingService.buildCompensationPosture(req.entityId, year);
  res.json({ success: true, data: { year, ...posture } });
});

exports.listEwtPayees = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseYear(req.params.year);
  const quarter = parseQuarter(req.params.quarter);
  if (!year || !quarter) {
    return res.status(400).json({ success: false, message: 'Invalid year/quarter.' });
  }
  // Returns the per-payee × ATC schedule that drives 2307 PDF generation
  // and SAWT row preview. Same shape as withholdingReturnService.listPayees.
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'].slice((quarter - 1) * 3, quarter * 3).map(m => `${year}-${m}`);
  const payees = await withholdingReturnService.listPayees(req.entityId, months);
  res.json({ success: true, data: { year, quarter, periods: months, payees } });
});

exports.exportEwtCsv = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'EXPORT_FORM'))) return;
  const formCode = req.params.formCode;
  // Phase J3 (May 2026) — 1601-C added. 2550M/Q stays in exportVatReturnCsv.
  if (formCode !== '1601-EQ' && formCode !== '1606' && formCode !== '1601-C') {
    return res.status(400).json({ success: false, message: `Export not implemented for ${formCode}. J2/J3 support 1601-EQ / 1606 / 1601-C here; 2550M/Q goes through exportVatReturnCsv.` });
  }
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ success: false, message: 'Invalid year.' });

  let periodMonthOrQuarter;
  if (formCode === '1606' || formCode === '1601-C') {
    periodMonthOrQuarter = parseMonth(req.params.period);
    if (!periodMonthOrQuarter) return res.status(400).json({ success: false, message: 'Invalid month (1-12).' });
  } else {
    periodMonthOrQuarter = parseQuarter(req.params.period);
    if (!periodMonthOrQuarter) return res.status(400).json({ success: false, message: 'Invalid quarter (1-4).' });
  }

  const entity = await Entity.findById(req.entityId).lean();
  if (!entity) return res.status(404).json({ success: false, message: 'Entity not found.' });

  const { csvContent, contentHash, filename } = await withholdingReturnService.exportEwtCsv({
    formCode, entityId: req.entityId, year, periodMonthOrQuarter, userId: req.user?._id, entity,
  });
  birDashboardService.invalidate(req.entityId);

  console.log('[BIR_EXPORT_EWT_RETURN]', JSON.stringify({
    user: req.user?.email, role: req.user?.role,
    entity_id: String(req.entityId),
    form_code: formCode, year, period: periodMonthOrQuarter,
    content_hash: contentHash,
    byte_length: Buffer.byteLength(csvContent, 'utf8'),
    ip: req.ip, ts: new Date().toISOString(),
  }));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Content-Hash', contentHash);
  res.send(csvContent);
});

exports.export2307Pdf = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'EXPORT_FORM'))) return;
  const year = parseYear(req.params.year);
  const quarter = parseQuarter(req.params.quarter);
  const { payeeKind, payeeId } = req.params;
  if (!year || !quarter || !payeeId) {
    return res.status(400).json({ success: false, message: 'Invalid year/quarter/payeeId.' });
  }
  const allowedKinds = ['PeopleMaster', 'VendorMaster', 'Hospital', 'Doctor', 'Other'];
  if (!allowedKinds.includes(payeeKind)) {
    return res.status(400).json({ success: false, message: `Invalid payeeKind. One of: ${allowedKinds.join(', ')}` });
  }

  const entity = await Entity.findById(req.entityId).lean();
  if (!entity) return res.status(404).json({ success: false, message: 'Entity not found.' });

  let result;
  try {
    result = await withholdingReturnService.export2307Pdf({
      entityId: req.entityId, payeeKind, payeeId, year, quarter, entity,
    });
  } catch (err) {
    return res.status(404).json({ success: false, message: err.message });
  }

  // Append PDF audit-log row to the per-payee BirFilingStatus row (creates if missing).
  const filter = {
    entity_id: req.entityId, form_code: '2307-OUT',
    period_year: year, period_month: null, period_quarter: null,
    period_payee_id: payeeId,
  };
  let row = await BirFilingStatus.findOne(filter);
  if (!row) {
    row = new BirFilingStatus({
      ...filter,
      period_payee_kind: payeeKind,
      status: 'DRAFT',
      totals_snapshot: result.totals,
    });
  } else {
    row.totals_snapshot = result.totals;
  }
  const filename = `2307_${payeeKind}_${payeeId}_${year}-Q${quarter}.pdf`;
  row.export_audit_log.push({
    exported_at: new Date(),
    exported_by: req.user?._id,
    artifact_kind: 'PDF',
    filename,
    content_hash: result.contentHash,
    byte_length: result.buffer.length,
    notes: `2307 ${year}-Q${quarter} ${result.payee.name} (${result.rowCount} rows)`,
  });
  await row.save();
  birDashboardService.invalidate(req.entityId);

  console.log('[BIR_EXPORT_2307_PDF]', JSON.stringify({
    user: req.user?.email, role: req.user?.role,
    entity_id: String(req.entityId),
    payee_kind: payeeKind, payee_id: String(payeeId),
    year, quarter, content_hash: result.contentHash,
    byte_length: result.buffer.length, ip: req.ip,
    ts: new Date().toISOString(),
  }));

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Content-Hash', result.contentHash);
  res.send(result.buffer);
});

exports.exportSawtDat = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'EXPORT_FORM'))) return;
  const year = parseYear(req.params.year);
  const quarter = parseQuarter(req.params.quarter);
  if (!year || !quarter) {
    return res.status(400).json({ success: false, message: 'Invalid year/quarter.' });
  }
  const entity = await Entity.findById(req.entityId).lean();
  if (!entity) return res.status(404).json({ success: false, message: 'Entity not found.' });

  const { datContent, contentHash, filename } = await withholdingReturnService.exportSawtDat({
    entityId: req.entityId, year, quarter, userId: req.user?._id, entity,
  });
  birDashboardService.invalidate(req.entityId);

  console.log('[BIR_EXPORT_SAWT_DAT]', JSON.stringify({
    user: req.user?.email, role: req.user?.role,
    entity_id: String(req.entityId),
    year, quarter, content_hash: contentHash,
    byte_length: Buffer.byteLength(datContent, 'utf8'),
    ip: req.ip, ts: new Date().toISOString(),
  }));

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Content-Hash', contentHash);
  res.send(datContent);
});

// ── Phase J3 Part B — 1604-CF Annual Compensation Alphalist + Form 2316 ─
//
// 1604-CF mirrors compute1606 / compute1601C in shape but is annual
// (period_year only — no month / quarter encoding). The .dat export targets
// BIR Alphalist Data Entry v7.x; the per-employee 2316 PDF is the year-end
// counterpart of the per-payee 2307 PDF (substitute filing exemption).
//
// VIEW_DASHBOARD gates compute. EXPORT_FORM gates both .dat and PDF
// because each appends a SHA-256 hash to BirFilingStatus.export_audit_log
// per Rule #20.

exports.compute1604CF = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseYear(req.params.year);
  if (!year) {
    return res.status(400).json({ success: false, message: 'Invalid year. Year ≥ 2024.' });
  }
  const result = await withholdingReturnService.compute1604CF({ entityId: req.entityId, year });
  const row = await BirFilingStatus.findOne({
    entity_id: req.entityId, form_code: '1604-CF',
    period_year: year, period_month: null, period_quarter: null, period_payee_id: null,
  }).lean();
  res.json({ success: true, data: { ...result, filing_row: row || null } });
});

exports.export1604CFDat = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'EXPORT_FORM'))) return;
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ success: false, message: 'Invalid year.' });

  const entity = await Entity.findById(req.entityId).lean();
  if (!entity) return res.status(404).json({ success: false, message: 'Entity not found.' });

  const { datContent, contentHash, filename, totals } = await withholdingReturnService.export1604CFDat({
    entityId: req.entityId, year, userId: req.user?._id, entity,
  });
  birDashboardService.invalidate(req.entityId);

  console.log('[BIR_EXPORT_1604CF_DAT]', JSON.stringify({
    user: req.user?.email, role: req.user?.role,
    entity_id: String(req.entityId),
    year, employees_total: totals.employees_total,
    content_hash: contentHash,
    byte_length: Buffer.byteLength(datContent, 'utf8'),
    ip: req.ip, ts: new Date().toISOString(),
  }));

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Content-Hash', contentHash);
  res.send(datContent);
});

exports.export2316Pdf = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'EXPORT_FORM'))) return;
  const year = parseYear(req.params.year);
  const { payeeId } = req.params;
  if (!year || !payeeId) {
    return res.status(400).json({ success: false, message: 'Invalid year/payeeId.' });
  }

  const entity = await Entity.findById(req.entityId).lean();
  if (!entity) return res.status(404).json({ success: false, message: 'Entity not found.' });

  let result;
  try {
    result = await withholdingReturnService.export2316Pdf({
      entityId: req.entityId, payeeId, year, entity,
    });
  } catch (err) {
    return res.status(404).json({ success: false, message: err.message });
  }

  // Per-employee BirFilingStatus row (form_code='2316', period_payee_id=payeeId).
  // Schema requires period_payee_kind for per-payee forms; compensation is
  // always PeopleMaster-scoped.
  const filter = {
    entity_id: req.entityId, form_code: '2316',
    period_year: year, period_month: null, period_quarter: null,
    period_payee_id: payeeId,
  };
  let row = await BirFilingStatus.findOne(filter);
  if (!row) {
    row = new BirFilingStatus({
      ...filter,
      period_payee_kind: 'PeopleMaster',
      status: 'DRAFT',
      totals_snapshot: result.totals,
    });
  } else {
    row.totals_snapshot = result.totals;
  }
  const filename = `2316_${payeeId}_${year}.pdf`;
  row.export_audit_log.push({
    exported_at: new Date(),
    exported_by: req.user?._id,
    artifact_kind: 'PDF',
    filename,
    content_hash: result.contentHash,
    byte_length: result.buffer.length,
    notes: `2316 ${year} ${result.employee.name} (${result.rowCount} ledger rows)`,
  });
  await row.save();
  birDashboardService.invalidate(req.entityId);

  console.log('[BIR_EXPORT_2316_PDF]', JSON.stringify({
    user: req.user?.email, role: req.user?.role,
    entity_id: String(req.entityId),
    payee_id: String(payeeId),
    year, content_hash: result.contentHash,
    byte_length: result.buffer.length, ip: req.ip,
    ts: new Date().toISOString(),
  }));

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Content-Hash', result.contentHash);
  res.send(result.buffer);
});

// ── Phase J4 — 1604-E Annual EWT Alphalist + QAP Quarterly Alphalist ────
//
// 1604-E mirrors compute1604CF (annual, period_year only) but for OUTBOUND-
// direction WithholdingLedger rows (vendors / contractors / hospitals) and
// uses a single flat per-(payee × ATC) schedule instead of the 7.1/7.2/7.3
// compensation partition.
//
// QAP mirrors SAWT in shape (quarterly, year+quarter encoded) but covers the
// 1601-EQ ATC subset — finance posture and entity scoping behave identically
// to 1601-EQ + SAWT for Rule #20 traceability.
//
// VIEW_DASHBOARD gates compute. EXPORT_FORM gates .dat (BIR Alphalist Data
// Entry v7.x) because each appends a SHA-256 hash to BirFilingStatus.export
// _audit_log per Rule #20.

exports.compute1604E = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseYear(req.params.year);
  if (!year) {
    return res.status(400).json({ success: false, message: 'Invalid year. Year ≥ 2024.' });
  }
  const result = await withholdingReturnService.compute1604E({ entityId: req.entityId, year });
  const row = await BirFilingStatus.findOne({
    entity_id: req.entityId, form_code: '1604-E',
    period_year: year, period_month: null, period_quarter: null, period_payee_id: null,
  }).lean();
  res.json({ success: true, data: { ...result, filing_row: row || null } });
});

exports.export1604EDat = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'EXPORT_FORM'))) return;
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ success: false, message: 'Invalid year.' });

  const entity = await Entity.findById(req.entityId).lean();
  if (!entity) return res.status(404).json({ success: false, message: 'Entity not found.' });

  const { datContent, contentHash, filename, totals } = await withholdingReturnService.export1604EDat({
    entityId: req.entityId, year, userId: req.user?._id, entity,
  });
  birDashboardService.invalidate(req.entityId);

  console.log('[BIR_EXPORT_1604E_DAT]', JSON.stringify({
    user: req.user?.email, role: req.user?.role,
    entity_id: String(req.entityId),
    year,
    distinct_payees: totals.distinct_payees,
    payee_lines: totals.payee_lines,
    content_hash: contentHash,
    byte_length: Buffer.byteLength(datContent, 'utf8'),
    ip: req.ip, ts: new Date().toISOString(),
  }));

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Content-Hash', contentHash);
  res.send(datContent);
});

exports.computeQAP = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseYear(req.params.year);
  const quarter = parseQuarter(req.params.quarter);
  if (!year || !quarter) {
    return res.status(400).json({ success: false, message: 'Invalid year/quarter. Year ≥ 2024, quarter 1-4.' });
  }
  const result = await withholdingReturnService.computeQAP({ entityId: req.entityId, year, quarter });
  const row = await BirFilingStatus.findOne({
    entity_id: req.entityId, form_code: 'QAP',
    period_year: year, period_quarter: quarter, period_month: null, period_payee_id: null,
  }).lean();
  res.json({ success: true, data: { ...result, filing_row: row || null } });
});

exports.exportQAPDat = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'EXPORT_FORM'))) return;
  const year = parseYear(req.params.year);
  const quarter = parseQuarter(req.params.quarter);
  if (!year || !quarter) return res.status(400).json({ success: false, message: 'Invalid year/quarter.' });

  const entity = await Entity.findById(req.entityId).lean();
  if (!entity) return res.status(404).json({ success: false, message: 'Entity not found.' });

  const { datContent, contentHash, filename, totals } = await withholdingReturnService.exportQAPDat({
    entityId: req.entityId, year, quarter, userId: req.user?._id, entity,
  });
  birDashboardService.invalidate(req.entityId);

  console.log('[BIR_EXPORT_QAP_DAT]', JSON.stringify({
    user: req.user?.email, role: req.user?.role,
    entity_id: String(req.entityId),
    year, quarter,
    distinct_payees: totals.distinct_payees,
    payee_lines: totals.payee_lines,
    content_hash: contentHash,
    byte_length: Buffer.byteLength(datContent, 'utf8'),
    ip: req.ip, ts: new Date().toISOString(),
  }));

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Content-Hash', contentHash);
  res.send(datContent);
});

// ── Phase J5 — Books of Accounts (Loose-Leaf PDFs) ─────────────────────
//
// Six books generated from POSTED JournalEntry rows:
//   SALES_JOURNAL, PURCHASE_JOURNAL, CASH_RECEIPTS, CASH_DISBURSEMENTS,
//   GENERAL_JOURNAL, GENERAL_LEDGER
//
// Each book is exported per-month OR as an annual binding (12 sections +
// year summary). Sworn declaration is a separate per-book PDF for the
// notary block. All exports append SHA-256-stamped audit-log rows to
// BirFilingStatus(form_code='BOOKS', period_year=Y) per Rule #20.
//
// VIEW_DASHBOARD gates the catalog + compute endpoints. EXPORT_FORM gates
// the PDF endpoints (each mutates the audit log).

function parseBookCode(v) {
  if (!v || typeof v !== 'string') return null;
  return bookOfAccountsService.BOOK_CODES.includes(v) ? v : null;
}

function parseOptionalMonth(v) {
  if (v === undefined || v === null || v === '' || v === 'annual') return null;
  return parseMonth(v);
}

exports.getBooksCatalog = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const data = await bookOfAccountsService.getBookCatalog({ entityId: req.entityId });
  res.json({ success: true, data });
});

exports.computeBook = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseYear(req.params.year);
  const bookCode = parseBookCode(req.params.bookCode);
  // The month is optional — explicitly null/undefined means annual.
  const monthRaw = req.query.month !== undefined ? req.query.month : null;
  const month = monthRaw === null ? null : parseOptionalMonth(monthRaw);

  if (!year) return res.status(400).json({ success: false, message: 'Invalid year. Year ≥ 2024.' });
  if (!bookCode) return res.status(400).json({
    success: false,
    message: `Invalid book code. One of: ${bookOfAccountsService.BOOK_CODES.join(', ')}`,
  });
  if (monthRaw !== null && monthRaw !== '' && monthRaw !== 'annual' && month === null) {
    return res.status(400).json({ success: false, message: 'Invalid month. 1-12 or omit for annual.' });
  }

  const data = await bookOfAccountsService.computeBook({
    entityId: req.entityId, bookCode, year, month,
  });
  // Attach the BOOKS BirFilingStatus row (annual encoding) so the page can
  // render lifecycle status + audit log.
  const row = await BirFilingStatus.findOne({
    entity_id: req.entityId, form_code: 'BOOKS',
    period_year: year, period_month: null, period_quarter: null, period_payee_id: null,
  }).lean();
  res.json({ success: true, data: { ...data, filing_row: row || null } });
});

exports.exportBookPdf = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'EXPORT_FORM'))) return;
  const year = parseYear(req.params.year);
  const bookCode = parseBookCode(req.params.bookCode);
  const monthRaw = req.query.month !== undefined ? req.query.month : null;
  const month = monthRaw === null ? null : parseOptionalMonth(monthRaw);

  if (!year) return res.status(400).json({ success: false, message: 'Invalid year. Year ≥ 2024.' });
  if (!bookCode) return res.status(400).json({
    success: false,
    message: `Invalid book code. One of: ${bookOfAccountsService.BOOK_CODES.join(', ')}`,
  });
  if (monthRaw !== null && monthRaw !== '' && monthRaw !== 'annual' && month === null) {
    return res.status(400).json({ success: false, message: 'Invalid month. 1-12 or omit for annual.' });
  }

  const entity = await Entity.findById(req.entityId).lean();
  if (!entity) return res.status(404).json({ success: false, message: 'Entity not found.' });

  let result;
  try {
    result = await bookOfAccountsService.exportBookPdf({
      entityId: req.entityId, bookCode, year, month, entity,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }

  // Lazy-create the BOOKS filing-status row (annual encoding — single row
  // per (entity, year)). Each per-book per-period export appends a fresh
  // audit-log entry; the row's `totals_snapshot` mirrors the most recent
  // export so dashboard tiles can show the latest figure at a glance.
  const filter = {
    entity_id: req.entityId, form_code: 'BOOKS',
    period_year: year, period_month: null, period_quarter: null, period_payee_id: null,
  };
  let row = await BirFilingStatus.findOne(filter);
  if (!row) {
    row = new BirFilingStatus({
      ...filter,
      status: 'DRAFT',
      totals_snapshot: { last_export: { book: bookCode, totals: result.totals } },
    });
  } else {
    row.totals_snapshot = {
      ...(row.totals_snapshot || {}),
      last_export: { book: bookCode, totals: result.totals },
    };
  }
  row.export_audit_log.push({
    exported_at: new Date(),
    exported_by: req.user?._id,
    artifact_kind: 'PDF',
    filename: result.filename,
    content_hash: result.contentHash,
    byte_length: result.buffer.length,
    notes: `BOOKS ${bookCode} ${month ? `${year}-${String(month).padStart(2, '0')}` : `Annual ${year}`} (${result.rowCount} rows, ${result.page_count} pages)`,
  });
  await row.save();
  birDashboardService.invalidate(req.entityId);

  console.log('[BIR_EXPORT_BOOKS_PDF]', JSON.stringify({
    user: req.user?.email, role: req.user?.role,
    entity_id: String(req.entityId),
    book: bookCode, year, month,
    row_count: result.rowCount,
    page_count: result.page_count,
    content_hash: result.contentHash,
    byte_length: result.buffer.length,
    ip: req.ip, ts: new Date().toISOString(),
  }));

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('X-Content-Hash', result.contentHash);
  res.send(result.buffer);
});

exports.exportBookSwornDeclarationPdf = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'EXPORT_FORM'))) return;
  const year = parseYear(req.params.year);
  const bookCode = parseBookCode(req.params.bookCode);

  if (!year) return res.status(400).json({ success: false, message: 'Invalid year. Year ≥ 2024.' });
  if (!bookCode) return res.status(400).json({
    success: false,
    message: `Invalid book code. One of: ${bookOfAccountsService.BOOK_CODES.join(', ')}`,
  });

  const entity = await Entity.findById(req.entityId).lean();
  if (!entity) return res.status(404).json({ success: false, message: 'Entity not found.' });

  let result;
  try {
    result = await bookOfAccountsService.exportSwornDeclaration({
      entityId: req.entityId, bookCode, year, entity,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }

  // Audit-log against the same BOOKS row.
  const filter = {
    entity_id: req.entityId, form_code: 'BOOKS',
    period_year: year, period_month: null, period_quarter: null, period_payee_id: null,
  };
  let row = await BirFilingStatus.findOne(filter);
  if (!row) {
    row = new BirFilingStatus({ ...filter, status: 'DRAFT', totals_snapshot: null });
  }
  row.export_audit_log.push({
    exported_at: new Date(),
    exported_by: req.user?._id,
    artifact_kind: 'PDF',
    filename: result.filename,
    content_hash: result.contentHash,
    byte_length: result.buffer.length,
    notes: `Sworn Declaration ${bookCode} ${year}`,
  });
  await row.save();
  birDashboardService.invalidate(req.entityId);

  console.log('[BIR_EXPORT_BOOKS_SWORN]', JSON.stringify({
    user: req.user?.email, role: req.user?.role,
    entity_id: String(req.entityId),
    book: bookCode, year,
    content_hash: result.contentHash,
    byte_length: result.buffer.length,
    ip: req.ip, ts: new Date().toISOString(),
  }));

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('X-Content-Hash', result.contentHash);
  res.send(result.buffer);
});

// ── Phase J6 — Inbound 2307 Reconciliation + 1702 CWT credit rollup ────
//
// CwtLedger is the source-of-truth for INBOUND CWT — every row is auto-
// created on collection post when row.cwt_amount > 0 (collectionController
// :614 → cwtService.createCwtEntry). J6 adds a reconciliation lifecycle on
// top: PENDING_2307 (default) → RECEIVED (bookkeeper attests receipt) or
// EXCLUDED (finance disqualifies). RECEIVED rows tagged for a year roll up
// into the 1702 Creditable Tax Withheld credit (J7).
//
// VIEW_DASHBOARD gates the read endpoints (compute / list / posture /
// 1702 rollup). RECONCILE_INBOUND_2307 gates the write endpoints
// (mark-received / mark-pending / exclude). Both are lookup-driven via
// BIR_ROLES (Rule #3 / Rule #19).

function parseQuarterCode(v) {
  if (!v) return null;
  const upper = String(v).toUpperCase();
  return ['Q1', 'Q2', 'Q3', 'Q4'].includes(upper) ? upper : null;
}

exports.compute2307Inbound = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ success: false, message: 'Invalid year. Year ≥ 2024.' });
  const rawQuarter = req.params.quarter !== undefined ? req.params.quarter : null;
  let quarter = null;
  if (rawQuarter !== null && rawQuarter !== undefined && rawQuarter !== '') {
    // Accept both `Q1` and `1` for the quarter URL segment.
    quarter = parseQuarterCode(rawQuarter);
    if (!quarter) {
      const numeric = parseQuarter(rawQuarter);
      if (numeric) quarter = `Q${numeric}`;
    }
    if (!quarter) {
      return res.status(400).json({ success: false, message: 'Invalid quarter. Use Q1..Q4 or 1..4.' });
    }
  }
  const data = await cwt2307ReconciliationService.compute2307InboundSummary({
    entityId: req.entityId, year, quarter,
  });
  res.json({ success: true, data });
});

exports.list2307InboundRows = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ success: false, message: 'Invalid year. Year ≥ 2024.' });
  const quarter = req.query.quarter ? (parseQuarterCode(req.query.quarter) || `Q${parseQuarter(req.query.quarter) || ''}`) : null;
  const status = req.query.status && ['PENDING_2307', 'RECEIVED', 'EXCLUDED'].includes(req.query.status) ? req.query.status : null;
  const hospitalId = req.query.hospital_id || null;
  const rows = await cwt2307ReconciliationService.listInboundRows({
    entityId: req.entityId, year,
    quarter: quarter && quarter !== 'Q' ? quarter : null,
    status,
    hospitalId,
  });
  res.json({ success: true, data: { rows, total: rows.length } });
});

exports.markReceived2307Inbound = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'RECONCILE_INBOUND_2307'))) return;
  const { rowId } = req.params;
  if (!rowId) return res.status(400).json({ success: false, message: 'rowId is required.' });
  const { cert_2307_url, cert_filename, cert_content_hash, cert_notes } = req.body || {};
  try {
    const row = await cwt2307ReconciliationService.markReceived(rowId, {
      entityId: req.entityId, userId: req.user?._id,
      cert_2307_url, cert_filename, cert_content_hash, cert_notes,
    });
    console.log('[BIR_2307_INBOUND_MARK_RECEIVED]', JSON.stringify({
      user: req.user?.email, role: req.user?.role,
      entity_id: String(req.entityId),
      row_id: String(row._id), cr_no: row.cr_no, cwt: row.cwt_amount,
      year: row.year, quarter: row.quarter,
      content_hash: row.cert_content_hash, has_url: !!row.cert_2307_url,
      ts: new Date().toISOString(),
    }));
    res.json({ success: true, data: row });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    throw err;
  }
});

exports.markPending2307Inbound = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'RECONCILE_INBOUND_2307'))) return;
  const { rowId } = req.params;
  if (!rowId) return res.status(400).json({ success: false, message: 'rowId is required.' });
  try {
    const row = await cwt2307ReconciliationService.markPending(rowId, {
      entityId: req.entityId, userId: req.user?._id,
    });
    console.log('[BIR_2307_INBOUND_MARK_PENDING]', JSON.stringify({
      user: req.user?.email, role: req.user?.role,
      entity_id: String(req.entityId),
      row_id: String(row._id), cr_no: row.cr_no,
      year: row.year, quarter: row.quarter,
      ts: new Date().toISOString(),
    }));
    res.json({ success: true, data: row });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    throw err;
  }
});

exports.exclude2307InboundRow = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'RECONCILE_INBOUND_2307'))) return;
  const { rowId } = req.params;
  if (!rowId) return res.status(400).json({ success: false, message: 'rowId is required.' });
  const { reason } = req.body || {};
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ success: false, message: 'reason is required to exclude a 2307-IN row.' });
  }
  try {
    const row = await cwt2307ReconciliationService.excludeRow(rowId, {
      entityId: req.entityId, userId: req.user?._id, reason,
    });
    console.log('[BIR_2307_INBOUND_EXCLUDE]', JSON.stringify({
      user: req.user?.email, role: req.user?.role,
      entity_id: String(req.entityId),
      row_id: String(row._id), cr_no: row.cr_no,
      year: row.year, quarter: row.quarter,
      reason: row.excluded_reason,
      ts: new Date().toISOString(),
    }));
    res.json({ success: true, data: row });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    throw err;
  }
});

exports.getInboundCwtPosture = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseYear(req.query.year) || new Date().getFullYear();
  const posture = await cwt2307ReconciliationService.buildInboundPosture(req.entityId, year);
  res.json({ success: true, data: { year, ...posture } });
});

exports.compute1702CwtRollup = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ success: false, message: 'Invalid year. Year ≥ 2024.' });
  const rollup = await cwt2307ReconciliationService.compute1702CwtRollup({
    entityId: req.entityId, year,
  });
  res.json({ success: true, data: rollup });
});

// ── Withholding Posture (read-only summary for the dashboard) ──────────
exports.getWithholdingPosture = catchAsync(async (req, res) => {
  if (!requireEntity(req, res)) return;
  if (!(await ensureRole(req, res, 'VIEW_DASHBOARD'))) return;
  const year = parseYear(req.query.year) || new Date().getFullYear();
  const posture = await withholdingService.buildPosture(req.entityId, year);
  res.json({ success: true, data: { year, ...posture } });
});

exports._test = { parseBirConfirmation };
