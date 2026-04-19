/**
 * copilotToolRegistry.js — Phase G7.2
 *
 * Static map: handler_key (from COPILOT_TOOLS lookup metadata) → JS function.
 * Adding a new tool = add a new lookup row + register one handler here. The
 * runtime never trusts the lookup to map to arbitrary code — only handlers in
 * this file are callable.
 *
 * Each handler signature:
 *   async function(ctx, args) → { result, display? }
 *
 * `ctx` = {
 *   user:      req.user,                  // role, _id, entity_id, entity_ids
 *   entityId:  req.entityId,              // current working entity
 *   entityIds: req.user.entity_ids || [], // multi-entity scope (used by COMPARE_ENTITIES)
 *   mode:      'preview' | 'execute',     // write_confirm tools branch on this
 * }
 *
 * `args` = JSON object validated by the tool's input_schema (Claude side).
 *
 * Rules:
 *   #20 — write_confirm handlers in 'execute' mode call existing controller
 *         functions, never duplicate gateApproval / period-lock logic.
 *   #21 — handlers never accept entity_id in args; they always derive it from
 *         ctx.entityId / ctx.entityIds.
 */
'use strict';

const mongoose = require('mongoose');

// ── Common helpers ──
const ROLES = require('../../constants/roles').ROLES || {};
const PRIVILEGED_ROLES = ['president', 'ceo', 'admin', 'finance'];
function isPrivileged(role) {
  return PRIVILEGED_ROLES.includes(String(role || '').toLowerCase());
}

function bad(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function clampLimit(n, def = 20, max = 100) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 1) return def;
  return Math.min(v, max);
}

function rangeToDates(range, from, to) {
  const now = new Date();
  let start, end = now;
  switch (String(range || '').toLowerCase()) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week': {
      const day = now.getDay() === 0 ? 7 : now.getDay(); // Mon=1
      start = new Date(now); start.setDate(now.getDate() - (day - 1)); start.setHours(0, 0, 0, 0);
      break;
    }
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'ytd':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'custom':
      if (!from || !to) throw bad('range=custom requires from and to ISO dates');
      start = new Date(from); end = new Date(to);
      break;
    default:
      throw bad(`Unknown range '${range}' — use today | week | month | ytd | custom`);
  }
  return { start, end };
}

// ── Read tool: LIST_PENDING_APPROVALS ─────────────────────────────────────
async function listPendingApprovals(ctx, args = {}) {
  const { getUniversalPending } = require('./universalApprovalService');
  const limit = clampLimit(args.limit, 20, 50);
  const items = await getUniversalPending(
    ctx.entityId,
    ctx.user,
    ctx.entityIds && ctx.entityIds.length ? ctx.entityIds : [ctx.entityId],
  );
  const trimmed = items.slice(0, limit).map((i) => ({
    id: i.id,
    type: i.type,
    module: i.module,
    doc_ref: i.doc_ref,
    submitted_at: i.submitted_at,
    submitted_by: i.submitted_by_name || i.submitted_by,
    amount: i.amount,
    summary: i.description || i.summary || '',
  }));
  return {
    result: { count: items.length, returned: trimmed.length, items: trimmed },
    display: `${items.length} pending approval(s); showing ${trimmed.length}.`,
  };
}

// ── Read tool: SEARCH_DOCUMENTS ───────────────────────────────────────────
async function searchDocuments(ctx, args = {}) {
  const { query, modules = [], status, limit } = args;
  if (!query || !String(query).trim()) throw bad('query is required');
  const cap = clampLimit(limit, 25, 50);

  // Per-module collections + searchable text fields. Field names verified against
  // erp/models/*.js — the FIRST entry in `fields` is treated as the canonical
  // doc_ref for display; remaining fields are joined into the excerpt.
  // Models without a stable text doc_ref (SmerEntry, IncomeReport, CarLogbookEntry,
  // PettyCashTransaction) use `period` or fall through to the date excerpt.
  const SEARCH_TARGETS = [
    { module: 'SALES',       Model: tryModel('SalesLine'),            fields: ['csi_no', 'service_description'] },
    { module: 'COLLECTION',  Model: tryModel('Collection'),           fields: ['cr_no', 'check_no', 'bank'] },
    { module: 'EXPENSES',    Model: tryModel('SmerEntry'),            fields: ['period', 'cycle'] },
    { module: 'SMER',        Model: tryModel('SmerEntry'),            fields: ['period', 'cycle'] },
    { module: 'CAR_LOGBOOK', Model: tryModel('CarLogbookEntry'),      fields: ['period', 'cycle'] },
    { module: 'PRF_CALF',    Model: tryModel('PrfCalf'),              fields: ['prf_number', 'prf_type', 'payee_type'] },
    { module: 'PURCHASING',  Model: tryModel('PurchaseOrder'),        fields: ['po_number'] },
    { module: 'JOURNAL',     Model: tryModel('JournalEntry'),         fields: ['je_number', 'description'] },
    { module: 'BANKING',     Model: tryModel('BankStatement'),        fields: ['period'] },
    { module: 'PETTY_CASH',  Model: tryModel('PettyCashTransaction'), fields: ['source_description'] },
    { module: 'INCOME',      Model: tryModel('IncomeReport'),         fields: ['period', 'cycle'] },
    { module: 'INCENTIVE',   Model: tryModel('IncentivePayout'),      fields: ['program_code', 'tier_label'] },
  ].filter((t) => !!t.Model);

  const wantedModules = (modules || []).map((m) => String(m).toUpperCase());
  const targets = wantedModules.length
    ? SEARCH_TARGETS.filter((t) => wantedModules.includes(t.module))
    : SEARCH_TARGETS;

  const filter = { entity_id: ctx.entityId };
  if (status) filter.status = String(status).toUpperCase();

  const out = [];
  const safeRe = String(query).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(safeRe, 'i');

  for (const t of targets) {
    if (out.length >= cap) break;
    const orClauses = t.fields.map((f) => ({ [f]: rx }));
    try {
      const docs = await t.Model.find({ ...filter, $or: orClauses })
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(cap - out.length)
        .lean();
      for (const d of docs) {
        out.push({
          module: t.module,
          id: String(d._id),
          ref: d[t.fields[0]] || '(no ref)',
          status: d.status || 'UNKNOWN',
          owner: d.bdm_id || d.created_by || null,
          updated: d.updatedAt || d.createdAt,
          excerpt: t.fields.slice(1).map((f) => d[f]).filter(Boolean).join(' · ').slice(0, 160),
        });
      }
    } catch (err) {
      // collection might not exist on this install — skip silently
      continue;
    }
  }

  return {
    result: { count: out.length, items: out },
    display: `Found ${out.length} document(s) matching "${String(query).slice(0, 60)}".`,
  };
}

function tryModel(name) {
  try { return mongoose.model(name); } catch { return null; }
}

// ── Read tool: SUMMARIZE_MODULE ───────────────────────────────────────────
async function summarizeModule(ctx, args = {}) {
  const moduleKey = String(args.module || '').toUpperCase();
  if (!moduleKey) throw bad('module is required');
  const { start, end } = rangeToDates(args.range || 'month', args.from, args.to);

  // Field names verified against erp/models/*.js (April 2026).
  // SmerEntry/IncomeReport keep `period` as a "YYYY-MM" string (no period_start),
  // so summaries for those modules are scoped via the doc's createdAt instead —
  // the most reliable cross-module date field. CarLogbookEntry exposes
  // `entry_date` per row; PettyCashTransaction uses `txn_date`.
  const MODULE_CONFIG = {
    COLLECTION: { Model: tryModel('Collection'),           dateField: 'cr_date',         amountField: 'cr_amount' },
    SALES:      { Model: tryModel('SalesLine'),            dateField: 'csi_date',        amountField: 'invoice_total' },
    EXPENSES:   { Model: tryModel('SmerEntry'),            dateField: 'createdAt',       amountField: 'total_reimbursable' },
    SMER:       { Model: tryModel('SmerEntry'),            dateField: 'createdAt',       amountField: 'total_reimbursable' },
    CAR_LOGBOOK:{ Model: tryModel('CarLogbookEntry'),      dateField: 'createdAt',       amountField: 'total_amount' },
    PETTY_CASH: { Model: tryModel('PettyCashTransaction'), dateField: 'txn_date',        amountField: 'amount' },
    INCOME:     { Model: tryModel('IncomeReport'),         dateField: 'createdAt',       amountField: 'net_pay' },
    PURCHASING: { Model: tryModel('PurchaseOrder'),        dateField: 'po_date',         amountField: 'total_amount' },
    BANKING:    { Model: tryModel('BankStatement'),        dateField: 'statement_date',  amountField: 'closing_balance' },
    INCENTIVE:  { Model: tryModel('IncentivePayout'),      dateField: 'createdAt',       amountField: 'tier_budget' },
  };

  const cfg = MODULE_CONFIG[moduleKey];
  if (!cfg || !cfg.Model) throw bad(`Module '${moduleKey}' not supported for SUMMARIZE_MODULE`);

  const dateMatch = { $gte: start, $lte: end };
  const match = { entity_id: new mongoose.Types.ObjectId(ctx.entityId), [cfg.dateField]: dateMatch };

  const [agg] = await cfg.Model.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        total_amount: { $sum: { $ifNull: [`$${cfg.amountField}`, 0] } },
      },
    },
    { $sort: { count: -1 } },
    {
      $group: {
        _id: null,
        by_status: { $push: { status: '$_id', count: '$count', total_amount: '$total_amount' } },
        total_count: { $sum: '$count' },
        total_amount: { $sum: '$total_amount' },
      },
    },
  ]);

  const result = {
    module: moduleKey,
    range: { from: start.toISOString(), to: end.toISOString() },
    total_count: agg?.total_count || 0,
    total_amount: Number((agg?.total_amount || 0).toFixed(2)),
    by_status: agg?.by_status || [],
  };
  return {
    result,
    display: `${moduleKey}: ${result.total_count} doc(s), total ₱${result.total_amount.toLocaleString()} from ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}.`,
  };
}

// ── Read tool: EXPLAIN_REJECTION ──────────────────────────────────────────
async function explainRejection(ctx, args = {}) {
  const { doc_id } = args;
  if (!doc_id || !mongoose.isValidObjectId(doc_id)) throw bad('valid doc_id required');

  const ApprovalRequest = tryModel('ApprovalRequest');
  let request = ApprovalRequest ? await ApprovalRequest.findById(doc_id).lean() : null;
  let sourceDoc = null, modelName = null;

  if (request) {
    modelName = request.doc_type;
    if (request.doc_id) {
      const M = tryModel(modelName);
      if (M) sourceDoc = await M.findById(request.doc_id).lean();
    }
  } else {
    // doc_id may be the source doc directly — search the universal models
    const candidates = ['SmerEntry', 'CarLogbookEntry', 'Collection', 'SalesLine', 'PrfCalf', 'PurchaseOrder', 'JournalEntry', 'BankStatement', 'PettyCashTransaction', 'IncomeReport', 'IncentivePayout'];
    for (const name of candidates) {
      const M = tryModel(name);
      if (!M) continue;
      const found = await M.findById(doc_id).lean();
      if (found && found.entity_id?.toString() === ctx.entityId.toString()) {
        sourceDoc = found; modelName = name; break;
      }
    }
    if (sourceDoc && ApprovalRequest) {
      request = await ApprovalRequest.findOne({ doc_id: sourceDoc._id }).sort({ created_at: -1 }).lean();
    }
  }

  if (!sourceDoc && !request) {
    return { result: { found: false, doc_id }, display: 'Document not found in this entity.' };
  }

  // Entity scoping (Rule #21)
  if (sourceDoc && sourceDoc.entity_id && sourceDoc.entity_id.toString() !== ctx.entityId.toString() && !isPrivileged(ctx.user.role)) {
    throw bad('Document belongs to another entity', 403);
  }

  const reason = sourceDoc?.rejection_reason || sourceDoc?.return_reason || request?.decision_reason || null;
  // doc_ref derivation prefers the model's canonical text identifier; falls back
  // to period+cycle for SMER/Income/CarLogbook (no doc number) — verified
  // against erp/models/*.js (April 2026).
  const docRef = sourceDoc?.csi_no
    || sourceDoc?.cr_no
    || sourceDoc?.po_number
    || sourceDoc?.je_number
    || sourceDoc?.prf_number
    || (sourceDoc?.period && sourceDoc?.cycle ? `${sourceDoc.period}/${sourceDoc.cycle}` : null)
    || null;
  const result = {
    found: true,
    module: modelName,
    doc_id: sourceDoc?._id?.toString(),
    doc_ref: docRef,
    status: sourceDoc?.status,
    rejected_by: sourceDoc?.rejected_by || request?.decided_by || null,
    rejected_at: sourceDoc?.rejected_at || request?.decided_at || null,
    reason,
    history: request?.history || [],
  };
  return { result, display: reason ? `Rejection reason: ${reason}` : 'No rejection reason on file.' };
}

// ── Read tool: NAVIGATE_TO ────────────────────────────────────────────────
const PAGE_ROUTES = {
  // Lookup-aligned page keys → frontend routes
  approvals:    '/erp/approvals',
  sales:        '/erp/sales',
  collections:  '/erp/collections',
  expenses:     '/erp/expenses',
  smer:         '/erp/expenses', // SMER lives inside Expenses page
  car_logbook:  '/erp/car-logbook',
  prf_calf:     '/erp/prf-calf',
  purchasing:   '/erp/purchase-orders',
  journals:     '/erp/journals',
  banking:      '/erp/bank-recon',
  petty_cash:   '/erp/petty-cash',
  income:       '/erp/income',
  incentives:   '/erp/sales-goals/incentives',
  payouts:      '/erp/incentive-payouts',
  kpi:          '/erp/self-rating',
  dashboard:    '/erp',
  agent_dashboard: '/erp/agent-dashboard',
  control_center:  '/erp/control-center',
};

async function navigateTo(ctx, args = {}) {
  const page = String(args.page || '').toLowerCase().replace(/[^a-z_]/g, '');
  const base = PAGE_ROUTES[page];
  if (!base) throw bad(`Unknown page '${args.page}'. Allowed: ${Object.keys(PAGE_ROUTES).join(', ')}`);
  const filters = (args.filters && typeof args.filters === 'object') ? args.filters : {};
  const qs = Object.entries(filters)
    .filter(([k, v]) => k && v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`)
    .join('&');
  const url = qs ? `${base}?${qs}` : base;
  return {
    result: { url, page, filters },
    display: `Open ${url}`,
  };
}

// ── Read tool: COMPARE_ENTITIES ───────────────────────────────────────────
async function compareEntities(ctx, args = {}) {
  if (!isPrivileged(ctx.user.role)) throw bad('COMPARE_ENTITIES requires privileged role', 403);
  const metric = String(args.metric || '').toLowerCase();
  const { start, end } = rangeToDates(args.range || 'month');

  const Entity = tryModel('Entity');
  if (!Entity) throw bad('Entity model not registered');
  const allowed = ctx.entityIds && ctx.entityIds.length
    ? ctx.entityIds
    : (await Entity.find({ status: { $ne: 'INACTIVE' } }).select('_id').lean()).map((e) => e._id);

  const METRIC_CONFIG = {
    sales:       { Model: tryModel('SalesLine'),  dateField: 'csi_date',  sumField: 'invoice_total' },
    collections: { Model: tryModel('Collection'), dateField: 'cr_date',   sumField: 'cr_amount' },
    expenses:    { Model: tryModel('SmerEntry'),  dateField: 'createdAt', sumField: 'total_reimbursable' },
    pending_approvals: { custom: 'pending_approvals' },
  };
  const cfg = METRIC_CONFIG[metric];
  if (!cfg) throw bad(`metric '${metric}' not supported`);

  const out = [];
  for (const eid of allowed) {
    const ent = await Entity.findById(eid).select('name short_name').lean();
    if (cfg.custom === 'pending_approvals') {
      const ApprovalRequest = tryModel('ApprovalRequest');
      const c = ApprovalRequest ? await ApprovalRequest.countDocuments({ entity_id: eid, status: 'PENDING' }) : 0;
      out.push({ entity_id: eid, entity: ent?.short_name || ent?.name || String(eid), value: c });
    } else if (cfg.Model) {
      const [agg] = await cfg.Model.aggregate([
        { $match: { entity_id: new mongoose.Types.ObjectId(eid), [cfg.dateField]: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: { $ifNull: [`$${cfg.sumField}`, 0] } } } },
      ]);
      out.push({ entity_id: eid, entity: ent?.short_name || ent?.name || String(eid), value: Number((agg?.total || 0).toFixed(2)) });
    }
  }
  out.sort((a, b) => (b.value || 0) - (a.value || 0));
  return {
    result: { metric, range: { from: start.toISOString(), to: end.toISOString() }, entities: out },
    display: `Top: ${out[0]?.entity || 'n/a'} = ${out[0]?.value ?? 0}`,
  };
}

// ── Write-confirm tool: DRAFT_REJECTION_REASON ────────────────────────────
//
// preview mode → return the draft + a confirmation card payload.
// execute mode → call the SAME approvalHandlers map that universalApprove uses
//                via a thin wrapper. NO bypass of gateApproval (rejection paths
//                already protect terminal states; see buildGroupBReject).
async function draftRejectionReason(ctx, args = {}) {
  const { approval_request_id, reason } = args;
  if (!approval_request_id || !mongoose.isValidObjectId(approval_request_id)) {
    throw bad('valid approval_request_id required');
  }
  if (!reason || !String(reason).trim()) throw bad('reason required');

  const ApprovalRequest = tryModel('ApprovalRequest');
  if (!ApprovalRequest) throw bad('ApprovalRequest model not registered', 500);

  const request = await ApprovalRequest.findById(approval_request_id).lean();
  if (!request) throw bad('Approval request not found', 404);

  // Entity gating (Rule #21)
  if (request.entity_id && request.entity_id.toString() !== ctx.entityId.toString() && !isPrivileged(ctx.user.role)) {
    throw bad('Approval request belongs to another entity', 403);
  }

  const docRef = request.doc_ref || request.doc_id?.toString() || '(unknown)';
  const moduleKey = request.module || request.doc_type || 'UNKNOWN';

  if (ctx.mode !== 'execute') {
    // preview — return draft only. NO writes.
    return {
      result: {
        confirmation_payload: {
          tool_code: 'DRAFT_REJECTION_REASON',
          approval_request_id,
          reason: String(reason).slice(0, 500),
          doc_ref: docRef,
          module: moduleKey,
        },
        confirmation_text: `Reject ${docRef} (${moduleKey}) with reason: "${String(reason).slice(0, 200)}"?`,
      },
      display: `Draft prepared. Click Execute to apply rejection on ${docRef}.`,
    };
  }

  // execute — route to the canonical handler used by /universal-approve.
  const { approvalHandlers, TYPE_TO_MODULE } = require('../controllers/universalApprovalController');
  // Find the type key that maps to this module
  const typeKey = Object.entries(TYPE_TO_MODULE).find(([, m]) => m === moduleKey)?.[0]
              || Object.entries(TYPE_TO_MODULE).find(([, m]) => m === request.doc_type)?.[0]
              || 'approval_request';
  const handler = approvalHandlers[typeKey];
  if (!handler) throw bad(`No approval handler for type '${typeKey}'`, 500);

  // Same call signature as universalApprove → guarantees identical guarantees
  // around terminal-state protection + ApprovalRequest closure.
  const result = await handler(approval_request_id, 'reject', ctx.user._id, String(reason).slice(0, 500));

  return {
    result: { ok: true, doc_ref: docRef, module: moduleKey, reason: String(reason).slice(0, 500), updated: !!result },
    display: `Rejected ${docRef} (${moduleKey}).`,
  };
}

// ── Write-confirm tool: DRAFT_MESSAGE ─────────────────────────────────────
async function draftMessage(ctx, args = {}) {
  const { recipient_id, subject, body, category = 'general' } = args;
  if (!recipient_id || !mongoose.isValidObjectId(recipient_id)) throw bad('valid recipient_id required');
  if (!subject || !body) throw bad('subject and body required');

  const User = tryModel('User');
  const recipient = User ? await User.findById(recipient_id).select('name role full_name').lean() : null;
  if (!recipient) throw bad('Recipient not found', 404);

  if (ctx.mode !== 'execute') {
    return {
      result: {
        confirmation_payload: {
          tool_code: 'DRAFT_MESSAGE',
          recipient_id,
          subject: String(subject).slice(0, 200),
          body: String(body).slice(0, 5000),
          category,
        },
        confirmation_text: `Send to ${recipient.full_name || recipient.name}: "${String(subject).slice(0, 80)}"?`,
        recipient_name: recipient.full_name || recipient.name,
      },
      display: 'Message draft prepared. Click Execute to send.',
    };
  }

  const MessageInbox = require('../../models/MessageInbox');
  const msg = await MessageInbox.create({
    senderName: ctx.user.full_name || ctx.user.name || 'President',
    senderRole: ctx.user.role,
    senderUserId: ctx.user._id,
    title: String(subject).slice(0, 200),
    body: String(body).slice(0, 5000),
    category: String(category).toLowerCase(),
    priority: 'normal',
    recipientRole: recipient.role,
    recipientUserId: recipient._id,
  });
  return {
    result: { ok: true, message_id: String(msg._id), recipient: recipient.full_name || recipient.name },
    display: `Message sent to ${recipient.full_name || recipient.name}.`,
  };
}

// ── Write-confirm tool: DRAFT_NEW_ENTRY ───────────────────────────────────
//
// Returns a target route + values in preview mode. In execute mode, returns
// the same payload — the frontend navigates the user to the existing form
// with values pre-loaded. Actual form submission goes through the existing
// controller (Rule #20: no bypass).
async function draftNewEntry(ctx, args = {}) {
  const moduleKey = String(args.module || '').toUpperCase();
  const values = (args.values && typeof args.values === 'object') ? args.values : {};

  const ENTRY_ROUTES = {
    EXPENSES:   '/erp/expenses?new=1',
    SMER:       '/erp/expenses?new=1&type=smer',
    SALES:      '/erp/sales/entry',
    COLLECTION: '/erp/collections?new=1',
    PETTY_CASH: '/erp/petty-cash?new=1',
  };
  const base = ENTRY_ROUTES[moduleKey];
  if (!base) throw bad(`Module '${moduleKey}' not supported for DRAFT_NEW_ENTRY`);

  const url = `${base}${base.includes('?') ? '&' : '?'}prefill=${encodeURIComponent(JSON.stringify(values).slice(0, 1500))}`;

  return {
    result: {
      confirmation_payload: { tool_code: 'DRAFT_NEW_ENTRY', module: moduleKey, values, url },
      confirmation_text: `Open new ${moduleKey} form pre-filled with these values?`,
      url,
      values,
    },
    display: `Will open ${moduleKey} form pre-filled.`,
  };
}

// ── Registry ──────────────────────────────────────────────────────────────
const HANDLERS = {
  listPendingApprovals,
  searchDocuments,
  summarizeModule,
  explainRejection,
  navigateTo,
  compareEntities,
  draftRejectionReason,
  draftMessage,
  draftNewEntry,
};

function getHandler(handlerKey) {
  return HANDLERS[handlerKey] || null;
}

function listHandlerKeys() {
  return Object.keys(HANDLERS);
}

module.exports = {
  getHandler,
  listHandlerKeys,
  HANDLERS,
  // Exposed for verifyCopilotWiring + tests
  _internal: { rangeToDates, isPrivileged, tryModel },
};
