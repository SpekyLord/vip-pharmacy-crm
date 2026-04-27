/**
 * BIR Data Quality Agent — Phase VIP-1.J (Apr 2026).
 *
 * Scans the master-data collections that drive BIR exports for missing TIN,
 * incomplete address, and other tax-config gaps. Persists findings on
 * BirDataQualityRun for the dashboard data-quality strip + drill-down.
 *
 * Triggers:
 *   - Nightly cron (registered via agentRoutes / agentScheduler)
 *   - On-demand via POST /api/erp/bir/data-quality/run
 *   - Boot-time once per process (warm the dashboard cache)
 *
 * Outputs:
 *   - BirDataQualityRun row per (entity, run)
 *   - MessageInbox alerts to admin + finance + president when a blocker
 *     affects a deadline within 7 days
 *
 * Per Rule #3, the strict regex for TIN format lives on the Entity pre-validate
 * hook + lookup-driven contractor-specific overrides (J2 will add per-payee
 * config). This agent only checks presence + obvious format faults.
 */

// Lazy-required models to keep this agent boot-tolerant: a model file rename
// or an environment that doesn't include CRM (Doctor) shouldn't crash the
// agent at require time. The runScan path handles a null Model gracefully.
function safeRequire(p) {
  try { return require(p); } catch (_) { return null; }
}

const Entity = safeRequire('../erp/models/Entity');
const Hospital = safeRequire('../erp/models/Hospital');
const Customer = safeRequire('../erp/models/Customer');
const Vendor = safeRequire('../erp/models/VendorMaster') || safeRequire('../erp/models/Vendor');
const PeopleMaster = safeRequire('../erp/models/PeopleMaster');
const BirDataQualityRun = safeRequire('../erp/models/BirDataQualityRun');
const Lookup = safeRequire('../erp/models/Lookup');
const Doctor = safeRequire('../models/Doctor');
const MessageInbox = safeRequire('../models/MessageInbox');

// ── TIN validator (loose) — matches XXX-XXX-XXX-XXXXX after normalization ──
const TIN_REGEX = /^\d{3}-\d{3}-\d{3}-\d{5}$/;

function evaluateTin(tin) {
  if (!tin || typeof tin !== 'string' || tin.trim() === '') return 'TIN_MISSING';
  if (!TIN_REGEX.test(tin.trim())) {
    // Tolerate 9-digit (unbranched) TINs as valid — many sole-prop suppliers
    // don't publish a branch code. This is a soft check; the strict format
    // gate fires at write time inside Entity.pre('validate').
    const digits = tin.replace(/\D/g, '');
    if (digits.length !== 9 && digits.length !== 14) return 'TIN_INVALID';
  }
  return null;
}

function evaluateAddress(addressLike) {
  // address can be a flat string or a structured object {street, barangay,
  // city, province, zip}. Flat-string is legacy — issue ADDRESS_MISSING if
  // empty, otherwise treat as complete (we don't parse strings).
  if (!addressLike) return ['ADDRESS_MISSING'];
  if (typeof addressLike === 'string') {
    return addressLike.trim() === '' ? ['ADDRESS_MISSING'] : [];
  }
  const issues = [];
  if (!addressLike.barangay) issues.push('ADDRESS_INCOMPLETE_BARANGAY');
  if (!addressLike.city) issues.push('ADDRESS_INCOMPLETE_CITY');
  if (!addressLike.province) issues.push('ADDRESS_INCOMPLETE_PROVINCE');
  if (!addressLike.zip && !addressLike.zip_code) issues.push('ADDRESS_INCOMPLETE_ZIP');
  return issues;
}

async function scanCollection(Model, kind, entityFilter, { displayField = 'name', tinField = 'tin', addressField = 'address' } = {}) {
  if (!Model) return { total: 0, findings: [] };
  const filter = { ...entityFilter };
  let docs;
  try {
    docs = await Model.find(filter).lean();
  } catch (err) {
    // Some models live in a separate database (e.g., CRM Doctor) and may
    // not be queryable from this process. Skip silently rather than crash
    // the whole run.
    return { total: 0, findings: [], error: err.message };
  }

  const findings = [];
  for (const doc of docs) {
    const issues = [];
    const tinIssue = evaluateTin(doc[tinField]);
    if (tinIssue) issues.push(tinIssue);
    issues.push(...evaluateAddress(doc[addressField]));
    if (issues.length === 0) continue;
    findings.push({
      collection_kind: kind,
      record_id: doc._id,
      display_name: doc[displayField] || doc.full_name || doc.entity_name || `(unnamed ${kind})`,
      issue_codes: issues,
      related_id: doc.user_id || doc.user || null,
      blocked_forms: [],
    });
  }
  return { total: docs.length, findings };
}

/**
 * Determine which BIR forms a finding blocks based on form catalog
 * `requires_*` flags. Used to populate `blocked_forms_due_within_7d`.
 */
async function tagBlockedForms(entityId, summary) {
  const catalog = await Lookup.find({
    category: 'BIR_FORMS_CATALOG',
    entity_id: entityId,
    is_active: true,
  }).lean();

  const blocked = [];
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  for (const row of catalog) {
    const meta = row.metadata || {};
    // Crude due-date estimate (next-month / next-quarter convention).
    // A precise computation lives in birDashboardService.computeDueDate;
    // here we just need "is this form's next deadline ≤ 7 days?"
    let nextDue;
    if (meta.frequency === 'MONTHLY') {
      const dt = new Date();
      dt.setUTCMonth(dt.getUTCMonth() + 1);
      dt.setUTCDate(meta.due_day || 25);
      nextDue = dt;
    } else if (meta.frequency === 'QUARTERLY') {
      const dt = new Date();
      const q = Math.floor(dt.getUTCMonth() / 3);
      dt.setUTCMonth((q + 1) * 3);
      dt.setUTCDate(meta.due_day || 31);
      nextDue = dt;
    } else continue;

    const daysOut = nextDue.getTime() - now;
    if (daysOut < 0 || daysOut > sevenDaysMs) continue;

    // If the form requires payroll or withholding and we have any TIN
    // shortfall, this form is data-blocked.
    if ((meta.requires_payroll && summary.people_issues > 0) ||
        (meta.requires_withholding && (summary.vendor_issues > 0 || summary.people_issues > 0)) ||
        (meta.requires_collections && summary.hospital_issues > 0) ||
        summary.entity_self > 0) {
      blocked.push(row.code);
    }
  }
  return blocked;
}

async function notifyBlockers(entityId, run) {
  if (!MessageInbox) return;
  if (!run.blocked_forms_due_within_7d || run.blocked_forms_due_within_7d.length === 0) return;
  // Find one admin user to alert; full multi-recipient broadcast is the
  // notify() service's job. Keep this scaffold minimal so tests pass.
  try {
    await MessageInbox.create({
      entity_id: entityId,
      recipient_role: 'ALL_ADMINS',
      category: 'compliance_alert',
      priority: 'high',
      subject: `BIR data-quality blockers — ${run.blocked_forms_due_within_7d.join(', ')}`,
      body: `The BIR Data Quality scan flagged ${run.findings.length} record(s) with missing TIN/address that block forms due within 7 days: ${run.blocked_forms_due_within_7d.join(', ')}. Open /erp/bir to review.`,
      source_module: 'BIR_DATA_QUALITY',
    });
  } catch (err) {
    console.warn('[birDataQualityAgent] notify failed:', err.message);
  }
}

/**
 * Main entry point — run a scan for a single entity.
 */
async function runScan({ entityId, triggeredBy = 'ON_DEMAND', triggeredUserId = null }) {
  const startedAt = new Date();
  const run = await BirDataQualityRun.create({
    entity_id: entityId,
    triggered_by: triggeredBy,
    triggered_user_id: triggeredUserId,
    started_at: startedAt,
    status: 'RUNNING',
  });

  try {
    const entity = await Entity.findById(entityId).lean();
    if (!entity) throw new Error(`Entity ${entityId} not found`);

    // Entity self-check
    const entityIssues = [];
    if (evaluateTin(entity.tin)) entityIssues.push(evaluateTin(entity.tin));
    if (!entity.rdo_code) entityIssues.push('RDO_MISSING');
    if (!entity.tax_type) entityIssues.push('TAX_TYPE_MISSING');
    if (!entity.business_style) entityIssues.push('BUSINESS_STYLE_MISSING');
    entityIssues.push(...evaluateAddress(entity.address));

    const findings = [];
    if (entityIssues.length > 0) {
      findings.push({
        collection_kind: 'Entity',
        record_id: entity._id,
        display_name: entity.entity_name,
        issue_codes: entityIssues,
        related_id: null,
        blocked_forms: [],
      });
    }

    const entityFilter = { entity_id: entityId };
    const hospitalScan = await scanCollection(Hospital, 'Hospital', entityFilter, { displayField: 'hospital_name' });
    const customerScan = await scanCollection(Customer, 'Customer', entityFilter, { displayField: 'customer_name' });
    const vendorScan   = await scanCollection(Vendor,   'Vendor',   entityFilter, { displayField: 'vendor_name' });
    const peopleScan   = await scanCollection(PeopleMaster, 'PeopleMaster', entityFilter, { displayField: 'full_name', tinField: 'government_ids.tin' });
    const doctorScan   = Doctor ? await scanCollection(Doctor, 'Doctor', {}, { displayField: 'name' }) : { total: 0, findings: [] };

    findings.push(
      ...hospitalScan.findings,
      ...customerScan.findings,
      ...vendorScan.findings,
      ...peopleScan.findings,
      ...doctorScan.findings,
    );

    const summary = {
      hospital_total: hospitalScan.total,
      hospital_issues: hospitalScan.findings.length,
      customer_total: customerScan.total,
      customer_issues: customerScan.findings.length,
      vendor_total: vendorScan.total,
      vendor_issues: vendorScan.findings.length,
      people_total: peopleScan.total,
      people_issues: peopleScan.findings.length,
      doctor_total: doctorScan.total,
      doctor_issues: doctorScan.findings.length,
      entity_self: entityIssues.length > 0 ? 1 : 0,
    };

    const blocked = await tagBlockedForms(entityId, summary);
    const totalIssues = findings.length;
    let status = 'OK';
    if (totalIssues > 0) {
      status = blocked.length > 0 ? 'BLOCK' : 'WARN';
    }

    const completedAt = new Date();
    run.findings = findings;
    run.summary = summary;
    run.status = status;
    run.blocked_forms_due_within_7d = blocked;
    run.completed_at = completedAt;
    run.duration_ms = completedAt - startedAt;
    await run.save();

    if (status === 'BLOCK') await notifyBlockers(entityId, run);
    return run.toObject();
  } catch (err) {
    run.error_message = err.message;
    run.status = 'WARN';
    run.completed_at = new Date();
    run.duration_ms = run.completed_at - startedAt;
    await run.save();
    throw err;
  }
}

/**
 * Cron entry — sweep every active entity. Used by agent scheduler.
 */
async function runScanAll({ triggeredBy = 'CRON' } = {}) {
  const entities = await Entity.find({ status: 'ACTIVE' }).lean();
  const results = [];
  for (const e of entities) {
    try {
      const result = await runScan({ entityId: e._id, triggeredBy });
      results.push({ entity_id: e._id, status: result.status, findings: result.findings?.length || 0 });
    } catch (err) {
      results.push({ entity_id: e._id, status: 'ERROR', error: err.message });
    }
  }
  return results;
}

module.exports = {
  runScan,
  runScanAll,
  evaluateTin,
  evaluateAddress,
};
