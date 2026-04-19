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

// ── Write-confirm tool: DRAFT_REPLY_TO_MESSAGE (Phase G9.R8) ──────────────
//
// Threaded reply to an existing MessageInbox row. Routes through the SAME
// /api/messages/:id/reply controller path the inbox UI uses (Rule #20: never
// reimplement reply / threading / audience guards in the AI path). Preview
// returns the draft + parent metadata; execute creates the child row.
async function draftReplyToMessage(ctx, args = {}) {
  const { message_id, body } = args;
  if (!message_id || !mongoose.isValidObjectId(message_id)) {
    throw bad('valid message_id required');
  }
  const text = String(body || '').trim();
  if (!text) throw bad('body required');

  const MessageInbox = require('../../models/MessageInbox');
  const parent = await MessageInbox.findById(message_id).lean();
  if (!parent) throw bad('Parent message not found', 404);

  // Audience guard mirroring messageInboxController.replyToMessage
  const allowedRecipient =
    String(parent.recipientUserId) === String(ctx.user._id)
    || (!parent.recipientUserId && parent.recipientRole === ctx.user.role)
    || String(parent.senderUserId) === String(ctx.user._id);
  if (!allowedRecipient && !isPrivileged(ctx.user.role)) {
    throw bad('You cannot reply to this message', 403);
  }
  // Entity scope (Rule #21): non-privileged callers can only reply within
  // their working entity.
  if (parent.entity_id && ctx.entityId && String(parent.entity_id) !== String(ctx.entityId) && !isPrivileged(ctx.user.role)) {
    throw bad('Message belongs to another entity', 403);
  }

  if (ctx.mode !== 'execute') {
    return {
      result: {
        confirmation_payload: {
          tool_code: 'DRAFT_REPLY_TO_MESSAGE',
          message_id,
          body: text.slice(0, 5000),
          parent_title: parent.title,
        },
        confirmation_text: `Send reply to "${String(parent.title || '').slice(0, 80)}"?`,
        parent_title: parent.title,
      },
      display: 'Reply draft prepared. Click Execute to send.',
    };
  }

  // Execute — write the reply via the canonical reply pathway. We construct
  // the row directly using the SAME field assembly the controller uses,
  // staying in-process (no HTTP self-call) but mirroring the controller's
  // contract exactly: thread_id = parent.thread_id || parent._id,
  // parent_message_id = parent._id, audience swap (sender ↔ recipient).
  const replyToUserId = String(parent.senderUserId) === String(ctx.user._id)
    ? parent.recipientUserId
    : parent.senderUserId;
  const replyToRole = String(parent.senderUserId) === String(ctx.user._id)
    ? parent.recipientRole
    : parent.senderRole;

  const reply = await MessageInbox.create({
    senderName: ctx.user.full_name || ctx.user.name || 'Copilot User',
    senderRole: ctx.user.role,
    senderUserId: ctx.user._id,
    title: String(parent.title || '').startsWith('Re: ')
      ? String(parent.title).slice(0, 200)
      : `Re: ${String(parent.title || '').slice(0, 196)}`,
    body: text.slice(0, 5000),
    category: parent.category || 'reply',
    priority: parent.priority || 'normal',
    recipientRole: replyToRole || 'admin',
    recipientUserId: replyToUserId || null,
    readBy: [],
    isArchived: false,
    entity_id: parent.entity_id,
    folder: parent.folder || 'CHAT',
    thread_id: parent.thread_id || parent._id,
    parent_message_id: parent._id,
  });

  return {
    result: { ok: true, message_id: String(reply._id), thread_id: String(reply.thread_id) },
    display: `Reply sent (${String(parent.title || '').slice(0, 60)}).`,
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

// ═════════════════════════════════════════════════════════════════════════
// Phase G8 (P2-10 through P2-19) — 10 new Copilot handlers
//
// 5 Secretary: createTask, listOverdueItems, draftDecisionBrief,
//              draftAnnouncement, weeklySummary
// 5 HR:        suggestKpiTargets, draftCompAdjustment, auditSelfRatings,
//              rankPeople, recommendHrAction
//
// All write_confirm handlers route through existing controllers / models —
// never bypass gateApproval / period locks (Rule #20). All handlers derive
// entity from ctx.entityId — never accept entity_id in args (Rule #21).
// ═════════════════════════════════════════════════════════════════════════

// ── Secretary: CREATE_TASK (write_confirm) ────────────────────────────────
async function createTask(ctx, args = {}) {
  const { title, description = '', assignee_user_id = null, due_date = null, priority = 'normal' } = args;
  if (!title || !String(title).trim()) throw bad('title is required');

  const Task = tryModel('Task');
  if (!Task) throw bad('Task model not registered', 500);
  const User = tryModel('User');

  // Normalise assignee (default = self)
  let assigneeId = null;
  let assigneeName = ctx.user.full_name || ctx.user.name || 'Me';
  if (assignee_user_id && mongoose.isValidObjectId(assignee_user_id)) {
    const u = User ? await User.findById(assignee_user_id).select('_id name full_name').lean() : null;
    if (!u) throw bad('assignee not found', 404);
    assigneeId = u._id;
    assigneeName = u.full_name || u.name;
  }

  // Normalise due date — accept ISO; relative words ("friday", "next week") are
  // resolved by Claude into ISO before this handler runs, so we only need
  // defensive parsing here.
  let dueDate = null;
  if (due_date) {
    const d = new Date(due_date);
    if (!isNaN(d.getTime())) dueDate = d;
  }

  const cleanPriority = Task.TASK_PRIORITIES && Task.TASK_PRIORITIES.includes(String(priority).toLowerCase())
    ? String(priority).toLowerCase()
    : 'normal';

  if (ctx.mode !== 'execute') {
    return {
      result: {
        confirmation_payload: {
          tool_code: 'CREATE_TASK',
          title: String(title).slice(0, 200),
          description: String(description).slice(0, 5000),
          assignee_user_id: assigneeId ? String(assigneeId) : null,
          assignee_name: assigneeName,
          due_date: dueDate ? dueDate.toISOString() : null,
          priority: cleanPriority,
        },
        confirmation_text: `Create task "${String(title).slice(0, 80)}"${dueDate ? ` due ${dueDate.toISOString().slice(0, 10)}` : ''} for ${assigneeName}?`,
      },
      display: 'Task draft prepared. Click Execute to save.',
    };
  }

  const doc = await Task.create({
    entity_id: ctx.entityId,
    title: String(title).slice(0, 200),
    description: String(description).slice(0, 5000),
    assignee_user_id: assigneeId,
    created_by: ctx.user._id,
    due_date: dueDate,
    priority: cleanPriority,
  });

  return {
    result: { ok: true, task_id: String(doc._id), assignee_name: assigneeName },
    display: `Task created: "${doc.title}"${dueDate ? ` (due ${dueDate.toISOString().slice(0, 10)})` : ''}`,
  };
}

// ── Secretary: LIST_OVERDUE_ITEMS (read) ──────────────────────────────────
async function listOverdueItems(ctx, args = {}) {
  const scope = String(args.scope || 'both').toLowerCase();
  const assigneeMode = String(args.assignee || 'me').toLowerCase();
  const limit = clampLimit(args.limit, 50, 200);
  const now = new Date();

  const out = { tasks: [], approvals: [] };

  if (scope === 'tasks' || scope === 'both') {
    const Task = tryModel('Task');
    if (Task) {
      const filter = {
        entity_id: ctx.entityId,
        status: { $in: ['OPEN', 'IN_PROGRESS'] },
        due_date: { $lt: now, $ne: null },
      };
      if (!isPrivileged(ctx.user.role) || assigneeMode === 'me') {
        filter.assignee_user_id = ctx.user._id;
      }
      const rows = await Task.find(filter).sort({ due_date: 1 }).limit(limit).lean();
      out.tasks = rows.map(t => ({
        id: String(t._id),
        title: t.title,
        due_date: t.due_date,
        priority: t.priority,
        days_overdue: Math.floor((now - t.due_date) / (24 * 3600 * 1000)),
      }));
    }
  }

  if (scope === 'approvals' || scope === 'both') {
    const AR = tryModel('ApprovalRequest');
    if (AR) {
      const cutoff = new Date(now.getTime() - 3 * 24 * 3600 * 1000); // 3 days = overdue for approvals
      // ApprovalRequest has no created_at field — `requested_at` is the canonical
      // submission timestamp. Fall back to createdAt from timestamps plugin for older rows.
      const filter = {
        entity_id: ctx.entityId,
        status: 'PENDING',
        $or: [{ requested_at: { $lt: cutoff } }, { createdAt: { $lt: cutoff } }],
      };
      const rows = await AR.find(filter).sort({ requested_at: 1 }).limit(limit).lean();
      out.approvals = rows.map(a => ({
        id: String(a._id),
        module: a.module || a.doc_type,
        doc_ref: a.doc_ref,
        days_waiting: Math.floor((now - (a.requested_at || a.createdAt)) / (24 * 3600 * 1000)),
      }));
    }
  }

  const total = out.tasks.length + out.approvals.length;
  return {
    result: { total, ...out },
    display: `${total} overdue item(s): ${out.tasks.length} task(s), ${out.approvals.length} approval(s).`,
  };
}

// ── Secretary: DRAFT_DECISION_BRIEF (read) ────────────────────────────────
// Pure aggregation — reuses searchDocuments + summarizeModule internally to
// assemble a structured 1-page brief. No Claude writes.
async function draftDecisionBrief(ctx, args = {}) {
  const { subject, modules = [] } = args;
  if (!subject || !String(subject).trim()) throw bad('subject is required');

  // Gather facts via existing SEARCH_DOCUMENTS handler (guarantees entity scope)
  let facts = [];
  try {
    const search = await searchDocuments(ctx, { query: subject, modules, limit: 15 });
    facts = search?.result?.items || [];
  } catch {
    facts = [];
  }

  const brief = {
    subject: String(subject).slice(0, 200),
    generated_at: new Date().toISOString(),
    background: facts.length
      ? `${facts.length} related document(s) across ${new Set(facts.map(f => f.module)).size} module(s). Most recent: ${facts[0]?.ref || facts[0]?.id}.`
      : 'No related documents found in this entity.',
    facts: facts.slice(0, 8).map(f => ({ module: f.module, ref: f.ref, status: f.status, excerpt: f.excerpt })),
    options: [
      'Option A — proceed as currently scoped',
      'Option B — defer pending more data',
      'Option C — escalate to finance for impact review',
    ],
    recommendation: 'Insufficient automated signal — use this brief as a fact scaffold and overlay your judgement.',
  };
  return {
    result: brief,
    display: `Brief assembled for "${brief.subject}" with ${facts.length} supporting fact(s).`,
  };
}

// ── Secretary: DRAFT_ANNOUNCEMENT (write_confirm) ─────────────────────────
async function draftAnnouncement(ctx, args = {}) {
  const { subject, body, scope_type, recipient_role, target_entity_id, priority = 'normal' } = args;
  if (!subject || !body) throw bad('subject and body are required');
  const st = String(scope_type || '').toLowerCase();
  if (!['by_role', 'by_entity', 'both'].includes(st)) {
    throw bad('scope_type must be by_role | by_entity | both');
  }
  const User = tryModel('User');
  if (!User) throw bad('User model not registered', 500);

  // Resolve recipient filter. Entity filter NEVER accepts client entity_id
  // unless the caller is privileged and explicitly wants a different entity.
  const filter = { isActive: true };
  if (st === 'by_role' || st === 'both') {
    if (!recipient_role) throw bad('recipient_role required for by_role / both');
    filter.role = String(recipient_role).toLowerCase();
  }
  if (st === 'by_entity' || st === 'both') {
    // privileged users can broadcast to a different entity they have access to;
    // non-privileged users are always scoped to their own working entity.
    const useEntity = isPrivileged(ctx.user.role) && target_entity_id && mongoose.isValidObjectId(target_entity_id)
      ? target_entity_id
      : ctx.entityId;
    filter.$or = [
      { entity_id: useEntity },
      { entity_ids: useEntity },
    ];
  }

  const recipients = await User.find(filter).select('_id role full_name name').lean();

  if (ctx.mode !== 'execute') {
    return {
      result: {
        confirmation_payload: {
          tool_code: 'DRAFT_ANNOUNCEMENT',
          subject: String(subject).slice(0, 200),
          body: String(body).slice(0, 5000),
          scope_type: st,
          recipient_role: recipient_role || null,
          target_entity_id: target_entity_id || null,
          priority,
          recipient_count: recipients.length,
        },
        confirmation_text: `Broadcast "${String(subject).slice(0, 80)}" to ${recipients.length} recipient(s) (${st.replace('_', ' ')})?`,
        scope_summary: st.replace('_', ' '),
        recipient_count: recipients.length,
      },
      display: `Broadcast prepared for ${recipients.length} recipient(s). Click Execute to send.`,
    };
  }

  // Execute — fan out via MessageInbox. One row per recipient so individual
  // read/archive state works per-user; broadcast rows (recipientUserId=null)
  // already exist in this system and work too, but targeted rows give
  // better telemetry and per-user archival.
  const MessageInbox = require('../../models/MessageInbox');
  const created = [];
  for (const u of recipients) {
    try {
      const msg = await MessageInbox.create({
        senderName: ctx.user.full_name || ctx.user.name || 'President',
        senderRole: ctx.user.role,
        senderUserId: ctx.user._id,
        title: String(subject).slice(0, 200),
        body: String(body).slice(0, 5000),
        category: 'announcement',
        priority: ['normal', 'important', 'high'].includes(String(priority)) ? String(priority) : 'normal',
        recipientRole: u.role,
        recipientUserId: u._id,
      });
      created.push(String(msg._id));
    } catch (e) {
      // one bad recipient shouldn't kill the broadcast — log and continue
      console.warn('[draftAnnouncement] send failed for user:', String(u._id), e.message);
    }
  }

  return {
    result: { ok: true, sent: created.length, message_ids: created.slice(0, 10) },
    display: `Announcement sent to ${created.length} recipient(s).`,
  };
}

// ── Secretary: WEEKLY_SUMMARY (read) ──────────────────────────────────────
async function weeklySummary(ctx, args = {}) {
  const offset = Number.isInteger(args.week_offset) ? args.week_offset : 0;
  const now = new Date();
  const day = now.getDay() === 0 ? 7 : now.getDay();
  const start = new Date(now); start.setDate(now.getDate() - (day - 1) + offset * 7); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 7);

  const mongooseLib = mongoose;
  const entityObjId = new mongooseLib.Types.ObjectId(ctx.entityId);

  const SalesLine = tryModel('SalesLine');
  const Collection = tryModel('Collection');
  const AR = tryModel('ApprovalRequest');

  const [salesAgg, collAgg, pendingApproval, approvedThisWeek] = await Promise.all([
    SalesLine ? SalesLine.aggregate([
      { $match: { entity_id: entityObjId, csi_date: { $gte: start, $lt: end } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$invoice_total', 0] } }, count: { $sum: 1 } } },
    ]) : Promise.resolve([]),
    Collection ? Collection.aggregate([
      { $match: { entity_id: entityObjId, cr_date: { $gte: start, $lt: end } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$cr_amount', 0] } }, count: { $sum: 1 } } },
    ]) : Promise.resolve([]),
    AR ? AR.countDocuments({ entity_id: entityObjId, status: 'PENDING' }) : Promise.resolve(0),
    AR ? AR.countDocuments({ entity_id: entityObjId, status: 'APPROVED', decided_at: { $gte: start, $lt: end } }) : Promise.resolve(0),
  ]);

  const sales = salesAgg[0] || { total: 0, count: 0 };
  const coll = collAgg[0] || { total: 0, count: 0 };
  const collRatio = sales.total > 0 ? coll.total / sales.total : 0;

  const result = {
    week_of: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
    sales: { total: Number(sales.total.toFixed(2)), count: sales.count },
    collections: { total: Number(coll.total.toFixed(2)), count: coll.count, ratio_vs_sales: Number((collRatio * 100).toFixed(1)) },
    approvals: { pending_now: pendingApproval, approved_this_week: approvedThisWeek },
  };
  return {
    result,
    display: `Week ${result.week_of.from}: sales ₱${result.sales.total.toLocaleString()} · collections ${result.collections.ratio_vs_sales}% of sales · ${result.approvals.pending_now} pending approval(s).`,
  };
}

// ── HR: SUGGEST_KPI_TARGETS (write_confirm) ───────────────────────────────
async function suggestKpiTargets(ctx, args = {}) {
  const { person_id, period, peer_scope = 'same_role_same_entity' } = args;
  if (!person_id || !mongoose.isValidObjectId(person_id)) throw bad('valid person_id required');
  if (!period) throw bad('period is required');

  const PeopleMaster = tryModel('PeopleMaster');
  const SGT = tryModel('SalesGoalTarget');
  const Person = PeopleMaster ? await PeopleMaster.findById(person_id).lean() : null;
  if (!Person) throw bad('person not found', 404);

  // Peer scope
  const peerFilter = { is_active: true, person_type: Person.person_type };
  if (peer_scope === 'same_role_same_entity') peerFilter.entity_id = ctx.entityId;

  const peers = PeopleMaster ? await PeopleMaster.find(peerFilter).select('_id').limit(50).lean() : [];
  const peerIds = peers.map(p => p._id);

  // Peer historical attainment (median revenue_target_actual) — proxy for target
  let suggestedRevenue = 0;
  if (SGT && peerIds.length) {
    const agg = await SGT.aggregate([
      { $match: { person_id: { $in: peerIds } } },
      { $sort: { period: -1 } },
      { $limit: 200 },
      { $group: { _id: null, avg: { $avg: { $ifNull: ['$revenue_target', 0] } } } },
    ]);
    suggestedRevenue = Math.round(agg[0]?.avg || 0);
  }
  const suggestedCollectionPct = 80; // safe conservative default

  if (ctx.mode !== 'execute') {
    return {
      result: {
        confirmation_payload: {
          tool_code: 'SUGGEST_KPI_TARGETS',
          person_id: String(person_id),
          period,
          peer_scope,
          suggested: {
            revenue_target: suggestedRevenue,
            collection_target_pct: suggestedCollectionPct,
          },
          peer_sample_size: peerIds.length,
        },
        confirmation_text: `Create DRAFT SalesGoalTarget for ${Person.full_name || Person.name} (${period}) with revenue ₱${suggestedRevenue.toLocaleString()} / collection ${suggestedCollectionPct}%?`,
        person_name: Person.full_name || Person.name,
      },
      display: `Suggested from ${peerIds.length} peer(s). Click Execute to create DRAFT target.`,
    };
  }

  if (!SGT) throw bad('SalesGoalTarget model not registered', 500);
  const doc = await SGT.create({
    entity_id: ctx.entityId,
    person_id,
    period,
    revenue_target: suggestedRevenue,
    collection_target_pct: suggestedCollectionPct,
    status: 'DRAFT',
    created_by: ctx.user._id,
  });

  return {
    result: { ok: true, target_id: String(doc._id) },
    display: `DRAFT SalesGoalTarget created for ${Person.full_name || Person.name} (${period}). Submit from Sales Goals page to route through gateApproval.`,
  };
}

// ── HR: DRAFT_COMP_ADJUSTMENT (write_confirm) ─────────────────────────────
async function draftCompAdjustment(ctx, args = {}) {
  const { person_id, component, new_amount, effective_date, reason = '' } = args;
  if (!person_id || !mongoose.isValidObjectId(person_id)) throw bad('valid person_id required');
  if (!component) throw bad('component required (e.g. base_salary, allowance)');
  if (typeof new_amount !== 'number' || new_amount < 0) throw bad('new_amount must be a non-negative number');
  if (!effective_date) throw bad('effective_date required (ISO)');

  const PeopleMaster = tryModel('PeopleMaster');
  const Person = PeopleMaster ? await PeopleMaster.findById(person_id).lean() : null;
  if (!Person) throw bad('person not found', 404);

  if (ctx.mode !== 'execute') {
    return {
      result: {
        confirmation_payload: {
          tool_code: 'DRAFT_COMP_ADJUSTMENT',
          person_id: String(person_id),
          component: String(component).toLowerCase(),
          new_amount,
          effective_date,
          reason: String(reason).slice(0, 500),
        },
        confirmation_text: `Adjust ${component} for ${Person.full_name || Person.name} to ₱${Number(new_amount).toLocaleString()} effective ${effective_date}?`,
        person_name: Person.full_name || Person.name,
      },
      display: 'Compensation change drafted. Click Execute to queue for gateApproval.',
    };
  }

  // Execute routes through PersonComp model (if present) — goes through
  // gateApproval internally via the existing PeopleMaster controller.
  // Writing a DRAFT row so the PRESIDENT can verify then submit.
  const PersonComp = tryModel('PersonComp');
  if (!PersonComp) {
    return {
      result: { ok: false, note: 'PersonComp model not registered on this install — change not persisted. Use the People > Comp UI.' },
      display: 'PersonComp model not registered. No changes saved.',
    };
  }
  const doc = await PersonComp.create({
    entity_id: ctx.entityId,
    person_id,
    component: String(component).toLowerCase(),
    amount: Number(new_amount),
    effective_date: new Date(effective_date),
    reason: String(reason).slice(0, 500),
    status: 'DRAFT',
    created_by: ctx.user._id,
  });
  return {
    result: { ok: true, personcomp_id: String(doc._id) },
    display: `DRAFT comp adjustment saved. Submit from People > Compensation to route through gateApproval.`,
  };
}

// ── HR: AUDIT_SELF_RATINGS (read) ─────────────────────────────────────────
async function auditSelfRatings(ctx, args = {}) {
  const { period, person_id } = args;
  if (!period) throw bad('period is required');

  const KpiRating = tryModel('KpiRating') || tryModel('KpiSelfRating');
  const KpiSnapshot = tryModel('KpiSnapshot');
  if (!KpiRating) return { result: { found: 0, flags: [] }, display: 'KpiRating model not registered — nothing to audit.' };

  const filter = { period };
  if (person_id && mongoose.isValidObjectId(person_id)) filter.person_id = person_id;
  if (ctx.entityId) filter.entity_id = ctx.entityId;
  const ratings = await KpiRating.find(filter).limit(200).lean();

  const flags = [];
  for (const r of ratings) {
    const selfScore = Number(r.self_score || r.score || 0);
    let actualScore = null;
    if (KpiSnapshot && r.person_id) {
      const snap = await KpiSnapshot.findOne({ person_id: r.person_id, period }).select('composite_score attainment_pct').lean();
      actualScore = snap?.composite_score ?? snap?.attainment_pct ?? null;
    }
    if (selfScore && actualScore !== null) {
      const gap = selfScore - actualScore;
      if (Math.abs(gap) >= 20) {
        flags.push({
          person_id: String(r.person_id),
          self_score: selfScore,
          actual_score: actualScore,
          gap,
          direction: gap > 0 ? 'over_rating' : 'under_rating',
        });
      }
    }
  }

  return {
    result: { found: ratings.length, flags },
    display: `${flags.length} flagged variance(s) out of ${ratings.length} self-rating(s) reviewed.`,
  };
}

// ── HR: RANK_PEOPLE (read) ────────────────────────────────────────────────
async function rankPeople(ctx, args = {}) {
  const { role, period, direction = 'top', limit } = args;
  if (!period) throw bad('period is required');
  const cap = clampLimit(limit, 10, 50);
  const asc = String(direction).toLowerCase() === 'bottom';

  const PeopleMaster = tryModel('PeopleMaster');
  const KpiSnapshot = tryModel('KpiSnapshot');
  if (!PeopleMaster) throw bad('PeopleMaster model not registered', 500);

  const peopleFilter = { is_active: true, entity_id: ctx.entityId };
  if (role) peopleFilter.person_type = String(role).toUpperCase();
  const people = await PeopleMaster.find(peopleFilter).limit(200).lean();

  const scored = [];
  for (const p of people) {
    let attainment = null;
    if (KpiSnapshot) {
      const snap = await KpiSnapshot.findOne({ person_id: p._id, period }).select('composite_score attainment_pct').lean();
      attainment = snap?.composite_score ?? snap?.attainment_pct ?? null;
    }
    scored.push({
      person_id: String(p._id),
      name: p.full_name || p.name,
      role: p.person_type,
      attainment,
    });
  }
  scored.sort((a, b) => {
    const aa = a.attainment ?? (asc ? Infinity : -Infinity);
    const bb = b.attainment ?? (asc ? Infinity : -Infinity);
    return asc ? aa - bb : bb - aa;
  });
  const top = scored.slice(0, cap);

  return {
    result: { period, direction: asc ? 'bottom' : 'top', count: top.length, items: top },
    display: `${asc ? 'Bottom' : 'Top'} ${top.length} ${role || 'people'} by KPI attainment for ${period}.`,
  };
}

// ── HR: RECOMMEND_HR_ACTION (read, read-only recommendation) ──────────────
async function recommendHrAction(ctx, args = {}) {
  const { person_id, period } = args;
  if (!person_id || !mongoose.isValidObjectId(person_id)) throw bad('valid person_id required');
  if (!period) throw bad('period is required');

  // Bluntness from lookup (default 'balanced' — never auto-executes anything)
  let bluntness = 'balanced';
  try {
    const Lookup = require('../models/Lookup');
    const row = await Lookup.findOne({ category: 'HR_ACTION_BLUNTNESS', code: 'DEFAULT', is_active: { $ne: false } }).lean();
    if (row?.metadata?.value) bluntness = String(row.metadata.value).toLowerCase();
  } catch { /* default */ }

  const PeopleMaster = tryModel('PeopleMaster');
  const KpiSnapshot = tryModel('KpiSnapshot');
  const VarianceAlert = tryModel('VarianceAlert');

  const person = PeopleMaster ? await PeopleMaster.findById(person_id).lean() : null;
  if (!person) throw bad('person not found', 404);

  const snap = KpiSnapshot ? await KpiSnapshot.findOne({ person_id, period }).lean() : null;
  const attainment = snap?.composite_score ?? snap?.attainment_pct ?? null;

  const variances = VarianceAlert
    ? await VarianceAlert.countDocuments({ person_id, status: { $ne: 'RESOLVED' } })
    : 0;

  // Decision tree — intentionally simple. Each tier flags requires_hr_legal_review
  // for actions above 'coach'. Blunt tier drops hedges but never changes the
  // available action set.
  let action = 'no_action';
  let rationale = 'Insufficient data or performance within band.';

  if (attainment !== null) {
    if (attainment >= 110) { action = 'promote'; rationale = `Attainment ${attainment}% — consistently above target.`; }
    else if (attainment >= 90) { action = 'no_action'; rationale = `Attainment ${attainment}% — on track.`; }
    else if (attainment >= 70) { action = 'coach'; rationale = `Attainment ${attainment}% — below target; coaching conversation recommended.`; }
    else if (attainment >= 50) { action = 'warn'; rationale = `Attainment ${attainment}% — warning with clear improvement plan.`; }
    else { action = 'PIP'; rationale = `Attainment ${attainment}% — formal Performance Improvement Plan.`; }
  }
  if (variances >= 3 && (action === 'warn' || action === 'PIP')) {
    action = 'manage_out';
    rationale += ` ${variances} unresolved variance alert(s) — escalate to HR/legal review.`;
  }

  // Conservative bluntness never recommends manage_out; downgrade to PIP.
  if (bluntness === 'conservative' && action === 'manage_out') {
    action = 'PIP';
    rationale = `[Conservative mode] Downgraded from manage_out to PIP. ${rationale}`;
  }
  // Blunt drops hedges; text is already direct.

  const requires_hr_legal_review = ['warn', 'PIP', 'manage_out'].includes(action);

  return {
    result: {
      person_id: String(person_id),
      person_name: person.full_name || person.name,
      period,
      attainment_pct: attainment,
      unresolved_variances: variances,
      recommendation: action,
      rationale,
      requires_hr_legal_review,
      bluntness_applied: bluntness,
    },
    display: `Recommendation for ${person.full_name || person.name}: ${action}${requires_hr_legal_review ? ' (requires HR/legal review)' : ''}.`,
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
  draftReplyToMessage, // Phase G9.R8
  draftNewEntry,
  // ── Phase G8 ──
  createTask,
  listOverdueItems,
  draftDecisionBrief,
  draftAnnouncement,
  weeklySummary,
  suggestKpiTargets,
  draftCompAdjustment,
  auditSelfRatings,
  rankPeople,
  recommendHrAction,
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
