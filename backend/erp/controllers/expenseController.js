/**
 * Expense Controller — SMER, Car Logbook, ORE/ACCESS, PRF/CALF
 *
 * All transactional documents follow: DRAFT → VALID → ERROR → POSTED
 * PRF/CALF follows: DRAFT → APPROVED → LIQUIDATED (CALF) or APPROVED (PRF)
 */
const mongoose = require('mongoose');
const SmerEntry = require('../models/SmerEntry');
const CarLogbookEntry = require('../models/CarLogbookEntry');
const CarLogbookCycle = require('../models/CarLogbookCycle');
const ExpenseEntry = require('../models/ExpenseEntry');
const PrfCalf = require('../models/PrfCalf');
const TransactionEvent = require('../models/TransactionEvent');
const ErpAuditLog = require('../models/ErpAuditLog');
const DocumentAttachment = require('../models/DocumentAttachment');
const Settings = require('../models/Settings');
const { catchAsync } = require('../../middleware/errorHandler');
const { computePerdiemAmount, resolvePerdiemThresholds, resolvePerdiemConfig, resolveActivityPerdiemRuleMap, getActivityRuleFromMap } = require('../services/perdiemCalc');
// fuelTracker computations handled by CarLogbookEntry pre-save hook
const { generateExpenseSummary } = require('../services/expenseSummary');
const { getDailyMdCounts, getDailyVisitDetails } = require('../services/smerCrmBridge');
const { journalFromExpense, resolveFundingCoa, getCoaMap, journalFromPrfCalf } = require('../services/autoJournal');
const { createAndPostJournal, reverseJournal } = require('../services/journalEngine');
const JournalEntry = require('../models/JournalEntry');
const { getEditableStatuses } = require('../services/approvalService');
// Phase G4.5c.1 (April 22, 2026) — shared proxy-entry resolver. Replaces the
// inline `assigned_to` handling that lived only in batch upload. Unifies
// audit codes with Sales / Collections / GRN (PROXY_CREATE / PROXY_UPDATE).
const { resolveOwnerForWrite, widenFilterForProxy, canProxyEntry } = require('../utils/resolveOwnerScope');

const { ROLES } = require('../../constants/roles');
const { detectText } = require('../ocr/visionClient');
const { processOcr } = require('../ocr/ocrProcessor');
const { classifyExpense } = require('../services/expenseClassifier');
const { uploadErpDocument } = require('../services/documentUpload');
const { compressImage } = require('../../middleware/upload');
// Phase VIP-1.J / J2 — withholding-tax engine.
// withholdingService writes WithholdingLedger rows when an expense or PRF
// rent line carries an ATC code AND the entity has the matching master
// switch enabled. Required at module top so the post path stays synchronous.
const Entity = require('../models/Entity');
const VendorMaster = require('../models/VendorMaster');
const withholdingService = require('../services/withholdingService');

// ═══════════════════════════════════════════
// PHASE VIP-1.J / J2 — Withholding ledger emit helpers
// ═══════════════════════════════════════════
// emitEwtForExpense / emitEwtForPrfRent are called AFTER the document flips
// to POSTED. Both are best-effort + non-fatal: if the engine throws, the
// post still succeeds and `[WITHHOLDING_FAILURE]` is logged for backfill.
// Mirrors the AUTO_JOURNAL_FAILURE pattern used for VAT + journal writes.
//
// Idempotency: every emit deletes prior rows for the same `source_event_id`
// before re-inserting. That makes a re-acknowledge / re-post safe and
// matches the journal engine's reversal-then-rewrite cadence in
// journalEngine.js:168.
async function emitEwtForExpense(doc, userId) {
  if (!doc?.entity_id || !doc?.event_id) return { skipped: true, reason: 'NO_ENTITY_OR_EVENT' };
  try {
    const entity = await Entity.findById(doc.entity_id).lean();
    if (!entity?.withholding_active) return { skipped: true, reason: 'WITHHOLDING_OFF' };

    // Pre-fetch vendor objects for any line that has vendor_id set (one
    // round-trip — keeps the loop O(1) DB calls per line + 1 batched
    // vendor read).
    const vendorIds = [...new Set((doc.lines || []).map(l => l.vendor_id).filter(Boolean).map(String))];
    const vendorMap = new Map();
    if (vendorIds.length) {
      const vendors = await VendorMaster.find({
        _id: { $in: vendorIds },
        entity_id: doc.entity_id,
      }).lean();
      vendors.forEach(v => vendorMap.set(String(v._id), v));
    }

    const entries = [];
    for (const line of (doc.lines || [])) {
      const vendor = line.vendor_id ? vendorMap.get(String(line.vendor_id)) : null;
      const resolved = await withholdingService.resolveAtcCodeForExpenseLine({
        entity, line, vendor, period: doc.period,
      });
      if (!resolved) continue;
      const gross = Number(line.amount || 0);
      const withheld = gross * resolved.rate;
      entries.push({
        entity_id: doc.entity_id,
        period: doc.period,
        direction: 'OUTBOUND',
        atc_code: resolved.atc_code,
        form_code: resolved.form_code,
        payee_kind: resolved.payee_kind,
        payee_id: resolved.payee_id,
        payee_name_snapshot: resolved.payee_name_snapshot,
        payee_tin_snapshot: resolved.payee_tin_snapshot,
        payee_address_snapshot: resolved.payee_address_snapshot,
        gross_amount: gross,
        withholding_rate: resolved.rate,
        withheld_amount: withheld,
        source_module: 'EXPENSE',
        source_doc_ref: `EXP-${doc.period}-${doc.cycle}`,
        source_event_id: doc.event_id,
        source_line_id: line._id,
        bdm_id: doc.bdm_id,
        finance_tag: 'PENDING',
      });
    }

    // Idempotent: delete prior rows for this event then re-insert. The
    // delete is no-op on a fresh post; on re-acknowledge it cleans state.
    await withholdingService.deleteWithholdingEntriesForEvent(doc.event_id);
    if (entries.length) await withholdingService.createWithholdingEntries(entries);
    return { skipped: false, count: entries.length };
  } catch (err) {
    console.error('[WITHHOLDING_FAILURE] ExpenseEntry', String(doc._id), err.message);
    return { skipped: true, reason: 'ERROR', error: err.message };
  }
}

async function emitEwtForPrfRent(doc, userId) {
  if (!doc?.entity_id || !doc?.event_id) return { skipped: true, reason: 'NO_ENTITY_OR_EVENT' };
  if (doc.doc_type !== 'PRF') return { skipped: true, reason: 'NOT_PRF' };
  if (!doc.atc_code) return { skipped: true, reason: 'NO_ATC' };
  try {
    const entity = await Entity.findById(doc.entity_id).lean();
    if (!entity?.rent_withholding_active) return { skipped: true, reason: 'RENT_WITHHOLDING_OFF' };

    // Vendor lookup — partner_id on PrfCalf points to a Doctor, not a Vendor,
    // for partner rebates. For RENT PRFs, the engine expects partner_id to
    // be a Vendor _id (landlord). We try Vendor first; if not found, the
    // resolver still works using the PRF's payee_name + atc_code.
    let vendor = null;
    if (doc.partner_id) {
      vendor = await VendorMaster.findOne({
        _id: doc.partner_id,
        entity_id: doc.entity_id,
      }).lean();
    }

    const resolved = await withholdingService.resolveAtcCodeForPrfRent({ entity, prf: doc, vendor });
    if (!resolved) return { skipped: true, reason: 'RESOLVER_RETURNED_NULL' };

    const gross = Number(doc.rebate_amount || doc.amount || 0);
    const withheld = gross * resolved.rate;
    const entries = [{
      entity_id: doc.entity_id,
      period: doc.period,
      direction: 'OUTBOUND',
      atc_code: resolved.atc_code,
      form_code: resolved.form_code,
      payee_kind: resolved.payee_kind,
      payee_id: resolved.payee_id,
      payee_name_snapshot: resolved.payee_name_snapshot,
      payee_tin_snapshot: resolved.payee_tin_snapshot,
      payee_address_snapshot: resolved.payee_address_snapshot,
      gross_amount: gross,
      withholding_rate: resolved.rate,
      withheld_amount: withheld,
      source_module: 'PRF_CALF',
      source_doc_ref: `PRF-${doc.prf_number || doc._id}`,
      source_event_id: doc.event_id,
      source_line_id: null,
      bdm_id: doc.bdm_id,
      finance_tag: 'PENDING',
    }];

    await withholdingService.deleteWithholdingEntriesForEvent(doc.event_id);
    await withholdingService.createWithholdingEntries(entries);
    return { skipped: false, count: 1 };
  } catch (err) {
    console.error('[WITHHOLDING_FAILURE] PrfCalf', String(doc._id), err.message);
    return { skipped: true, reason: 'ERROR', error: err.message };
  }
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * Load active CompProfile for a BDM user.
 * Used by SMER endpoints to resolve per-person per diem thresholds.
 * Returns lean CompProfile or null.
 */
async function loadBdmCompProfile(bdmUserId, entityId) {
  const PeopleMaster = require('../models/PeopleMaster');
  const CompProfile = require('../models/CompProfile');
  const person = await PeopleMaster.findOne({ user_id: bdmUserId, entity_id: entityId }).select('_id').lean();
  if (!person) return null;
  return CompProfile.findOne({ person_id: person._id, entity_id: entityId, status: 'ACTIVE' }).sort({ effective_date: -1 }).lean();
}

/**
 * Enforce "No Work" activity rules on a daily entry.
 * When activity_type is 'NO_WORK': md_count=0, perdiem=ZERO/0, no override, no hospital.
 */
function enforceNoWorkRules(entry) {
  if (entry.activity_type !== 'NO_WORK') return entry;
  return {
    ...entry,
    md_count: 0,
    perdiem_tier: 'ZERO',
    perdiem_amount: 0,
    perdiem_override: false,
    override_tier: undefined,
    override_reason: undefined,
    hospital_id: undefined,
    hospital_ids: [],
    hospital_covered: undefined,
  };
}

// ═══════════════════════════════════════════
// SMER ENDPOINTS
// ═══════════════════════════════════════════

// Phase G4.5f (April 23, 2026) — SMER + per-diem override adopt the shared
// proxy-entry resolver. Writes use resolveOwnerForWrite (stamps bdm_id =
// target, seeds recorded_on_behalf_of for audit + hub force-routing). Reads
// use widenFilterForProxy (eligible proxies see target BDMs' SMERs).
//
// Distinct lookup code SMER (not EXPENSES) so subscribers can configure the
// per-diem proxy roster independently from single-entry expenses. Pairs with
// PROXY_ENTRY_ROLES.SMER + VALID_OWNER_ROLES.SMER + the EXPENSES__SMER_PROXY
// sub-permission — all admin-editable via Control Center.
//
// Unblocks the BDMs→CRM-only / eBDMs→ERP-proxy policy locked Apr 23 2026.
// Field BDMs keep `expenses` module access (read SMER, log overrides on own
// SMER) — only the proxy WRITE path requires the new sub-perm.
const SMER_PROXY_OPTS = { subKey: 'smer_proxy', lookupCode: 'SMER' };

// Phase G4.5f — courtesy receipt to the SMER owner when a proxy posts on
// their behalf or when an override decision is taken on a proxied request.
// Lazy-required so the cross-package import (CRM-root MessageInbox) doesn't
// add startup cost when SMER is idle. Failures are logged but never block
// the underlying write — receipts are notification, not a system of record.
//
// recipientRole is resolved from the TARGET user's actual role (post-Phase S2
// this is 'staff'; pre-migration docs used 'contractor' / 'employee'). The
// filter in getInboxList uses recipientRole=user.role, so resolving dynamically
// keeps receipts visible across the migration boundary.
async function writeProxyReceipt({ entityId, recipientUserId, senderUser, category, title, body }) {
  if (!recipientUserId) return;
  try {
    const MessageInbox = require('../../models/MessageInbox');
    const User = require('../../models/User');
    const target = await User.findById(recipientUserId).select('role').lean();
    // Fall back to 'staff' (Phase S2 target) when the target cannot be loaded
    // so a receipt still lands for new users even when the User lookup fails
    // transiently.
    const recipientRole = target?.role || 'staff';
    await MessageInbox.create({
      entity_id: entityId,
      recipientRole,
      recipientUserId,
      senderUserId: senderUser?._id,
      senderName: senderUser?.name || senderUser?.email || 'System',
      senderRole: senderUser?.role || 'system',
      title,
      body,
      category,                      // PERDIEM_SUMMARY | PERDIEM_OVERRIDE_DECISION
      priority: 'normal',
      must_acknowledge: false,        // explicit — overrides the lookup-driven default hook
      requires_action: false,
      folder: 'INBOX',
    });
  } catch (err) {
    console.error('[writeProxyReceipt] inbox write failed (non-critical):', err.message);
  }
}

const createSmer = catchAsync(async (req, res) => {
  // Phase G4.5f — proxy resolver. Self-filers → owner = self; eligible proxy
  // (admin/finance/eBDM contractor with expenses.smer_proxy ticked) +
  // body.assigned_to → owner = target BDM, proxiedBy = caller. Throws 400 if
  // a non-BDM caller omits assigned_to (Rule #21 — no silent self-fill).
  let owner;
  try {
    owner = await resolveOwnerForWrite(req, 'expenses', SMER_PROXY_OPTS);
  } catch (err) {
    if (err.statusCode === 400 || err.statusCode === 403) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    throw err;
  }

  // Proxy-create requires a non-empty bdm_phone_instruction (authorization
  // tag). User decision Apr 23 2026: short tags are fine, no min-length.
  if (owner.isOnBehalf) {
    const tag = String(req.body?.bdm_phone_instruction || '').trim();
    if (!tag) {
      return res.status(400).json({
        success: false,
        message: 'bdm_phone_instruction is required when filing SMER on behalf of another BDM (short tag like "ok with boss" is fine).'
      });
    }
  }

  // Pre-check for an existing SMER on (entity, bdm, period, cycle). Two cases:
  //   (1) non-reversed dupe → return a clean 409 (not a raw E11000) so the UI
  //       can redirect her to the existing draft.
  //   (2) reversed dupe (deletion_event_id stamped) → archive-rename its period
  //       to `${period}::REV::${_id}` so the unique key frees up for the new
  //       SMER. The reversed row keeps its _id, daily entries, deletion_event_id,
  //       and the reversal TransactionEvent — full audit is preserved.
  if (req.body.period && req.body.cycle) {
    const dupes = await SmerEntry.find({
      entity_id: req.entityId,
      bdm_id: owner.ownerId,
      period: req.body.period,
      cycle: req.body.cycle,
    }).select('_id status period cycle deletion_event_id').lean();

    const liveDupe = dupes.find(d => !d.deletion_event_id);
    if (liveDupe) {
      return res.status(409).json({
        success: false,
        message: `You already have a ${liveDupe.status} SMER for ${req.body.period} ${req.body.cycle}. Open it instead of creating a new one.`,
        data: { smer_id: liveDupe._id, status: liveDupe.status },
      });
    }

    for (const d of dupes.filter(d => d.deletion_event_id)) {
      // eslint-disable-next-line vip-tenant/require-entity-filter -- _id from same-entity dupe scan above (line 168 scoped by entity_id+bdm_id)
      await SmerEntry.updateOne(
        { _id: d._id },
        { $set: { period: `${d.period}::REV::${d._id}` } }
      );
    }
  }

  const settings = await Settings.getSettings();
  // Phase G1.5 — rate resolved via PERDIEM_RATES lookup (per-entity × per-role).
  // No silent ₱800 fallback; missing row throws ApiError(400) so payroll blocks loudly.
  // `req.body.perdiem_rate` remains an explicit one-off override (e.g., admin seeds a
  // one-time promotional rate without editing the lookup).
  const perdiemConfig = await resolvePerdiemConfig({ entityId: req.entityId, role: 'BDM' });
  const perdiemRate = req.body.perdiem_rate || perdiemConfig.rate_php;

  // Load CompProfile once — used for both revolving fund and per diem thresholds.
  // Phase G4.5f — for proxy-create, the CompProfile must be the TARGET BDM's
  // (owner.ownerId), not the caller's. A non-BDM caller has no per-person row;
  // her revolving fund + thresholds would silently fall back to Settings global,
  // overpaying or underpaying the actual owner.
  const compProfile = await loadBdmCompProfile(owner.ownerId, req.entityId);

  // Auto-resolve travel advance from CompProfile → Settings fallback (0 or missing = use default)
  let travelAdvance = req.body.travel_advance;
  if (!travelAdvance || travelAdvance === 0) {
    travelAdvance = settings.REVOLVING_FUND_AMOUNT || 8000;
    if (compProfile?.revolving_fund_amount > 0) travelAdvance = compProfile.revolving_fund_amount;
  }

  // Auto-compute per diem for each daily entry (skip overridden entries)
  // Phase G1.6 — threshold chain: CompProfile per-person → PERDIEM_RATES per-role → Settings global.
  // Passing perdiemConfig as 5th arg ensures preview (getSmerCrmMdCounts) and
  // create/update/post all resolve to the same tier for non-pharma subscribers.
  // Phase G4.5ee — pre-resolve the activity-rule map ONCE for this entity (1 DB
  // read, 60s cache). Then look up the per-day rule sync inside .map(). When
  // an entry's activity is OFFICE / NO_WORK / etc., the rule overrides the
  // MD-threshold logic. Override paths intentionally pass NO options so that
  // an admin force-FULL/HALF always wins over the activity rule.
  const activityRulesMap = await resolveActivityPerdiemRuleMap(req.entityId);
  let dailyEntries = (req.body.daily_entries || []).map(entry => {
    // "No Work" — force zero everything, skip per diem computation. The
    // ACTIVITY_PERDIEM_RULES.NO_WORK = ZERO row makes this redundant for the
    // tier, but enforceNoWorkRules also clears md_count + hospital_covered +
    // override fields (semantics broader than tier), so we keep it.
    if (entry.activity_type === 'NO_WORK') return enforceNoWorkRules(entry);
    if (entry.perdiem_override && entry.override_tier) {
      // Override set — use override_tier for amount, preserve CRM md_count.
      // No options passed → activity rule does NOT apply to override paths.
      const { amount } = computePerdiemAmount(entry.override_tier === 'FULL' ? 999 : 3, perdiemRate, settings, compProfile, perdiemConfig);
      return { ...entry, perdiem_tier: entry.override_tier, perdiem_amount: amount };
    }
    const activityRule = getActivityRuleFromMap(activityRulesMap, entry.activity_type);
    const { tier, amount } = computePerdiemAmount(entry.md_count || 0, perdiemRate, settings, compProfile, perdiemConfig, { activityRule });
    return { ...entry, perdiem_tier: tier, perdiem_amount: amount };
  });

  // Strip empty strings from enum fields to avoid Mongoose validation errors
  dailyEntries = dailyEntries.map(e => {
    const cleaned = { ...e };
    if (!cleaned.activity_type) delete cleaned.activity_type;
    if (!cleaned.override_tier) delete cleaned.override_tier;
    return cleaned;
  });

  // Strip ownership fields from body so a crafted payload cannot bypass the
  // proxy gate. Owner / proxy stamps come from the resolver above only.
  const {
    assigned_to: _dAssigned,
    bdm_id: _dBdm,
    recorded_on_behalf_of: _dProxy,
    ...safeBody
  } = req.body || {};

  const phoneInstruction = owner.isOnBehalf
    ? String(req.body?.bdm_phone_instruction || '').trim()
    : '';

  const smer = await SmerEntry.create({
    ...safeBody,
    travel_advance: travelAdvance,
    daily_entries: dailyEntries,
    perdiem_rate: perdiemRate,
    entity_id: req.entityId,
    bdm_id: owner.ownerId,
    recorded_on_behalf_of: owner.proxiedBy,
    bdm_phone_instruction: phoneInstruction,
    created_by: req.user._id,
    status: 'DRAFT'
  });

  if (owner.isOnBehalf) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: owner.ownerId,
      log_type: 'PROXY_CREATE',
      target_ref: smer._id.toString(),
      target_model: 'SmerEntry',
      changed_by: req.user._id,
      note: `Proxy create: SMER ${smer.period} ${smer.cycle} keyed by ${req.user.name || req.user._id} (${req.user.role}) on behalf of BDM ${owner.ownerId} — instruction: ${phoneInstruction}`
    }).catch(err => console.error('[createSmer] PROXY_CREATE audit failed (non-critical):', err.message));
  }

  res.status(201).json({ success: true, data: smer });
});

const updateSmer = catchAsync(async (req, res) => {
  const editable = await getEditableStatuses(req.entityId, 'SMER');
  // Phase G4.5f — widen so eligible proxies can edit on behalf.
  const scope = await widenFilterForProxy(req, 'expenses', SMER_PROXY_OPTS);
  const smer = await SmerEntry.findOne({ _id: req.params.id, ...scope, status: { $in: editable } });
  if (!smer) return res.status(404).json({ success: false, message: 'Draft SMER not found' });

  // Strip ownership fields — proxy cannot reassign after create; ownership is
  // stamped at create time only. Edit history lives in audit log.
  const {
    assigned_to: _dAssigned,
    bdm_id: _dBdm,
    recorded_on_behalf_of: _dProxy,
    ...safeBody
  } = req.body || {};
  // Reattach safeBody so the rest of the function works against it (preserves
  // the per-day recompute below without expanding the diff).
  req.body = safeBody;

  const settings = await Settings.getSettings();
  const perdiemRate = req.body.perdiem_rate || smer.perdiem_rate;
  const compProfile = await loadBdmCompProfile(smer.bdm_id, smer.entity_id);
  // Phase G1.6 — resolve per-role config so update recomputes the SAME tier the
  // preview showed. Must use SMER's entity_id (not req.entityId) in case admin
  // is editing cross-entity. Degrades to undefined if lookup missing (display-only).
  let perdiemConfig;
  try {
    perdiemConfig = await resolvePerdiemConfig({ entityId: smer.entity_id, role: 'BDM' });
  } catch (_) {
    perdiemConfig = undefined;
  }

  // Re-compute per diem if daily entries changed (skip overridden entries)
  // Phase G1.6 — threshold chain: CompProfile per-person → PERDIEM_RATES per-role → Settings global.
  // Phase G4.5ee — same activity-rule map prefetch as createSmer.
  if (req.body.daily_entries) {
    const activityRulesMap = await resolveActivityPerdiemRuleMap(smer.entity_id);
    req.body.daily_entries = req.body.daily_entries.map(entry => {
      // Strip empty strings from enum fields
      const cleaned = { ...entry };
      if (!cleaned.activity_type) delete cleaned.activity_type;
      if (!cleaned.override_tier) delete cleaned.override_tier;

      // "No Work" — force zero everything
      if (cleaned.activity_type === 'NO_WORK') return enforceNoWorkRules(cleaned);

      if (cleaned.perdiem_override && cleaned.override_tier) {
        // Override always wins — no activity rule passed.
        const { amount } = computePerdiemAmount(cleaned.override_tier === 'FULL' ? 999 : 3, perdiemRate, settings, compProfile, perdiemConfig);
        return { ...cleaned, perdiem_tier: cleaned.override_tier, perdiem_amount: amount };
      }
      const activityRule = getActivityRuleFromMap(activityRulesMap, cleaned.activity_type);
      const { tier, amount } = computePerdiemAmount(cleaned.md_count || 0, perdiemRate, settings, compProfile, perdiemConfig, { activityRule });
      return { ...cleaned, perdiem_tier: tier, perdiem_amount: amount };
    });
  }

  Object.assign(smer, req.body);
  if (req.body.perdiem_rate) smer.perdiem_rate = perdiemRate;
  await smer.save();

  // Phase G4.5f — audit when the editor is not the owner (proxy update).
  const isProxyEdit = String(smer.bdm_id) !== String(req.user._id);
  if (isProxyEdit) {
    await ErpAuditLog.logChange({
      entity_id: smer.entity_id,
      bdm_id: smer.bdm_id,
      log_type: 'PROXY_UPDATE',
      target_ref: smer._id.toString(),
      target_model: 'SmerEntry',
      changed_by: req.user._id,
      note: `Proxy update: SMER ${smer.period} ${smer.cycle} edited by ${req.user.name || req.user._id} (${req.user.role}) on behalf of BDM ${smer.bdm_id}`
    }).catch(err => console.error('[updateSmer] PROXY_UPDATE audit failed (non-critical):', err.message));
  }

  res.json({ success: true, data: smer });
});

const getSmerList = catchAsync(async (req, res) => {
  // Phase G4.5f — widen so eligible proxies see the BDMs they file on behalf of.
  // Admin/finance/president already have tenantFilter without bdm_id (no-op for
  // them); contractors with expenses.smer_proxy ticked get bdm_id stripped.
  const scope = await widenFilterForProxy(req, 'expenses', SMER_PROXY_OPTS);
  const scopeIsWidened = !('bdm_id' in scope);
  const filter = { ...scope };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.period) filter.period = req.query.period;
  if (req.query.cycle) filter.cycle = req.query.cycle;

  // Hide reversed rows by default; opt-in via ?include_reversed=true.
  // Mirrors getExpenseList / getPrfCalfList — without this, a SAP-Storno'd SMER
  // keeps appearing in the BDM's list (and triggers the "edit existing" flow on
  // create), stranding her on a dead record.
  if (req.query.include_reversed !== 'true') {
    filter.deletion_event_id = { $exists: false };
  }

  // Rule #21: privileged (or proxy) callers may narrow by ?bdm_id=. A plain
  // self-scoped BDM must NOT be able to override scope.bdm_id via query
  // string (would allow impersonation). Gate the override on scopeIsWidened
  // — true only when tenantFilter had no bdm_id (admin/finance) or
  // widenFilterForProxy stripped it (proxy contractor).
  if (req.query.bdm_id && scopeIsWidened) filter.bdm_id = req.query.bdm_id;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const [docs, total] = await Promise.all([
    SmerEntry.find(filter)
      .populate('bdm_id', 'name')
      .populate('recorded_on_behalf_of', 'name')
      .sort({ period: -1, cycle: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    SmerEntry.countDocuments(filter)
  ]);

  res.json({ success: true, data: docs, pagination: { page, limit, total } });
});

const getSmerById = catchAsync(async (req, res) => {
  // Phase G4.5f — widen for proxy reads. Privileged optional ?bdm_id= narrowing.
  // scopeIsWidened gate prevents a plain BDM from overriding scope.bdm_id via
  // a crafted query (Rule #21 impersonation guard).
  const scope = await widenFilterForProxy(req, 'expenses', SMER_PROXY_OPTS);
  const scopeIsWidened = !('bdm_id' in scope);
  const docFilter = { _id: req.params.id, ...scope };
  if (req.query.bdm_id && scopeIsWidened) docFilter.bdm_id = req.query.bdm_id;
  const smer = await SmerEntry.findOne(docFilter)
    .populate('bdm_id', 'name')
    .populate('recorded_on_behalf_of', 'name')
    .lean();
  if (!smer) return res.status(404).json({ success: false, message: 'SMER not found' });
  res.json({ success: true, data: smer });
});

const deleteDraftSmer = catchAsync(async (req, res) => {
  // Phase G4.5f — proxy can delete DRAFT of BDMs they file on behalf of.
  const scope = await widenFilterForProxy(req, 'expenses', SMER_PROXY_OPTS);
  const result = await SmerEntry.findOneAndDelete({ _id: req.params.id, ...scope, status: 'DRAFT' });
  if (!result) return res.status(404).json({ success: false, message: 'Draft SMER not found' });
  res.json({ success: true, message: 'Draft SMER deleted' });
});

const validateSmer = catchAsync(async (req, res) => {
  const editable = await getEditableStatuses(req.entityId, 'SMER');
  // Phase G4.5f — Integrity Point A. validateSmer loops every matching SMER in
  // scope. For self-filers tenantFilter scopes to the caller's own SMERs (safe).
  // For privileged or proxy callers, widenFilterForProxy strips bdm_id —
  // unscoped, the loop would validate every BDM's VALID SMERs at once. Require
  // an explicit bdm_id (and optionally period+cycle) on widened paths.
  //
  // scopeIsWidened is the authoritative gate: true iff caller is privileged or
  // proxy-eligible. Plain BDMs keep scope.bdm_id = self — any ?bdm_id=other
  // override attempt is ignored (Rule #21 impersonation guard).
  const scope = await widenFilterForProxy(req, 'expenses', SMER_PROXY_OPTS);
  const scopeIsWidened = !('bdm_id' in scope);
  const rawBdm = (req.query && req.query.bdm_id) || (req.body && req.body.bdm_id) || null;
  if (scopeIsWidened && !rawBdm) {
    return res.status(400).json({
      success: false,
      message: 'bdm_id is required — privileged/proxy users must specify which BDM to validate'
    });
  }
  const filter = { ...scope, status: { $in: editable } };
  if (scopeIsWidened && rawBdm) filter.bdm_id = rawBdm;
  // Scope to a specific period+cycle when provided so validate runs against
  // the active SMER, not every open draft across all months.
  const period = req.body?.period || req.query?.period;
  const cycle = req.body?.cycle || req.query?.cycle;
  if (period) filter.period = period;
  if (cycle) filter.cycle = cycle;
  const smers = await SmerEntry.find(filter);

  for (const smer of smers) {
    const errors = [];

    if (!smer.daily_entries.length) errors.push('No daily entries');
    if (!smer.period) errors.push('Period is required');
    if (!smer.cycle) errors.push('Cycle is required');

    for (const entry of smer.daily_entries) {
      if (!entry.entry_date) errors.push(`Day ${entry.day}: date is required`);
      // "No Work" validation — catch data corruption or direct DB edits
      if (entry.activity_type === 'NO_WORK') {
        if (entry.md_count > 0) errors.push(`Day ${entry.day}: "No Work" day cannot have engagements`);
        if (entry.perdiem_amount > 0) errors.push(`Day ${entry.day}: "No Work" day cannot have per diem`);
        if (entry.perdiem_override) errors.push(`Day ${entry.day}: "No Work" day cannot have per diem override`);
      }
      if (entry.md_count > 0 && !entry.activity_type && !entry.hospital_covered && !entry.perdiem_override) {
        errors.push(`Day ${entry.day}: activity type required when engagements > 0`);
      }
      if (entry.perdiem_override && !entry.override_reason) {
        errors.push(`Day ${entry.day}: override reason required`);
      }
      // Block validation while a per diem override is still awaiting approval.
      // Without this, the SMER could flip to VALID → POSTED, and the subsequent
      // override approval would silently no-op (SMER no longer editable),
      // stranding the daily entry in PENDING state.
      if (entry.override_status === 'PENDING') {
        errors.push(`Day ${entry.day}: per diem override pending approval — cannot validate until approved or rejected (see Approval Hub)`);
      }
    }

    smer.validation_errors = errors;
    smer.status = errors.length > 0 ? 'ERROR' : 'VALID';
    await smer.save();
  }

  res.json({ success: true, message: `Validated ${smers.length} SMER(s)`, data: smers.map(s => ({ _id: s._id, status: s.status, errors: s.validation_errors })) });
});

/**
 * POST /expenses/smer/:id/revert
 * Demote a VALID SMER back to DRAFT so the BDM (or proxy) can edit it.
 * Mirrors reopenSmer in spirit, but for the pre-POST stage — no journal
 * reversal needed because VALID has not posted yet.
 *
 * Period-locked (period locks gate every status mutation under EXPENSE).
 * Proxy-aware via widenFilterForProxy (same scope as updateSmer).
 */
const revertSmer = catchAsync(async (req, res) => {
  const scope = await widenFilterForProxy(req, 'expenses', SMER_PROXY_OPTS);
  const smer = await SmerEntry.findOne({ _id: req.params.id, ...scope, status: 'VALID' });
  if (!smer) return res.status(404).json({ success: false, message: 'VALID SMER not found' });

  const oldStatus = smer.status;
  smer.status = 'DRAFT';
  smer.validation_errors = [];
  await smer.save();

  await ErpAuditLog.logChange({
    entity_id: smer.entity_id,
    bdm_id: smer.bdm_id,
    log_type: 'STATUS_CHANGE',
    target_ref: smer._id.toString(),
    target_model: 'SmerEntry',
    field_changed: 'status',
    old_value: oldStatus,
    new_value: 'DRAFT',
    changed_by: req.user._id,
    note: `Reverted to DRAFT for editing — ${smer.period} ${smer.cycle}${String(smer.bdm_id) !== String(req.user._id) ? ' (proxy)' : ''}`
  }).catch(err => console.error('[revertSmer] audit failed (non-critical):', err.message));

  res.json({ success: true, data: smer });
});

const submitSmer = catchAsync(async (req, res) => {
  // Phase G4.5f — Integrity Point A. submitSmer loops every matching VALID
  // SMER in scope. Self-filers narrow via tenantFilter (own bdm_id only).
  // Privileged/proxy callers MUST pass an explicit bdm_id so the loop binds
  // to one BDM's submission — otherwise a single click would post every
  // proxy-targetable BDM's VALID SMER at once.
  //
  // scopeIsWidened: authoritative guard. Plain BDM scope keeps bdm_id=self;
  // any ?bdm_id=other or body.bdm_id=other override is ignored here (Rule #21
  // impersonation guard — the frontend may send body.bdm_id as a convenience
  // for proxy callers, but we never honor it from a self-scoped contractor).
  const scope = await widenFilterForProxy(req, 'expenses', SMER_PROXY_OPTS);
  const scopeIsWidened = !('bdm_id' in scope);
  const rawBdm = (req.query && req.query.bdm_id) || (req.body && req.body.bdm_id) || null;
  if (scopeIsWidened && !rawBdm) {
    return res.status(400).json({
      success: false,
      message: 'bdm_id is required — privileged/proxy users must specify which BDM to submit SMER for'
    });
  }
  const filter = { ...scope, status: 'VALID' };
  if (scopeIsWidened && rawBdm) filter.bdm_id = rawBdm;
  // Period/cycle scope — frontend always sends them. Without these the loop
  // could post a stale VALID SMER from an earlier month.
  const period = req.body?.period || req.query?.period;
  const cycle = req.body?.cycle || req.query?.cycle;
  if (period) filter.period = period;
  if (cycle) filter.cycle = cycle;

  const smers = await SmerEntry.find(filter);
  if (!smers.length) return res.status(400).json({ success: false, message: 'No VALID SMERs to submit' });

  // Phase G4.5f — proxy submit requires bdm_phone_instruction (cycle-level
  // authorization tag). Required and non-empty after trim. Persist to the
  // SMER so audit shows what the proxy was told.
  const hasProxiedSmer = smers.some(s => !!s.recorded_on_behalf_of);
  const callerIsOwner = smers.every(s => String(s.bdm_id) === String(req.user._id));
  const isProxySubmit = hasProxiedSmer || !callerIsOwner;
  if (isProxySubmit) {
    const tag = String(req.body?.bdm_phone_instruction || '').trim();
    if (!tag) {
      return res.status(400).json({
        success: false,
        message: 'bdm_phone_instruction is required when submitting SMER on behalf of another BDM (short tag like "ok with boss" is fine).'
      });
    }
    // Stamp the cycle-level tag on every submitted SMER so the audit shows
    // what authorization the proxy claimed at submit time.
    for (const s of smers) {
      if (!s.bdm_phone_instruction) s.bdm_phone_instruction = tag;
    }
  }

  // Defensive re-check: validation already rejects SMERs with pending per diem
  // overrides, but guard submit too in case the state changed between validate
  // and submit (race) or a future caller skips validate.
  for (const smer of smers) {
    const pending = smer.daily_entries.find(e => e.override_status === 'PENDING');
    if (pending) {
      return res.status(400).json({
        success: false,
        message: `SMER ${smer.period}-${smer.cycle} has a pending per diem override on day ${pending.day}. Resolve in Approval Hub before submitting.`,
      });
    }
  }

  // Authority matrix gate
  // Phase G4.5f — force hub routing whenever any SMER in the batch was created
  // on behalf of another BDM (Rule #20 four-eyes: proxy submits, never
  // self-approves). Owner-bdm chain: if the loop is single-BDM scoped (which
  // it always is on the proxy-narrowed path), pass that bdm_id so the Hub
  // hydrates the card with owner = target BDM, not the caller.
  const { gateApproval } = require('../services/approvalService');
  const smerTotalAmount = smers.reduce((sum, s) => sum + (s.total_reimbursable || 0), 0);
  // ownerBdmId — for the Hub card. On the widened path we have rawBdm (explicit);
  // on the self-scoped path every SMER in the loop has the same bdm_id by
  // construction (scope pins bdm_id=self), so smers[0].bdm_id is authoritative.
  const ownerBdmId = (scopeIsWidened && rawBdm) || smers[0].bdm_id;
  const gated = await gateApproval({
    entityId: req.entityId,
    module: 'EXPENSES',
    docType: 'SMER',
    docId: smers[0]._id,
    docRef: smers.map(s => `SMER-${s.period}-${s.cycle}`).join(', '),
    amount: smerTotalAmount,
    description: `Submit ${smers.length} SMER(s) (total ₱${smerTotalAmount.toLocaleString()})`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
    forceApproval: isProxySubmit,
    ownerBdmId,
    // Bundle every SMER id so the Hub auto-post dispatcher cascades the
    // post to ALL of them on approval. Without this, only docId (smers[0])
    // posted and the rest stayed VALID silently — money-bug class.
    metadata: { doc_ids: smers.map(s => s._id) },
  }, res);
  if (gated) {
    // Save the cycle-level tag stamping that happened during the proxy check
    // above — otherwise a held-for-approval SMER loses the authorization tag.
    if (isProxySubmit) {
      for (const s of smers) {
        if (s.isModified && s.isModified('bdm_phone_instruction')) await s.save();
      }
    }
    return;
  }

  // Period lock check
  const { checkPeriodOpen } = require('../utils/periodLock');
  for (const smer of smers) { await checkPeriodOpen(smer.entity_id, smer.period); }

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    for (const smer of smers) {
      const event = await TransactionEvent.create([{
        entity_id: smer.entity_id,
        bdm_id: smer.bdm_id,
        event_type: 'SMER',
        event_date: new Date(),
        document_ref: `SMER-${smer.period}-${smer.cycle}`,
        payload: { smer_id: smer._id, total_reimbursable: smer.total_reimbursable },
        status: 'ACTIVE',
        created_by: req.user._id
      }], { session });

      smer.status = 'POSTED';
      smer.posted_at = new Date();
      smer.posted_by = req.user._id;
      smer.event_id = event[0]._id;
      await smer.save({ session });
    }
  });
  session.endSession();

  // Phase 9.1b: Link DocumentAttachments to events (non-blocking)
  for (const smer of smers) {
    if (smer.event_id) {
      // eslint-disable-next-line vip-tenant/require-entity-filter -- source_id is unique; smer fetched with entity scope upstream
      await DocumentAttachment.updateMany(
        { source_model: 'SmerEntry', source_id: smer._id },
        { $set: { event_id: smer.event_id } }
      ).catch(() => {});
    }
  }

  // Phase 11/22: Auto-journal — SMER multi-line (COA from Settings.COA_MAP)
  const coaMap = await getCoaMap();
  for (const smer of smers) {
    try {
      const lines = [];
      const desc = `SMER ${smer.period}-${smer.cycle}`;
      if (smer.total_perdiem > 0) lines.push({ account_code: coaMap.PER_DIEM || '6100', account_name: 'Per Diem Expense', debit: smer.total_perdiem, credit: 0, description: desc });
      if (smer.total_transpo > 0) lines.push({ account_code: coaMap.TRANSPORT || '6150', account_name: 'Transport Expense', debit: smer.total_transpo, credit: 0, description: desc });
      if (smer.total_special_cases > 0) lines.push({ account_code: coaMap.SPECIAL_TRANSPORT || '6160', account_name: 'Special Transport Expense', debit: smer.total_special_cases, credit: 0, description: desc });
      if (smer.total_ore > 0) lines.push({ account_code: coaMap.OTHER_REIMBURSABLE || '6170', account_name: 'Other Reimbursable Expense', debit: smer.total_ore, credit: 0, description: desc });
      if (lines.length > 0) {
        // CR AR_BDM draws down the BDM's standing advance — reduction of a DEBIT-normal asset.
        lines.push({ account_code: coaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: smer.total_reimbursable, description: desc, is_contra: true });
        await createAndPostJournal(smer.entity_id, {
          je_date: smer.posted_at || new Date(),
          period: smer.period,
          description: `SMER: ${desc}`,
          source_module: 'EXPENSE',
          source_event_id: smer.event_id,
          source_doc_ref: `SMER-${smer.period}-${smer.cycle}`,
          lines,
          bir_flag: 'BOTH',
          vat_flag: 'N/A',
          bdm_id: smer.bdm_id,
          created_by: req.user._id
        });
      }
    } catch (jeErr) {
      // Phase 35 — keep the catch (we don't want a JE error to roll back the SMER
      // POSTED state, which would leave the SMER in limbo mid-batch) but log a
      // searchable prefix so ops can grep pm2 logs. Follow-up Phase 36 will wire
      // an AutoJournalFailure collection + President alert.
      console.error('[AUTO_JOURNAL_FAILURE] SMER', String(smer._id), jeErr.message);
    }
  }

  // Phase G4.5f — courtesy receipt to the BDM whose SMER was posted on their
  // behalf. Best-effort, non-blocking. Sent to every proxied SMER in the batch
  // (rare to be more than one in a single submit, but loop covers it).
  for (const smer of smers) {
    if (!smer.recorded_on_behalf_of) continue;
    await writeProxyReceipt({
      entityId: smer.entity_id,
      recipientUserId: smer.bdm_id,
      senderUser: req.user,
      category: 'PERDIEM_SUMMARY',
      title: `SMER ${smer.period} ${smer.cycle} posted on your behalf`,
      body: `Your SMER for ${smer.period} ${smer.cycle} was posted on your behalf by ${req.user.name || req.user.email}. ` +
        `Total reimbursable: ₱${(smer.total_reimbursable || 0).toLocaleString()} ` +
        `(per diem ₱${(smer.total_perdiem || 0).toLocaleString()}, transport ₱${((smer.total_transpo || 0) + (smer.total_special_cases || 0)).toLocaleString()}). ` +
        `Authorization on file: "${smer.bdm_phone_instruction || '(not recorded)'}". ` +
        `If anything looks off, contact your operations lead.`,
    });
  }

  res.json({ success: true, message: `Posted ${smers.length} SMER(s)` });
});

const reopenSmer = catchAsync(async (req, res) => {
  const { smer_ids } = req.body;
  // Phase G4.5f — widen so eligible proxies can reopen on behalf.
  const scope = await widenFilterForProxy(req, 'expenses', SMER_PROXY_OPTS);
  const smers = await SmerEntry.find({ _id: { $in: smer_ids }, ...scope, status: 'POSTED' });
  if (!smers.length) return res.status(400).json({ success: false, message: 'No POSTED SMERs to reopen' });

  const reopened = [];
  const failed = [];

  for (const smer of smers) {
    // Reverse journal entries
    if (smer.event_id) {
      try {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- source_event_id is unique; smer fetched via entity-scoped widenFilterForProxy
        const jes = await JournalEntry.find({ source_event_id: smer.event_id, status: 'POSTED', is_reversal: { $ne: true } });
        for (const je of jes) { await reverseJournal(je._id, 'Auto-reversal: SMER reopen', req.user._id); }
      } catch (jeErr) {
        console.error('JE reversal failed for SMER reopen:', smer._id, jeErr.message);
        failed.push({ _id: smer._id, error: `Journal reversal failed: ${jeErr.message}` });
        continue; // Do NOT mark as DRAFT — ledger would be unbalanced
      }
    }

    smer.status = 'DRAFT';
    smer.reopen_count = (smer.reopen_count || 0) + 1;
    smer.posted_at = undefined;
    smer.posted_by = undefined;
    await smer.save();

    await ErpAuditLog.logChange({
      entity_id: smer.entity_id,
      bdm_id: smer.bdm_id,
      log_type: 'REOPEN',
      target_ref: smer._id.toString(),
      target_model: 'SmerEntry',
      changed_by: req.user._id,
      note: `Reopened (count: ${smer.reopen_count})`
    });
    reopened.push(smer._id);
  }

  if (failed.length && !reopened.length) {
    return res.status(500).json({ success: false, message: 'All SMER reopens failed due to journal reversal errors', failed });
  }
  res.json({ success: true, message: `Reopened ${reopened.length} SMER(s)${failed.length ? `, ${failed.length} failed` : ''}`, reopened, failed });
});

/**
 * POST /expenses/smer/:id/override-perdiem
 * Request per diem tier override for a specific day.
 * Routes through Universal Approval system — override is NOT applied until approved.
 * Remove override (revert to CRM-computed) does NOT require approval.
 *
 * Body: { entry_id, override_tier: 'FULL'|'HALF', override_reason: 'Meeting with President' }
 * To remove override: { entry_id, remove_override: true }
 */
const overridePerdiemDay = catchAsync(async (req, res) => {
  const { entry_id, override_tier, override_reason, remove_override } = req.body;
  if (!entry_id) return res.status(400).json({ success: false, message: 'entry_id is required' });

  const editable = await getEditableStatuses(req.entityId, 'SMER');
  // Phase G4.5f — widen so eligible proxies can request overrides on behalf.
  const scope = await widenFilterForProxy(req, 'expenses', SMER_PROXY_OPTS);
  const smer = await SmerEntry.findOne({
    _id: req.params.id,
    ...scope,
    status: { $in: editable }
  });
  if (!smer) return res.status(404).json({ success: false, message: 'SMER not found or not editable' });

  const entry = smer.daily_entries.id(entry_id);
  if (!entry) return res.status(404).json({ success: false, message: 'Daily entry not found' });

  // Phase G4.5f — proxy detection. The caller is acting on behalf when the
  // SMER's owner is not the caller. recorded_on_behalf_of on the SMER itself
  // covers cycle-level proxy creates; the caller-vs-owner check covers a
  // direct admin/finance action on a self-filed BDM SMER (also proxy).
  const isOnBehalf = String(smer.bdm_id) !== String(req.user._id);
  const phoneInstruction = isOnBehalf
    ? String(req.body?.bdm_phone_instruction || '').trim()
    : '';
  if (isOnBehalf && !remove_override && !phoneInstruction) {
    return res.status(400).json({
      success: false,
      message: 'bdm_phone_instruction is required when requesting a per-diem override on behalf of another BDM (short tag like "ok with boss" is fine).'
    });
  }

  // Block overrides on "No Work" entries
  if (entry.activity_type === 'NO_WORK') {
    return res.status(400).json({ success: false, message: '"No Work" days cannot have per diem overrides' });
  }

  if (remove_override) {
    // Remove override — revert to CRM-computed tier (no approval needed)
    // Phase G1.6 — include perdiemConfig so revert matches current preview tier
    // under per-role thresholds. Degrade-to-undefined if lookup missing.
    // Phase G4.5ee — also resolve the activity rule so a reverted entry on an
    // OFFICE day correctly returns to FULL (or whatever the activity rule
    // says) instead of falling back to MD-threshold logic that the override
    // was masking.
    const settings = await Settings.getSettings();
    const compProfile = await loadBdmCompProfile(smer.bdm_id, smer.entity_id);
    let perdiemConfig;
    try {
      perdiemConfig = await resolvePerdiemConfig({ entityId: smer.entity_id, role: 'BDM' });
    } catch (_) {
      perdiemConfig = undefined;
    }
    const activityRulesMap = await resolveActivityPerdiemRuleMap(smer.entity_id);
    const activityRule = getActivityRuleFromMap(activityRulesMap, entry.activity_type);
    const { tier, amount } = computePerdiemAmount(entry.md_count || 0, smer.perdiem_rate, settings, compProfile, perdiemConfig, { activityRule });
    entry.perdiem_override = false;
    entry.override_tier = undefined;
    entry.override_reason = undefined;
    entry.overridden_by = undefined;
    entry.overridden_at = undefined;
    entry.override_status = undefined;
    entry.approval_request_id = undefined;
    entry.requested_override_tier = undefined;
    entry.perdiem_tier = tier;
    entry.perdiem_amount = amount;

    await ErpAuditLog.logChange({
      entity_id: smer.entity_id, bdm_id: smer.bdm_id,
      log_type: 'ITEM_CHANGE', target_ref: smer._id.toString(), target_model: 'SmerEntry',
      field_changed: `daily_entries.${entry.day}.perdiem_override`,
      old_value: true, new_value: false,
      changed_by: req.user._id, note: `Override removed for day ${entry.day}`
    });
    await smer.save();
    return res.json({ success: true, data: smer });
  }

  // Validate override request
  if (!override_tier || !['FULL', 'HALF'].includes(override_tier)) {
    return res.status(400).json({ success: false, message: 'override_tier must be FULL or HALF' });
  }
  if (!override_reason) {
    return res.status(400).json({ success: false, message: 'override_reason is required' });
  }

  // Route through approval system
  // Per diem overrides ALWAYS require approval (bypasses authority matrix setting)
  // — except for management roles who can self-approve
  const ApprovalRequest = require('../models/ApprovalRequest');
  const docRef = `${smer.period}-${smer.cycle}-Day${entry.day}`;
  const settings = await Settings.getSettings();
  const compProfile = await loadBdmCompProfile(smer.bdm_id, smer.entity_id);
  // Phase G1.6 — include perdiemConfig so override-amount matches the tier the
  // post path will compute (identical resolver chain, same multiplier).
  let overridePerdiemConfig;
  try {
    overridePerdiemConfig = await resolvePerdiemConfig({ entityId: smer.entity_id, role: 'BDM' });
  } catch (_) {
    overridePerdiemConfig = undefined;
  }
  const { amount: overrideAmount } = computePerdiemAmount(override_tier === 'FULL' ? 999 : 3, smer.perdiem_rate, settings, compProfile, overridePerdiemConfig);

  const isManagement = [ROLES.PRESIDENT, ROLES.CEO, ROLES.ADMIN, ROLES.FINANCE].includes(req.user.role);

  // Phase G4.5f — proxy submits ALWAYS route through approval (Rule #20
  // four-eyes), even when the caller is management. Without this, an admin
  // proxy could self-apply an override on a BDM's per diem without the
  // President or another approver checking the call.
  const mustApprove = !isManagement || isOnBehalf;

  if (mustApprove) {
    // BDMs/contractors AND proxy submits: route through approval hub.
    // Proxy metadata flows into the ApprovalRequest so the Hub card hydrates
    // with owner = target BDM and the authorization tag is visible to approvers.
    const approvalReq = await ApprovalRequest.create({
      entity_id: smer.entity_id,
      module: 'PERDIEM_OVERRIDE',
      doc_type: 'SMER_DAILY_ENTRY',
      doc_id: smer._id,
      doc_ref: docRef,
      amount: overrideAmount,
      description: `Per diem override Day ${entry.day}: ${entry.perdiem_tier} → ${override_tier} (${override_reason}). Entry ID: ${entry_id}`,
      metadata: {
        entry_id, override_tier, override_reason,
        // Phase G4.5f — proxy chain so universalApprovalController.perdiem_override
        // can route the post-decision receipt back to the SMER owner. The fields
        // are read on apply but not required by any decision logic — keeping the
        // handler compatible with non-proxy requests (metadata fields just absent).
        recorded_on_behalf_of: isOnBehalf ? req.user._id : undefined,
        bdm_phone_instruction: isOnBehalf ? phoneInstruction : undefined,
        owner_bdm_id: smer.bdm_id,
      },
      requested_by: req.user._id,
      requested_at: new Date(),
      status: 'PENDING',
    });

    // Save pending state on the daily entry so frontend can show status.
    // Stamp proxy fields at the entry level so they survive the universal
    // approval handler (which mutates a few entry fields but does NOT touch
    // recorded_on_behalf_of / bdm_phone_instruction).
    entry.override_status = 'PENDING';
    entry.requested_override_tier = override_tier;
    entry.override_reason = override_reason;
    entry.approval_request_id = approvalReq._id;
    if (isOnBehalf) {
      entry.recorded_on_behalf_of = req.user._id;
      entry.bdm_phone_instruction = phoneInstruction;
    }
    await smer.save();

    return res.status(202).json({
      success: false,
      approval_pending: true,
      message: 'Per diem override requires approval. Request submitted.',
      request: approvalReq,
      data: smer,
    });
  }

  // Management self-apply (caller is acting on their own SMER — rare for non-BDM
  // roles since they don't own SMERs, but covers self-filing BDMs who happen to
  // be admins of nothing or single-user instances).
  const oldTier = entry.perdiem_tier;
  entry.perdiem_override = true;
  entry.override_tier = override_tier;
  entry.override_reason = override_reason;
  entry.overridden_by = req.user._id;
  entry.overridden_at = new Date();
  entry.perdiem_tier = override_tier;
  entry.perdiem_amount = overrideAmount;

  await ErpAuditLog.logChange({
    entity_id: smer.entity_id, bdm_id: smer.bdm_id,
    log_type: 'ITEM_CHANGE', target_ref: smer._id.toString(), target_model: 'SmerEntry',
    field_changed: `daily_entries.${entry.day}.perdiem_tier`,
    old_value: `${oldTier} (md_count: ${entry.md_count})`, new_value: `${override_tier} (override: ${override_reason})`,
    changed_by: req.user._id, note: `Per diem override day ${entry.day}: ${oldTier} → ${override_tier} — ${override_reason}`
  });

  await smer.save();
  res.json({ success: true, data: smer });
});

/**
 * POST /expenses/smer/:id/apply-override
 * Apply a per diem override AFTER it has been approved in the Universal Approval Hub.
 * Called by the frontend when the approval request status is APPROVED.
 * Body: { entry_id, approval_request_id }
 */
const applyPerdiemOverride = catchAsync(async (req, res) => {
  const { entry_id, approval_request_id } = req.body;
  if (!entry_id || !approval_request_id) {
    return res.status(400).json({ success: false, message: 'entry_id and approval_request_id are required' });
  }

  // Verify approval is APPROVED
  const ApprovalRequest = require('../models/ApprovalRequest');
  const approvalReq = await ApprovalRequest.findOne({
    _id: approval_request_id,
    entity_id: req.entityId,
    module: 'PERDIEM_OVERRIDE',
    status: 'APPROVED',
  }).lean();
  if (!approvalReq) {
    return res.status(403).json({ success: false, message: 'No approved override request found. Approval must be granted first.' });
  }

  const editable = await getEditableStatuses(req.entityId, 'SMER');
  // Phase G4.5f — Integrity Point B. Without widening, a proxy that requested
  // an override (and is not the SMER owner) would 404 here when calling apply
  // after Hub approval. tenantFilter scopes by bdm_id; widenFilterForProxy
  // strips it for eligible proxy callers.
  const scope = await widenFilterForProxy(req, 'expenses', SMER_PROXY_OPTS);
  const smer = await SmerEntry.findOne({
    _id: req.params.id,
    ...scope,
    status: { $in: editable }
  });
  if (!smer) return res.status(404).json({ success: false, message: 'SMER not found or not editable' });

  const entry = smer.daily_entries.id(entry_id);
  if (!entry) return res.status(404).json({ success: false, message: 'Daily entry not found' });

  // Parse override details from the approval description
  // Description format: "Per diem override Day N: OLD → NEW (reason). Entry ID: xxx"
  // Phase 34-P (Apr 21 2026) — DO NOT modify this regex. It's the silent-skip
  // fix that ensures override_tier survives the metadata→description fallback.
  const descMatch = approvalReq.description?.match(/→ (FULL|HALF) \((.+?)\)\./);
  const override_tier = descMatch?.[1];
  const override_reason = descMatch?.[2] || 'Approved override';

  if (!override_tier) {
    return res.status(400).json({ success: false, message: 'Could not parse override tier from approval request' });
  }

  const settings = await Settings.getSettings();
  const compProfile = await loadBdmCompProfile(smer.bdm_id, smer.entity_id);
  // Phase G1.6 — include perdiemConfig so approved-override recompute uses the
  // same threshold chain as the request-time preview.
  let applyPerdiemConfig;
  try {
    applyPerdiemConfig = await resolvePerdiemConfig({ entityId: smer.entity_id, role: 'BDM' });
  } catch (_) {
    applyPerdiemConfig = undefined;
  }
  const { amount } = computePerdiemAmount(override_tier === 'FULL' ? 999 : 3, smer.perdiem_rate, settings, compProfile, applyPerdiemConfig);
  const oldTier = entry.perdiem_tier;

  entry.perdiem_override = true;
  entry.override_tier = override_tier;
  entry.override_reason = `${override_reason} (Approval #${approval_request_id})`;
  entry.overridden_by = approvalReq.decided_by || req.user._id;
  entry.overridden_at = new Date();
  entry.perdiem_tier = override_tier;
  entry.perdiem_amount = amount;

  await ErpAuditLog.logChange({
    entity_id: smer.entity_id, bdm_id: smer.bdm_id,
    log_type: 'ITEM_CHANGE', target_ref: smer._id.toString(), target_model: 'SmerEntry',
    field_changed: `daily_entries.${entry.day}.perdiem_tier`,
    old_value: `${oldTier} (md_count: ${entry.md_count})`,
    new_value: `${override_tier} (approved override: ${override_reason})`,
    changed_by: req.user._id,
    note: `Per diem override day ${entry.day}: ${oldTier} → ${override_tier} — approved via request #${approval_request_id}`
  });

  await smer.save();

  // Phase G4.5f — courtesy receipt to the SMER owner when the apply path is
  // hit on a proxied entry. (universalApprovalController also writes a receipt
  // on hub-direct decisions; this covers the legacy explicit-apply path that
  // some clients may still poll.)
  if (entry.recorded_on_behalf_of && String(smer.bdm_id) !== String(req.user._id)) {
    await writeProxyReceipt({
      entityId: smer.entity_id,
      recipientUserId: smer.bdm_id,
      senderUser: req.user,
      category: 'PERDIEM_OVERRIDE_DECISION',
      title: `Per-diem override APPROVED — ${smer.period} ${smer.cycle} Day ${entry.day}`,
      body: `Your per-diem override for ${smer.period} ${smer.cycle} Day ${entry.day} was APPROVED. ` +
        `New tier: ${override_tier} (₱${(amount || 0).toLocaleString()}). ` +
        `Original request keyed by ${req.user.name || req.user.email} — authorization on file: ` +
        `"${entry.bdm_phone_instruction || '(not recorded)'}".`,
    });
  }

  res.json({ success: true, data: smer, message: 'Approved override applied successfully' });
});

// ═══════════════════════════════════════════
// CAR LOGBOOK ENDPOINTS
// ═══════════════════════════════════════════

// Phase G4.5e (April 23, 2026) — Car Logbook adopts the shared proxy-entry
// resolver. Writes use resolveOwnerForWrite (stamps bdm_id = target, seeds
// recorded_on_behalf_of for proxy audit + hub force-routing). Reads use
// widenFilterForProxy (eligible proxies see target BDMs' logbooks).
//
// The legacy `resolveCarLogbookScope` has been deleted. Frontend Rule #21
// narrowing via ?bdm_id= is re-applied explicitly on list endpoints below.
// Unblocks the BDMs→CRM-only / eBDMs→ERP-proxy policy locked Apr 23 2026.
const CAR_LOGBOOK_PROXY_OPTS = { subKey: 'car_logbook_proxy', lookupCode: 'CAR_LOGBOOK' };

const createCarLogbook = catchAsync(async (req, res) => {
  // Phase G4.5e proxy resolver. Caller (BDM) → ownerId = self; eligible proxy
  // (admin/finance/eBDM contractor with expenses.car_logbook_proxy ticked) +
  // body.assigned_to → ownerId = target BDM, proxiedBy = caller. Throws 400 if
  // a non-BDM caller omits assigned_to (Rule #21 guard — no silent self-fill).
  let owner;
  try {
    owner = await resolveOwnerForWrite(req, 'expenses', CAR_LOGBOOK_PROXY_OPTS);
  } catch (err) {
    if (err.statusCode === 400 || err.statusCode === 403) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    throw err;
  }

  const settings = await Settings.getSettings();
  const kmPerLiter = req.body.km_per_liter || settings.FUEL_EFFICIENCY_DEFAULT || 12;

  // Strip ownership fields from body so a crafted payload cannot silently
  // reassign owner or proxy audit past the helper's gate.
  const { assigned_to: _dAssigned, bdm_id: _dBdm, recorded_on_behalf_of: _dProxy, ...safeBody } = req.body || {};

  const entry = await CarLogbookEntry.create({
    ...safeBody,
    km_per_liter: kmPerLiter,
    entity_id: req.entityId,
    bdm_id: owner.ownerId,
    recorded_on_behalf_of: owner.proxiedBy,
    created_by: req.user._id,
    status: 'DRAFT'
  });

  if (owner.isOnBehalf) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: owner.ownerId,
      log_type: 'PROXY_CREATE',
      target_ref: entry._id.toString(),
      target_model: 'CarLogbookEntry',
      changed_by: req.user._id,
      note: `Proxy create: Car Logbook ${entry.period} ${entry.cycle} ${entry.entry_date?.toISOString().split('T')[0]} keyed by ${req.user.name || req.user._id} (${req.user.role}) on behalf of BDM ${owner.ownerId}`
    }).catch(err => console.error('[createCarLogbook] PROXY_CREATE audit failed (non-critical):', err.message));
  }

  const autoCalf = await autoCalfForSource(entry, 'CARLOGBOOK');
  res.status(201).json({ success: true, data: entry, auto_calf: autoCalf ? { _id: autoCalf._id, calf_number: autoCalf.calf_number, amount: autoCalf.amount } : null });
});

const updateCarLogbook = catchAsync(async (req, res) => {
  const editable = await getEditableStatuses(req.entityId, 'CAR_LOGBOOK');
  // Phase G4.5e — widen so eligible proxies can edit on behalf.
  const scope = await widenFilterForProxy(req, 'expenses', CAR_LOGBOOK_PROXY_OPTS);
  const entry = await CarLogbookEntry.findOne({ _id: req.params.id, ...scope, status: { $in: editable } });
  if (!entry) return res.status(404).json({ success: false, message: 'Draft car logbook entry not found' });

  // Strip ownership fields — proxy cannot reassign after create; ownership is
  // stamped at create time only. Edit history lives in audit log.
  const { assigned_to: _dAssigned, bdm_id: _dBdm, recorded_on_behalf_of: _dProxy, ...safeBody } = req.body || {};

  Object.assign(entry, safeBody);
  if (req.entityId) entry.entity_id = req.entityId;
  await entry.save();

  // Audit when the editor is not the owner.
  const isProxyEdit = String(entry.bdm_id) !== String(req.user._id);
  if (isProxyEdit) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: entry.bdm_id,
      log_type: 'PROXY_UPDATE',
      target_ref: entry._id.toString(),
      target_model: 'CarLogbookEntry',
      changed_by: req.user._id,
      note: `Proxy update: Car Logbook ${entry.period} ${entry.cycle} ${entry.entry_date?.toISOString().split('T')[0]} edited by ${req.user.name || req.user._id} (${req.user.role}) on behalf of BDM ${entry.bdm_id}`
    }).catch(err => console.error('[updateCarLogbook] PROXY_UPDATE audit failed (non-critical):', err.message));
  }

  const autoCalf = await autoCalfForSource(entry, 'CARLOGBOOK');
  res.json({ success: true, data: entry, auto_calf: autoCalf ? { _id: autoCalf._id, calf_number: autoCalf.calf_number, amount: autoCalf.amount } : null });
});

const getCarLogbookList = catchAsync(async (req, res) => {
  // Phase G4.5e — widen so eligible proxies see the BDMs they file on behalf of.
  // Admin/finance/president already have tenantFilter without bdm_id — this is a
  // no-op for them; it only strips bdm_id for a contractor-proxy (Judy / Jay Ann).
  const scope = await widenFilterForProxy(req, 'expenses', CAR_LOGBOOK_PROXY_OPTS);

  // Rule #21: privileged (or proxy) callers may narrow by ?bdm_id=. Absence
  // means "no BDM filter" for admin/finance (they see all) — but the grid UI
  // is per-person, so the frontend gates with a "Select a BDM" banner at the
  // view layer. Backend returns an empty set for privileged-no-bdm_id to
  // preserve the pre-G4.5e contract (frontend banner already depends on it).
  const privileged = !!(req.isPresident || req.isAdmin || req.isFinance);
  const bdmId = req.query.bdm_id || (privileged ? null : req.bdmId);
  if (privileged && !req.query.bdm_id) {
    return res.json({
      success: true,
      data: [],
      pagination: { page: 1, limit: 0, total: 0 },
      message: 'Select a BDM to view their car logbook'
    });
  }

  const filter = { ...scope };
  if (bdmId) filter.bdm_id = bdmId;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.period) filter.period = req.query.period;
  if (req.query.cycle) filter.cycle = req.query.cycle;

  // Hide reversed rows by default; opt-in via ?include_reversed=true.
  // Matches getExpenseList / getPrfCalfList / getSmerList.
  if (req.query.include_reversed !== 'true') {
    filter.deletion_event_id = { $exists: false };
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  const [docs, total] = await Promise.all([
    CarLogbookEntry.find(filter)
      .populate('bdm_id', 'name')
      .populate('recorded_on_behalf_of', 'name')
      .sort({ entry_date: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    CarLogbookEntry.countDocuments(filter)
  ]);

  res.json({ success: true, data: docs, pagination: { page, limit, total } });
});

const getCarLogbookById = catchAsync(async (req, res) => {
  // Phase G4.5e — widen for proxy reads. Privileged narrowing via ?bdm_id=
  // continues via req.query.bdm_id on the frontend.
  const scope = await widenFilterForProxy(req, 'expenses', CAR_LOGBOOK_PROXY_OPTS);
  const docFilter = { _id: req.params.id, ...scope };
  if (req.query.bdm_id) docFilter.bdm_id = req.query.bdm_id;
  const entry = await CarLogbookEntry.findOne(docFilter)
    .populate('bdm_id', 'name')
    .populate('recorded_on_behalf_of', 'name')
    .lean();
  if (!entry) return res.status(404).json({ success: false, message: 'Car logbook entry not found' });
  res.json({ success: true, data: entry });
});

const getSmerDailyByDate = catchAsync(async (req, res) => {
  const { date } = req.params; // YYYY-MM-DD
  // Phase G4.5e — SMER destination prefill for Car Logbook. Widen so proxy
  // callers see target BDM's SMER entries. Non-privileged BDMs use their own id.
  const privileged = !!(req.isPresident || req.isAdmin || req.isFinance);
  const bdmId = req.query.bdm_id || (privileged ? null : req.bdmId);
  if (privileged && !req.query.bdm_id) return res.json({ success: true, data: null });

  const targetDate = new Date(date + 'T00:00:00.000Z');
  const nextDate = new Date(targetDate);
  nextDate.setDate(nextDate.getDate() + 1);

  const scope = await widenFilterForProxy(req, 'expenses', CAR_LOGBOOK_PROXY_OPTS);
  const smerFilter = { ...scope, 'daily_entries.entry_date': { $gte: targetDate, $lt: nextDate } };
  if (bdmId) smerFilter.bdm_id = bdmId;

  const smer = await SmerEntry.findOne(smerFilter).lean();

  if (!smer) return res.json({ success: true, data: null });

  const dailyEntry = smer.daily_entries.find(de => {
    const d = new Date(de.entry_date);
    return d >= targetDate && d < nextDate;
  });

  res.json({
    success: true,
    data: dailyEntry ? {
      hospital_covered: dailyEntry.hospital_covered || '',
      notes: dailyEntry.notes || '',
      activity_type: dailyEntry.activity_type || '',
      destination: [dailyEntry.hospital_covered, dailyEntry.notes].filter(Boolean).join(' — ')
    } : null
  });
});

const getSmerDestinationsBatch = catchAsync(async (req, res) => {
  const { dates } = req.query; // comma-separated YYYY-MM-DD
  if (!dates) return res.json({ success: true, data: {} });

  // Phase G4.5e — widen for proxy reads; same pattern as getSmerDailyByDate.
  const privileged = !!(req.isPresident || req.isAdmin || req.isFinance);
  const bdmId = req.query.bdm_id || (privileged ? null : req.bdmId);
  if (privileged && !req.query.bdm_id) return res.json({ success: true, data: {} });

  const dateList = dates.split(',').filter(Boolean);
  if (!dateList.length) return res.json({ success: true, data: {} });

  const startDate = new Date(dateList[0] + 'T00:00:00.000Z');
  const endDate = new Date(dateList[dateList.length - 1] + 'T00:00:00.000Z');
  endDate.setDate(endDate.getDate() + 1);

  const scope = await widenFilterForProxy(req, 'expenses', CAR_LOGBOOK_PROXY_OPTS);
  const smerFilter = { ...scope, 'daily_entries.entry_date': { $gte: startDate, $lt: endDate } };
  if (bdmId) smerFilter.bdm_id = bdmId;

  const smers = await SmerEntry.find(smerFilter).lean();

  const result = {};
  for (const smer of smers) {
    for (const de of smer.daily_entries || []) {
      const dateKey = new Date(de.entry_date).toISOString().split('T')[0];
      if (dateList.includes(dateKey) && !result[dateKey]) {
        result[dateKey] = {
          hospital_covered: de.hospital_covered || '',
          notes: de.notes || '',
          activity_type: de.activity_type || '',
          destination: [de.hospital_covered, de.notes].filter(Boolean).join(' — ')
        };
      }
    }
  }

  res.json({ success: true, data: result });
});

const deleteDraftCarLogbook = catchAsync(async (req, res) => {
  // Phase G4.5e — proxy can delete DRAFT of BDMs they file on behalf of.
  const scope = await widenFilterForProxy(req, 'expenses', CAR_LOGBOOK_PROXY_OPTS);
  const result = await CarLogbookEntry.findOneAndDelete({ _id: req.params.id, ...scope, status: 'DRAFT' });
  if (!result) return res.status(404).json({ success: false, message: 'Draft car logbook not found' });
  res.json({ success: true, message: 'Draft car logbook deleted' });
});

const validateCarLogbook = catchAsync(async (req, res) => {
  // Phase G4.5e — widen for proxy validate. Rule #21: privileged callers (and
  // proxies) should pass a bdm_id context in body/query so validate scopes to
  // one BDM's cycle — validating the union across all BDMs would be wrong.
  const scope = await widenFilterForProxy(req, 'expenses', CAR_LOGBOOK_PROXY_OPTS);
  const privileged = !!(req.isPresident || req.isAdmin || req.isFinance);
  const rawBdm = (req.query && req.query.bdm_id) || (req.body && req.body.bdm_id) || null;
  const bdmId = rawBdm || (privileged ? null : req.bdmId);
  if (privileged && !rawBdm) {
    return res.status(400).json({
      success: false,
      message: 'bdm_id is required — privileged/proxy users must specify which BDM to validate'
    });
  }
  const editable = await getEditableStatuses(req.entityId, 'CAR_LOGBOOK');
  const filter = { ...scope, status: { $in: editable } };
  if (bdmId) filter.bdm_id = bdmId;
  // Scope to the active period+cycle when the frontend provides them so validation
  // runs against the cycle being edited, not every open draft across all months.
  const period = req.body?.period || req.query?.period;
  const cycle = req.body?.cycle || req.query?.cycle;
  if (period) filter.period = period;
  if (cycle) filter.cycle = cycle;
  const entries = await CarLogbookEntry.find(filter);

  for (const entry of entries) {
    const errors = [];

    if (!entry.entry_date) errors.push('Date is required');
    if (entry.entry_date && new Date(entry.entry_date) > new Date()) errors.push('Logbook date cannot be in the future');
    if (!entry.starting_km && entry.starting_km !== 0) errors.push('Starting KM is required');
    if (!entry.ending_km && entry.ending_km !== 0) errors.push('Ending KM is required');
    if (entry.ending_km < entry.starting_km) errors.push('Ending KM must be >= Starting KM');
    if (entry.personal_km > entry.total_km) errors.push('Personal KM cannot exceed total KM');

    // Odometer sequential check: starting_km should be >= previous entry's ending_km
    if (entry.entry_date && entry.starting_km > 0) {
      const prevEntry = await CarLogbookEntry.findOne({
        entity_id: entry.entity_id,
        bdm_id: entry.bdm_id,
        entry_date: { $lt: entry.entry_date },
        status: { $in: ['VALID', 'POSTED'] }
      }).sort({ entry_date: -1 }).select('ending_km entry_date').lean();
      if (prevEntry && entry.starting_km < prevEntry.ending_km) {
        errors.push(`Starting KM (${entry.starting_km}) is less than previous entry's ending KM (${prevEntry.ending_km} on ${new Date(prevEntry.entry_date).toLocaleDateString()})`);
      }
    }

    // Fuel receipt date cross-check: OCR-extracted date should match logbook entry_date
    for (let j = 0; j < (entry.fuel_entries || []).length; j++) {
      const fuel = entry.fuel_entries[j];
      if (fuel.receipt_date && entry.entry_date) {
        const receiptDay = new Date(fuel.receipt_date).toISOString().split('T')[0];
        const entryDay = new Date(entry.entry_date).toISOString().split('T')[0];
        if (receiptDay !== entryDay) {
          errors.push(`Fuel ${j + 1}: receipt date (${receiptDay}) does not match logbook date (${entryDay})`);
        }
      }
    }

    // CALF gate: non-cash fuel entries require CALF to be linked AND POSTED
    for (let j = 0; j < (entry.fuel_entries || []).length; j++) {
      const fuel = entry.fuel_entries[j];
      if (fuel.calf_required && req.user.role !== ROLES.PRESIDENT) {
        if (!fuel.calf_id) {
          errors.push(`Fuel ${j + 1}: CALF required for ${fuel.payment_mode} fuel (${fuel.station_name || 'unknown station'})`);
        } else {
          // eslint-disable-next-line vip-tenant/require-entity-filter -- calf_id stored on entry by createPrfCalf back-link (line 2421+, same-entity enforced)
          const linkedCalf = await PrfCalf.findById(fuel.calf_id).select('status').lean();
          if (!linkedCalf) {
            errors.push(`Fuel ${j + 1}: linked CALF not found`);
          } else if (linkedCalf.status !== 'POSTED') {
            errors.push(`Fuel ${j + 1}: linked CALF must be POSTED (current: ${linkedCalf.status})`);
          }
        }
      }
    }

    // Overconsumption warning (not blocking — appended after errors)
    const warnings = [];
    if (entry.overconsumption_flag) {
      warnings.push(`WARNING: Fuel overconsumption detected (variance: ${entry.efficiency_variance}L)`);
    }
    entry.validation_errors = [...errors, ...warnings];

    entry.status = errors.length > 0 ? 'ERROR' : 'VALID';
    await entry.save();
  }

  res.json({ success: true, message: `Validated ${entries.length} logbook(s)`, data: entries.map(e => ({ _id: e._id, status: e.status, errors: e.validation_errors })) });
});

// ─────────────────────────────────────────────────────────────────────────
// Submit a single fuel entry for independent approval (per-fuel-entry flow,
// mirrors SmerEntry perdiem_override). Auto-generates FUEL-XXXXXX doc_ref
// via existing docNumbering.js (no new function needed — reuses generateDocNumber).
// ─────────────────────────────────────────────────────────────────────────
const submitFuelEntryForApproval = catchAsync(async (req, res) => {
  const { id, fuel_id } = req.params;   // id = CarLogbookEntry day doc id
  // Phase G4.5e — widen for proxy submit. Rule #21 narrowing: when privileged,
  // optionally scope by ?bdm_id= (eBDM flow) — the dayDoc's own bdm_id is then
  // matched exactly. Contractor proxies only see BDMs they can proxy for.
  const scope = await widenFilterForProxy(req, 'expenses', CAR_LOGBOOK_PROXY_OPTS);
  const editable = await getEditableStatuses(req.entityId, 'CAR_LOGBOOK');
  const docFilter = { _id: id, ...scope, status: { $in: editable } };
  if (req.query.bdm_id) docFilter.bdm_id = req.query.bdm_id;
  const dayDoc = await CarLogbookEntry.findOne(docFilter);
  if (!dayDoc) return res.status(404).json({ success: false, message: 'Car logbook day not found or not editable' });
  const fuel = dayDoc.fuel_entries.id(fuel_id);
  if (!fuel) return res.status(404).json({ success: false, message: 'Fuel entry not found' });
  if (fuel.approval_status === 'APPROVED') {
    return res.status(400).json({ success: false, message: 'Fuel entry already approved' });
  }

  // Assign sequencing doc_ref (FUEL-{ENTITY}{MMDDYY}-{NNN}) if not yet set
  if (!fuel.doc_ref) {
    try {
      const { generateDocNumber } = require('../services/docNumbering');
      fuel.doc_ref = await generateDocNumber({
        prefix: 'FUEL',
        entityId: dayDoc.entity_id,
        date: dayDoc.entry_date || new Date(),
      });
    } catch (e) {
      console.error('FUEL doc_ref generation failed:', e.message);
    }
  }

  const { gateApproval } = require('../services/approvalService');
  const dateStr = dayDoc.entry_date ? new Date(dayDoc.entry_date).toISOString().split('T')[0] : '';
  const calfLabel = fuel.calf_id ? `CALF:${fuel.calf_id}` : (fuel.payment_mode || 'CASH');
  // Phase G4.5e — force hub routing when the parent day was proxy-created
  // (Rule #20 four-eyes: a proxy entered, never approves).
  const hasProxy = !!dayDoc.recorded_on_behalf_of;
  const gated = await gateApproval({
    entityId: dayDoc.entity_id,
    module: 'EXPENSES',
    docType: 'FUEL_ENTRY',
    docId: fuel._id,
    docRef: fuel.doc_ref || `FUEL-${dayDoc.period}-${dayDoc._id}`,
    amount: fuel.total_amount || 0,
    description: `Fuel ₱${(fuel.total_amount || 0).toLocaleString()} @ ${fuel.station_name || 'unknown'} on ${dateStr} [${calfLabel}]`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
    forceApproval: hasProxy,
    ownerBdmId: dayDoc.bdm_id,
  }, res);

  if (gated) {
    fuel.approval_status = 'PENDING';
    await dayDoc.save();
    return;    // gateApproval already sent the 202
  }

  // Open-post path (no gate): mark APPROVED immediately
  fuel.approval_status = 'APPROVED';
  fuel.approved_by = req.user._id;
  fuel.approved_at = new Date();
  await dayDoc.save();
  res.json({ success: true, data: { approval_status: fuel.approval_status, doc_ref: fuel.doc_ref } });
});

// ─────────────────────────────────────────────────────────────────────────
// Submit the cycle (period+cycle) as ONE unit via CarLogbookCycle wrapper.
// Replaces the legacy per-day aggregation that produced the "16× LOGBOOK-2026-04"
// display bug. Per-day CarLogbookEntry docs remain the source of truth for
// odometer/fuel/efficiency; the wrapper only carries submit/approve/post state.
// ─────────────────────────────────────────────────────────────────────────
const submitCarLogbook = catchAsync(async (req, res) => {
  // Phase G4.5e — submit binds a CarLogbookCycle wrapper to a specific BDM.
  // Rule #21: privileged callers (and proxies) must pass bdm_id so the wrapper
  // doesn't default to their own user _id (which would bind some other BDM's
  // VALID entries to a ghost president-owned cycle). widenFilterForProxy
  // ensures eligible proxies can read the target BDM's VALID entries.
  const scope = await widenFilterForProxy(req, 'expenses', CAR_LOGBOOK_PROXY_OPTS);
  const privileged = !!(req.isPresident || req.isAdmin || req.isFinance);
  const rawBdm = (req.query && req.query.bdm_id) || (req.body && req.body.bdm_id) || null;
  const bdmId = rawBdm || (privileged ? null : req.bdmId);
  if (privileged && !rawBdm) {
    return res.status(400).json({
      success: false,
      message: 'bdm_id is required — privileged/proxy users must specify which BDM to submit the cycle for'
    });
  }

  // Scope to a specific cycle when period+cycle provided (frontend always passes them)
  const period = req.body?.period || req.query?.period;
  const cycle = req.body?.cycle || req.query?.cycle;
  const scopedFilter = { ...scope, status: 'VALID' };
  if (bdmId) scopedFilter.bdm_id = bdmId;
  if (period) scopedFilter.period = period;
  if (cycle) scopedFilter.cycle = cycle;

  const entries = await CarLogbookEntry.find(scopedFilter);
  if (!entries.length) return res.status(400).json({ success: false, message: 'No VALID logbook entries to submit' });

  // Require period+cycle for the cycle wrapper. If not provided, we group by first entry's period+cycle
  // (legacy behavior) — and reject if multiple different cycles are mixed under one unscoped submit.
  const effPeriod = period || entries[0].period;
  const effCycle = cycle || entries[0].cycle;
  const mismatched = entries.filter(e => e.period !== effPeriod || e.cycle !== effCycle);
  if (mismatched.length) {
    return res.status(400).json({
      success: false,
      message: `Multiple cycles in VALID state. Please submit one period+cycle at a time. Found: ${[...new Set(entries.map(e => `${e.period} ${e.cycle}`))].join(', ')}`
    });
  }

  // Upsert the CarLogbookCycle wrapper and aggregate totals from the per-day docs.
  // bdm_id comes from resolved scope (not req.bdmId) so privileged/proxy users
  // bind to the chosen BDM, never to their own id.
  const upsertFilter = { entity_id: req.entityId, bdm_id: bdmId, period: effPeriod, cycle: effCycle };
  let cycleDoc = await CarLogbookCycle.findOne(upsertFilter);
  if (!cycleDoc) {
    cycleDoc = new CarLogbookCycle({ ...upsertFilter, created_by: req.user._id, km_per_liter: entries[0].km_per_liter || 12 });
  }
  // Phase G4.5e — refreshTotalsFromDays propagates recorded_on_behalf_of from
  // the per-day docs into the cycle wrapper (if ANY day was proxy-created).
  await cycleDoc.refreshTotalsFromDays();
  cycleDoc.status = 'VALID';
  await cycleDoc.save();

  // Link every per-day doc back to the cycle wrapper (idempotent)
  for (const e of entries) {
    if (String(e.cycle_id) !== String(cycleDoc._id)) {
      e.cycle_id = cycleDoc._id;
      await e.save();
    }
  }

  // Authority-matrix gate on the cycle wrapper (one clean ApprovalRequest per cycle)
  const { gateApproval } = require('../services/approvalService');
  const docRef = `LOGBOOK-${effPeriod}-${effCycle}`;
  const desc = `Submit Car Logbook ${effPeriod} ${effCycle} (${cycleDoc.working_days} working day${cycleDoc.working_days === 1 ? '' : 's'}, total ₱${(cycleDoc.total_fuel_amount || 0).toLocaleString()})`;
  // Phase G4.5e — force hub routing when any day was proxy-created (Rule #20).
  const hasProxy = !!cycleDoc.recorded_on_behalf_of;
  const gated = await gateApproval({
    entityId: req.entityId,
    module: 'EXPENSES',
    docType: 'CAR_LOGBOOK',
    docId: cycleDoc._id,
    docRef,
    amount: cycleDoc.total_fuel_amount || 0,
    description: desc,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
    forceApproval: hasProxy,
    ownerBdmId: cycleDoc.bdm_id,
  }, res);
  if (gated) return;   // held in Approval Hub (202 sent)

  // Period lock check
  const { checkPeriodOpen } = require('../utils/periodLock');
  await checkPeriodOpen(req.entityId, effPeriod);

  // Pre-post gates:
  //  1. Non-CASH fuel must have approval_status = APPROVED (unless President bypass)
  //  2. Non-CASH fuel with CALF required: linked CALF must be POSTED
  for (const entry of entries) {
    for (const fuel of (entry.fuel_entries || [])) {
      if (fuel.payment_mode && fuel.payment_mode !== 'CASH' && fuel.approval_status !== 'APPROVED' && req.user.role !== ROLES.PRESIDENT) {
        return res.status(400).json({
          success: false,
          message: `Cannot post: fuel @ ${fuel.station_name || 'unknown'} on ${new Date(entry.entry_date).toISOString().split('T')[0]} is not APPROVED (currently ${fuel.approval_status || 'unsubmitted'}). Submit the fuel entry for approval first.`
        });
      }
      if (fuel.calf_required && fuel.calf_id && req.user.role !== ROLES.PRESIDENT) {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- calf_id stored on entry by createPrfCalf back-link (same-entity enforced)
        const calf = await PrfCalf.findById(fuel.calf_id).select('status').lean();
        if (!calf || calf.status !== 'POSTED') {
          return res.status(400).json({
            success: false,
            message: `Cannot post: fuel "${fuel.station_name || ''}" has CALF not POSTED (${calf?.status || 'NOT_FOUND'}). Post the CALF first.`
          });
        }
      }
    }
  }

  // Transactional post: one TransactionEvent for the cycle, flip cycle + per-day docs to POSTED
  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    const event = await TransactionEvent.create([{
      entity_id: cycleDoc.entity_id,
      bdm_id: cycleDoc.bdm_id,
      event_type: 'CAR_LOGBOOK',
      event_date: new Date(),
      document_ref: docRef,
      payload: {
        cycle_id: cycleDoc._id,
        period: effPeriod,
        cycle: effCycle,
        working_days: cycleDoc.working_days,
        total_km: cycleDoc.total_km,
        total_fuel: cycleDoc.total_fuel_amount,
        daily_entry_ids: cycleDoc.daily_entry_ids,
      },
      status: 'ACTIVE',
      created_by: req.user._id
    }], { session });

    cycleDoc.status = 'POSTED';
    cycleDoc.posted_at = new Date();
    cycleDoc.posted_by = req.user._id;
    cycleDoc.event_id = event[0]._id;
    await cycleDoc.save({ session });

    for (const entry of entries) {
      entry.status = 'POSTED';
      entry.posted_at = new Date();
      entry.posted_by = req.user._id;
      entry.event_id = event[0]._id;
      entry.cycle_id = cycleDoc._id;
      await entry.save({ session });
    }
  });
  session.endSession();

  // Non-blocking DocumentAttachment event linkage (both per-day + cycle)
  if (cycleDoc.event_id) {
    // eslint-disable-next-line vip-tenant/require-entity-filter -- source_id is unique; entries fetched with entity scope upstream
    await DocumentAttachment.updateMany(
      { source_model: 'CarLogbookEntry', source_id: { $in: entries.map(e => e._id) } },
      { $set: { event_id: cycleDoc.event_id } }
    ).catch(() => {});
    // eslint-disable-next-line vip-tenant/require-entity-filter -- source_id is unique; cycleDoc fetched with entity scope upstream
    await DocumentAttachment.updateMany(
      { source_model: 'CarLogbookCycle', source_id: cycleDoc._id },
      { $set: { event_id: cycleDoc.event_id } }
    ).catch(() => {});
  }

  // Auto-journal: ONE JE for the whole cycle (COA from Settings.COA_MAP — subscription-safe)
  try {
    if (cycleDoc.total_fuel_amount > 0) {
      const coaMap = await getCoaMap();
      let cashTotal = 0, fundedTotal = 0, fundedCoa = null;
      for (const entry of entries) {
        for (const fuel of (entry.fuel_entries || [])) {
          if (!fuel.payment_mode || fuel.payment_mode === 'CASH') {
            cashTotal += fuel.total_amount || 0;
          } else {
            fundedTotal += fuel.total_amount || 0;
            if (!fundedCoa) fundedCoa = await resolveFundingCoa(fuel);
          }
        }
      }
      const jeDesc = `Car Logbook ${effPeriod} ${effCycle}`;
      const lines = [];
      const totalFuel = cashTotal + fundedTotal;
      if (totalFuel > 0) lines.push({ account_code: coaMap.FUEL_GAS || '6200', account_name: 'Fuel & Gas Expense', debit: totalFuel, credit: 0, description: jeDesc });
      // Cash portion reduces the BDM's advance (AR_BDM asset) — contra.
      if (cashTotal > 0) lines.push({ account_code: coaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: cashTotal, description: jeDesc, is_contra: true });
      // Funded portion credits the funding source (bank/CC/petty cash — DEBIT-normal asset).
      if (fundedTotal > 0 && fundedCoa) {
        const d = String(fundedCoa.coa_code || '').charAt(0);
        const fundedIsContra = d === '1' || d === '5' || d === '6';
        lines.push({ account_code: fundedCoa.coa_code, account_name: fundedCoa.coa_name, debit: 0, credit: fundedTotal, description: jeDesc, is_contra: fundedIsContra });
      }
      if (lines.length >= 2) {
        await createAndPostJournal(cycleDoc.entity_id, {
          je_date: new Date(),
          period: effPeriod,
          description: jeDesc,
          source_module: 'EXPENSE',
          source_event_id: cycleDoc.event_id,
          source_doc_ref: docRef,
          lines,
          bir_flag: 'BOTH',
          vat_flag: 'N/A',
          bdm_id: cycleDoc.bdm_id,
          created_by: req.user._id
        });
      }
    }
  } catch (jeErr) {
    console.error('[AUTO_JOURNAL_FAILURE] CarLogbookCycle', String(cycleDoc._id), jeErr.message);
  }

  res.json({
    success: true,
    message: `Posted Car Logbook ${effPeriod} ${effCycle} (${entries.length} day${entries.length === 1 ? '' : 's'})`,
    data: { cycle_id: cycleDoc._id, event_id: cycleDoc.event_id, working_days: cycleDoc.working_days, total_fuel_amount: cycleDoc.total_fuel_amount }
  });
});

const reopenCarLogbook = catchAsync(async (req, res) => {
  // Accept cycle_ids (new) or logbook_ids (legacy: per-day ids). For legacy ids,
  // resolve to their parent cycle wrapper. If no wrapper exists (pre-Phase 33 data),
  // fall back to the old per-day reopen path.
  const cycleIds = req.body?.cycle_ids || [];
  const legacyIds = req.body?.logbook_ids || [];
  // Phase G4.5e — widen for proxy reopen. Reopen sub-perm is still gated at
  // the route layer (expenses.reopen).
  const scope = await widenFilterForProxy(req, 'expenses', CAR_LOGBOOK_PROXY_OPTS);

  // Preferred path: reopen the cycle wrapper
  if (cycleIds.length) {
    const cycles = await CarLogbookCycle.find({ _id: { $in: cycleIds }, ...scope, status: 'POSTED' });
    if (!cycles.length) return res.status(400).json({ success: false, message: 'No POSTED cycles to reopen' });

    const reopened = [], failed = [];
    for (const cycleDoc of cycles) {
      if (cycleDoc.event_id) {
        try {
          // eslint-disable-next-line vip-tenant/require-entity-filter -- source_event_id is unique; cycleDoc fetched via entity-scoped widenFilterForProxy
          const jes = await JournalEntry.find({ source_event_id: cycleDoc.event_id, status: 'POSTED', is_reversal: { $ne: true } });
          for (const je of jes) { await reverseJournal(je._id, 'Auto-reversal: CarLogbook cycle reopen', req.user._id); }
        } catch (jeErr) {
          console.error('JE reversal failed on cycle reopen:', cycleDoc._id, jeErr.message);
          failed.push({ _id: cycleDoc._id, error: `Journal reversal failed: ${jeErr.message}` });
          continue;    // Rule #20: keep POSTED, ledger stays balanced
        }
      }
      // Flip cycle + per-day docs back to DRAFT
      cycleDoc.status = 'DRAFT';
      cycleDoc.reopen_count = (cycleDoc.reopen_count || 0) + 1;
      cycleDoc.posted_at = undefined;
      cycleDoc.posted_by = undefined;
      await cycleDoc.save();

      // eslint-disable-next-line vip-tenant/require-entity-filter -- cycle_id is unique; cycleDoc fetched via entity-scoped widenFilterForProxy
      await CarLogbookEntry.updateMany(
        { cycle_id: cycleDoc._id, status: 'POSTED' },
        { $set: { status: 'DRAFT' }, $unset: { posted_at: 1, posted_by: 1 }, $inc: { reopen_count: 1 } }
      );

      await ErpAuditLog.logChange({
        entity_id: cycleDoc.entity_id,
        bdm_id: cycleDoc.bdm_id,
        log_type: 'REOPEN',
        target_ref: cycleDoc._id.toString(),
        target_model: 'CarLogbookCycle',
        changed_by: req.user._id,
        note: `Cycle reopened (count: ${cycleDoc.reopen_count})`
      });
      reopened.push(cycleDoc._id);
    }
    if (failed.length && !reopened.length) {
      return res.status(500).json({ success: false, message: 'All cycle reopens failed due to journal reversal errors', failed });
    }
    return res.json({ success: true, message: `Reopened ${reopened.length} cycle(s)${failed.length ? `, ${failed.length} failed` : ''}`, reopened, failed });
  }

  // Legacy fallback: per-day ids passed in. Group by cycle_id (or by period+cycle) and reopen.
  const entries = await CarLogbookEntry.find({ _id: { $in: legacyIds }, ...scope, status: 'POSTED' });
  if (!entries.length) return res.status(400).json({ success: false, message: 'No POSTED logbooks to reopen' });

  const cyclesTouched = new Set();
  const reopened = [], failed = [];
  for (const entry of entries) {
    if (entry.event_id) {
      try {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- source_event_id is unique; entry fetched via entity-scoped widenFilterForProxy
        const jes = await JournalEntry.find({ source_event_id: entry.event_id, status: 'POSTED', is_reversal: { $ne: true } });
        for (const je of jes) { await reverseJournal(je._id, 'Auto-reversal: CarLogbook reopen', req.user._id); }
      } catch (jeErr) {
        console.error('JE reversal failed for logbook reopen:', entry._id, jeErr.message);
        failed.push({ _id: entry._id, error: `Journal reversal failed: ${jeErr.message}` });
        continue;
      }
    }
    entry.status = 'DRAFT';
    entry.reopen_count = (entry.reopen_count || 0) + 1;
    entry.posted_at = undefined;
    entry.posted_by = undefined;
    await entry.save();
    if (entry.cycle_id) cyclesTouched.add(String(entry.cycle_id));

    await ErpAuditLog.logChange({
      entity_id: entry.entity_id,
      bdm_id: entry.bdm_id,
      log_type: 'REOPEN',
      target_ref: entry._id.toString(),
      target_model: 'CarLogbookEntry',
      changed_by: req.user._id,
      note: `Reopened (count: ${entry.reopen_count})`
    });
    reopened.push(entry._id);
  }

  // Sync parent cycle wrappers back to DRAFT when any of their days reverted
  for (const cid of cyclesTouched) {
    // eslint-disable-next-line vip-tenant/require-entity-filter -- cid from entity-scoped per-day entry above (entries fetched via widenFilterForProxy)
    const cycleDoc = await CarLogbookCycle.findById(cid);
    if (cycleDoc && cycleDoc.status === 'POSTED') {
      cycleDoc.status = 'DRAFT';
      cycleDoc.reopen_count = (cycleDoc.reopen_count || 0) + 1;
      cycleDoc.posted_at = undefined;
      cycleDoc.posted_by = undefined;
      await cycleDoc.save();
    }
  }

  if (failed.length && !reopened.length) {
    return res.status(500).json({ success: false, message: 'All logbook reopens failed due to journal reversal errors', failed });
  }
  res.json({ success: true, message: `Reopened ${reopened.length} logbook(s)${failed.length ? `, ${failed.length} failed` : ''}`, reopened, failed });
});

// ═══════════════════════════════════════════
// AUTO-CALF — auto-create/update linked CALF for company-funded lines
// ═══════════════════════════════════════════

async function autoCalfForSource(sourceDoc, sourceType) {
  try {
    const lines = sourceType === 'EXPENSE' ? (sourceDoc.lines || []) : (sourceDoc.fuel_entries || []);
    const calfLines = lines.filter(l => l.calf_required && !l.calf_id);
    if (!calfLines.length) return null;

    const totalAmount = Math.round(calfLines.reduce((s, l) => s + (l.amount || l.total_amount || 0), 0) * 100) / 100;
    const lineIds = calfLines.map(l => l._id);

    // Reuse existing DRAFT CALF for this source if any
    const editable = await getEditableStatuses(sourceDoc.entity_id, 'PRF_CALF');
    let calf = await PrfCalf.findOne({
      entity_id: sourceDoc.entity_id,
      doc_type: 'CALF',
      linked_expense_id: sourceDoc._id,
      status: { $in: editable }
    });

    if (calf) {
      calf.linked_expense_line_ids = lineIds;
      calf.advance_amount = totalAmount;
      calf.liquidation_amount = totalAmount;
      calf.amount = totalAmount;
      calf.balance = 0;
      await calf.save();
    } else {
      calf = await PrfCalf.create({
        entity_id: sourceDoc.entity_id,
        bdm_id: sourceDoc.bdm_id,
        // Phase G4.5e — propagate proxy audit from source expense/logbook. When
        // the source was keyed on behalf, the auto-generated CALF inherits the
        // proxy reference so submit force-routes through the Approval Hub
        // (Rule #20 four-eyes) and the orphan diagnostic sees the whole chain.
        recorded_on_behalf_of: sourceDoc.recorded_on_behalf_of || undefined,
        doc_type: 'CALF',
        period: sourceDoc.period,
        cycle: sourceDoc.cycle || 'MONTHLY',
        purpose: sourceType === 'EXPENSE'
          ? 'Auto-CALF: ACCESS expenses (company-funded)'
          : 'Auto-CALF: Fuel (company-funded)',
        advance_amount: totalAmount,
        liquidation_amount: totalAmount,
        amount: totalAmount,
        balance: 0,
        payment_mode: calfLines[0]?.payment_mode || 'CARD',
        funding_card_id: calfLines[0]?.funding_card_id || null,
        funding_account_id: calfLines[0]?.funding_account_id || null,
        linked_expense_id: sourceDoc._id,
        linked_expense_line_ids: lineIds,
        bir_flag: 'INTERNAL',
        status: 'DRAFT',
        created_by: sourceDoc.created_by || sourceDoc.bdm_id
      });
    }

    // Back-link calf_id to source lines
    for (const l of calfLines) l.calf_id = calf._id;
    await sourceDoc.save();

    return calf;
  } catch (err) {
    console.error('Auto-CALF failed:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════
// EXPENSE ENTRY (ORE/ACCESS) ENDPOINTS
// ═══════════════════════════════════════════

// Auto-classify expense lines that have no coa_code or are still '6900' (Misc)
async function autoClassifyLines(lines, entityId) {
  if (!lines || !lines.length) return;
  // Pre-load EXPENSE_CATEGORY lookups once for category→COA fallback
  const Lookup = require('../models/Lookup');
  let catLookups = null;
  for (const line of lines) {
    if (!line.coa_code || line.coa_code === '6900') {
      // Step 1: Try classifier (vendor/keyword match by establishment name)
      if (line.establishment) {
        try {
          const result = await classifyExpense(
            { supplier_name: { value: line.establishment } },
            { entityId }
          );
          if (result.coa_code && result.coa_code !== '6900') {
            line.coa_code = result.coa_code;
            if (!line.expense_category) line.expense_category = result.expense_category;
            if (result.vendor_id) line.vendor_id = result.vendor_id;
            continue;
          }
        } catch (err) {
          console.warn(`[autoClassify] Line "${line.establishment}" failed:`, err.message);
        }
      }
      // Step 2: Fallback — resolve COA from expense_category lookup metadata
      if (line.expense_category && (!line.coa_code || line.coa_code === '6900')) {
        if (!catLookups) {
          try {
            catLookups = await Lookup.find({ entity_id: entityId, category: 'EXPENSE_CATEGORY', is_active: true }).lean();
          } catch { catLookups = []; }
        }
        const catMatch = catLookups.find(l => l.label === line.expense_category || l.code === line.expense_category);
        if (catMatch?.metadata?.coa_code && catMatch.metadata.coa_code !== '6900') {
          line.coa_code = catMatch.metadata.coa_code;
        }
      }
    }
  }
}

const createExpense = catchAsync(async (req, res) => {
  // Block future expense dates at save time (not just validation)
  const now = new Date();
  for (let i = 0; i < (req.body.lines || []).length; i++) {
    const line = req.body.lines[i];
    if (line.expense_date && new Date(line.expense_date) > now) {
      return res.status(400).json({
        success: false,
        message: `Line ${i + 1}: expense date cannot be in the future`
      });
    }
  }

  // Auto-classify lines without coa_code before saving
  await autoClassifyLines(req.body.lines, req.entityId);

  // Phase G4.5c.1 — proxy entry resolver. Caller may set body.assigned_to to
  // record on behalf of another BDM; gate is two-layer (PROXY_ENTRY_ROLES
  // lookup + expenses.proxy_entry sub-perm). Throws 403 if ineligible.
  let owner;
  try {
    owner = await resolveOwnerForWrite(req, 'expenses', { subKey: 'proxy_entry' });
  } catch (err) {
    if (err.statusCode === 403 || err.statusCode === 400) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    throw err;
  }

  // Strip proxy-control fields from body so a crafted payload cannot silently
  // reassign or bypass the helper's gate.
  const {
    assigned_to: _discardAssigned,
    bdm_id: _discardBdm,
    recorded_on_behalf_of: _discardProxy,
    calf_override: _discardCalfOverride,
    ...safeBody
  } = req.body || {};

  const entry = await ExpenseEntry.create({
    ...safeBody,
    entity_id: req.entityId,
    bdm_id: owner.ownerId,
    recorded_on_behalf_of: owner.proxiedBy,
    // calf_override is president-only; never set from create-proxy path.
    created_by: req.user._id,
    status: 'DRAFT'
  });

  // Phase G4.5c.1 — unify audit with Sales/Collections/GRN.
  if (owner.isOnBehalf) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: owner.ownerId,
      log_type: 'PROXY_CREATE',
      target_ref: entry._id.toString(),
      target_model: 'ExpenseEntry',
      changed_by: req.user._id,
      note: `Proxy create: Expense ${entry.period}-${entry.cycle} keyed by ${req.user.name || req.user._id} (${req.user.role}) on behalf of BDM ${owner.ownerId}`
    }).catch(err => console.error('[createExpense] PROXY_CREATE audit failed (non-critical):', err.message));
  }

  // Auto-create linked CALF for company-funded (ACCESS non-cash) lines
  const autoCalf = await autoCalfForSource(entry, 'EXPENSE');
  res.status(201).json({ success: true, data: entry, auto_calf: autoCalf ? { _id: autoCalf._id, calf_number: autoCalf.calf_number, amount: autoCalf.amount } : null });
});

const updateExpense = catchAsync(async (req, res) => {
  const editable = await getEditableStatuses(req.entityId, 'EXPENSES');
  // Phase G4.5c.1 — widen so eligible proxies can edit on behalf.
  const scope = await widenFilterForProxy(req, 'expenses', { subKey: 'proxy_entry' });
  const entry = await ExpenseEntry.findOne({ _id: req.params.id, ...scope, status: { $in: editable } });
  if (!entry) return res.status(404).json({ success: false, message: 'Draft expense not found' });

  // Block future expense dates on update too
  const now = new Date();
  for (let i = 0; i < (req.body.lines || []).length; i++) {
    const line = req.body.lines[i];
    if (line.expense_date && new Date(line.expense_date) > now) {
      return res.status(400).json({
        success: false,
        message: `Line ${i + 1}: expense date cannot be in the future`
      });
    }
  }

  // Auto-classify lines without coa_code before saving
  await autoClassifyLines(req.body.lines, req.entityId);

  // Phase G4.5c.1 — strip ownership fields. A proxy cannot reassign an entry's
  // owner via update; ownership is stamped at create time only. calf_override
  // is also locked (president-only, set at batch-upload time).
  const {
    assigned_to: _discardAssigned,
    bdm_id: _discardBdm,
    recorded_on_behalf_of: _discardProxy,
    calf_override: _discardCalfOverride,
    ...safeBody
  } = req.body || {};

  Object.assign(entry, safeBody);
  await entry.save();

  // Phase G4.5c.1 — audit when the editor is not the owner.
  const isProxyEdit = String(entry.bdm_id) !== String(req.user._id);
  if (isProxyEdit) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: entry.bdm_id,
      log_type: 'PROXY_UPDATE',
      target_ref: entry._id.toString(),
      target_model: 'ExpenseEntry',
      changed_by: req.user._id,
      note: `Proxy update: Expense ${entry.period}-${entry.cycle} edited by ${req.user.name || req.user._id} (${req.user.role}) on behalf of BDM ${entry.bdm_id}`
    }).catch(err => console.error('[updateExpense] PROXY_UPDATE audit failed (non-critical):', err.message));
  }

  // Re-run auto-CALF (updates existing or creates new if needed)
  const autoCalf = await autoCalfForSource(entry, 'EXPENSE');
  res.json({ success: true, data: entry, auto_calf: autoCalf ? { _id: autoCalf._id, calf_number: autoCalf.calf_number, amount: autoCalf.amount } : null });
});

const getExpenseList = catchAsync(async (req, res) => {
  // Phase G4.5c.1 — widen so eligible proxies see the BDMs they file on behalf of.
  const scope = await widenFilterForProxy(req, 'expenses', { subKey: 'proxy_entry' });
  const filter = { ...scope };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.period) filter.period = req.query.period;
  if (req.query.cycle) filter.cycle = req.query.cycle;

  // Phase 6 — hide reversed rows by default; opt-in via ?include_reversed=true.
  if (req.query.include_reversed !== 'true') {
    filter.deletion_event_id = { $exists: false };
  }

  // Rule #21: privileged users may scope by bdm_id; absence = no BDM filter.
  const privileged = req.isPresident || req.isAdmin || req.isFinance;
  if (privileged && req.query.bdm_id) filter.bdm_id = req.query.bdm_id;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const [docs, total] = await Promise.all([
    ExpenseEntry.find(filter)
      .populate('bdm_id', 'name')
      .populate('recorded_on_behalf_of', 'name')
      .sort({ period: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    ExpenseEntry.countDocuments(filter)
  ]);

  res.json({ success: true, data: docs, pagination: { page, limit, total } });
});

const getExpenseById = catchAsync(async (req, res) => {
  // Phase G4.5c.1 — widen for proxy reads.
  const scope = await widenFilterForProxy(req, 'expenses', { subKey: 'proxy_entry' });
  const entry = await ExpenseEntry.findOne({ _id: req.params.id, ...scope })
    .populate('bdm_id', 'name')
    .populate('recorded_on_behalf_of', 'name')
    .lean();
  if (!entry) return res.status(404).json({ success: false, message: 'Expense not found' });
  res.json({ success: true, data: entry });
});

const deleteDraftExpense = catchAsync(async (req, res) => {
  // Phase G4.5c.1 — proxy can delete DRAFT of BDMs they file on behalf of.
  const scope = await widenFilterForProxy(req, 'expenses', { subKey: 'proxy_entry' });
  const result = await ExpenseEntry.findOneAndDelete({ _id: req.params.id, ...scope, status: 'DRAFT' });
  if (!result) return res.status(404).json({ success: false, message: 'Draft expense not found' });
  res.json({ success: true, message: 'Draft expense deleted' });
});

const validateExpenses = catchAsync(async (req, res) => {
  const editable = await getEditableStatuses(req.entityId, 'EXPENSES');
  // Phase G4.5c.1 — widen for proxy validate.
  const scope = await widenFilterForProxy(req, 'expenses', { subKey: 'proxy_entry' });
  const filter = { ...scope, status: { $in: editable } };
  if (req.body?.expense_ids?.length) filter._id = { $in: req.body.expense_ids };
  const entries = await ExpenseEntry.find(filter);

  for (const entry of entries) {
    // Auto-resolve COA codes before validation (tries vendor/keyword match, then category fallback)
    await autoClassifyLines(entry.lines, entry.entity_id);

    const errors = [];

    if (!entry.lines.length) errors.push('No expense lines');
    if (!entry.period) errors.push('Period is required');
    if (!entry.cycle) errors.push('Cycle is required');

    for (let i = 0; i < entry.lines.length; i++) {
      const line = entry.lines[i];
      if (!line.expense_date) errors.push(`Line ${i + 1}: date is required`);
      if (line.expense_date && new Date(line.expense_date) > new Date()) errors.push(`Line ${i + 1}: expense date cannot be in the future`);
      if (!line.amount || line.amount <= 0) errors.push(`Line ${i + 1}: valid amount required`);
      if (!line.establishment) errors.push(`Line ${i + 1}: establishment is required`);

      // OR proof gate: ORE and ACCESS lines require OR photo or OR number (PRD v5 §8.3)
      // Transport categories (P2P, Grab/taxi) are exempt — receipt optional (lookup metadata.or_optional)
      const isTransportCat = (line.expense_category || '').startsWith('TRANSPORT_') || (line.expense_category || '').startsWith('Transport —');
      if (!isTransportCat) {
        if (!line.or_photo_url && !line.or_number) {
          errors.push(`Line ${i + 1}: OR photo or OR number required for ${line.expense_type} expense`);
        } else if (line.or_number && !line.or_photo_url) {
          errors.push(`WARNING: Line ${i + 1}: OR# ${line.or_number} provided without receipt photo — attach photo for audit trail`);
        }
      }

      // #17 Hardening: BLOCK posting with coa_code=6900 (Misc) — must map to correct account
      if (!line.coa_code || line.coa_code === '6900') {
        errors.push(`BLOCKED — Line ${i + 1}: COA code missing or defaulted to Miscellaneous (6900). Map "${line.establishment || 'unknown'}" to correct account before posting.`);
      }

      // CALF gate: ACCESS with non-cash requires CALF to be linked AND POSTED
      if (line.calf_required && req.user.role !== ROLES.PRESIDENT) {
        if (!line.calf_id) {
          errors.push(`Line ${i + 1}: CALF required for non-cash ACCESS expense`);
        } else {
          // Verify linked CALF is POSTED (not just linked)
          // eslint-disable-next-line vip-tenant/require-entity-filter -- calf_id stored on entry by createPrfCalf back-link (same-entity enforced)
          const linkedCalf = await PrfCalf.findById(line.calf_id).select('status').lean();
          if (!linkedCalf) {
            errors.push(`Line ${i + 1}: linked CALF not found`);
          } else if (linkedCalf.status !== 'POSTED') {
            errors.push(`Line ${i + 1}: linked CALF must be POSTED (current: ${linkedCalf.status})`);
          }
        }
      }
    }

    entry.validation_errors = errors;
    // WARNING-prefixed entries are soft — they're surfaced for audit-trail
    // visibility (e.g. OR# without photo) but must NOT block submit. Only
    // hard errors and BLOCKED-prefixed entries flip status to ERROR. The
    // submit-side hard-gate at line ~2353 already re-checks BLOCKED COA
    // codes as a belt-and-suspenders guard.
    const blocking = errors.filter(e => !String(e).startsWith('WARNING:'));
    entry.status = blocking.length > 0 ? 'ERROR' : 'VALID';
    await entry.save();
  }

  res.json({ success: true, message: `Validated ${entries.length} expense(s)`, data: entries.map(e => ({ _id: e._id, status: e.status, errors: e.validation_errors })) });
});

const submitExpenses = catchAsync(async (req, res) => {
  // Phase G4.5c.1 — widen so eligible proxies can submit on behalf.
  const scope = await widenFilterForProxy(req, 'expenses', { subKey: 'proxy_entry' });
  const filter = { ...scope, status: 'VALID' };
  if (req.body?.expense_ids?.length) filter._id = { $in: req.body.expense_ids };
  const entries = await ExpenseEntry.find(filter);
  if (!entries.length) return res.status(400).json({ success: false, message: 'No VALID expenses to submit' });

  // Phase G4.5c.1 — Option B: if ANY entry was proxy-created (recorded_on_behalf_of
  // set), force every submit through the Approval Hub regardless of role. Rule #20
  // four-eyes — a proxy enters, never approves.
  const proxiedEntry = entries.find(e => e.recorded_on_behalf_of);
  const hasProxy = !!proxiedEntry;

  // Authority matrix gate
  const { gateApproval } = require('../services/approvalService');
  const expTotalAmount = entries.reduce((sum, e) => sum + (e.total_amount || 0), 0);
  const gated = await gateApproval({
    entityId: req.entityId,
    module: 'EXPENSES',
    docType: 'EXPENSE_ENTRY',
    docId: entries[0]._id,
    docRef: entries.map(e => `EXP-${e.period}-${e.cycle}`).join(', '),
    amount: expTotalAmount,
    description: `Submit ${entries.length} expense entr${entries.length === 1 ? 'y' : 'ies'} (total ₱${expTotalAmount.toLocaleString()})`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
    forceApproval: hasProxy,
    ownerBdmId: proxiedEntry?.bdm_id,
    // Bundle every expense id so the Hub auto-post dispatcher cascades the
    // post to ALL of them on approval. Without this, only docId (entries[0])
    // posted and the rest stayed VALID silently — money-bug class.
    metadata: { doc_ids: entries.map(e => e._id) },
  }, res);
  if (gated) return;

  // Period lock check
  const { checkPeriodOpen } = require('../utils/periodLock');
  for (const entry of entries) { await checkPeriodOpen(entry.entity_id, entry.period); }

  // #17 Hardening: hard gate — reject any VALID entry that still has 6900 COA (shouldn't happen, belt-and-suspenders)
  for (const entry of entries) {
    const miscLines = (entry.lines || []).filter(l => !l.coa_code || l.coa_code === '6900');
    if (miscLines.length) {
      entry.status = 'ERROR';
      entry.validation_errors = [`BLOCKED — ${miscLines.length} line(s) still mapped to Miscellaneous (6900). Assign correct COA codes.`];
      await entry.save();
      return res.status(400).json({
        success: false,
        message: `Cannot post: ${miscLines.length} expense line(s) still mapped to Miscellaneous (6900). Map to correct COA accounts first.`
      });
    }
  }

  // Phase G4.5h — ACCESS-bearing expenses post via their linked CALF, not via
  // submitExpenses. Mirror the GRN→UT gold standard (one submit → one approval
  // → one cascade). If the CALF is already POSTED but the Expense hasn't
  // cascaded (e.g. an older code path skipped it), allow the submit through as
  // a legacy drain path — otherwise redirect the caller to the CALF surface.
  for (const entry of entries) {
    const calfLine = (entry.lines || []).find(l => l.calf_required && l.calf_id);
    if (!calfLine) continue;
    // eslint-disable-next-line vip-tenant/require-entity-filter -- calf_id stored on entry by createPrfCalf back-link (same-entity enforced); entry fetched via widenFilterForProxy
    const calf = await PrfCalf.findById(calfLine.calf_id).select('status calf_number').lean();
    if (calf && calf.status !== 'POSTED') {
      return res.status(400).json({
        success: false,
        message: `This expense posts via its CALF (${calf.calf_number || calf._id}). Submit the CALF instead — the CALF acknowledge will post both docs in one step.`,
        data: { linked_calf_id: calf._id, calf_status: calf.status }
      });
    }
  }

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    for (const entry of entries) {
      const event = await TransactionEvent.create([{
        entity_id: entry.entity_id,
        bdm_id: entry.bdm_id,
        event_type: 'EXPENSE',
        event_date: new Date(),
        document_ref: `EXP-${entry.period}-${entry.cycle}`,
        payload: { expense_id: entry._id, total_amount: entry.total_amount, ore: entry.total_ore, access: entry.total_access },
        status: 'ACTIVE',
        created_by: req.user._id
      }], { session });

      entry.status = 'POSTED';
      entry.posted_at = new Date();
      entry.posted_by = req.user._id;
      entry.event_id = event[0]._id;
      await entry.save({ session });
    }
  });
  session.endSession();

  // Phase 9.1b: Link DocumentAttachments to events (non-blocking)
  for (const entry of entries) {
    if (entry.event_id) {
      // eslint-disable-next-line vip-tenant/require-entity-filter -- source_id is unique; entries fetched with entity scope upstream
      await DocumentAttachment.updateMany(
        { source_model: 'ExpenseEntry', source_id: entry._id },
        { $set: { event_id: entry.event_id } }
      ).catch(() => {});
    }
  }

  // Phase 11: Auto-journal — Expenses (ORE: DR 6XXX CR coaMap.AR_BDM, ACCESS: DR 6XXX CR funding)
  const expCoaMap = await getCoaMap();
  for (const entry of entries) {
    try {
      const lines = [];
      const desc = `EXP ${entry.period}-${entry.cycle}`;
      let creditOre = 0;
      let creditAccess = 0;
      let accessCoa = null;

      for (const line of (entry.lines || [])) {
        const amt = line.amount || 0;
        if (amt <= 0) continue;
        const drCode = line.coa_code || expCoaMap.MISC_EXPENSE || '6900';
        const drName = line.expense_category || 'Miscellaneous Expense';
        lines.push({ account_code: drCode, account_name: drName, debit: amt, credit: 0, description: line.establishment || desc });
        if (line.expense_type === 'ACCESS') {
          creditAccess += amt;
          if (!accessCoa) accessCoa = await resolveFundingCoa(line, expCoaMap.AP_TRADE || '2000');
        } else {
          creditOre += amt;
        }
      }

      // ORE credit → AR BDM Advances (personal reimbursement) — contra on asset.
      if (creditOre > 0) lines.push({ account_code: expCoaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: creditOre, description: desc, is_contra: true });
      // ACCESS credit → funding source (company-funded). If funding is DEBIT-normal (bank/CC/petty
      // cash/AR_BDM), the CR is a reduction → is_contra. If funding falls back to AP_TRADE
      // (CREDIT-normal liability), CR is an increase → not contra.
      if (creditAccess > 0) {
        const coa = accessCoa || { coa_code: expCoaMap.AP_TRADE || '2000', coa_name: 'Accounts Payable — Trade' };
        const d = String(coa.coa_code || '').charAt(0);
        const isContra = d === '1' || d === '5' || d === '6';
        lines.push({ account_code: coa.coa_code, account_name: coa.coa_name, debit: 0, credit: creditAccess, description: desc, is_contra: isContra });
      }

      if (lines.length >= 2) {
        await createAndPostJournal(entry.entity_id, {
          je_date: entry.posted_at || new Date(),
          period: entry.period,
          description: `Expenses: ${desc}`,
          source_module: 'EXPENSE',
          source_event_id: entry.event_id,
          source_doc_ref: `EXP-${entry.period}-${entry.cycle}`,
          lines,
          bir_flag: entry.bir_flag || 'BOTH',
          vat_flag: 'N/A',
          bdm_id: entry.bdm_id,
          created_by: req.user._id
        });
      }
    } catch (jeErr) {
      console.error('[AUTO_JOURNAL_FAILURE] ExpenseEntry', String(entry._id), jeErr.message);
    }
    // Phase VIP-1.J / J2 — emit WithholdingLedger rows (no-op when entity
    // has withholding_active=false). Best-effort: post still succeeds on
    // failure; failures land in [WITHHOLDING_FAILURE] log for backfill.
    await emitEwtForExpense(entry, req.user._id);
  }

  res.json({ success: true, message: `Posted ${entries.length} expense(s)` });
});

const reopenExpenses = catchAsync(async (req, res) => {
  const { expense_ids } = req.body;
  // Phase G4.5c.1 — widen so eligible proxies can reopen on behalf. Reopen
  // itself is still gated by expenses.reopen sub-perm at route middleware.
  const scope = await widenFilterForProxy(req, 'expenses', { subKey: 'proxy_entry' });
  const entries = await ExpenseEntry.find({ _id: { $in: expense_ids }, ...scope, status: 'POSTED' });
  if (!entries.length) return res.status(400).json({ success: false, message: 'No POSTED expenses to reopen' });

  const reopened = [];
  const failed = [];

  for (const entry of entries) {
    // Reverse journal entries — if reversal fails, skip this entry (keep POSTED, ledger stays balanced)
    if (entry.event_id) {
      try {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- source_event_id is unique; entry fetched via entity-scoped widenFilterForProxy
        const jes = await JournalEntry.find({ source_event_id: entry.event_id, status: 'POSTED', is_reversal: { $ne: true } });
        for (const je of jes) { await reverseJournal(je._id, 'Auto-reversal: Expense reopen', req.user._id); }
      } catch (jeErr) {
        console.error('JE reversal failed for expense reopen:', entry._id, jeErr.message);
        failed.push({ _id: entry._id, error: `Journal reversal failed: ${jeErr.message}` });
        continue; // Do NOT mark as DRAFT — ledger would be unbalanced
      }
    }

    entry.status = 'DRAFT';
    entry.reopen_count = (entry.reopen_count || 0) + 1;
    entry.posted_at = undefined;
    entry.posted_by = undefined;
    await entry.save();

    // Phase VIP-1.J / J2 — drop EWT rows tied to the reversed event so a
    // re-post starts from a clean ledger state. Idempotent (no-op when no
    // rows). MUST happen AFTER journal reversal to keep audit ordering
    // consistent.
    if (entry.event_id) {
      try {
        await withholdingService.deleteWithholdingEntriesForEvent(entry.event_id);
      } catch (whErr) {
        console.error('[WITHHOLDING_FAILURE] reopen ExpenseEntry', String(entry._id), whErr.message);
      }
    }

    await ErpAuditLog.logChange({
      entity_id: entry.entity_id,
      bdm_id: entry.bdm_id,
      log_type: 'REOPEN',
      target_ref: entry._id.toString(),
      target_model: 'ExpenseEntry',
      changed_by: req.user._id,
      note: `Reopened (count: ${entry.reopen_count})`
    });
    reopened.push(entry._id);
  }

  if (failed.length && !reopened.length) {
    return res.status(500).json({ success: false, message: 'All expense reopens failed due to journal reversal errors', failed });
  }
  res.json({ success: true, message: `Reopened ${reopened.length} expense(s)${failed.length ? `, ${failed.length} failed` : ''}`, reopened, failed });
});

// ═══════════════════════════════════════════
// PRF / CALF ENDPOINTS (DRAFT → VALID → ERROR → POSTED)
//
// PRF: Payment instruction for partner rebates — Finance needs partner bank
//      details to process payment. Partner doesn't get paid without PRF.
// CALF: Company-fund advance + liquidation — attached to expense ORs
//       paid with company funds (not revolving/cash). Tracks advance vs spent.
//
// Phase G4.5e proxy wiring: single shared opts object so every call site reads
// the same (module, sub-perm, lookup code) triple.
// ═══════════════════════════════════════════
const PRF_CALF_PROXY_OPTS = { subKey: 'prf_calf_proxy', lookupCode: 'PRF_CALF' };

const createPrfCalf = catchAsync(async (req, res) => {
  // CALF must be linked to an expense entry — prevent orphan CALFs
  if (req.body.doc_type === 'CALF' && !req.body.linked_expense_id) {
    return res.status(400).json({
      success: false,
      message: 'CALF must be linked to an expense entry. Use "Create CALF" from pending company-funded items.'
    });
  }

  // #13 Hardening: Validate linked_expense_line_ids actually belong to the linked expense/logbook
  if (req.body.doc_type === 'CALF' && req.body.linked_expense_id && req.body.linked_expense_line_ids?.length) {
    const expense = await ExpenseEntry.findOne({ _id: req.body.linked_expense_id, entity_id: req.entityId }).lean();
    if (expense) {
      const validLineIds = new Set(expense.lines.map(l => l._id.toString()));
      const invalid = req.body.linked_expense_line_ids.filter(lid => !validLineIds.has(lid.toString()));
      if (invalid.length) {
        return res.status(400).json({
          success: false,
          message: `Invalid linked_expense_line_ids: ${invalid.length} line(s) do not belong to the linked expense entry.`
        });
      }
    } else {
      const logbook = await CarLogbookEntry.findOne({ _id: req.body.linked_expense_id, entity_id: req.entityId }).lean();
      if (logbook) {
        const validFuelIds = new Set((logbook.fuel_entries || []).map(f => f._id.toString()));
        const invalid = req.body.linked_expense_line_ids.filter(lid => !validFuelIds.has(lid.toString()));
        if (invalid.length) {
          return res.status(400).json({
            success: false,
            message: `Invalid linked_expense_line_ids: ${invalid.length} fuel entry(s) do not belong to the linked logbook.`
          });
        }
      }
    }
  }

  // Phase G4.5e — proxy resolver. Accepts body.assigned_to from an eligible
  // proxy (admin/finance/eBDM with expenses.prf_calf_proxy). Rule #21: throws
  // 400 when a non-BDM caller omits assigned_to; no silent self-fill.
  //
  // Special case — auto-CALF flow: createPrfCalf is ALSO called synthetically
  // by autoCalfForSource via PrfCalf.create (not through this endpoint). That
  // path is a model-level create, so this gate only applies to explicit user
  // creations through POST /prf-calf (manual PRF or standalone CALF).
  let owner;
  try {
    owner = await resolveOwnerForWrite(req, 'expenses', PRF_CALF_PROXY_OPTS);
  } catch (err) {
    if (err.statusCode === 400 || err.statusCode === 403) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    throw err;
  }

  // Strip ownership fields so a crafted payload cannot bypass the helper.
  const { assigned_to: _dAssigned, bdm_id: _dBdm, recorded_on_behalf_of: _dProxy, ...safeBody } = req.body || {};

  const doc = await PrfCalf.create({
    ...safeBody,
    entity_id: req.entityId,
    bdm_id: owner.ownerId,
    recorded_on_behalf_of: owner.proxiedBy,
    created_by: req.user._id,
    status: 'DRAFT'
  });

  if (owner.isOnBehalf) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: owner.ownerId,
      log_type: 'PROXY_CREATE',
      target_ref: doc._id.toString(),
      target_model: 'PrfCalf',
      changed_by: req.user._id,
      note: `Proxy create: ${doc.doc_type} ${doc.period}-${doc.cycle} (₱${doc.amount}) keyed by ${req.user.name || req.user._id} (${req.user.role}) on behalf of BDM ${owner.ownerId}`
    }).catch(err => console.error('[createPrfCalf] PROXY_CREATE audit failed (non-critical):', err.message));
  }

  // ── Back-link: update expense/logbook lines' calf_id when CALF is linked ──
  // Also auto-copy OR photos from linked lines into CALF photo_urls (no double-scan needed)
  if (doc.doc_type === 'CALF' && doc.linked_expense_id && doc.linked_expense_line_ids?.length) {
    const collectedPhotos = [];

    // Try ExpenseEntry first (ACCESS lines) — enforce same entity
    // eslint-disable-next-line vip-tenant/require-entity-filter -- post-fetch entity_id check at +1 line returns 403 on mismatch
    const expense = await ExpenseEntry.findById(doc.linked_expense_id);
    if (expense && expense.entity_id.toString() !== doc.entity_id.toString()) {
      return res.status(403).json({ success: false, message: 'Cannot link CALF to expense from a different entity' });
    }
    if (expense) {
      for (const line of expense.lines) {
        if (doc.linked_expense_line_ids.some(lid => lid.toString() === line._id.toString())) {
          line.calf_id = doc._id;
          if (line.or_photo_url) collectedPhotos.push(line.or_photo_url);
        }
      }
      await expense.save();
    } else {
      // Try CarLogbookEntry (fuel entries) — enforce same entity
      // eslint-disable-next-line vip-tenant/require-entity-filter -- post-fetch entity_id check at +1 line returns 403 on mismatch
      const logbook = await CarLogbookEntry.findById(doc.linked_expense_id);
      if (logbook && logbook.entity_id.toString() !== doc.entity_id.toString()) {
        return res.status(403).json({ success: false, message: 'Cannot link CALF to logbook from a different entity' });
      }
      if (logbook) {
        for (const fuel of logbook.fuel_entries) {
          if (doc.linked_expense_line_ids.some(lid => lid.toString() === fuel._id.toString())) {
            fuel.calf_id = doc._id;
          }
        }
        await logbook.save();
      }
    }

    // Auto-populate CALF photo_urls from linked OR photos (if CALF has none)
    if (collectedPhotos.length && (!doc.photo_urls || !doc.photo_urls.length)) {
      doc.photo_urls = collectedPhotos;
      await doc.save();
    }
  }

  res.status(201).json({ success: true, data: doc });
});

const updatePrfCalf = catchAsync(async (req, res) => {
  const editable = await getEditableStatuses(req.entityId, 'PRF_CALF');
  // Phase G4.5e — widen for proxy update.
  const scope = await widenFilterForProxy(req, 'expenses', PRF_CALF_PROXY_OPTS);
  const doc = await PrfCalf.findOne({ _id: req.params.id, ...scope, status: { $in: editable } });
  if (!doc) return res.status(404).json({ success: false, message: 'Draft PRF/CALF not found' });

  // Snapshot old links before update
  const oldLinkedId = doc.linked_expense_id?.toString();
  const oldLineIds = (doc.linked_expense_line_ids || []).map(id => id.toString());

  // Strip ownership fields — ownership is stamped at create time only.
  const { assigned_to: _dAssigned, bdm_id: _dBdm, recorded_on_behalf_of: _dProxy, ...safeBody } = req.body || {};
  Object.assign(doc, safeBody);

  // Audit proxy edits (when editor is not the owner).
  const isProxyEdit = String(doc.bdm_id) !== String(req.user._id);
  if (isProxyEdit) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: doc.bdm_id,
      log_type: 'PROXY_UPDATE',
      target_ref: doc._id.toString(),
      target_model: 'PrfCalf',
      changed_by: req.user._id,
      note: `Proxy update: ${doc.doc_type} ${doc.period}-${doc.cycle} edited by ${req.user.name || req.user._id} (${req.user.role}) on behalf of BDM ${doc.bdm_id}`
    }).catch(err => console.error('[updatePrfCalf] PROXY_UPDATE audit failed (non-critical):', err.message));
  }

  // Re-run back-linking if linked source changed
  const newLinkedId = doc.linked_expense_id?.toString();
  const newLineIds = (doc.linked_expense_line_ids || []).map(id => id.toString());
  const linkChanged = doc.doc_type === 'CALF' && (oldLinkedId !== newLinkedId || oldLineIds.join(',') !== newLineIds.join(','));

  if (linkChanged) {
    // Clear old back-links
    if (oldLinkedId) {
      const clearCalfId = (lines, lineIds) => {
        for (const l of lines) {
          if (lineIds.includes(l._id.toString()) && l.calf_id?.toString() === doc._id.toString()) {
            l.calf_id = null;
          }
        }
      };
      // eslint-disable-next-line vip-tenant/require-entity-filter -- oldLinkedId from prior entity-scoped doc.linked_expense_id (CALF→source link verified at link time)
      const oldExp = await ExpenseEntry.findById(oldLinkedId);
      if (oldExp) { clearCalfId(oldExp.lines, oldLineIds); await oldExp.save(); }
      else {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- oldLinkedId from prior entity-scoped doc.linked_expense_id
        const oldLb = await CarLogbookEntry.findById(oldLinkedId);
        if (oldLb) { clearCalfId(oldLb.fuel_entries, oldLineIds); await oldLb.save(); }
      }
    }

    // Set new back-links (same logic as createPrfCalf) — enforce same entity
    if (newLinkedId && newLineIds.length) {
      const collectedPhotos = [];
      // eslint-disable-next-line vip-tenant/require-entity-filter -- post-fetch entity_id check at +1 line returns 403 on mismatch
      const expense = await ExpenseEntry.findById(newLinkedId);
      if (expense && expense.entity_id.toString() !== doc.entity_id.toString()) {
        return res.status(403).json({ success: false, message: 'Cannot link CALF to expense from a different entity' });
      }
      if (expense) {
        for (const line of expense.lines) {
          if (newLineIds.includes(line._id.toString())) {
            line.calf_id = doc._id;
            if (line.or_photo_url) collectedPhotos.push(line.or_photo_url);
          }
        }
        await expense.save();
      } else {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- post-fetch entity_id check at +1 line returns 403 on mismatch
        const logbook = await CarLogbookEntry.findById(newLinkedId);
        if (logbook && logbook.entity_id.toString() !== doc.entity_id.toString()) {
          return res.status(403).json({ success: false, message: 'Cannot link CALF to logbook from a different entity' });
        }
        if (logbook) {
          for (const fuel of logbook.fuel_entries) {
            if (newLineIds.includes(fuel._id.toString())) fuel.calf_id = doc._id;
          }
          await logbook.save();
        }
      }
      if (collectedPhotos.length && (!doc.photo_urls || !doc.photo_urls.length)) {
        doc.photo_urls = collectedPhotos;
      }
    }
  }

  await doc.save();
  res.json({ success: true, data: doc });
});

const getPrfCalfList = catchAsync(async (req, res) => {
  // Phase G4.5e — widen so eligible proxies see the BDMs they file on behalf of.
  const scope = await widenFilterForProxy(req, 'expenses', PRF_CALF_PROXY_OPTS);
  const filter = { ...scope };
  if (req.query.doc_type) filter.doc_type = req.query.doc_type;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.period) filter.period = req.query.period;

  // Phase 6 — hide reversed rows by default; opt-in via ?include_reversed=true.
  if (req.query.include_reversed !== 'true') {
    filter.deletion_event_id = { $exists: false };
  }

  // Rule #21: privileged users may scope by bdm_id; absence = no BDM filter.
  const privileged = req.isPresident || req.isAdmin || req.isFinance;
  if (privileged && req.query.bdm_id) filter.bdm_id = req.query.bdm_id;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const [docs, total] = await Promise.all([
    PrfCalf.find(filter)
      .populate('bdm_id', 'name')
      .populate('recorded_on_behalf_of', 'name')
      .populate('posted_by', 'name')
      .sort({ created_at: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    PrfCalf.countDocuments(filter)
  ]);

  res.json({ success: true, data: docs, pagination: { page, limit, total } });
});

const getPrfCalfById = catchAsync(async (req, res) => {
  // Phase G4.5e — widen for proxy reads.
  const scope = await widenFilterForProxy(req, 'expenses', PRF_CALF_PROXY_OPTS);
  const doc = await PrfCalf.findOne({ _id: req.params.id, ...scope })
    .populate('bdm_id', 'name')
    .populate('recorded_on_behalf_of', 'name')
    .populate('posted_by', 'name').lean();
  if (!doc) return res.status(404).json({ success: false, message: 'PRF/CALF not found' });
  res.json({ success: true, data: doc });
});

// ─────────────────────────────────────────────────────────────────────────
// Linked Expenses — unified view of every fuel entry + expense line that
// references this CALF. Used by the PrfCalf drill-down to audit "which
// expenses drew against this CALF" in one place (Phase 33).
// ─────────────────────────────────────────────────────────────────────────
const getLinkedExpenses = catchAsync(async (req, res) => {
  // Phase G4.5e — widen for proxy drill-down reads.
  const scope = await widenFilterForProxy(req, 'expenses', PRF_CALF_PROXY_OPTS);
  const calf = await PrfCalf.findOne({ _id: req.params.id, ...scope }).lean();
  if (!calf) return res.status(404).json({ success: false, message: 'CALF not found' });

  // Fuel entries (per-day CarLogbookEntry.fuel_entries[j] with calf_id = this CALF)
  const dayDocs = await CarLogbookEntry.find({
    entity_id: calf.entity_id,
    'fuel_entries.calf_id': calf._id,
  }).select('period cycle entry_date bdm_id status fuel_entries cycle_id').lean();

  // Resolve VAT rate once for this CALF so every fuel row in the breakdown
  // uses the same lookup-driven rate the JE engine will apply at post time.
  // CarLogbookEntry.fuel_entries does not persist net_of_vat / vat_amount /
  // bir_flag (unlike ExpenseEntry.lines), so we derive them here for the
  // detail panel; the journal-entry path resolves the same fields independently.
  const vatRate = await Settings.getVatRate();
  const splitFuelVat = (total) => {
    const t = Number(total) || 0;
    if (!t) return { vat: 0, net: 0 };
    const vat = Math.round(t * (vatRate / (1 + vatRate)) * 100) / 100;
    const net = Math.round((t - vat) * 100) / 100;
    return { vat, net };
  };

  const fuelLinks = [];
  for (const d of dayDocs) {
    for (const fe of (d.fuel_entries || [])) {
      if (String(fe.calf_id) !== String(calf._id)) continue;
      const { vat: feVat, net: feNet } = splitFuelVat(fe.total_amount);
      fuelLinks.push({
        source: 'FUEL',
        doc_ref: fe.doc_ref || `FUEL-${d.period}-${d._id}`,
        date: d.entry_date,
        period: d.period,
        cycle: d.cycle,
        description: `${fe.station_name || 'Fuel'} ${fe.liters || 0}L`,
        // Surface the same shape as expense lines so the CALF panel can render
        // a uniform breakdown table. Fuel entries don't persist these fields
        // on the sub-doc, so derive Net/VAT via the lookup-driven VAT rate and
        // default BIR flag to BOTH (matches ExpenseEntry.lines default).
        expense_category: 'fuel',
        coa_code: fe.coa_code || null,
        vat_amount: feVat,
        net_of_vat: feNet,
        bir_flag: fe.bir_flag || 'BOTH',
        amount: fe.total_amount || 0,
        approval_status: fe.approval_status,
        payment_mode: fe.payment_mode,
        cycle_status: d.status,
        cycle_id: d.cycle_id,
        bdm_id: d.bdm_id,
      });
    }
  }

  // Expense lines (ExpenseEntry.lines[k] with calf_id = this CALF)
  const expenseDocs = await ExpenseEntry.find({
    entity_id: calf.entity_id,
    'lines.calf_id': calf._id,
  }).select('period cycle bdm_id status lines').lean();

  const expenseLinks = [];
  for (const e of expenseDocs) {
    for (const line of (e.lines || [])) {
      if (String(line.calf_id) !== String(calf._id)) continue;
      expenseLinks.push({
        source: 'EXPENSE',
        doc_ref: `EXP-${e.period}-${e.cycle}`,
        date: line.date || null,
        period: e.period,
        cycle: e.cycle,
        description: line.establishment || line.description || 'Expense',
        // Phase: CALF detail breakdown — surface what was actually spent so
        // Approval Hub reviewers don't need to navigate to the Expense module
        // to see line-level context (category, vendor, BIR reportability).
        expense_category: line.expense_category || null,
        coa_code: line.coa_code || null,
        vat_amount: line.vat_amount || 0,
        net_of_vat: line.net_of_vat || 0,
        bir_flag: line.bir_flag || null,
        amount: line.amount || 0,
        payment_mode: line.payment_mode,
        cycle_status: e.status,
        bdm_id: e.bdm_id,
      });
    }
  }

  const all = [...fuelLinks, ...expenseLinks].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  const total_linked = Math.round(all.reduce((s, r) => s + (r.amount || 0), 0) * 100) / 100;
  const variance = Math.round(((calf.amount || 0) - total_linked) * 100) / 100;

  res.json({
    success: true,
    data: {
      calf: { _id: calf._id, doc_type: calf.doc_type, calf_number: calf.calf_number, amount: calf.amount, period: calf.period, status: calf.status },
      linked: all,
      total_linked,
      calf_amount: calf.amount || 0,
      variance,
      fuel_count: fuelLinks.length,
      expense_count: expenseLinks.length,
    }
  });
});

const deleteDraftPrfCalf = catchAsync(async (req, res) => {
  // Phase G4.5e — proxy can delete DRAFT of BDMs they file on behalf of.
  const scope = await widenFilterForProxy(req, 'expenses', PRF_CALF_PROXY_OPTS);
  const result = await PrfCalf.findOneAndDelete({ _id: req.params.id, ...scope, status: 'DRAFT' });
  if (!result) return res.status(404).json({ success: false, message: 'Draft PRF/CALF not found' });

  // Clean up calf_id references on linked expense/logbook lines (prevent orphaned refs)
  if (result.doc_type === 'CALF' && result.linked_expense_id && result.linked_expense_line_ids?.length) {
    // eslint-disable-next-line vip-tenant/require-entity-filter -- linked_expense_id from entity-scoped result (deleteDraft scope above)
    const expense = await ExpenseEntry.findById(result.linked_expense_id);
    if (expense) {
      for (const line of expense.lines) {
        if (line.calf_id?.toString() === result._id.toString()) line.calf_id = undefined;
      }
      await expense.save();
    } else {
      // eslint-disable-next-line vip-tenant/require-entity-filter -- linked_expense_id from entity-scoped result
      const logbook = await CarLogbookEntry.findById(result.linked_expense_id);
      if (logbook) {
        for (const fuel of logbook.fuel_entries) {
          if (fuel.calf_id?.toString() === result._id.toString()) fuel.calf_id = undefined;
        }
        await logbook.save();
      }
    }
  }

  res.json({ success: true, message: 'Draft PRF/CALF deleted' });
});

const validatePrfCalf = catchAsync(async (req, res) => {
  const editable = await getEditableStatuses(req.entityId, 'PRF_CALF');
  // Phase G4.5e — widen for proxy validate.
  const scope = await widenFilterForProxy(req, 'expenses', PRF_CALF_PROXY_OPTS);
  const docs = await PrfCalf.find({ ...scope, status: { $in: editable } });

  for (const doc of docs) {
    const errors = [];

    if (!doc.amount || doc.amount <= 0) errors.push('Valid amount is required');
    if (!doc.period) errors.push('Period is required');
    if (!doc.cycle) errors.push('Cycle is required');

    // Photo proof: required for PRF only. CALF inherits OR photos from linked expense lines.
    if (doc.doc_type === 'PRF' && !doc.photo_urls?.length) {
      errors.push('Photo proof is required for PRF');
    }
    if (doc.doc_type === 'CALF' && !doc.photo_urls?.length && doc.linked_expense_id) {
      // Auto-inherit OR photos from linked expense lines
      // eslint-disable-next-line vip-tenant/require-entity-filter -- linked_expense_id from entity-scoped doc (validatePrfCalf scope above)
      const linkedExp = await ExpenseEntry.findById(doc.linked_expense_id).lean();
      const linkedPhotos = (linkedExp?.lines || [])
        .filter(l => (doc.linked_expense_line_ids || []).some(lid => lid.toString() === l._id.toString()))
        .map(l => l.or_photo_url)
        .filter(Boolean);
      if (linkedPhotos.length) {
        doc.photo_urls = linkedPhotos;
      }
      // No error if CALF has no photos — OR proof lives on the expense line, not the CALF
    }

    if (doc.doc_type === 'PRF') {
      if (!doc.payee_name) errors.push('Payee name is required');
      if (!doc.purpose) errors.push('Purpose is required');

      if (doc.prf_type === 'PERSONAL_REIMBURSEMENT') {
        // Personal reimbursement: BDM/employee used own money, needs OR photo proof
        if (!doc.photo_urls?.length) errors.push('OR photo required for personal reimbursement');
      } else {
        // Partner rebate (default): requires partner bank details for Finance to send payment
        if (!doc.partner_bank) errors.push('Partner bank name is required');
        if (!doc.partner_account_name) errors.push('Partner account holder name is required');
        if (!doc.partner_account_no) errors.push('Partner account number is required');
        if (!doc.rebate_amount || doc.rebate_amount <= 0) errors.push('Rebate amount is required');
      }
    }

    if (doc.doc_type === 'CALF') {
      // CALF: advance amount and linked expense required
      if (!doc.advance_amount || doc.advance_amount <= 0) errors.push('Advance amount is required');
      if (!doc.linked_expense_id) errors.push('CALF must be linked to an expense entry');

      // #13 Hardening: Validate linked_expense_line_ids belong to the linked expense/logbook
      if (doc.linked_expense_id && doc.linked_expense_line_ids?.length) {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- linked_expense_id from entity-scoped doc (validatePrfCalf scope)
        const srcExpense = await ExpenseEntry.findById(doc.linked_expense_id).lean();
        if (srcExpense) {
          const validIds = new Set(srcExpense.lines.map(l => l._id.toString()));
          const orphaned = doc.linked_expense_line_ids.filter(lid => !validIds.has(lid.toString()));
          if (orphaned.length) errors.push(`${orphaned.length} linked line(s) do not belong to the linked expense entry`);
        } else {
          // eslint-disable-next-line vip-tenant/require-entity-filter -- linked_expense_id from entity-scoped doc
          const srcLogbook = await CarLogbookEntry.findById(doc.linked_expense_id).lean();
          if (srcLogbook) {
            const validIds = new Set((srcLogbook.fuel_entries || []).map(f => f._id.toString()));
            const orphaned = doc.linked_expense_line_ids.filter(lid => !validIds.has(lid.toString()));
            if (orphaned.length) errors.push(`${orphaned.length} linked fuel entry(s) do not belong to the linked logbook`);
          } else {
            errors.push('Linked expense/logbook entry not found');
          }
        }
      }
    }

    doc.validation_errors = errors;
    doc.status = errors.length > 0 ? 'ERROR' : 'VALID';
    await doc.save();
  }

  res.json({
    success: true,
    message: `Validated ${docs.length} PRF/CALF(s)`,
    data: docs.map(d => ({ _id: d._id, doc_type: d.doc_type, status: d.status, errors: d.validation_errors }))
  });
});

const submitPrfCalf = catchAsync(async (req, res) => {
  // Phase G4.5e — widen so eligible proxies can submit on behalf.
  const scope = await widenFilterForProxy(req, 'expenses', PRF_CALF_PROXY_OPTS);
  const docs = await PrfCalf.find({ ...scope, status: 'VALID' });
  if (!docs.length) return res.status(400).json({ success: false, message: 'No VALID PRF/CALFs to submit' });

  // Phase G4.5e — force hub routing when ANY doc was proxy-created (Rule #20).
  const proxiedDoc = docs.find(d => d.recorded_on_behalf_of);
  const hasProxy = !!proxiedDoc;

  // Authority matrix gate
  const { gateApproval } = require('../services/approvalService');
  const prfCalfTotal = docs.reduce((sum, d) => sum + (d.amount || 0), 0);
  const gated = await gateApproval({
    entityId: req.entityId,
    module: 'EXPENSES',
    docType: 'PRF_CALF',
    docId: docs[0]._id,
    docRef: docs.map(d => d.prf_number || d.calf_number || d.doc_type).join(', '),
    amount: prfCalfTotal,
    description: `Submit ${docs.length} PRF/CALF doc${docs.length === 1 ? '' : 's'} (total ₱${prfCalfTotal.toLocaleString()})`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
    forceApproval: hasProxy,
    ownerBdmId: proxiedDoc?.bdm_id,
  }, res);
  if (gated) return;

  // Period lock check
  const { checkPeriodOpen } = require('../utils/periodLock');
  for (const doc of docs) { await checkPeriodOpen(doc.entity_id, doc.period); }

  // Phase G4.5h — delegate to postSinglePrfCalf so the direct-submit path and
  // the Approval-Hub path share one transactional cascade. Each doc is atomic:
  // if a doc's cascade fails (e.g. linked Expense validation error), its CALF
  // rolls back too — no half-posted state. Other docs in the batch proceed.
  const posted = [];
  const failed = [];
  for (const doc of docs) {
    try {
      await postSinglePrfCalf(doc, req.user._id);
      posted.push({ prf_calf_id: doc._id, status: 'POSTED', linked_source_id: doc.linked_expense_id || null });
    } catch (err) {
      console.error('submitPrfCalf: per-doc cascade failed', String(doc._id), err.message);
      failed.push({ prf_calf_id: doc._id, error: err.message, cascade_errors: err.cascadeErrors || null });
    }
  }
  if (failed.length && !posted.length) {
    return res.status(400).json({ success: false, message: 'All PRF/CALF submits failed', failed });
  }
  res.json({
    success: true,
    message: `Posted ${posted.length} PRF/CALF(s)${failed.length ? `, ${failed.length} failed` : ''}`,
    posted,
    failed: failed.length ? failed : undefined
  });
});

const reopenPrfCalf = catchAsync(async (req, res) => {
  const { prf_calf_ids } = req.body;
  // Phase G4.5e — widen for proxy reopen. Reopen sub-perm is still gated at
  // the route layer (expenses.reopen).
  const scope = await widenFilterForProxy(req, 'expenses', PRF_CALF_PROXY_OPTS);
  const docs = await PrfCalf.find({ _id: { $in: prf_calf_ids }, ...scope, status: 'POSTED' });
  if (!docs.length) return res.status(400).json({ success: false, message: 'No POSTED PRF/CALFs to reopen' });

  const reopenedDocs = [];
  const failedDocs = [];

  for (const doc of docs) {
    // Reverse journal entries — if reversal fails, skip (keep POSTED, ledger stays balanced)
    if (doc.event_id) {
      try {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- source_event_id is unique; doc fetched via entity-scoped widenFilterForProxy
        const jes = await JournalEntry.find({ source_event_id: doc.event_id, status: 'POSTED', is_reversal: { $ne: true } });
        for (const je of jes) { await reverseJournal(je._id, `Auto-reversal: ${doc.doc_type} reopen`, req.user._id); }
      } catch (jeErr) {
        console.error('JE reversal failed for PRF/CALF reopen:', doc._id, jeErr.message);
        failedDocs.push({ _id: doc._id, error: `Journal reversal failed: ${jeErr.message}` });
        continue; // Do NOT mark as DRAFT — ledger would be unbalanced
      }
    }

    doc.status = 'DRAFT';
    doc.reopen_count = (doc.reopen_count || 0) + 1;
    doc.posted_at = undefined;
    doc.posted_by = undefined;
    await doc.save();
    reopenedDocs.push(doc);

    // Clear calf_id on linked expense/logbook lines so they show as pending again
    if (doc.doc_type === 'CALF' && doc.linked_expense_id && doc.linked_expense_line_ids?.length) {
      try {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- linked_expense_id from entity-scoped doc (reopen scope)
        const expense = await ExpenseEntry.findById(doc.linked_expense_id);
        if (expense) {
          for (const line of expense.lines) {
            if (line.calf_id?.toString() === doc._id.toString()) line.calf_id = undefined;
          }
          await expense.save();
        } else {
          // eslint-disable-next-line vip-tenant/require-entity-filter -- linked_expense_id from entity-scoped doc
          const logbook = await CarLogbookEntry.findById(doc.linked_expense_id);
          if (logbook) {
            for (const fuel of logbook.fuel_entries) {
              if (fuel.calf_id?.toString() === doc._id.toString()) fuel.calf_id = undefined;
            }
            await logbook.save();
          }
        }
      } catch (linkErr) { console.error('Clear calf_id on reopen failed:', doc._id, linkErr.message); }
    }

    await ErpAuditLog.logChange({
      entity_id: doc.entity_id,
      bdm_id: doc.bdm_id,
      log_type: 'REOPEN',
      target_ref: doc._id.toString(),
      target_model: 'PrfCalf',
      changed_by: req.user._id,
      note: `Reopened ${doc.doc_type} (count: ${doc.reopen_count})`
    });

    // Auto-reopen linked expense/carlogbook (reverse its JE too)
    if (doc.doc_type === 'CALF' && doc.linked_expense_id) {
      try {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- linked_expense_id from entity-scoped doc (reopen scope)
        let source = await ExpenseEntry.findById(doc.linked_expense_id);
        // eslint-disable-next-line vip-tenant/require-entity-filter -- linked_expense_id from entity-scoped doc
        if (!source) source = await CarLogbookEntry.findById(doc.linked_expense_id);
        if (source && source.status === 'POSTED') {
          // Reverse source JEs — if this fails, source stays POSTED (acceptable: CALF already reopened)
          if (source.event_id) {
            // eslint-disable-next-line vip-tenant/require-entity-filter -- source_event_id is unique; source above is same-entity per back-link contract
            const jes = await JournalEntry.find({ source_event_id: source.event_id, status: 'POSTED', is_reversal: { $ne: true } });
            for (const je of jes) { await reverseJournal(je._id, `Auto-reversal: linked CALF reopen`, req.user._id); }
          }
          source.status = 'DRAFT';
          source.reopen_count = (source.reopen_count || 0) + 1;
          source.posted_at = undefined;
          source.posted_by = undefined;
          await source.save();
        }
      } catch (err) { console.error('Auto-reopen linked source failed:', doc.linked_expense_id, err.message); }
    }
  }

  // Return linked expense IDs for frontend navigation
  const linkedSources = reopenedDocs
    .filter(d => d.doc_type === 'CALF' && d.linked_expense_id)
    .map(d => ({ calf_id: d._id, linked_expense_id: d.linked_expense_id }));

  if (failedDocs.length && !reopenedDocs.length) {
    return res.status(500).json({ success: false, message: 'All PRF/CALF reopens failed due to journal reversal errors', failed: failedDocs });
  }
  res.json({ success: true, message: `Reopened ${reopenedDocs.length} PRF/CALF(s)${failedDocs.length ? `, ${failedDocs.length} failed` : ''}`, linked_sources: linkedSources, failed: failedDocs.length ? failedDocs : undefined });
});

// ═══════════════════════════════════════════
// EXPENSE SUMMARY ENDPOINT
// ═══════════════════════════════════════════

const getExpenseSummary = catchAsync(async (req, res) => {
  const { period, cycle } = req.query;
  if (!period || !cycle) return res.status(400).json({ success: false, message: 'period and cycle are required' });

  const summary = await generateExpenseSummary(req.entityId, req.bdmId, period, cycle);
  res.json({ success: true, data: summary });
});

// ═══════════════════════════════════════════
// CRM → SMER BRIDGE (auto-populate MD counts from CRM visit logs)
// ═══════════════════════════════════════════

/**
 * Resolve which BDM's CRM visits to pull, given an HTTP request. Centralized
 * so both the count endpoint and the drill-down endpoint use the same rules.
 *
 * Rule #21 + Phase G4.5f alignment:
 *   - privileged caller (admin/finance/president): MUST pass ?bdm_id=. No
 *     implicit self-fallback — these roles have no Visit rows, so req.bdmId
 *     would silently resolve to an empty result.
 *   - CONTRACTOR self-file (no bdm_id, or bdm_id matches own _id): falls back
 *     to req.bdmId. Pre-G4.5f behavior preserved.
 *   - CONTRACTOR proxy (bdm_id ≠ own _id): must hold expenses.smer_proxy and
 *     pass PROXY_ENTRY_ROLES.SMER. Otherwise 403. Without this gate, an eBDM
 *     would silently pull their own CRM visits into the target BDM's SMER.
 *   - any other role: 403.
 *
 * Throws an Error with .statusCode set; catchAsync surfaces it to the client.
 */
async function resolveBdmForCrmPull(req) {
  const requestedBdmId = req.query.bdm_id || null;
  const privileged = req.isPresident || req.isAdmin || req.isFinance;

  if (privileged) {
    if (!requestedBdmId) {
      const err = new Error('bdm_id is required for admin/finance/president pulls');
      err.statusCode = 400;
      throw err;
    }
    return requestedBdmId;
  }

  if (req.user.role !== ROLES.CONTRACTOR) {
    const err = new Error('CRM bridge is for BDM users. Admins must pass ?bdm_id=.');
    err.statusCode = 403;
    throw err;
  }

  // Self-file: backend self-scopes via req.bdmId.
  if (!requestedBdmId || String(requestedBdmId) === String(req.user._id)) {
    return req.bdmId || req.user._id;
  }

  // Proxy CONTRACTOR: gate via expenses.smer_proxy + PROXY_ENTRY_ROLES.SMER
  // (same gate the SMER write/submit/reopen paths enforce in Phase G4.5f).
  const { canProxy } = await canProxyEntry(req, 'expenses', SMER_PROXY_OPTS);
  if (!canProxy) {
    const err = new Error('Proxy pull denied. Your Access Template does not grant expenses.smer_proxy.');
    err.statusCode = 403;
    throw err;
  }
  return requestedBdmId;
}

/**
 * GET /expenses/smer/crm-md-counts?period=2026-04&cycle=C1[&bdm_id=...]
 * Returns daily MD counts pulled from CRM visit logs for the BDM's period/cycle.
 * Used to auto-populate SMER daily entries instead of manual MD count entry.
 */
const getSmerCrmMdCounts = catchAsync(async (req, res) => {
  let bdmUserId;
  try {
    bdmUserId = await resolveBdmForCrmPull(req);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }

  const { period, cycle } = req.query;
  if (!period || !cycle) return res.status(400).json({ success: false, message: 'period and cycle are required' });

  const [year, month] = period.split('-').map(Number);
  const startDay = cycle === 'C1' ? 1 : 16;
  const endDay = cycle === 'C1' ? 15 : new Date(year, month, 0).getDate();

  // Pass Manila calendar keys to the bridge so the window is timezone-stable
  // regardless of server TZ (production runs UTC).
  const pad = (n) => String(n).padStart(2, '0');
  const dateKeyFor = (day) => `${year}-${pad(month)}-${pad(day)}`;

  // Phase G1.5 — resolve per-entity × per-role per-diem config BEFORE querying
  // the CRM bridge, so we can pass skip_flagged + source into the aggregation.
  // Phase G1.6 — dispatch source (visit/logbook/manual/none) per subscriber config.
  // May 05 2026 — pipe include_extra_calls through so subscribers can opt out
  // of the yes-equal-weight policy via Control Center → PERDIEM_RATES metadata.
  const perdiemConfig = await resolvePerdiemConfig({ entityId: req.entityId, role: 'BDM' });
  const dailyCounts = await getDailyMdCounts(
    bdmUserId,
    dateKeyFor(startDay),
    dateKeyFor(endDay),
    {
      skipFlagged: perdiemConfig.skip_flagged,
      source: perdiemConfig.eligibility_source,
      includeExtraCalls: perdiemConfig.include_extra_calls,
    }
  );

  const settings = await Settings.getSettings();
  const perdiemRate = perdiemConfig.rate_php;
  const compProfile = await loadBdmCompProfile(bdmUserId, req.entityId);

  // Build daily entries with CRM data
  const DAYS_OF_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const entries = [];

  for (let day = startDay; day <= endDay; day++) {
    // Use UTC constructor so day-of-week is a pure calendar lookup, independent
    // of server TZ. Apr 1 2026 is a Wednesday in every timezone.
    const date = new Date(Date.UTC(year, month - 1, day));
    const dow = date.getUTCDay();
    // Phase G1.5 — weekend policy is lookup-driven via PERDIEM_RATES.allow_weekend.
    // Pharma default: false (skip Sat/Sun). Non-pharma subscribers flip via Control Center.
    if (!perdiemConfig.allow_weekend && (dow === 0 || dow === 6)) continue;

    const dateKey = dateKeyFor(day);
    const crmData = dailyCounts[dateKey] || { md_count: 0, unique_doctors: 0, flagged_excluded: 0 };
    // Phase G1.6 — pass perdiemConfig so per-role thresholds apply (CompProfile > PERDIEM_RATES > Settings).
    const { tier, amount } = computePerdiemAmount(crmData.md_count, perdiemRate, settings, compProfile, perdiemConfig);

    entries.push({
      day,
      entry_date: dateKey,
      day_of_week: DAYS_OF_WEEK[dow],
      md_count: crmData.md_count,
      unique_doctors: crmData.unique_doctors,
      flagged_excluded: crmData.flagged_excluded || 0,
      locations: crmData.locations || '',
      perdiem_tier: tier,
      perdiem_amount: amount,
      source: 'CRM' // indicates data came from CRM visit logs
    });
  }

  res.json({
    success: true,
    data: {
      period,
      cycle,
      perdiem_rate: perdiemRate,
      // Phase G1.5 follow-up — surface the resolved data source so the UI can
      // adjust button labels ("Pull from CRM" vs "Pull from Logbook") and so a
      // non-zero flagged_excluded total tells the BDM why their pull undercounts.
      eligibility_source: perdiemConfig.eligibility_source,
      skip_flagged: !!perdiemConfig.skip_flagged,
      include_extra_calls: !!perdiemConfig.include_extra_calls,
      daily_entries: entries,
      total_md_visits: entries.reduce((s, e) => s + e.md_count, 0),
      total_perdiem: entries.reduce((s, e) => s + e.perdiem_amount, 0),
      total_flagged_excluded: entries.reduce((s, e) => s + (e.flagged_excluded || 0), 0),
      full_days: entries.filter(e => e.perdiem_tier === 'FULL').length,
      half_days: entries.filter(e => e.perdiem_tier === 'HALF').length,
      zero_days: entries.filter(e => e.perdiem_tier === 'ZERO').length
    }
  });
});

/**
 * GET /expenses/smer/crm-visits/:date
 * Returns detailed visit info for a specific date (drill-down from SMER daily entry).
 * Shows which MDs were visited, with names and engagement types.
 */
const getSmerCrmVisitDetail = catchAsync(async (req, res) => {
  const { date } = req.params;
  if (!date) return res.status(400).json({ success: false, message: 'date is required' });

  // Same resolver as getSmerCrmMdCounts — privileged must pass bdm_id;
  // CONTRACTOR proxy must hold expenses.smer_proxy.
  let bdmUserId;
  try {
    bdmUserId = await resolveBdmForCrmPull(req);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }

  // Phase G1.6 — resolve source so drill-down reads from the correct backing store
  // (CRM Visit for pharma; CarLogbook for non-pharma). No fallback: if the lookup
  // row is missing the resolver throws, matching Rule #21 (no silent zero).
  // May 05 2026 — pipe include_extra_calls so drill-down matches the count.
  const drillConfig = await resolvePerdiemConfig({ entityId: req.entityId, role: 'BDM' });
  const visits = await getDailyVisitDetails(bdmUserId, date, {
    source: drillConfig.eligibility_source,
    includeExtraCalls: drillConfig.include_extra_calls,
  });

  res.json({
    success: true,
    data: {
      date,
      md_count: visits.length,
      visits: visits.map(v => ({
        doctor_id: v.doctor?._id,
        doctor_name: v.doctor ? `${v.doctor.firstName} ${v.doctor.lastName}` : 'Unknown',
        specialization: v.doctor?.specialization,
        address: v.doctor?.clinicOfficeAddress,
        visit_time: v.visitDate,
        visit_type: v.visitType,
        engagement_types: v.engagementTypes,
        week_label: v.weekLabel
      }))
    }
  });
});

// ═══════════════════════════════════════════
// PENDING PARTNER REBATES (for PRF auto-fill)
// ═══════════════════════════════════════════

/**
 * GET /expenses/prf-calf/pending-rebates
 * Returns partners with unpaid rebates from POSTED Collections.
 * Aggregates by partner (doctor_id) across all POSTED collections,
 * subtracts any POSTED PRFs for that partner to get remaining balance.
 */
const getPendingPartnerRebates = catchAsync(async (req, res) => {
  const Collection = require('../models/Collection');

  // Phase G4.5e — widen so eligible proxies see POSTED collections for BDMs
  // they file on behalf of (lets Judy/Jay Ann generate PRFs for partner rebates
  // accumulated on field-BDM collections). Reuses PRF_CALF proxy sub-perm.
  const scope = await widenFilterForProxy(req, 'expenses', PRF_CALF_PROXY_OPTS);

  // Get all POSTED collections for this BDM with partner tags
  const collections = await Collection.find({
    ...scope,
    status: 'POSTED',
    'settled_csis.partner_tags.0': { $exists: true }
  }).lean();

  // Aggregate rebates by partner
  const partnerMap = {};
  for (const col of collections) {
    for (const csi of col.settled_csis || []) {
      for (const tag of csi.partner_tags || []) {
        if (!tag.rebate_amount || tag.rebate_amount <= 0) continue;
        const key = tag.doctor_id?.toString() || tag.doctor_name;
        if (!partnerMap[key]) {
          partnerMap[key] = {
            doctor_id: tag.doctor_id,
            doctor_name: tag.doctor_name,
            total_rebate: 0,
            collections: []
          };
        }
        partnerMap[key].total_rebate += tag.rebate_amount;
        partnerMap[key].collections.push({
          collection_id: col._id,
          cr_no: col.cr_no,
          cr_date: col.cr_date,
          doc_ref: csi.doc_ref,
          rebate_pct: tag.rebate_pct,
          rebate_amount: tag.rebate_amount
        });
      }
    }
  }

  // Phase G4.5e — Subtract POSTED PRFs for each partner + capture last known
  // bank details. Reuse the same widened scope so proxies see the PRF history
  // of the BDMs they file on behalf of.
  const allPrfs = await PrfCalf.find({
    ...scope,
    doc_type: 'PRF',
    prf_type: { $ne: 'PERSONAL_REIMBURSEMENT' }
  }).sort({ created_at: -1 }).lean();

  for (const prf of allPrfs) {
    const key = prf.partner_id?.toString() || prf.payee_name;
    if (!partnerMap[key]) continue;

    if (prf.status === 'POSTED') {
      partnerMap[key].total_rebate -= (prf.rebate_amount || 0);
      partnerMap[key].paid = (partnerMap[key].paid || 0) + (prf.rebate_amount || 0);
    } else if (['DRAFT', 'VALID'].includes(prf.status)) {
      partnerMap[key].pending_prf = (partnerMap[key].pending_prf || 0) + (prf.rebate_amount || 0);
    }

    // Capture last known bank details (from most recent PRF with bank info)
    if (!partnerMap[key].last_bank && prf.partner_bank) {
      partnerMap[key].last_bank = {
        partner_bank: prf.partner_bank,
        partner_account_name: prf.partner_account_name,
        partner_account_no: prf.partner_account_no
      };
    }
  }

  // Filter to only partners with remaining balance > 0
  const pending = Object.values(partnerMap)
    .filter(p => p.total_rebate > 0.01)
    .map(p => ({
      ...p,
      total_rebate: Math.round(p.total_rebate * 100) / 100,
      paid: Math.round((p.paid || 0) * 100) / 100,
      pending_prf: Math.round((p.pending_prf || 0) * 100) / 100,
      remaining: Math.round(p.total_rebate * 100) / 100
    }))
    .sort((a, b) => b.remaining - a.remaining);

  res.json({ success: true, data: pending });
});

/**
 * GET /expenses/prf-calf/pending-calf
 * Returns company-funded items needing CALF documentation:
 * 1. ACCESS expense lines (non-cash: credit card, GCash, bank transfer)
 * 2. Car Logbook fuel entries (Shell Fleet Card, company credit card — non-cash)
 */
const getPendingCalfLines = catchAsync(async (req, res) => {
  const pending = [];

  // Phase G4.5e — widen so eligible proxies see pending CALF lines across the
  // BDMs they file on behalf of. Reuses the PRF_CALF proxy sub-perm because
  // this is the CALF auto-link surface.
  const scope = await widenFilterForProxy(req, 'expenses', PRF_CALF_PROXY_OPTS);

  // 1. ACCESS expense lines needing CALF
  const expenses = await ExpenseEntry.find({
    ...scope,
    'lines.calf_required': true
  }).lean();

  for (const exp of expenses) {
    const accessLines = (exp.lines || []).filter(l => l.calf_required && !l.calf_id);
    if (!accessLines.length) continue;

    pending.push({
      source: 'ACCESS',
      source_id: exp._id,
      source_model: 'ExpenseEntry',
      period: exp.period,
      cycle: exp.cycle,
      status: exp.status,
      total_amount: Math.round(accessLines.reduce((s, l) => s + (l.amount || 0), 0) * 100) / 100,
      line_count: accessLines.length,
      lines: accessLines.map(l => ({
        _id: l._id,
        date: l.expense_date,
        description: l.establishment || l.particulars,
        amount: l.amount,
        payment_mode: l.payment_mode,
        funding_card_id: l.funding_card_id || null,
        funding_account_id: l.funding_account_id || null,
        or_photo_url: l.or_photo_url || null
      }))
    });
  }

  // 2. Car Logbook fuel entries paid with company funds (non-cash)
  //    Reuse the same widened scope so proxies see target-BDM logbooks too.
  const COMPANY_FUEL_MODES = ['FLEET_CARD', 'CARD', 'GCASH'];
  const logbooks = await CarLogbookEntry.find({
    ...scope,
    'fuel_entries.payment_mode': { $in: COMPANY_FUEL_MODES }
  }).lean();

  for (const lb of logbooks) {
    const companyFuel = (lb.fuel_entries || []).filter(f => COMPANY_FUEL_MODES.includes(f.payment_mode) && !f.calf_id);
    if (!companyFuel.length) continue;

    pending.push({
      source: 'FUEL',
      source_id: lb._id,
      source_model: 'CarLogbookEntry',
      period: lb.period,
      cycle: lb.cycle,
      status: lb.status,
      entry_date: lb.entry_date,
      total_amount: Math.round(companyFuel.reduce((s, f) => s + ((f.liters || 0) * (f.price_per_liter || 0)), 0) * 100) / 100,
      line_count: companyFuel.length,
      lines: companyFuel.map(f => ({
        _id: f._id,
        date: lb.entry_date,
        description: `${f.station_name || 'Gas'} — ${f.liters}L ${f.fuel_type || ''}`,
        amount: Math.round((f.liters || 0) * (f.price_per_liter || 0) * 100) / 100,
        payment_mode: f.payment_mode
      }))
    });
  }

  // Phase G4.5e — Filter out items that already have CALF linked. Reuse the
  // proxy-widened scope so the dedup set correctly reflects target BDMs' CALFs.
  const existingCalfs = await PrfCalf.find({
    ...scope,
    doc_type: 'CALF',
    linked_expense_id: { $exists: true }
  }).lean();
  const calfedIds = new Set(existingCalfs.map(c => c.linked_expense_id?.toString()));
  const filtered = pending.filter(p => !calfedIds.has(p.source_id.toString()));

  res.json({ success: true, data: filtered });
});

// ═══════════════════════════════════════════
// BATCH UPLOAD (President / Admin only)
// ═══════════════════════════════════════════

/**
 * Process multiple OR images via OCR + classify each → return preview lines (NOT saved).
 * Expects multipart: photos[] (up to 20), bir_flag, assigned_to, period, cycle
 */
const batchUploadExpenses = catchAsync(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'At least one photo is required.' });
  }

  // Read ASSORTED_THRESHOLD from Settings (admin-configurable, default 3)
  const settings = await Settings.getSettings();
  const ASSORTED_THRESHOLD = settings.ASSORTED_THRESHOLD ?? 3;

  const { bir_flag = 'BOTH', assigned_to, period, cycle, category_override, payment_mode: batchPaymentMode, funding_card_id, funding_account_id, cost_center_id } = req.body;
  const lines = [];
  const errors = [];

  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    try {
      // 1. Compress before S3 upload (saves storage), OCR uses original for best quality
      const { buffer: compressedBuffer, mimetype: compressedMime } = await compressImage(
        file.buffer, file.mimetype, { maxDim: 1920, quality: 80 }
      );
      const uploadResult = await uploadErpDocument(
        compressedBuffer, file.originalname,
        req.user?.name, period, cycle, 'OR', compressedMime
      );

      // 2. OCR (uses original buffer for best quality)
      const ocrResult = await detectText(file.buffer);
      const processed = await processOcr('OR', ocrResult, {});

      // 3. Classify COA
      const classification = processed.classification || await classifyExpense(processed.extracted || {});

      // 4. Create DocumentAttachment
      // #19 Hardening: surface attachment creation errors instead of swallowing silently
      let attachmentId = null;
      let attachmentWarning = null;
      try {
        const att = await DocumentAttachment.create({
          entity_id: req.entityId,
          bdm_id: assigned_to || req.user._id,
          document_type: 'OR',
          ocr_applied: true,
          storage_url: uploadResult.url,
          s3_key: uploadResult.key,
          original_filename: file.originalname,
          uploaded_by: req.user._id
        });
        attachmentId = att._id;
      } catch (err) {
        console.error('DocumentAttachment creation failed:', err.message);
        attachmentWarning = `Attachment record failed for "${file.originalname}": ${err.message}. S3 file uploaded but not tracked — re-upload or create attachment manually.`;
        errors.push({ index: i, filename: file.originalname, error: attachmentWarning, type: 'ATTACHMENT_FAILED' });
      }

      const ext = processed.extracted || {};

      // 5. Assorted items check
      const lineItems = ext.line_items?.value || ext.line_items || [];
      const isAssorted = Array.isArray(lineItems) && lineItems.length >= ASSORTED_THRESHOLD;

      const establishment = isAssorted
        ? 'Assorted Items'
        : (classification?.vendor_name || ext.supplier_name?.value || ext.supplier_name || '');

      // 6. Determine expense type based on funding
      const expenseType = (funding_card_id || funding_account_id || (batchPaymentMode && batchPaymentMode !== 'CASH')) ? 'ACCESS' : 'ORE';
      const resolvedPaymentMode = batchPaymentMode || ext.payment_mode?.value || ext.payment_mode || 'CASH';

      // 7. Build line object
      lines.push({
        _index: i,
        expense_date: ext.date?.value || ext.date || null,
        expense_type: expenseType,
        expense_category: category_override || classification?.expense_category || 'MISCELLANEOUS',
        coa_code: classification?.coa_code || '6900',
        establishment,
        particulars: isAssorted ? `${lineItems.length} items from receipt` : (ext.supplier_name?.value || ''),
        amount: ext.amount?.value ?? ext.amount ?? 0,
        vat_amount: classification?.vat_amount ?? ext.vat_amount?.value ?? ext.vat_amount ?? 0,
        or_number: ext.or_number?.value || ext.or_number || '',
        or_photo_url: uploadResult.url,
        or_attachment_id: attachmentId,
        payment_mode: resolvedPaymentMode,
        funding_card_id: funding_card_id || null,
        funding_account_id: funding_account_id || null,
        cost_center_id: cost_center_id || null,
        bir_flag,
        is_assorted: isAssorted,
        _classification: classification,
        _ocr_confidence: processed.confidence || null,
        _original_filename: file.originalname,
        _attachment_warning: attachmentWarning || null
      });
    } catch (err) {
      console.error(`Batch OCR failed for image ${i}:`, err.message);
      errors.push({ index: i, filename: file.originalname, error: err.message });
    }
  }

  const assortedCount = lines.filter(l => l.is_assorted).length;
  const totalAmount = lines.reduce((sum, l) => sum + (l.amount || 0), 0);

  res.json({
    success: true,
    data: {
      lines,
      errors,
      summary: {
        total_images: req.files.length,
        processed: lines.length,
        failed: errors.filter(e => e.type !== 'ATTACHMENT_FAILED').length,
        attachment_failures: errors.filter(e => e.type === 'ATTACHMENT_FAILED').length,
        assorted_count: assortedCount,
        total_amount: Math.round(totalAmount * 100) / 100
      }
    }
  });
});

/**
 * Save reviewed batch lines as a single DRAFT ExpenseEntry.
 * Body: { bir_flag, assigned_to, period, cycle, lines: [...] }
 */
const saveBatchExpenses = catchAsync(async (req, res) => {
  const { bir_flag = 'BOTH', assigned_to, period, cycle, lines, funding_card_id, funding_account_id, cost_center_id } = req.body;

  if (!lines || !lines.length) {
    return res.status(400).json({ success: false, message: 'No expense lines to save.' });
  }
  if (!period || !cycle) {
    return res.status(400).json({ success: false, message: 'Period and cycle are required.' });
  }

  // Clean lines — strip preview-only fields
  const cleanLines = lines.map(l => ({
    expense_date: l.expense_date,
    expense_type: l.expense_type || 'ORE',
    expense_category: l.expense_category,
    coa_code: l.coa_code,
    establishment: l.establishment,
    particulars: l.particulars,
    amount: l.amount,
    vat_amount: l.vat_amount,
    or_number: l.or_number,
    or_photo_url: l.or_photo_url,
    or_attachment_id: l.or_attachment_id,
    payment_mode: l.payment_mode || 'CASH',
    funding_card_id: l.funding_card_id || funding_card_id || null,
    funding_account_id: l.funding_account_id || funding_account_id || null,
    cost_center_id: l.cost_center_id || cost_center_id || null,
    bir_flag: l.bir_flag || bir_flag,
    is_assorted: l.is_assorted || false,
    notes: l.notes
  }));

  const bdmId = assigned_to || req.user._id;
  const isOnBehalf = assigned_to && assigned_to !== req.user._id.toString();

  // Phase G4.5c.1 — CALF bypass is president-only (matches the original
  // Phase 18 comment intent; previously leaked to any admin uploader). We
  // still stamp recorded_on_behalf_of = proxy user for audit trail.
  const isPresidentProxy = isOnBehalf && req.user.role === ROLES.PRESIDENT;

  const entry = await ExpenseEntry.create({
    entity_id: req.entityId,
    bdm_id: bdmId,
    recorded_on_behalf_of: isOnBehalf ? req.user._id : undefined,
    calf_override: isPresidentProxy,
    period,
    cycle,
    lines: cleanLines,
    bir_flag,
    status: 'DRAFT',
    created_by: req.user._id
  });

  // Audit trail: log when president/admin uploads on behalf of another BDM
  if (isOnBehalf) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: bdmId,
      log_type: 'BATCH_UPLOAD_ON_BEHALF',
      target_ref: entry._id.toString(),
      target_model: 'ExpenseEntry',
      changed_by: req.user._id,
      note: `Batch upload: ${cleanLines.length} lines assigned to BDM ${bdmId} by ${req.user.name || req.user._id} (${req.user.role})`
    }).catch(err => console.error('[BatchSave] Audit log write failed (non-critical):', err.message));
  }

  res.status(201).json({
    success: true,
    data: entry,
    message: `Batch saved: ${cleanLines.length} expense lines as DRAFT`
  });
});

// ═══════════════════════════════════════════
// REVOLVING FUND — Resolve per-BDM amount
// ═══════════════════════════════════════════

/**
 * Resolve revolving fund amount for the current BDM.
 * CompProfile.revolving_fund_amount (per-person) → Settings.REVOLVING_FUND_AMOUNT (global fallback).
 * 0 in CompProfile means "use global default".
 */
const getRevolvingFundAmount = catchAsync(async (req, res) => {
  const settings = await Settings.getSettings();
  const PeopleMaster = require('../models/PeopleMaster');
  const CompProfile = require('../models/CompProfile');

  let amount = settings.REVOLVING_FUND_AMOUNT || 8000;
  let source = 'SETTINGS';

  const person = await PeopleMaster.findOne({
    user_id: req.bdmId,
    entity_id: req.entityId
  }).select('_id').lean();

  if (person) {
    const comp = await CompProfile.findOne({
      person_id: person._id,
      entity_id: req.entityId,
      status: 'ACTIVE'
    }).sort({ effective_date: -1 }).lean();

    if (comp?.revolving_fund_amount > 0) {
      amount = comp.revolving_fund_amount;
      source = 'COMP_PROFILE';
    }
  }

  res.json({ success: true, data: { amount, source } });
});

// ═══════════════════════════════════════════
// PER DIEM CONFIG — Resolve per-BDM thresholds
// ═══════════════════════════════════════════

/**
 * GET /expenses/perdiem-config
 * Resolve per diem thresholds for the current BDM.
 * CompProfile per-person → PERDIEM_RATES per-role (Phase G1.6) → Settings global fallback.
 * null/undefined at any layer = defer to next. 0 IS a valid override at any layer.
 * Returns: { fullThreshold, halfThreshold, source: 'COMP_PROFILE'|'PERDIEM_RATES'|'SETTINGS' }
 */
const getPerdiemConfig = catchAsync(async (req, res) => {
  const settings = await Settings.getSettings();
  const compProfile = await loadBdmCompProfile(req.bdmId, req.entityId);

  // Phase G1.6 — pull per-role perdiem config (may throw if lookup row is
  // missing for this entity). Caught + swallowed so the display endpoint
  // degrades gracefully when PERDIEM_RATES isn't seeded yet; the strict
  // resolver path (getSmerCrmMdCounts, SMER submit) still enforces it.
  let perdiemConfig;
  try {
    perdiemConfig = await resolvePerdiemConfig({ entityId: req.entityId, role: 'BDM' });
  } catch (_) {
    perdiemConfig = undefined;
  }

  const resolved = resolvePerdiemThresholds(settings, compProfile, perdiemConfig);

  res.json({
    success: true,
    data: {
      fullThreshold: resolved.fullThreshold,
      halfThreshold: resolved.halfThreshold,
      source: resolved.source,
      // Phase G1.5 follow-up — let the SMER page adjust the Pull-from-CRM button
      // label and copy on first load (instead of waiting for the user to click
      // and only then learning the source isn't CRM). Defaults to 'visit' when
      // PERDIEM_RATES isn't seeded, matching the bridge's pharma default.
      eligibility_source: perdiemConfig?.eligibility_source || 'visit',
      skip_flagged: !!perdiemConfig?.skip_flagged
    }
  });
});

// ═══ Single-document posting helpers (called from Approval Hub) ═══

const postSingleSmer = async (doc, userId) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const [event] = await TransactionEvent.create([{
        entity_id: doc.entity_id, bdm_id: doc.bdm_id, event_type: 'SMER',
        event_date: new Date(), document_ref: `SMER-${doc.period}-${doc.cycle}`,
        payload: { smer_id: doc._id, total_reimbursable: doc.total_reimbursable },
        status: 'ACTIVE', created_by: userId
      }], { session });
      doc.status = 'POSTED';
      doc.posted_at = new Date();
      doc.posted_by = userId;
      doc.event_id = event._id;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  // Non-blocking: DocumentAttachments
  // eslint-disable-next-line vip-tenant/require-entity-filter -- source_id is unique; doc fetched by Approval Hub with entity scope
  await DocumentAttachment.updateMany(
    { source_model: 'SmerEntry', source_id: doc._id },
    { $set: { event_id: doc.event_id } }
  ).catch(() => {});

  // Auto-journal (non-blocking)
  try {
    const coaMap = await getCoaMap();
    const lines = [];
    const desc = `SMER ${doc.period}-${doc.cycle}`;
    if (doc.total_perdiem > 0) lines.push({ account_code: coaMap.PER_DIEM || '6100', account_name: 'Per Diem Expense', debit: doc.total_perdiem, credit: 0, description: desc });
    if (doc.total_transpo > 0) lines.push({ account_code: coaMap.TRANSPORT || '6150', account_name: 'Transport Expense', debit: doc.total_transpo, credit: 0, description: desc });
    if (doc.total_special_cases > 0) lines.push({ account_code: coaMap.SPECIAL_TRANSPORT || '6160', account_name: 'Special Transport Expense', debit: doc.total_special_cases, credit: 0, description: desc });
    if (doc.total_ore > 0) lines.push({ account_code: coaMap.OTHER_REIMBURSABLE || '6170', account_name: 'Other Reimbursable Expense', debit: doc.total_ore, credit: 0, description: desc });
    if (lines.length > 0) {
      lines.push({ account_code: coaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: doc.total_reimbursable, description: desc, is_contra: true });
      await createAndPostJournal(doc.entity_id, {
        je_date: doc.posted_at, period: doc.period, description: `SMER: ${desc}`,
        source_module: 'EXPENSE', source_event_id: doc.event_id, source_doc_ref: `SMER-${doc.period}-${doc.cycle}`,
        lines, bir_flag: 'BOTH', vat_flag: 'N/A', bdm_id: doc.bdm_id, created_by: userId
      });
    }
  } catch (jeErr) { console.error('[AUTO_JOURNAL_FAILURE] SMER (approval hub)', String(doc._id), jeErr.message); }
};

const postSingleCarLogbook = async (doc, userId) => {
  // Phase 33: `doc` may be a CarLogbookCycle wrapper (preferred) OR a legacy
  // per-day CarLogbookEntry (backward-compat path). We branch on collection.
  const isCycle = doc.constructor && doc.constructor.modelName === 'CarLogbookCycle';

  if (isCycle) {
    // Fetch all VALID per-day entries belonging to this cycle
    const days = await CarLogbookEntry.find({
      entity_id: doc.entity_id,
      bdm_id: doc.bdm_id,
      period: doc.period,
      cycle: doc.cycle,
      status: { $in: ['VALID', 'POSTED'] }
    });
    // Refresh header totals from the per-day docs (in case nothing changed since validate)
    if (typeof doc.refreshTotalsFromDays === 'function') await doc.refreshTotalsFromDays();

    const docRef = `LOGBOOK-${doc.period}-${doc.cycle}`;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const [event] = await TransactionEvent.create([{
          entity_id: doc.entity_id, bdm_id: doc.bdm_id, event_type: 'CAR_LOGBOOK',
          event_date: new Date(), document_ref: docRef,
          payload: { cycle_id: doc._id, period: doc.period, cycle: doc.cycle, working_days: doc.working_days, total_km: doc.total_km, total_fuel: doc.total_fuel_amount },
          status: 'ACTIVE', created_by: userId
        }], { session });
        doc.status = 'POSTED';
        doc.posted_at = new Date();
        doc.posted_by = userId;
        doc.event_id = event._id;
        await doc.save({ session });
        for (const d of days) {
          d.status = 'POSTED';
          d.posted_at = new Date();
          d.posted_by = userId;
          d.event_id = event._id;
          d.cycle_id = doc._id;
          await d.save({ session });
        }
      });
    } finally { session.endSession(); }

    // eslint-disable-next-line vip-tenant/require-entity-filter -- source_id is unique; days fetched within entity scope at top of branch
    await DocumentAttachment.updateMany(
      { source_model: 'CarLogbookEntry', source_id: { $in: days.map(d => d._id) } },
      { $set: { event_id: doc.event_id } }
    ).catch(() => {});
    // eslint-disable-next-line vip-tenant/require-entity-filter -- source_id is unique; doc fetched by Approval Hub with entity scope
    await DocumentAttachment.updateMany(
      { source_model: 'CarLogbookCycle', source_id: doc._id },
      { $set: { event_id: doc.event_id } }
    ).catch(() => {});

    // ONE journal entry for the whole cycle
    try {
      if (doc.total_fuel_amount > 0) {
        const coaMap = await getCoaMap();
        let cashTotal = 0, fundedTotal = 0, fundedCoa = null;
        for (const d of days) {
          for (const fuel of (d.fuel_entries || [])) {
            if (!fuel.payment_mode || fuel.payment_mode === 'CASH') cashTotal += fuel.total_amount || 0;
            else { fundedTotal += fuel.total_amount || 0; if (!fundedCoa) fundedCoa = await resolveFundingCoa(fuel); }
          }
        }
        const jeDesc = `Car Logbook ${doc.period} ${doc.cycle}`;
        const lines = [];
        const totalFuel = cashTotal + fundedTotal;
        if (totalFuel > 0) lines.push({ account_code: coaMap.FUEL_GAS || '6200', account_name: 'Fuel & Gas Expense', debit: totalFuel, credit: 0, description: jeDesc });
        if (cashTotal > 0) lines.push({ account_code: coaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: cashTotal, description: jeDesc, is_contra: true });
        if (fundedTotal > 0 && fundedCoa) {
          const fundedIsContra = /^[156]/.test(String(fundedCoa.coa_code || ''));
          lines.push({ account_code: fundedCoa.coa_code, account_name: fundedCoa.coa_name, debit: 0, credit: fundedTotal, description: jeDesc, is_contra: fundedIsContra });
        }
        if (lines.length >= 2) {
          await createAndPostJournal(doc.entity_id, {
            je_date: new Date(), period: doc.period, description: jeDesc,
            source_module: 'EXPENSE', source_event_id: doc.event_id, source_doc_ref: docRef,
            lines, bir_flag: 'BOTH', vat_flag: 'N/A', bdm_id: doc.bdm_id, created_by: userId
          });
        }
      }
    } catch (jeErr) { console.error('[AUTO_JOURNAL_FAILURE] CarLogbookCycle (approval hub)', String(doc._id), jeErr.message); }
    return;
  }

  // ──────────────── Legacy per-day path (backward-compat) ────────────────
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const [event] = await TransactionEvent.create([{
        entity_id: doc.entity_id, bdm_id: doc.bdm_id, event_type: 'CAR_LOGBOOK',
        event_date: doc.entry_date, document_ref: `LOGBOOK-${doc.period}-${doc.entry_date.toISOString().split('T')[0]}`,
        payload: { logbook_id: doc._id, total_km: doc.total_km, total_fuel: doc.total_fuel_amount },
        status: 'ACTIVE', created_by: userId
      }], { session });
      doc.status = 'POSTED';
      doc.posted_at = new Date();
      doc.posted_by = userId;
      doc.event_id = event._id;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  // eslint-disable-next-line vip-tenant/require-entity-filter -- source_id is unique; doc fetched by Approval Hub with entity scope (legacy per-day path)
  await DocumentAttachment.updateMany(
    { source_model: 'CarLogbookEntry', source_id: doc._id },
    { $set: { event_id: doc.event_id } }
  ).catch(() => {});

  try {
    if (doc.total_fuel_amount > 0) {
      const coaMap = await getCoaMap();
      let cashTotal = 0, fundedTotal = 0, fundedCoa = null;
      for (const fuel of (doc.fuel_entries || [])) {
        if (!fuel.payment_mode || fuel.payment_mode === 'CASH') { cashTotal += fuel.total_amount || 0; }
        else { fundedTotal += fuel.total_amount || 0; if (!fundedCoa) fundedCoa = await resolveFundingCoa(fuel); }
      }
      const desc = `Logbook ${doc.period} ${doc.entry_date.toISOString().split('T')[0]}`;
      const lines = [];
      const totalFuel = cashTotal + fundedTotal;
      if (totalFuel > 0) lines.push({ account_code: coaMap.FUEL_GAS || '6200', account_name: 'Fuel & Gas Expense', debit: totalFuel, credit: 0, description: desc });
      if (cashTotal > 0) lines.push({ account_code: coaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: cashTotal, description: desc, is_contra: true });
      if (fundedTotal > 0 && fundedCoa) {
        const fundedIsContra = /^[156]/.test(String(fundedCoa.coa_code || ''));
        lines.push({ account_code: fundedCoa.coa_code, account_name: fundedCoa.coa_name, debit: 0, credit: fundedTotal, description: desc, is_contra: fundedIsContra });
      }
      if (lines.length >= 2) {
        await createAndPostJournal(doc.entity_id, {
          je_date: doc.entry_date || new Date(), period: doc.period, description: `Car Logbook: ${desc}`,
          source_module: 'EXPENSE', source_event_id: doc.event_id, source_doc_ref: `LOGBOOK-${doc.period}-${doc.entry_date.toISOString().split('T')[0]}`,
          lines, bir_flag: 'BOTH', vat_flag: 'N/A', bdm_id: doc.bdm_id, created_by: userId
        });
      }
    }
  } catch (jeErr) { console.error('[AUTO_JOURNAL_FAILURE] CarLogbookEntry legacy (approval hub)', String(doc._id), jeErr.message); }
};

const postSingleExpense = async (doc, userId) => {
  // Auto-resolve COA codes before posting (approval hub path)
  await autoClassifyLines(doc.lines, doc.entity_id);
  await doc.save();

  // Phase G4.5h — defense-in-depth. ACCESS-bearing expenses should never reach
  // postSingleExpense (submitExpenses rejects them upstream). If one does,
  // something escaped the redirect — fail loudly so the one-ack cascade
  // contract isn't silently violated.
  for (const line of (doc.lines || [])) {
    if (line.calf_required && line.calf_id) {
      // eslint-disable-next-line vip-tenant/require-entity-filter -- calf_id stored on entry by createPrfCalf back-link (same-entity enforced); doc from Approval Hub
      const calf = await PrfCalf.findById(line.calf_id).select('status calf_number').lean();
      if (!calf || calf.status !== 'POSTED') {
        throw new Error(
          `ACCESS expense reached the approval hub with an unposted CALF (${calf?.calf_number || calf?._id || 'NOT_FOUND'}). Phase G4.5h routes ACCESS expenses via their CALF — acknowledge the CALF instead.`
        );
      }
    }
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const [event] = await TransactionEvent.create([{
        entity_id: doc.entity_id, bdm_id: doc.bdm_id, event_type: 'EXPENSE',
        event_date: new Date(), document_ref: `EXP-${doc.period}-${doc.cycle}`,
        payload: { expense_id: doc._id, total_amount: doc.total_amount, ore: doc.total_ore, access: doc.total_access },
        status: 'ACTIVE', created_by: userId
      }], { session });
      doc.status = 'POSTED';
      doc.posted_at = new Date();
      doc.posted_by = userId;
      doc.event_id = event._id;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  // eslint-disable-next-line vip-tenant/require-entity-filter -- source_id is unique; doc fetched by Approval Hub with entity scope
  await DocumentAttachment.updateMany(
    { source_model: 'ExpenseEntry', source_id: doc._id },
    { $set: { event_id: doc.event_id } }
  ).catch(() => {});

  try {
    const coaMap = await getCoaMap();
    const lines = [];
    const desc = `EXP ${doc.period}-${doc.cycle}`;
    let creditOre = 0, creditAccess = 0, accessCoa = null;
    for (const line of (doc.lines || [])) {
      const amt = line.amount || 0;
      if (amt <= 0) continue;
      lines.push({ account_code: line.coa_code || coaMap.MISC_EXPENSE || '6900', account_name: line.expense_category || 'Miscellaneous Expense', debit: amt, credit: 0, description: line.establishment || desc });
      if (line.expense_type === 'ACCESS') { creditAccess += amt; if (!accessCoa) accessCoa = await resolveFundingCoa(line, coaMap.AP_TRADE || '2000'); }
      else { creditOre += amt; }
    }
    if (creditOre > 0) lines.push({ account_code: coaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: creditOre, description: desc, is_contra: true });
    if (creditAccess > 0) {
      const coa = accessCoa || { coa_code: coaMap.AP_TRADE || '2000', coa_name: 'Accounts Payable — Trade' };
      const isContra = /^[156]/.test(String(coa.coa_code || ''));
      lines.push({ account_code: coa.coa_code, account_name: coa.coa_name, debit: 0, credit: creditAccess, description: desc, is_contra: isContra });
    }
    if (lines.length >= 2) {
      await createAndPostJournal(doc.entity_id, {
        je_date: doc.posted_at || new Date(), period: doc.period, description: `Expenses: ${desc}`,
        source_module: 'EXPENSE', source_event_id: doc.event_id, source_doc_ref: `EXP-${doc.period}-${doc.cycle}`,
        lines, bir_flag: doc.bir_flag || 'BOTH', vat_flag: 'N/A', bdm_id: doc.bdm_id, created_by: userId
      });
    }
  } catch (jeErr) { console.error('[AUTO_JOURNAL_FAILURE] ExpenseEntry (approval hub)', String(doc._id), jeErr.message); }

  // Phase VIP-1.J / J2 — emit WithholdingLedger rows. Best-effort, see
  // emitEwtForExpense for non-fatal failure handling.
  await emitEwtForExpense(doc, userId);
};

// Phase G4.5h — One-Acknowledge cascade. Matches the GRN→UT gold standard at
// undertakingController.js:245 (`postSingleUndertaking`): a single president
// click posts the CALF AND the linked Expense/Car Logbook in one MongoDB
// session.withTransaction. If the source document fails re-validation the
// whole transaction rolls back — CALF stays DRAFT/VALID, no half-posted state.
// (Before G4.5h, source=ERROR + CALF=POSTED was possible and required manual
// reconciliation.) Auto-journal failures remain non-fatal and are captured in
// [AUTO_JOURNAL_FAILURE] logs so repostMissingJEs.js can backfill.
const postSinglePrfCalf = async (doc, userId) => {
  const session = await mongoose.startSession();
  // Phase VIP-1.J / J2 — capture cascaded source so its EWT can be emitted
  // AFTER the withTransaction commits. Keeps the transaction tight (no
  // best-effort writes inside) and mirrors the standalone post path's
  // post-transaction emit cadence.
  let cascadedExpenseSource = null;
  try {
    await session.withTransaction(async () => {
      // 1) Post the CALF/PRF itself — status + event
      const [event] = await TransactionEvent.create([{
        entity_id: doc.entity_id, bdm_id: doc.bdm_id, event_type: doc.doc_type,
        event_date: new Date(), document_ref: `${doc.doc_type}-${doc.prf_number || doc.calf_number || doc.period}`,
        payload: {
          prf_calf_id: doc._id, doc_type: doc.doc_type, amount: doc.amount,
          ...(doc.doc_type === 'PRF' && { payee_name: doc.payee_name, partner_bank: doc.partner_bank, rebate_amount: doc.rebate_amount }),
          ...(doc.doc_type === 'CALF' && { advance_amount: doc.advance_amount, liquidation_amount: doc.liquidation_amount, balance: doc.balance })
        },
        status: 'ACTIVE', created_by: userId
      }], { session });
      doc.status = 'POSTED';
      doc.posted_at = new Date();
      doc.posted_by = userId;
      doc.event_id = event._id;
      await doc.save({ session });

      // 2) CALF/PRF auto-journal (non-fatal — repostMissingJEs.js backfills)
      try {
        const jeData = await journalFromPrfCalf(doc, userId);
        if (jeData) {
          jeData.source_event_id = doc.event_id;
          await createAndPostJournal(doc.entity_id, jeData, { session });
        }
      } catch (jeErr) {
        console.error('[AUTO_JOURNAL_FAILURE] PrfCalf (approval hub)', String(doc._id), jeErr.message);
      }

      // 3) Cascade — post the linked Expense/CarLogbook in the SAME session
      if (doc.doc_type !== 'CALF' || !doc.linked_expense_id) return;

      // eslint-disable-next-line vip-tenant/require-entity-filter -- linked_expense_id from doc (Approval Hub fetched with entity scope); CALF→source link verified at link time
      let source = await ExpenseEntry.findById(doc.linked_expense_id).session(session);
      let sourceType = 'EXPENSE';
      if (!source) {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- linked_expense_id from doc (Approval Hub fetched with entity scope)
        source = await CarLogbookEntry.findById(doc.linked_expense_id).session(session);
        sourceType = 'CARLOGBOOK';
      }
      if (!source || source.status === 'POSTED') return;

      // Re-validate
      const valErrors = [];
      if (sourceType === 'EXPENSE') {
        await autoClassifyLines(source.lines, source.entity_id);
        if (!source.lines.length) valErrors.push('No expense lines');
        for (let i = 0; i < source.lines.length; i++) {
          const l = source.lines[i];
          if (!l.expense_date) valErrors.push(`Line ${i + 1}: date required`);
          if (!l.amount || l.amount <= 0) valErrors.push(`Line ${i + 1}: amount required`);
          if (!l.establishment) valErrors.push(`Line ${i + 1}: establishment required`);
          if (!l.coa_code || l.coa_code === '6900') valErrors.push(`Line ${i + 1}: COA code missing or Miscellaneous (6900)`);
        }
      } else {
        if (!source.entry_date) valErrors.push('Entry date required');
        if (source.ending_km < source.starting_km) valErrors.push('Ending KM < Starting KM');
      }

      if (valErrors.length) {
        // Phase G4.5h — throw to roll back the whole transaction. Matches
        // GRN→UT: if approveGrnCore rejects (e.g. missing waybill,
        // inventoryController.js:762), the UT acknowledge rolls back too.
        const cascadeErr = new Error(
          `Cannot acknowledge CALF — linked ${sourceType === 'EXPENSE' ? 'expense' : 'car logbook'} has validation errors: ${valErrors.join('; ')}`
        );
        cascadeErr.statusCode = 400;
        cascadeErr.cascadeErrors = valErrors;
        throw cascadeErr;
      }

      source.status = 'POSTED';
      source.posted_at = new Date();
      source.posted_by = userId;
      source.validation_errors = [];
      const [sourceEvent] = await TransactionEvent.create([{
        entity_id: source.entity_id, bdm_id: source.bdm_id,
        event_type: sourceType === 'EXPENSE' ? 'EXPENSE' : 'CAR_LOGBOOK',
        event_date: new Date(),
        document_ref: sourceType === 'EXPENSE'
          ? `EXP-${source.period}-${source.cycle}`
          : `LOGBOOK-${source.period}-${source.entry_date?.toISOString().split('T')[0] || ''}`,
        status: 'ACTIVE', created_by: userId
      }], { session });
      source.event_id = sourceEvent._id;
      await source.save({ session });

      // Source auto-journal (non-fatal, same rationale as CALF JE above)
      try {
        const autoCoaMap = await getCoaMap();
        if (sourceType === 'EXPENSE') {
          const jLines = [];
          let totalOre = 0, totalAccess = 0;
          const desc = `EXP-${source.period}-${source.cycle}`;
          for (const line of source.lines) {
            jLines.push({ account_code: line.coa_code || autoCoaMap.MISC_EXPENSE || '6900', account_name: line.expense_category || 'Miscellaneous', debit: line.amount, credit: 0, description: desc });
            if (line.expense_type === 'ORE') totalOre += line.amount || 0;
            else totalAccess += line.amount || 0;
          }
          if (totalOre > 0) jLines.push({ account_code: autoCoaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: totalOre, description: desc, is_contra: true });
          if (totalAccess > 0) {
            const funding = await resolveFundingCoa(source.lines.find(l => l.expense_type === 'ACCESS') || source, autoCoaMap.AP_TRADE);
            const isContra = /^[156]/.test(String(funding.coa_code || ''));
            jLines.push({ account_code: funding.coa_code, account_name: funding.coa_name, debit: 0, credit: totalAccess, description: desc, is_contra: isContra });
          }
          if (jLines.length >= 2) {
            await createAndPostJournal(source.entity_id, {
              je_date: source.posted_at, period: source.period, description: `Expenses: ${desc}`,
              source_module: 'EXPENSE', source_event_id: source.event_id, source_doc_ref: desc,
              lines: jLines, bir_flag: source.bir_flag || 'BOTH', vat_flag: 'N/A', bdm_id: source.bdm_id, created_by: userId
            }, { session });
          }
        } else {
          const fuelTotal = source.official_gas_amount || source.total_fuel_amount || 0;
          if (fuelTotal > 0) {
            const funding = await resolveFundingCoa(source.fuel_entries?.[0] || source);
            await createAndPostJournal(source.entity_id, {
              je_date: source.posted_at, period: source.period, description: `Car Logbook: ${source.period}`,
              source_module: 'EXPENSE', source_event_id: source.event_id,
              source_doc_ref: `LOGBOOK-${source.period}`,
              lines: [
                { account_code: autoCoaMap.FUEL_GAS || '6200', account_name: 'Fuel & Gas', debit: fuelTotal, credit: 0, description: `Car Logbook: ${source.period}` },
                { account_code: funding.coa_code, account_name: funding.coa_name, debit: 0, credit: fuelTotal, description: `Car Logbook: ${source.period}`, is_contra: /^[156]/.test(String(funding.coa_code || '')) }
              ],
              bir_flag: 'BOTH', vat_flag: 'N/A', bdm_id: source.bdm_id, created_by: userId
            }, { session });
          }
        }
      } catch (srcJeErr) {
        console.error('[AUTO_JOURNAL_FAILURE] CALF-cascade source', String(source._id), srcJeErr.message);
      }

      // Capture for post-transaction EWT emit. The withTransaction scope
      // intentionally excludes best-effort writes (mirrors how VAT writes
      // happen alongside JE creation, not as part of the same atomic txn).
      if (sourceType === 'EXPENSE') {
        cascadedExpenseSource = source;
      }
    });
  } finally { session.endSession(); }

  // Phase VIP-1.J / J2 — emit EWT for the cascaded source EXPENSE after the
  // CALF transaction commits. Best-effort, idempotent (delete-by-event then
  // re-insert) so a re-acknowledge replays cleanly.
  if (cascadedExpenseSource) {
    await emitEwtForExpense(cascadedExpenseSource, userId);
  }

  // Post-transaction: link DocumentAttachments to the CALF event (non-critical)
  // eslint-disable-next-line vip-tenant/require-entity-filter -- source_id is unique; doc fetched by Approval Hub with entity scope
  await DocumentAttachment.updateMany(
    { source_model: 'PrfCalf', source_id: doc._id },
    { $set: { event_id: doc.event_id } }
  ).catch(() => {});

  // Phase VIP-1.J / J2 — rent-line PRFs emit a 1606 WithholdingLedger row
  // when entity.rent_withholding_active is true. PRFs without atc_code
  // short-circuit before any DB read. CALF docs are skipped (advances
  // aren't payee payments). Cascade-EXPENSE rows below are emitted via
  // their own emitEwtForExpense call.
  await emitEwtForPrfRent(doc, userId);
};

// President-only: SAP Storno reversal for Expenses (ORE/ACCESS), CALF, and PRF.
// CALF clears non-POSTED expense calf_id links; PRF clears Collection rebate_prf_id.
// Idempotent JE reversal; period-locked landing month rejected.
const { buildPresidentReverseHandler } = require('../services/documentReversalService');
const presidentReverseExpense = buildPresidentReverseHandler('EXPENSE');
const _reverseCalfHandler = buildPresidentReverseHandler('CALF');
const _reversePrfHandler = buildPresidentReverseHandler('PRF');

// PRF and CALF share the same Mongoose model (PrfCalf) with a `doc_type`
// discriminator. Rather than forcing the frontend to know which URL variant to
// call, auto-route: peek at the doc, then dispatch to the matching handler.
// Keeps one URL per module — matches Sales/Collection ergonomics.
const presidentReversePrfCalf = catchAsync(async (req, res) => {
  const row = await PrfCalf.findOne({ _id: req.params.id, entity_id: req.entityId }).select('doc_type').lean();
  if (!row) return res.status(404).json({ success: false, message: 'PRF/CALF not found in your scope' });
  const fn = row.doc_type === 'PRF' ? _reversePrfHandler : _reverseCalfHandler;
  return fn(req, res);
});
const presidentReverseCalf = _reverseCalfHandler;
const presidentReversePrf = _reversePrfHandler;

module.exports = {
  // SMER
  createSmer, updateSmer, getSmerList, getSmerById, deleteDraftSmer,
  validateSmer, submitSmer, reopenSmer, revertSmer,
  overridePerdiemDay, applyPerdiemOverride, getSmerCrmMdCounts, getSmerCrmVisitDetail,
  // Car Logbook
  createCarLogbook, updateCarLogbook, getCarLogbookList, getCarLogbookById, deleteDraftCarLogbook,
  validateCarLogbook, submitCarLogbook, reopenCarLogbook, submitFuelEntryForApproval,
  getSmerDailyByDate, getSmerDestinationsBatch,
  // Expenses (ORE/ACCESS)
  createExpense, updateExpense, getExpenseList, getExpenseById, deleteDraftExpense,
  validateExpenses, submitExpenses, reopenExpenses,
  // PRF/CALF
  createPrfCalf, updatePrfCalf, getPrfCalfList, getPrfCalfById, deleteDraftPrfCalf,
  validatePrfCalf, submitPrfCalf, reopenPrfCalf, getPendingPartnerRebates, getPendingCalfLines,
  getLinkedExpenses,
  // Batch Upload
  batchUploadExpenses, saveBatchExpenses,
  // Summary
  getExpenseSummary,
  // Revolving Fund
  getRevolvingFundAmount,
  // Per Diem Config
  getPerdiemConfig,
  // Single-document posting helpers (for Approval Hub)
  postSingleSmer, postSingleCarLogbook, postSingleExpense, postSinglePrfCalf,
  // President Reversal (Phase 3a rollout — lookup-driven: accounting.reverse_posted)
  presidentReverseExpense, presidentReverseCalf, presidentReversePrf, presidentReversePrfCalf
};
