/**
 * SOX Control Matrix controller — Phase SG-6 #29
 *
 * Materializes a live, subscription-ready control matrix for every Sales
 * Goal state change:
 *   - Enumerates each controlled operation (plan.activate, plan.close,
 *     plan.reopen, bulk_targets, compute_snapshot, target_revise, payout.*,
 *     dispute.*).
 *   - For each op, reads the live authorization posture from:
 *       · MODULE_DEFAULT_ROLES lookup (Default-Roles Gate — Phase G4)
 *       · ERP_SUB_PERMISSIONS lookup (sub-permission requirement)
 *       · APPROVAL_MODULE + APPROVAL_CATEGORY lookup (authority matrix tier)
 *   - Scans the last N days (configurable via SOX_MATRIX_CONFIG) of
 *     ErpAuditLog for actual activity per op — who performed it, how often.
 *   - Cross-checks for segregation-of-duties violations: any user who both
 *     CREATED and POSTED the same document type (plan, payout, dispute) in
 *     the window gets flagged.
 *   - Also surfaces integrationHooks.describeRegistry() so subscribers see
 *     which events are wired and how many listeners each has.
 *
 * GET /sales-goals/sox-control-matrix?window_days=90 — returns JSON.
 * GET /sales-goals/sox-control-matrix/print?window_days=90 — returns HTML
 *     suitable for browser "Save as PDF" (reuses pdfRenderer if opted-in).
 *
 * Access: admin/finance/president only (see route mount).
 */

const mongoose = require('mongoose');
const ErpAuditLog = require('../models/ErpAuditLog');
const Lookup = require('../models/Lookup');
const SalesGoalPlan = require('../models/SalesGoalPlan');
const IncentivePayout = require('../models/IncentivePayout');
const User = require('../../models/User');
const { catchAsync } = require('../../middleware/errorHandler');
const pdfRenderer = require('../services/pdfRenderer');
const integrationHooks = require('../services/integrationHooks');

// Control matrix definition — one row per Sales-Goal controlled operation.
// Keeping this as a module constant (not a lookup) is INTENTIONAL: it is the
// *source of truth* about what Sales Goal does, and the matrix's job is to
// audit whether the live authorization config MATCHES these intents. Moving
// it to a lookup would let an admin hide a control from SOX reporting by
// deleting its row — which is the opposite of what SOX is for.
//
// Each row lists the authorization surfaces it depends on; the controller
// resolves them from lookups at request time so subscribers see their own
// configured state.
const CONTROLS = [
  {
    op: 'plan.activate',
    label: 'Activate Sales Goal Plan',
    description: 'Transitions a DRAFT plan to ACTIVE. Assigns reference number, auto-enrolls eligible BDMs, stamps approval trail.',
    module_default_roles_code: 'SALES_GOAL_PLAN',
    approval_module_code: 'SALES_GOAL_PLAN',
    sub_permission_key: 'sales_goals.plan_manage',
    audit_target_model: 'SalesGoalPlan',
    audit_log_types: ['STATUS_CHANGE'],
    event_emitted: 'plan.activated',
  },
  {
    op: 'plan.close',
    label: 'Close Sales Goal Plan',
    description: 'Finalizes an ACTIVE plan. Freezes targets, stops further accruals.',
    module_default_roles_code: 'SALES_GOAL_PLAN',
    approval_module_code: 'SALES_GOAL_PLAN',
    sub_permission_key: 'sales_goals.plan_manage',
    audit_target_model: 'SalesGoalPlan',
    audit_log_types: ['STATUS_CHANGE'],
    event_emitted: 'plan.closed',
  },
  {
    op: 'plan.reopen',
    label: 'Reopen Plan to DRAFT',
    description: 'Reverts ACTIVE plan + targets to DRAFT for edits. President-Reverse does the full cascade if ledger cleanup is needed.',
    module_default_roles_code: 'SALES_GOAL_PLAN',
    approval_module_code: 'SALES_GOAL_PLAN',
    sub_permission_key: 'sales_goals.plan_manage',
    audit_target_model: 'SalesGoalPlan',
    audit_log_types: ['REOPEN'],
    event_emitted: 'plan.reopened',
  },
  {
    op: 'plan.new_version',
    label: 'Spawn Plan New Version (SG-4 #21)',
    description: 'Mints v(N+1) of the logical IncentivePlan header. Historical snapshots stay tied to the prior version.',
    module_default_roles_code: 'SALES_GOAL_PLAN',
    approval_module_code: 'SALES_GOAL_PLAN',
    sub_permission_key: 'sales_goals.plan_manage',
    audit_target_model: 'SalesGoalPlan',
    audit_log_types: ['STATUS_CHANGE'],
    event_emitted: 'plan.versioned',
  },
  {
    op: 'targets.bulk',
    label: 'Bulk Assign Targets',
    description: 'Upserts many BDM/entity/territory targets at once. Sum-validation is advisory (over-allocation allowed).',
    module_default_roles_code: 'SALES_GOAL_PLAN',
    approval_module_code: 'SALES_GOAL_PLAN',
    sub_permission_key: 'sales_goals.plan_manage',
    audit_target_model: 'SalesGoalPlan',
    audit_log_types: ['STATUS_CHANGE'],
    event_emitted: null,
  },
  {
    op: 'targets.import',
    label: 'Excel Import Targets (SG-3R)',
    description: 'Upserts targets from a multi-sheet xlsx. Validated row-by-row; invalid rows returned in response.',
    module_default_roles_code: 'SALES_GOAL_PLAN',
    approval_module_code: 'SALES_GOAL_PLAN',
    sub_permission_key: 'sales_goals.plan_manage',
    audit_target_model: 'SalesGoalPlan',
    audit_log_types: ['STATUS_CHANGE'],
    event_emitted: null,
  },
  {
    op: 'target.revise',
    label: 'Mid-Period Target Revision (SG-6 #31)',
    description: 'Appends a TargetRevision entry to an ACTIVE target. Opt-in per entity via MID_PERIOD_REVISION_ENABLED.',
    module_default_roles_code: 'SALES_GOAL_PLAN',
    approval_module_code: 'SALES_GOAL_PLAN',
    sub_permission_key: 'sales_goals.plan_manage',
    audit_target_model: 'SalesGoalTarget',
    audit_log_types: ['STATUS_CHANGE'],
    event_emitted: 'target.revised',
  },
  {
    op: 'snapshot.compute',
    label: 'Compute KPI Snapshots',
    description: 'Re-runs the KPI engine across every active BDM. Accrual side-effects only on YTD snapshots (idempotent).',
    module_default_roles_code: 'SALES_GOAL_PLAN',
    approval_module_code: 'SALES_GOAL_PLAN',
    sub_permission_key: 'sales_goals.kpi_compute',
    audit_target_model: 'SalesGoalPlan',
    audit_log_types: ['STATUS_CHANGE'],
    event_emitted: null,
  },
  {
    op: 'payout.accrue',
    label: 'Incentive Accrual (automatic)',
    description: 'Automatic — fires inside computeBdmSnapshot on tier qualification. Posts DR Incentive Expense / CR Incentive Accrual.',
    module_default_roles_code: null,       // automatic — no user gate
    approval_module_code: null,
    sub_permission_key: null,
    audit_target_model: 'IncentivePayout',
    audit_log_types: ['STATUS_CHANGE'],
    event_emitted: 'payout.accrued',
    automatic: true,
  },
  {
    op: 'payout.approve',
    label: 'Approve Incentive Payout',
    description: 'Authority step (no JE). Confirms the accrued amount is final before payout.',
    module_default_roles_code: 'INCENTIVE_PAYOUT',
    approval_module_code: 'INCENTIVE_PAYOUT',
    sub_permission_key: 'sales_goals.payout_approve',
    audit_target_model: 'IncentivePayout',
    audit_log_types: ['STATUS_CHANGE'],
    event_emitted: 'payout.approved',
  },
  {
    op: 'payout.pay',
    label: 'Settle Incentive Payout',
    description: 'Posts settlement JE (DR Incentive Accrual / CR funding COA). Moves status to PAID.',
    module_default_roles_code: 'INCENTIVE_PAYOUT',
    approval_module_code: 'INCENTIVE_PAYOUT',
    sub_permission_key: 'sales_goals.payout_pay',
    audit_target_model: 'IncentivePayout',
    audit_log_types: ['STATUS_CHANGE'],
    event_emitted: 'payout.paid',
  },
  {
    op: 'payout.reverse',
    label: 'Reverse Incentive Payout (SAP Storno)',
    description: 'Posts reversal JE against the accrual. Danger sub-perm (sales_goals.payout_reverse).',
    module_default_roles_code: 'INCENTIVE_PAYOUT',
    approval_module_code: 'INCENTIVE_PAYOUT',
    sub_permission_key: 'sales_goals.payout_reverse',
    is_danger: true,
    audit_target_model: 'IncentivePayout',
    audit_log_types: ['STATUS_CHANGE'],
    event_emitted: 'payout.reversed',
  },
  {
    op: 'dispute.file',
    label: 'File Incentive Dispute',
    description: 'BDM files against an IncentivePayout or SalesCredit. No gate — just authenticated.',
    module_default_roles_code: null,
    approval_module_code: null,
    sub_permission_key: null,
    audit_target_model: 'IncentiveDispute',
    audit_log_types: ['STATUS_CHANGE'],
    event_emitted: 'dispute.filed',
  },
  {
    op: 'dispute.resolve',
    label: 'Resolve Dispute (approve/deny)',
    description: 'Multi-stage with SLA clock (#DSP agent). Approved → cascades payout reversal.',
    module_default_roles_code: 'INCENTIVE_DISPUTE',
    approval_module_code: 'INCENTIVE_DISPUTE',
    sub_permission_key: null,              // dispute access is role-gated via MODULE_DEFAULT_ROLES only
    audit_target_model: 'IncentiveDispute',
    audit_log_types: ['STATUS_CHANGE'],
    event_emitted: 'dispute.resolved',
  },
  {
    op: 'president_reverse.plan',
    label: 'President-Reverse Sales Goal Plan',
    description: 'SAP-Storno cascade. Reverses targets, snapshots, IncentivePayouts, journals. Danger sub-perm.',
    module_default_roles_code: null,       // gated by accounting.reverse_posted sub-perm
    approval_module_code: null,
    sub_permission_key: 'accounting.reverse_posted',
    is_danger: true,
    audit_target_model: 'SalesGoalPlan',
    audit_log_types: ['PRESIDENT_REVERSAL'],
    event_emitted: null,
  },
  {
    op: 'lifecycle.people_change',
    label: 'Auto-Lifecycle (SG-6 #30)',
    description: 'PeopleMaster post-save hook. Enroll / close / revise flows driven by SALES_GOAL_ELIGIBLE_ROLES + DEACTIVATION_PAYOUT_POLICY lookups.',
    module_default_roles_code: null,
    approval_module_code: null,
    sub_permission_key: null,
    audit_target_model: 'SalesGoalTarget',   // + IncentivePayout when policy = reverse_accrued
    audit_log_types: ['STATUS_CHANGE'],
    event_emitted: 'person.auto_enrolled',
    automatic: true,
  },
];

/**
 * Read MODULE_DEFAULT_ROLES + APPROVAL_MODULE entries in one shot so we
 * can resolve every control row in a single pass.
 */
async function loadAuthConfig(entityId) {
  const [moduleRoles, approvalModules, approvalCategories, subPerms] = await Promise.all([
    Lookup.find({ entity_id: entityId, category: 'MODULE_DEFAULT_ROLES', is_active: true }).lean(),
    // eslint-disable-next-line vip-tenant/require-entity-filter -- APPROVAL_MODULE is a global enum-style lookup, not per-entity
    Lookup.find({ category: 'APPROVAL_MODULE', is_active: true }).lean(),
    // eslint-disable-next-line vip-tenant/require-entity-filter -- APPROVAL_CATEGORY is a global enum-style lookup, not per-entity
    Lookup.find({ category: 'APPROVAL_CATEGORY', is_active: true }).lean(),
    // eslint-disable-next-line vip-tenant/require-entity-filter -- ERP_SUB_PERMISSION is a global enum-style lookup, not per-entity
    Lookup.find({ category: 'ERP_SUB_PERMISSION', is_active: true }).lean(),
  ]);

  // Flat maps by code for O(1) resolution.
  const moduleRolesByCode = new Map(moduleRoles.map(r => [r.code, r]));
  const approvalModuleByCode = new Map(approvalModules.map(r => [r.code, r]));
  const approvalCategoryByCode = new Map(approvalCategories.map(r => [r.code, r]));

  // Sub-perm index by "module.key" combo.
  const subPermByCombined = new Map();
  for (const row of subPerms) {
    const m = row.metadata?.module;
    const k = row.metadata?.key;
    if (m && k) subPermByCombined.set(`${m}.${k}`, row);
  }
  return { moduleRolesByCode, approvalModuleByCode, approvalCategoryByCode, subPermByCombined };
}

/**
 * For each control row, resolve the LIVE authorization posture from the
 * loaded lookups so the matrix reflects what subscribers actually see.
 */
function resolveControlAuth(control, cfg) {
  const out = {
    ...control,
    allowed_roles: null,
    allowed_roles_source: null,
    approval_category: null,
    sub_permission_label: null,
    has_approval_module_rule: false,
  };
  if (control.module_default_roles_code) {
    const row = cfg.moduleRolesByCode.get(control.module_default_roles_code);
    if (row) {
      out.allowed_roles = row.metadata?.roles || null;   // null = open-post
      out.allowed_roles_source = `MODULE_DEFAULT_ROLES[${row.code}]`;
    } else {
      out.allowed_roles_source = `MODULE_DEFAULT_ROLES[${control.module_default_roles_code}] (UNSEEDED)`;
    }
  }
  if (control.approval_module_code) {
    const row = cfg.approvalModuleByCode.get(control.approval_module_code);
    if (row) {
      out.has_approval_module_rule = true;
      const catCode = row.metadata?.category;
      if (catCode) {
        const cat = cfg.approvalCategoryByCode.get(catCode);
        out.approval_category = cat?.label || catCode;
      }
    }
  }
  if (control.sub_permission_key) {
    const row = cfg.subPermByCombined.get(control.sub_permission_key);
    out.sub_permission_label = row?.label || null;
  }
  return out;
}

/**
 * Count ErpAuditLog entries per control + collect the distinct users who
 * performed the action in the window.
 */
async function loadAuditActivity(entityId, windowDays) {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const logs = await ErpAuditLog.find({
    entity_id: entityId,
    changed_at: { $gte: since },
  })
    .select('log_type target_ref target_model field_changed changed_by changed_at note old_value new_value')
    .lean();

  // Bucket by target_model so resolveControlRow() can stitch counts in O(rows).
  const byModel = new Map();
  for (const log of logs) {
    if (!log.target_model) continue;
    if (!byModel.has(log.target_model)) byModel.set(log.target_model, []);
    byModel.get(log.target_model).push(log);
  }
  return { logs, byModel, windowStart: since };
}

/**
 * Match an audit log against a control row by (target_model, log_type, note).
 * Note matching is loose — we grep for a keyword in the audit note.
 */
function matchControl(control, log) {
  if (log.target_model !== control.audit_target_model) return false;
  if (!control.audit_log_types.includes(log.log_type)) return false;

  // Disambiguate multi-control target_models (e.g. STATUS_CHANGE on
  // SalesGoalPlan covers activate/close/reopen/bulk/new-version/compute).
  const note = String(log.note || '').toLowerCase();
  const fc = String(log.field_changed || '').toLowerCase();
  const newVal = String(log.new_value || '').toLowerCase();
  const oldVal = String(log.old_value || '').toLowerCase();

  switch (control.op) {
    case 'plan.activate':
      return (fc === 'status' && newVal === 'active' && oldVal === 'draft')
        || note.startsWith('activated plan');
    case 'plan.close':
      return (fc === 'status' && newVal === 'closed')
        || note.startsWith('closed plan');
    case 'plan.reopen':
      return log.log_type === 'REOPEN' || note.startsWith('reopened plan');
    case 'plan.new_version':
      return fc === 'version_no' || note.includes('new plan version');
    case 'targets.bulk':
      return fc === 'targets_bulk' || note.startsWith('bulk-assigned');
    case 'targets.import':
      return fc === 'targets_excel_import' || note.startsWith('excel import');
    case 'snapshot.compute':
      return fc === 'snapshot_compute' || note.startsWith('kpi snapshots computed');
    case 'target.revise':
      return control.audit_target_model === log.target_model && note.includes('[sg-6 #31]');
    case 'payout.accrue':
      return control.audit_target_model === log.target_model && newVal === 'accrued';
    case 'payout.approve':
      return control.audit_target_model === log.target_model && newVal === 'approved';
    case 'payout.pay':
      return control.audit_target_model === log.target_model && newVal === 'paid';
    case 'payout.reverse':
      return control.audit_target_model === log.target_model && newVal === 'reversed';
    case 'dispute.file':
    case 'dispute.resolve':
      return control.audit_target_model === log.target_model;
    case 'president_reverse.plan':
      return log.log_type === 'PRESIDENT_REVERSAL';
    case 'lifecycle.people_change':
      return note.includes('[sg-6 lifecycle]');
    default:
      return false;
  }
}

/**
 * Segregation-of-duties analyzer: flags any user who both CREATED and
 * POSTED (activated / approved / paid) the same document type within the
 * audit window. Uses audit-log field_changed + new_value as the signal.
 *
 * A violation ISN'T necessarily an error — in a small team the same person
 * may legitimately do both. The matrix just surfaces the overlap so auditors
 * can sign off knowingly.
 */
function analyzeSegregation(logs) {
  const bucket = new Map();
  // key = `${target_model}::${target_ref}` — one bucket per document.
  for (const log of logs) {
    if (!log.target_model || !log.target_ref || !log.changed_by) continue;
    const key = `${log.target_model}::${log.target_ref}`;
    if (!bucket.has(key)) bucket.set(key, new Map());
    const actors = bucket.get(key);
    const actorKey = String(log.changed_by);
    if (!actors.has(actorKey)) actors.set(actorKey, new Set());
    actors.get(actorKey).add(classifyAction(log));
  }

  const violations = [];
  for (const [docKey, actors] of bucket.entries()) {
    for (const [actor, actions] of actors.entries()) {
      // A user that both creates and posts the same doc — conflict.
      if (actions.has('create') && (actions.has('post') || actions.has('approve') || actions.has('pay') || actions.has('reverse'))) {
        const [target_model, target_ref] = docKey.split('::');
        violations.push({
          target_model,
          target_ref,
          user_id: actor,
          actions: [...actions],
        });
      }
    }
  }
  return violations;
}

function classifyAction(log) {
  const newVal = String(log.new_value || '').toLowerCase();
  const fc = String(log.field_changed || '').toLowerCase();
  const lt = String(log.log_type || '').toUpperCase();
  if (lt === 'REOPEN') return 'reopen';
  if (lt === 'PRESIDENT_REVERSAL') return 'reverse';
  if (fc === 'status') {
    if (newVal === 'draft' || newVal === 'open' || newVal === 'accrued') return 'create';
    if (newVal === 'active' || newVal === 'approved') return 'approve';
    if (newVal === 'paid') return 'pay';
    if (newVal === 'reversed' || newVal === 'rejected') return 'reverse';
    if (newVal === 'closed') return 'post';
  }
  if (fc === 'targets_bulk' || fc === 'targets_excel_import' || fc === 'snapshot_compute') return 'post';
  if (fc === 'version_no') return 'create';
  return 'other';
}

/**
 * Materialize the matrix — called by both the JSON and print routes.
 */
async function buildMatrix(entityId, windowDays) {
  const cfg = await loadAuthConfig(entityId);
  const { logs, byModel, windowStart } = await loadAuditActivity(entityId, windowDays);

  const rows = [];
  const actorIdSet = new Set();
  for (const control of CONTROLS) {
    const resolved = resolveControlAuth(control, cfg);
    const modelLogs = byModel.get(control.audit_target_model) || [];
    const matched = modelLogs.filter(log => matchControl(control, log));
    const actors = new Map();
    for (const log of matched) {
      const id = String(log.changed_by);
      actorIdSet.add(id);
      if (!actors.has(id)) actors.set(id, { user_id: id, count: 0, last_at: null });
      const a = actors.get(id);
      a.count += 1;
      if (!a.last_at || new Date(log.changed_at) > new Date(a.last_at)) a.last_at = log.changed_at;
    }
    rows.push({
      ...resolved,
      activity_count: matched.length,
      actors: [...actors.values()].sort((a, b) => b.count - a.count),
    });
  }

  // Segregation-of-duties analysis uses the full audit stream.
  const rawViolations = analyzeSegregation(logs);
  for (const v of rawViolations) actorIdSet.add(v.user_id);

  // Resolve user display names.
  const userIds = [...actorIdSet].filter(id => mongoose.Types.ObjectId.isValid(id));
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select('_id name email role').lean()
    : [];
  const userById = new Map(users.map(u => [String(u._id), u]));

  // Re-hydrate actor names on each row + violation.
  for (const row of rows) {
    row.actors = row.actors.map(a => ({
      ...a,
      name: userById.get(a.user_id)?.name || 'Unknown user',
      email: userById.get(a.user_id)?.email || '',
      role: userById.get(a.user_id)?.role || '',
    }));
  }
  const violations = rawViolations.map(v => ({
    ...v,
    name: userById.get(v.user_id)?.name || 'Unknown user',
    email: userById.get(v.user_id)?.email || '',
    role: userById.get(v.user_id)?.role || '',
  }));

  const eventRegistry = await integrationHooks.describeRegistry();
  const planCount = await SalesGoalPlan.countDocuments({ entity_id: entityId });
  const payoutCount = await IncentivePayout.countDocuments({ entity_id: entityId });

  return {
    generated_at: new Date().toISOString(),
    entity_id: entityId,
    window_days: windowDays,
    window_start: windowStart.toISOString(),
    totals: {
      controls: rows.length,
      audit_entries: logs.length,
      sod_violations: violations.length,
      plans: planCount,
      payouts: payoutCount,
    },
    controls: rows,
    segregation_violations: violations,
    integration_events: eventRegistry,
  };
}

exports.getControlMatrix = catchAsync(async (req, res) => {
  const entityId = req.entityId;
  const windowDays = Math.min(Math.max(Number(req.query.window_days) || 90, 1), 365);
  const matrix = await buildMatrix(entityId, windowDays);
  res.json({ success: true, data: matrix });
});

exports.printControlMatrix = catchAsync(async (req, res) => {
  const entityId = req.entityId;
  const windowDays = Math.min(Math.max(Number(req.query.window_days) || 90, 1), 365);
  const matrix = await buildMatrix(entityId, windowDays);

  const html = renderMatrixHtml(matrix);
  const format = await pdfRenderer.resolvePdfPreference(entityId, req.query.format);
  if (format === 'pdf') {
    try {
      const buffer = await pdfRenderer.htmlToPdf(html);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="sox-control-matrix-${Date.now()}.pdf"`);
      return res.send(buffer);
    } catch (err) {
      // Fall back to HTML if puppeteer unavailable — the preference resolver
      // should already have guarded this, but double-guard for safety.
      if (err.code !== pdfRenderer.PDF_UNAVAILABLE_ERR) throw err;
    }
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderMatrixHtml(matrix) {
  const rowsHtml = matrix.controls.map(r => {
    const roles = Array.isArray(r.allowed_roles) ? r.allowed_roles.join(', ')
      : r.allowed_roles === null ? '<em>OPEN</em>'
      : '<em>(unseeded)</em>';
    const actors = r.actors.length
      ? r.actors.map(a => `${escapeHtml(a.name)}${a.role ? ` (${escapeHtml(a.role)})` : ''} &times;${a.count}`).join('<br>')
      : '<em>No activity in window</em>';
    return `<tr>
      <td><strong>${escapeHtml(r.label)}</strong><br><small>${escapeHtml(r.op)}</small></td>
      <td>${escapeHtml(r.description)}</td>
      <td>${roles}<br><small>${escapeHtml(r.allowed_roles_source || '—')}</small></td>
      <td>${r.approval_category ? escapeHtml(r.approval_category) : '—'}</td>
      <td>${escapeHtml(r.sub_permission_key || '—')}${r.is_danger ? '<br><span style="color:#b91c1c;font-weight:600">DANGER</span>' : ''}</td>
      <td>${r.activity_count}</td>
      <td>${actors}</td>
      <td>${escapeHtml(r.event_emitted || '—')}</td>
    </tr>`;
  }).join('');

  const violationsHtml = matrix.segregation_violations.length
    ? matrix.segregation_violations.map(v => `<tr>
        <td>${escapeHtml(v.target_model)}</td>
        <td>${escapeHtml(v.target_ref)}</td>
        <td>${escapeHtml(v.name)}${v.role ? ` (${escapeHtml(v.role)})` : ''}</td>
        <td>${v.actions.map(escapeHtml).join(', ')}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;color:#16a34a;"><em>No segregation-of-duties conflicts detected.</em></td></tr>';

  const eventsHtml = matrix.integration_events.map(e => `<tr>
    <td>${escapeHtml(e.code)}</td>
    <td>${escapeHtml(e.label)}</td>
    <td>${e.listener_count}</td>
    <td>${e.enabled ? 'Yes' : 'No'}</td>
    <td>${escapeHtml(e.description || '—')}</td>
  </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<title>Sales Goal SOX Control Matrix</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  h2 { font-size: 16px; margin: 22px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  .meta { font-size: 12px; color: #6b7280; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; }
  th { background: #eef2ff; text-align: left; padding: 6px; border: 1px solid #c7d2fe; font-weight: 700; }
  td { border: 1px solid #e5e7eb; padding: 6px; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  .totals { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 16px; }
  .totals div { background: #f3f4f6; border-radius: 6px; padding: 10px; text-align: center; }
  .totals strong { font-size: 20px; display: block; }
  .totals span { font-size: 11px; color: #6b7280; text-transform: uppercase; }
  .footer { font-size: 10px; color: #9ca3af; margin-top: 20px; }
  .print-btn { position: fixed; top: 10px; right: 10px; padding: 8px 14px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
  @media print { .print-btn { display: none; } }
</style>
</head><body>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  <h1>Sales Goal SOX Control Matrix</h1>
  <div class="meta">
    Generated ${escapeHtml(matrix.generated_at)} &middot;
    Window: last ${matrix.window_days} days (since ${escapeHtml(matrix.window_start)}) &middot;
    Entity: ${escapeHtml(String(matrix.entity_id))}
  </div>

  <div class="totals">
    <div><strong>${matrix.totals.controls}</strong><span>Controls</span></div>
    <div><strong>${matrix.totals.audit_entries}</strong><span>Audit entries</span></div>
    <div><strong>${matrix.totals.sod_violations}</strong><span>SoD findings</span></div>
    <div><strong>${matrix.totals.plans}</strong><span>Plans tracked</span></div>
    <div><strong>${matrix.totals.payouts}</strong><span>Payouts tracked</span></div>
  </div>

  <h2>Control Matrix</h2>
  <table>
    <thead><tr>
      <th>Control</th><th>Description</th><th>Allowed Roles (live)</th>
      <th>Approval Category</th><th>Sub-Permission</th>
      <th>Activity</th><th>Actors (window)</th><th>Event Emitted</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <h2>Segregation-of-Duties Findings</h2>
  <p style="font-size:12px;margin-top:0">Flags any user who both CREATED and POSTED/APPROVED/PAID/REVERSED the same document within the window. Not every flag is a violation — acknowledge knowingly.</p>
  <table>
    <thead><tr><th>Target Model</th><th>Document</th><th>Actor</th><th>Actions</th></tr></thead>
    <tbody>${violationsHtml}</tbody>
  </table>

  <h2>Integration Event Registry</h2>
  <p style="font-size:12px;margin-top:0">Lookup-driven event bus. Subscribers can drop in listeners without Sales Goal code changes.</p>
  <table>
    <thead><tr><th>Code</th><th>Label</th><th>Listeners</th><th>Enabled</th><th>Description</th></tr></thead>
    <tbody>${eventsHtml}</tbody>
  </table>

  <div class="footer">
    VIP ERP · Phase SG-6 #29 SOX-readiness control matrix. Subscribers configure roles, approval modules,
    sub-permissions, and integration events via Control Center → Lookup Tables. No code changes are required
    to adjust the authorization posture of any row above.
  </div>
</body></html>`;
}
