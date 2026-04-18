/**
 * Expense Controller — SMER, Car Logbook, ORE/ACCESS, PRF/CALF
 *
 * All transactional documents follow: DRAFT → VALID → ERROR → POSTED
 * PRF/CALF follows: DRAFT → APPROVED → LIQUIDATED (CALF) or APPROVED (PRF)
 */
const mongoose = require('mongoose');
const SmerEntry = require('../models/SmerEntry');
const CarLogbookEntry = require('../models/CarLogbookEntry');
const ExpenseEntry = require('../models/ExpenseEntry');
const PrfCalf = require('../models/PrfCalf');
const TransactionEvent = require('../models/TransactionEvent');
const ErpAuditLog = require('../models/ErpAuditLog');
const DocumentAttachment = require('../models/DocumentAttachment');
const Settings = require('../models/Settings');
const { catchAsync } = require('../../middleware/errorHandler');
const { computePerdiemAmount, resolvePerdiemThresholds } = require('../services/perdiemCalc');
// fuelTracker computations handled by CarLogbookEntry pre-save hook
const { generateExpenseSummary } = require('../services/expenseSummary');
const { getDailyMdCounts, getDailyVisitDetails } = require('../services/smerCrmBridge');
const { journalFromExpense, resolveFundingCoa, getCoaMap, journalFromPrfCalf } = require('../services/autoJournal');
const { createAndPostJournal, reverseJournal } = require('../services/journalEngine');
const JournalEntry = require('../models/JournalEntry');

const { ROLES } = require('../../constants/roles');
const { detectText } = require('../ocr/visionClient');
const { processOcr } = require('../ocr/ocrProcessor');
const { classifyExpense } = require('../services/expenseClassifier');
const { uploadErpDocument } = require('../services/documentUpload');
const { compressImage } = require('../../middleware/upload');

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

const createSmer = catchAsync(async (req, res) => {
  const settings = await Settings.getSettings();
  const perdiemRate = req.body.perdiem_rate || settings.PERDIEM_RATE_DEFAULT || 800;

  // Load CompProfile once — used for both revolving fund and per diem thresholds
  const compProfile = await loadBdmCompProfile(req.bdmId, req.entityId);

  // Auto-resolve travel advance from CompProfile → Settings fallback (0 or missing = use default)
  let travelAdvance = req.body.travel_advance;
  if (!travelAdvance || travelAdvance === 0) {
    travelAdvance = settings.REVOLVING_FUND_AMOUNT || 8000;
    if (compProfile?.revolving_fund_amount > 0) travelAdvance = compProfile.revolving_fund_amount;
  }

  // Auto-compute per diem for each daily entry (skip overridden entries)
  // Per diem thresholds: CompProfile per-person → Settings global fallback
  let dailyEntries = (req.body.daily_entries || []).map(entry => {
    // "No Work" — force zero everything, skip per diem computation
    if (entry.activity_type === 'NO_WORK') return enforceNoWorkRules(entry);
    if (entry.perdiem_override && entry.override_tier) {
      // Override set — use override_tier for amount, preserve CRM md_count
      const { amount } = computePerdiemAmount(entry.override_tier === 'FULL' ? 999 : 3, perdiemRate, settings, compProfile);
      return { ...entry, perdiem_tier: entry.override_tier, perdiem_amount: amount };
    }
    const { tier, amount } = computePerdiemAmount(entry.md_count || 0, perdiemRate, settings, compProfile);
    return { ...entry, perdiem_tier: tier, perdiem_amount: amount };
  });

  // Strip empty strings from enum fields to avoid Mongoose validation errors
  dailyEntries = dailyEntries.map(e => {
    const cleaned = { ...e };
    if (!cleaned.activity_type) delete cleaned.activity_type;
    if (!cleaned.override_tier) delete cleaned.override_tier;
    return cleaned;
  });

  const smer = await SmerEntry.create({
    ...req.body,
    travel_advance: travelAdvance,
    daily_entries: dailyEntries,
    perdiem_rate: perdiemRate,
    entity_id: req.entityId,
    bdm_id: req.bdmId,
    created_by: req.user._id,
    status: 'DRAFT'
  });
  res.status(201).json({ success: true, data: smer });
});

const updateSmer = catchAsync(async (req, res) => {
  const smer = await SmerEntry.findOne({ _id: req.params.id, ...req.tenantFilter, status: { $in: ['DRAFT', 'ERROR'] } });
  if (!smer) return res.status(404).json({ success: false, message: 'Draft SMER not found' });

  const settings = await Settings.getSettings();
  const perdiemRate = req.body.perdiem_rate || smer.perdiem_rate;
  const compProfile = await loadBdmCompProfile(smer.bdm_id, smer.entity_id);

  // Re-compute per diem if daily entries changed (skip overridden entries)
  // Per diem thresholds: CompProfile per-person → Settings global fallback
  if (req.body.daily_entries) {
    req.body.daily_entries = req.body.daily_entries.map(entry => {
      // Strip empty strings from enum fields
      const cleaned = { ...entry };
      if (!cleaned.activity_type) delete cleaned.activity_type;
      if (!cleaned.override_tier) delete cleaned.override_tier;

      // "No Work" — force zero everything
      if (cleaned.activity_type === 'NO_WORK') return enforceNoWorkRules(cleaned);

      if (cleaned.perdiem_override && cleaned.override_tier) {
        const { amount } = computePerdiemAmount(cleaned.override_tier === 'FULL' ? 999 : 3, perdiemRate, settings, compProfile);
        return { ...cleaned, perdiem_tier: cleaned.override_tier, perdiem_amount: amount };
      }
      const { tier, amount } = computePerdiemAmount(cleaned.md_count || 0, perdiemRate, settings, compProfile);
      return { ...cleaned, perdiem_tier: tier, perdiem_amount: amount };
    });
  }

  Object.assign(smer, req.body);
  if (req.body.perdiem_rate) smer.perdiem_rate = perdiemRate;
  await smer.save();
  res.json({ success: true, data: smer });
});

const getSmerList = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.period) filter.period = req.query.period;
  if (req.query.cycle) filter.cycle = req.query.cycle;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const [docs, total] = await Promise.all([
    SmerEntry.find(filter)
      .populate('bdm_id', 'name')
      .sort({ period: -1, cycle: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    SmerEntry.countDocuments(filter)
  ]);

  res.json({ success: true, data: docs, pagination: { page, limit, total } });
});

const getSmerById = catchAsync(async (req, res) => {
  const smer = await SmerEntry.findOne({ _id: req.params.id, ...req.tenantFilter })
    .populate('bdm_id', 'name').lean();
  if (!smer) return res.status(404).json({ success: false, message: 'SMER not found' });
  res.json({ success: true, data: smer });
});

const deleteDraftSmer = catchAsync(async (req, res) => {
  const result = await SmerEntry.findOneAndDelete({ _id: req.params.id, ...req.tenantFilter, status: 'DRAFT' });
  if (!result) return res.status(404).json({ success: false, message: 'Draft SMER not found' });
  res.json({ success: true, message: 'Draft SMER deleted' });
});

const validateSmer = catchAsync(async (req, res) => {
  const smers = await SmerEntry.find({ ...req.tenantFilter, status: { $in: ['DRAFT', 'ERROR'] } });

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
    }

    smer.validation_errors = errors;
    smer.status = errors.length > 0 ? 'ERROR' : 'VALID';
    await smer.save();
  }

  res.json({ success: true, message: `Validated ${smers.length} SMER(s)`, data: smers.map(s => ({ _id: s._id, status: s.status, errors: s.validation_errors })) });
});

const submitSmer = catchAsync(async (req, res) => {
  const smers = await SmerEntry.find({ ...req.tenantFilter, status: 'VALID' });
  if (!smers.length) return res.status(400).json({ success: false, message: 'No VALID SMERs to submit' });

  // Authority matrix gate
  const { gateApproval } = require('../services/approvalService');
  const smerTotalAmount = smers.reduce((sum, s) => sum + (s.total_reimbursable || 0), 0);
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
  }, res);
  if (gated) return;

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
        lines.push({ account_code: coaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: smer.total_reimbursable, description: desc });
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
      console.error('Auto-journal failed for SMER:', smer._id, jeErr.message);
    }
  }

  res.json({ success: true, message: `Posted ${smers.length} SMER(s)` });
});

const reopenSmer = catchAsync(async (req, res) => {
  const { smer_ids } = req.body;
  const smers = await SmerEntry.find({ _id: { $in: smer_ids }, ...req.tenantFilter, status: 'POSTED' });
  if (!smers.length) return res.status(400).json({ success: false, message: 'No POSTED SMERs to reopen' });

  const reopened = [];
  const failed = [];

  for (const smer of smers) {
    // Reverse journal entries
    if (smer.event_id) {
      try {
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

  const smer = await SmerEntry.findOne({
    _id: req.params.id,
    ...req.tenantFilter,
    status: { $in: ['DRAFT', 'ERROR'] }
  });
  if (!smer) return res.status(404).json({ success: false, message: 'SMER not found or not editable' });

  const entry = smer.daily_entries.id(entry_id);
  if (!entry) return res.status(404).json({ success: false, message: 'Daily entry not found' });

  // Block overrides on "No Work" entries
  if (entry.activity_type === 'NO_WORK') {
    return res.status(400).json({ success: false, message: '"No Work" days cannot have per diem overrides' });
  }

  if (remove_override) {
    // Remove override — revert to CRM-computed tier (no approval needed)
    const settings = await Settings.getSettings();
    const compProfile = await loadBdmCompProfile(smer.bdm_id, smer.entity_id);
    const { tier, amount } = computePerdiemAmount(entry.md_count || 0, smer.perdiem_rate, settings, compProfile);
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
  const { amount: overrideAmount } = computePerdiemAmount(override_tier === 'FULL' ? 999 : 3, smer.perdiem_rate, settings, compProfile);

  const isManagement = [ROLES.PRESIDENT, ROLES.CEO, ROLES.ADMIN, ROLES.FINANCE].includes(req.user.role);

  if (!isManagement) {
    // BDMs/contractors: always create approval request — president must approve
    const approvalReq = await ApprovalRequest.create({
      entity_id: smer.entity_id,
      module: 'PERDIEM_OVERRIDE',
      doc_type: 'SMER_DAILY_ENTRY',
      doc_id: smer._id,
      doc_ref: docRef,
      amount: overrideAmount,
      description: `Per diem override Day ${entry.day}: ${entry.perdiem_tier} → ${override_tier} (${override_reason}). Entry ID: ${entry_id}`,
      metadata: { entry_id, override_tier, override_reason },
      requested_by: req.user._id,
      requested_at: new Date(),
      status: 'PENDING',
    });

    // Save pending state on the daily entry so frontend can show status
    entry.override_status = 'PENDING';
    entry.requested_override_tier = override_tier;
    entry.override_reason = override_reason;
    entry.approval_request_id = approvalReq._id;
    await smer.save();

    return res.status(202).json({
      success: false,
      approval_pending: true,
      message: 'Per diem override requires approval. Request submitted.',
      request: approvalReq,
      data: smer,
    });
  }

  // Management: apply override directly (self-approve)
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
    module: 'PERDIEM_OVERRIDE',
    status: 'APPROVED',
  }).lean();
  if (!approvalReq) {
    return res.status(403).json({ success: false, message: 'No approved override request found. Approval must be granted first.' });
  }

  const smer = await SmerEntry.findOne({
    _id: req.params.id,
    ...req.tenantFilter,
    status: { $in: ['DRAFT', 'ERROR'] }
  });
  if (!smer) return res.status(404).json({ success: false, message: 'SMER not found or not editable' });

  const entry = smer.daily_entries.id(entry_id);
  if (!entry) return res.status(404).json({ success: false, message: 'Daily entry not found' });

  // Parse override details from the approval description
  // Description format: "Per diem override Day N: OLD → NEW (reason). Entry ID: xxx"
  const descMatch = approvalReq.description?.match(/→ (FULL|HALF) \((.+?)\)\./);
  const override_tier = descMatch?.[1];
  const override_reason = descMatch?.[2] || 'Approved override';

  if (!override_tier) {
    return res.status(400).json({ success: false, message: 'Could not parse override tier from approval request' });
  }

  const settings = await Settings.getSettings();
  const compProfile = await loadBdmCompProfile(smer.bdm_id, smer.entity_id);
  const { amount } = computePerdiemAmount(override_tier === 'FULL' ? 999 : 3, smer.perdiem_rate, settings, compProfile);
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
  res.json({ success: true, data: smer, message: 'Approved override applied successfully' });
});

// ═══════════════════════════════════════════
// CAR LOGBOOK ENDPOINTS
// ═══════════════════════════════════════════

const createCarLogbook = catchAsync(async (req, res) => {
  const settings = await Settings.getSettings();
  const kmPerLiter = req.body.km_per_liter || settings.FUEL_EFFICIENCY_DEFAULT || 12;

  const entry = await CarLogbookEntry.create({
    ...req.body,
    km_per_liter: kmPerLiter,
    entity_id: req.entityId,
    bdm_id: req.bdmId,
    created_by: req.user._id,
    status: 'DRAFT'
  });
  const autoCalf = await autoCalfForSource(entry, 'CARLOGBOOK');
  res.status(201).json({ success: true, data: entry, auto_calf: autoCalf ? { _id: autoCalf._id, calf_number: autoCalf.calf_number, amount: autoCalf.amount } : null });
});

const updateCarLogbook = catchAsync(async (req, res) => {
  const entry = await CarLogbookEntry.findOne({ _id: req.params.id, ...req.tenantFilter, status: { $in: ['DRAFT', 'ERROR'] } });
  if (!entry) return res.status(404).json({ success: false, message: 'Draft car logbook entry not found' });

  Object.assign(entry, req.body);
  await entry.save();
  const autoCalf = await autoCalfForSource(entry, 'CARLOGBOOK');
  res.json({ success: true, data: entry, auto_calf: autoCalf ? { _id: autoCalf._id, calf_number: autoCalf.calf_number, amount: autoCalf.amount } : null });
});

const getCarLogbookList = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.period) filter.period = req.query.period;
  if (req.query.cycle) filter.cycle = req.query.cycle;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  const [docs, total] = await Promise.all([
    CarLogbookEntry.find(filter)
      .populate('bdm_id', 'name')
      .sort({ entry_date: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    CarLogbookEntry.countDocuments(filter)
  ]);

  res.json({ success: true, data: docs, pagination: { page, limit, total } });
});

const getCarLogbookById = catchAsync(async (req, res) => {
  const entry = await CarLogbookEntry.findOne({ _id: req.params.id, ...req.tenantFilter })
    .populate('bdm_id', 'name').lean();
  if (!entry) return res.status(404).json({ success: false, message: 'Car logbook entry not found' });
  res.json({ success: true, data: entry });
});

const getSmerDailyByDate = catchAsync(async (req, res) => {
  const { date } = req.params; // YYYY-MM-DD
  const targetDate = new Date(date + 'T00:00:00.000Z');
  const nextDate = new Date(targetDate);
  nextDate.setDate(nextDate.getDate() + 1);

  const smer = await SmerEntry.findOne({
    ...req.tenantFilter,
    'daily_entries.entry_date': { $gte: targetDate, $lt: nextDate }
  }).lean();

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

const deleteDraftCarLogbook = catchAsync(async (req, res) => {
  const result = await CarLogbookEntry.findOneAndDelete({ _id: req.params.id, ...req.tenantFilter, status: 'DRAFT' });
  if (!result) return res.status(404).json({ success: false, message: 'Draft car logbook not found' });
  res.json({ success: true, message: 'Draft car logbook deleted' });
});

const validateCarLogbook = catchAsync(async (req, res) => {
  const entries = await CarLogbookEntry.find({ ...req.tenantFilter, status: { $in: ['DRAFT', 'ERROR'] } });

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

const submitCarLogbook = catchAsync(async (req, res) => {
  const entries = await CarLogbookEntry.find({ ...req.tenantFilter, status: 'VALID' });
  if (!entries.length) return res.status(400).json({ success: false, message: 'No VALID logbook entries to submit' });

  // Authority matrix gate
  const { gateApproval } = require('../services/approvalService');
  const logbookTotal = entries.reduce((sum, e) => sum + (e.total_fuel_amount || 0), 0);
  const gated = await gateApproval({
    entityId: req.entityId,
    module: 'EXPENSES',
    docType: 'CAR_LOGBOOK',
    docId: entries[0]._id,
    docRef: entries.map(e => `LOGBOOK-${e.period}`).join(', '),
    amount: logbookTotal,
    description: `Submit ${entries.length} car logbook entr${entries.length === 1 ? 'y' : 'ies'} (total ₱${logbookTotal.toLocaleString()})`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  // Period lock check
  const { checkPeriodOpen } = require('../utils/periodLock');
  for (const entry of entries) { await checkPeriodOpen(entry.entity_id, entry.period); }

  // Pre-submit gate: verify all linked CALFs are POSTED
  for (const entry of entries) {
    for (const fuel of (entry.fuel_entries || [])) {
      if (fuel.calf_required && fuel.calf_id && req.user.role !== ROLES.PRESIDENT) {
        const calf = await PrfCalf.findById(fuel.calf_id).select('status').lean();
        if (!calf || calf.status !== 'POSTED') {
          return res.status(400).json({
            success: false,
            message: `Cannot post: fuel entry "${fuel.station_name || ''}" has CALF that is not POSTED (status: ${calf?.status || 'NOT_FOUND'}). Post the CALF first.`
          });
        }
      }
    }
  }

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    for (const entry of entries) {
      const event = await TransactionEvent.create([{
        entity_id: entry.entity_id,
        bdm_id: entry.bdm_id,
        event_type: 'CAR_LOGBOOK',
        event_date: entry.entry_date,
        document_ref: `LOGBOOK-${entry.period}-${entry.entry_date.toISOString().split('T')[0]}`,
        payload: { logbook_id: entry._id, total_km: entry.total_km, total_fuel: entry.total_fuel_amount },
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
      await DocumentAttachment.updateMany(
        { source_model: 'CarLogbookEntry', source_id: entry._id },
        { $set: { event_id: entry.event_id } }
      ).catch(() => {});
    }
  }

  // Phase 11/22: Auto-journal — Car Logbook (COA from Settings.COA_MAP)
  const coaMap = await getCoaMap();
  for (const entry of entries) {
    try {
      if (!entry.total_fuel_amount || entry.total_fuel_amount <= 0) continue;
      // Split fuel by payment mode: cash → CR 1110, non-cash → CR funding COA
      let cashTotal = 0;
      let fundedTotal = 0;
      let fundedCoa = null;
      for (const fuel of (entry.fuel_entries || [])) {
        if (!fuel.payment_mode || fuel.payment_mode === 'CASH') {
          cashTotal += fuel.total_amount || 0;
        } else {
          fundedTotal += fuel.total_amount || 0;
          if (!fundedCoa) fundedCoa = await resolveFundingCoa(fuel);
        }
      }
      const desc = `Logbook ${entry.period} ${entry.entry_date.toISOString().split('T')[0]}`;
      const lines = [];
      const totalFuel = cashTotal + fundedTotal;
      if (totalFuel > 0) lines.push({ account_code: coaMap.FUEL_GAS || '6200', account_name: 'Fuel & Gas Expense', debit: totalFuel, credit: 0, description: desc });
      if (cashTotal > 0) lines.push({ account_code: coaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: cashTotal, description: desc });
      if (fundedTotal > 0 && fundedCoa) lines.push({ account_code: fundedCoa.coa_code, account_name: fundedCoa.coa_name, debit: 0, credit: fundedTotal, description: desc });
      if (lines.length >= 2) {
        await createAndPostJournal(entry.entity_id, {
          je_date: entry.entry_date || new Date(),
          period: entry.period,
          description: `Car Logbook: ${desc}`,
          source_module: 'EXPENSE',
          source_event_id: entry.event_id,
          source_doc_ref: `LOGBOOK-${entry.period}-${entry.entry_date.toISOString().split('T')[0]}`,
          lines,
          bir_flag: 'BOTH',
          vat_flag: 'N/A',
          bdm_id: entry.bdm_id,
          created_by: req.user._id
        });
      }
    } catch (jeErr) {
      console.error('Auto-journal failed for logbook:', entry._id, jeErr.message);
    }
  }

  res.json({ success: true, message: `Posted ${entries.length} logbook(s)` });
});

const reopenCarLogbook = catchAsync(async (req, res) => {
  const { logbook_ids } = req.body;
  const entries = await CarLogbookEntry.find({ _id: { $in: logbook_ids }, ...req.tenantFilter, status: 'POSTED' });
  if (!entries.length) return res.status(400).json({ success: false, message: 'No POSTED logbooks to reopen' });

  const reopened = [];
  const failed = [];

  for (const entry of entries) {
    // Reverse journal entries — if reversal fails, skip (keep POSTED, ledger stays balanced)
    if (entry.event_id) {
      try {
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
    let calf = await PrfCalf.findOne({
      entity_id: sourceDoc.entity_id,
      doc_type: 'CALF',
      linked_expense_id: sourceDoc._id,
      status: { $in: ['DRAFT', 'ERROR'] }
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
            catLookups = await Lookup.find({ category: 'EXPENSE_CATEGORY', is_active: true }).lean();
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

  const entry = await ExpenseEntry.create({
    ...req.body,
    entity_id: req.entityId,
    bdm_id: req.bdmId,
    created_by: req.user._id,
    status: 'DRAFT'
  });
  // Auto-create linked CALF for company-funded (ACCESS non-cash) lines
  const autoCalf = await autoCalfForSource(entry, 'EXPENSE');
  res.status(201).json({ success: true, data: entry, auto_calf: autoCalf ? { _id: autoCalf._id, calf_number: autoCalf.calf_number, amount: autoCalf.amount } : null });
});

const updateExpense = catchAsync(async (req, res) => {
  const entry = await ExpenseEntry.findOne({ _id: req.params.id, ...req.tenantFilter, status: { $in: ['DRAFT', 'ERROR'] } });
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

  Object.assign(entry, req.body);
  await entry.save();
  // Re-run auto-CALF (updates existing or creates new if needed)
  const autoCalf = await autoCalfForSource(entry, 'EXPENSE');
  res.json({ success: true, data: entry, auto_calf: autoCalf ? { _id: autoCalf._id, calf_number: autoCalf.calf_number, amount: autoCalf.amount } : null });
});

const getExpenseList = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.period) filter.period = req.query.period;
  if (req.query.cycle) filter.cycle = req.query.cycle;

  // Phase 6 — hide reversed rows by default; opt-in via ?include_reversed=true.
  if (req.query.include_reversed !== 'true') {
    filter.deletion_event_id = { $exists: false };
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const [docs, total] = await Promise.all([
    ExpenseEntry.find(filter)
      .populate('bdm_id', 'name')
      .sort({ period: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    ExpenseEntry.countDocuments(filter)
  ]);

  res.json({ success: true, data: docs, pagination: { page, limit, total } });
});

const getExpenseById = catchAsync(async (req, res) => {
  const entry = await ExpenseEntry.findOne({ _id: req.params.id, ...req.tenantFilter })
    .populate('bdm_id', 'name').lean();
  if (!entry) return res.status(404).json({ success: false, message: 'Expense not found' });
  res.json({ success: true, data: entry });
});

const deleteDraftExpense = catchAsync(async (req, res) => {
  const result = await ExpenseEntry.findOneAndDelete({ _id: req.params.id, ...req.tenantFilter, status: 'DRAFT' });
  if (!result) return res.status(404).json({ success: false, message: 'Draft expense not found' });
  res.json({ success: true, message: 'Draft expense deleted' });
});

const validateExpenses = catchAsync(async (req, res) => {
  const entries = await ExpenseEntry.find({ ...req.tenantFilter, status: { $in: ['DRAFT', 'ERROR'] } });

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
    entry.status = errors.length > 0 ? 'ERROR' : 'VALID';
    await entry.save();
  }

  res.json({ success: true, message: `Validated ${entries.length} expense(s)`, data: entries.map(e => ({ _id: e._id, status: e.status, errors: e.validation_errors })) });
});

const submitExpenses = catchAsync(async (req, res) => {
  const entries = await ExpenseEntry.find({ ...req.tenantFilter, status: 'VALID' });
  if (!entries.length) return res.status(400).json({ success: false, message: 'No VALID expenses to submit' });

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

  // Pre-submit gate: verify all linked CALFs are POSTED
  for (const entry of entries) {
    for (const line of (entry.lines || [])) {
      if (line.calf_required && line.calf_id && req.user.role !== ROLES.PRESIDENT) {
        const calf = await PrfCalf.findById(line.calf_id).select('status').lean();
        if (!calf || calf.status !== 'POSTED') {
          return res.status(400).json({
            success: false,
            message: `Cannot post: expense line "${line.establishment || ''}" has CALF that is not POSTED (status: ${calf?.status || 'NOT_FOUND'}). Post the CALF first.`
          });
        }
      }
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

      // ORE credit → AR BDM Advances (personal reimbursement)
      if (creditOre > 0) lines.push({ account_code: expCoaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: creditOre, description: desc });
      // ACCESS credit → funding source (company-funded)
      if (creditAccess > 0) {
        const coa = accessCoa || { coa_code: expCoaMap.AP_TRADE || '2000', coa_name: 'Accounts Payable — Trade' };
        lines.push({ account_code: coa.coa_code, account_name: coa.coa_name, debit: 0, credit: creditAccess, description: desc });
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
      console.error('Auto-journal failed for expense:', entry._id, jeErr.message);
    }
  }

  res.json({ success: true, message: `Posted ${entries.length} expense(s)` });
});

const reopenExpenses = catchAsync(async (req, res) => {
  const { expense_ids } = req.body;
  const entries = await ExpenseEntry.find({ _id: { $in: expense_ids }, ...req.tenantFilter, status: 'POSTED' });
  if (!entries.length) return res.status(400).json({ success: false, message: 'No POSTED expenses to reopen' });

  const reopened = [];
  const failed = [];

  for (const entry of entries) {
    // Reverse journal entries — if reversal fails, skip this entry (keep POSTED, ledger stays balanced)
    if (entry.event_id) {
      try {
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
// ═══════════════════════════════════════════

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
    const expense = await ExpenseEntry.findById(req.body.linked_expense_id).lean();
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
      const logbook = await CarLogbookEntry.findById(req.body.linked_expense_id).lean();
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

  const doc = await PrfCalf.create({
    ...req.body,
    entity_id: req.entityId,
    bdm_id: req.bdmId,
    created_by: req.user._id,
    status: 'DRAFT'
  });

  // ── Back-link: update expense/logbook lines' calf_id when CALF is linked ──
  // Also auto-copy OR photos from linked lines into CALF photo_urls (no double-scan needed)
  if (doc.doc_type === 'CALF' && doc.linked_expense_id && doc.linked_expense_line_ids?.length) {
    const collectedPhotos = [];

    // Try ExpenseEntry first (ACCESS lines) — enforce same entity
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
  const doc = await PrfCalf.findOne({ _id: req.params.id, ...req.tenantFilter, status: { $in: ['DRAFT', 'ERROR'] } });
  if (!doc) return res.status(404).json({ success: false, message: 'Draft PRF/CALF not found' });

  // Snapshot old links before update
  const oldLinkedId = doc.linked_expense_id?.toString();
  const oldLineIds = (doc.linked_expense_line_ids || []).map(id => id.toString());

  Object.assign(doc, req.body);

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
      const oldExp = await ExpenseEntry.findById(oldLinkedId);
      if (oldExp) { clearCalfId(oldExp.lines, oldLineIds); await oldExp.save(); }
      else {
        const oldLb = await CarLogbookEntry.findById(oldLinkedId);
        if (oldLb) { clearCalfId(oldLb.fuel_entries, oldLineIds); await oldLb.save(); }
      }
    }

    // Set new back-links (same logic as createPrfCalf) — enforce same entity
    if (newLinkedId && newLineIds.length) {
      const collectedPhotos = [];
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
  const filter = { ...req.tenantFilter };
  if (req.query.doc_type) filter.doc_type = req.query.doc_type;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.period) filter.period = req.query.period;

  // Phase 6 — hide reversed rows by default; opt-in via ?include_reversed=true.
  if (req.query.include_reversed !== 'true') {
    filter.deletion_event_id = { $exists: false };
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const [docs, total] = await Promise.all([
    PrfCalf.find(filter)
      .populate('bdm_id', 'name')
      .populate('posted_by', 'name')
      .sort({ created_at: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    PrfCalf.countDocuments(filter)
  ]);

  res.json({ success: true, data: docs, pagination: { page, limit, total } });
});

const getPrfCalfById = catchAsync(async (req, res) => {
  const doc = await PrfCalf.findOne({ _id: req.params.id, ...req.tenantFilter })
    .populate('bdm_id', 'name')
    .populate('posted_by', 'name').lean();
  if (!doc) return res.status(404).json({ success: false, message: 'PRF/CALF not found' });
  res.json({ success: true, data: doc });
});

const deleteDraftPrfCalf = catchAsync(async (req, res) => {
  const result = await PrfCalf.findOneAndDelete({ _id: req.params.id, ...req.tenantFilter, status: 'DRAFT' });
  if (!result) return res.status(404).json({ success: false, message: 'Draft PRF/CALF not found' });

  // Clean up calf_id references on linked expense/logbook lines (prevent orphaned refs)
  if (result.doc_type === 'CALF' && result.linked_expense_id && result.linked_expense_line_ids?.length) {
    const expense = await ExpenseEntry.findById(result.linked_expense_id);
    if (expense) {
      for (const line of expense.lines) {
        if (line.calf_id?.toString() === result._id.toString()) line.calf_id = undefined;
      }
      await expense.save();
    } else {
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
  const docs = await PrfCalf.find({ ...req.tenantFilter, status: { $in: ['DRAFT', 'ERROR'] } });

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
        const srcExpense = await ExpenseEntry.findById(doc.linked_expense_id).lean();
        if (srcExpense) {
          const validIds = new Set(srcExpense.lines.map(l => l._id.toString()));
          const orphaned = doc.linked_expense_line_ids.filter(lid => !validIds.has(lid.toString()));
          if (orphaned.length) errors.push(`${orphaned.length} linked line(s) do not belong to the linked expense entry`);
        } else {
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
  const docs = await PrfCalf.find({ ...req.tenantFilter, status: 'VALID' });
  if (!docs.length) return res.status(400).json({ success: false, message: 'No VALID PRF/CALFs to submit' });

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
  }, res);
  if (gated) return;

  // Period lock check
  const { checkPeriodOpen } = require('../utils/periodLock');
  for (const doc of docs) { await checkPeriodOpen(doc.entity_id, doc.period); }

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    for (const doc of docs) {
      const event = await TransactionEvent.create([{
        entity_id: doc.entity_id,
        bdm_id: doc.bdm_id,
        event_type: doc.doc_type,
        event_date: new Date(),
        document_ref: `${doc.doc_type}-${doc.prf_number || doc.calf_number || doc.period}`,
        payload: {
          prf_calf_id: doc._id,
          doc_type: doc.doc_type,
          amount: doc.amount,
          ...(doc.doc_type === 'PRF' && {
            payee_name: doc.payee_name,
            partner_bank: doc.partner_bank,
            rebate_amount: doc.rebate_amount
          }),
          ...(doc.doc_type === 'CALF' && {
            advance_amount: doc.advance_amount,
            liquidation_amount: doc.liquidation_amount,
            balance: doc.balance
          })
        },
        status: 'ACTIVE',
        created_by: req.user._id
      }], { session });

      doc.status = 'POSTED';
      doc.posted_at = new Date();
      doc.posted_by = req.user._id;
      doc.event_id = event[0]._id;
      await doc.save({ session });
    }
  });
  session.endSession();

  // Phase 9.1b: Link DocumentAttachments to events (non-blocking)
  for (const doc of docs) {
    if (doc.event_id) {
      await DocumentAttachment.updateMany(
        { source_model: 'PrfCalf', source_id: doc._id },
        { $set: { event_id: doc.event_id } }
      ).catch(() => {});
    }
  }

  // Phase 11/22/H3: Auto-journal — PRF/CALF (shared function in autoJournal.js)
  for (const doc of docs) {
    try {
      const jeData = await journalFromPrfCalf(doc, req.user._id);
      if (jeData) {
        jeData.source_event_id = doc.event_id;
        await createAndPostJournal(doc.entity_id, jeData);
      }
    } catch (jeErr) {
      console.error('Auto-journal failed for PRF/CALF:', doc._id, jeErr.message);
    }
  }

  // ── Auto-validate+submit linked expenses/carlogbooks when CALF is posted ──
  // Uses MongoDB transaction so source + event are atomic; if anything fails,
  // both the source status and the TransactionEvent roll back together.
  const autoResults = [];
  for (const doc of docs) {
    if (doc.doc_type !== 'CALF' || !doc.linked_expense_id) continue;
    try {
      // Try ExpenseEntry first
      let source = await ExpenseEntry.findById(doc.linked_expense_id);
      let sourceType = 'EXPENSE';
      if (!source) {
        source = await CarLogbookEntry.findById(doc.linked_expense_id);
        sourceType = 'CARLOGBOOK';
      }
      if (!source || source.status === 'POSTED') continue;

      // Validate
      const valErrors = [];
      if (sourceType === 'EXPENSE') {
        // Auto-resolve COA codes before validation
        await autoClassifyLines(source.lines, source.entity_id);
        if (!source.lines.length) valErrors.push('No expense lines');
        for (let i = 0; i < source.lines.length; i++) {
          const l = source.lines[i];
          if (!l.expense_date) valErrors.push(`Line ${i + 1}: date required`);
          if (!l.amount || l.amount <= 0) valErrors.push(`Line ${i + 1}: amount required`);
          if (!l.establishment) valErrors.push(`Line ${i + 1}: establishment required`);
          if (!l.coa_code || l.coa_code === '6900') valErrors.push(`Line ${i + 1}: COA code missing or Miscellaneous (6900). Map "${l.establishment || 'unknown'}" to correct account.`);
        }
      } else {
        if (!source.entry_date) valErrors.push('Entry date required');
        if (source.ending_km < source.starting_km) valErrors.push('Ending KM < Starting KM');
      }

      if (valErrors.length) {
        source.status = 'ERROR';
        source.validation_errors = valErrors;
        await source.save();
        autoResults.push({ source_id: source._id, type: sourceType, status: 'ERROR', errors: valErrors });
        continue;
      }

      // Submit inside a transaction — atomic: if JE creation fails, source stays un-posted
      const autoSession = await mongoose.startSession();
      try {
        await autoSession.withTransaction(async () => {
          source.status = 'POSTED';
          source.posted_at = new Date();
          source.posted_by = req.user._id;
          source.validation_errors = [];

          const event = await TransactionEvent.create([{
            entity_id: source.entity_id,
            bdm_id: source.bdm_id,
            event_type: sourceType === 'EXPENSE' ? 'EXPENSE' : 'CAR_LOGBOOK',
            event_date: new Date(),
            document_ref: sourceType === 'EXPENSE'
              ? `EXP-${source.period}-${source.cycle}`
              : `LOGBOOK-${source.period}-${source.entry_date?.toISOString().split('T')[0] || ''}`,
            status: 'ACTIVE',
            created_by: req.user._id
          }], { session: autoSession });
          source.event_id = event[0]._id;
          await source.save({ session: autoSession });

          // Auto-journal inside the same transaction — ensures POSTED ↔ JE consistency
          const autoCoaMap = await getCoaMap();
          if (sourceType === 'EXPENSE') {
            const lines = [];
            let totalOre = 0, totalAccess = 0;
            const desc = `EXP-${source.period}-${source.cycle}`;
            for (const line of source.lines) {
              lines.push({ account_code: line.coa_code || autoCoaMap.MISC_EXPENSE || '6900', account_name: line.expense_category || 'Miscellaneous', debit: line.amount, credit: 0, description: desc });
              if (line.expense_type === 'ORE') totalOre += line.amount || 0;
              else totalAccess += line.amount || 0;
            }
            if (totalOre > 0) lines.push({ account_code: autoCoaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: totalOre, description: desc });
            if (totalAccess > 0) {
              const funding = await resolveFundingCoa(source.lines.find(l => l.expense_type === 'ACCESS') || source, autoCoaMap.AP_TRADE);
              lines.push({ account_code: funding.coa_code, account_name: funding.coa_name, debit: 0, credit: totalAccess, description: desc });
            }
            if (lines.length >= 2) {
              await createAndPostJournal(source.entity_id, {
                je_date: source.posted_at, period: source.period,
                description: `Expenses: ${desc}`, source_module: 'EXPENSE',
                source_event_id: source.event_id, source_doc_ref: desc, lines,
                bir_flag: source.bir_flag || 'BOTH', vat_flag: 'N/A',
                bdm_id: source.bdm_id, created_by: req.user._id
              }, { session: autoSession });
            }
          } else {
            // CarLogbook journal — DR 6200, CR funding
            const fuelTotal = source.official_gas_amount || source.total_fuel_amount || 0;
            if (fuelTotal > 0) {
              const funding = await resolveFundingCoa(source.fuel_entries?.[0] || source);
              await createAndPostJournal(source.entity_id, {
                je_date: source.posted_at, period: source.period,
                description: `Car Logbook: ${source.period}`, source_module: 'EXPENSE',
                source_event_id: source.event_id, source_doc_ref: `LOGBOOK-${source.period}`,
                lines: [
                  { account_code: calfCoaMap.FUEL_GAS || '6200', account_name: 'Fuel & Gas', debit: fuelTotal, credit: 0, description: `Car Logbook: ${source.period}` },
                  { account_code: funding.coa_code, account_name: funding.coa_name, debit: 0, credit: fuelTotal, description: `Car Logbook: ${source.period}` }
                ],
                bir_flag: 'BOTH', vat_flag: 'N/A',
                bdm_id: source.bdm_id, created_by: req.user._id
              }, { session: autoSession });
            }
          }
        });

        autoResults.push({ source_id: source._id, type: sourceType, status: 'POSTED' });
      } catch (txErr) {
        // Transaction rolled back — source stays in its previous status, no orphaned events/JEs
        console.error('Auto-submit linked source transaction failed:', doc.linked_expense_id, txErr.message);
        autoResults.push({ source_id: doc.linked_expense_id, type: sourceType, status: 'FAILED', error: txErr.message });
      } finally {
        autoSession.endSession();
      }
    } catch (err) {
      console.error('Auto-submit linked source failed:', doc.linked_expense_id, err.message);
      autoResults.push({ source_id: doc.linked_expense_id, type: 'UNKNOWN', status: 'FAILED', error: err.message });
    }
  }

  res.json({ success: true, message: `Posted ${docs.length} PRF/CALF(s)`, auto_submitted: autoResults });
});

const reopenPrfCalf = catchAsync(async (req, res) => {
  const { prf_calf_ids } = req.body;
  const docs = await PrfCalf.find({ _id: { $in: prf_calf_ids }, ...req.tenantFilter, status: 'POSTED' });
  if (!docs.length) return res.status(400).json({ success: false, message: 'No POSTED PRF/CALFs to reopen' });

  const reopenedDocs = [];
  const failedDocs = [];

  for (const doc of docs) {
    // Reverse journal entries — if reversal fails, skip (keep POSTED, ledger stays balanced)
    if (doc.event_id) {
      try {
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
        const expense = await ExpenseEntry.findById(doc.linked_expense_id);
        if (expense) {
          for (const line of expense.lines) {
            if (line.calf_id?.toString() === doc._id.toString()) line.calf_id = undefined;
          }
          await expense.save();
        } else {
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
        let source = await ExpenseEntry.findById(doc.linked_expense_id);
        if (!source) source = await CarLogbookEntry.findById(doc.linked_expense_id);
        if (source && source.status === 'POSTED') {
          // Reverse source JEs — if this fails, source stays POSTED (acceptable: CALF already reopened)
          if (source.event_id) {
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
 * GET /expenses/smer/crm-md-counts?period=2026-04&cycle=C1
 * Returns daily MD counts pulled from CRM visit logs for the BDM's period/cycle.
 * Used to auto-populate SMER daily entries instead of manual MD count entry.
 */
const getSmerCrmMdCounts = catchAsync(async (req, res) => {
  // Only BDMs (employees) should pull their own CRM visit data
  if (req.user.role !== ROLES.CONTRACTOR && !req.query.bdm_id) {
    return res.status(403).json({ success: false, message: 'CRM bridge is for BDM users. Pass bdm_id query param if admin.' });
  }
  const { period, cycle } = req.query;
  if (!period || !cycle) return res.status(400).json({ success: false, message: 'period and cycle are required' });

  const [year, month] = period.split('-').map(Number);
  const startDay = cycle === 'C1' ? 1 : 16;
  const endDay = cycle === 'C1' ? 15 : new Date(year, month, 0).getDate();

  const startDate = new Date(year, month - 1, startDay);
  const endDate = new Date(year, month - 1, endDay);

  // Pull from CRM Visit model — counts completed visits per day
  const bdmUserId = req.bdmId || req.user._id;
  const dailyCounts = await getDailyMdCounts(bdmUserId, startDate, endDate);

  const settings = await Settings.getSettings();
  const perdiemRate = settings.PERDIEM_RATE_DEFAULT || 800;
  const compProfile = await loadBdmCompProfile(bdmUserId, req.entityId);

  // Build daily entries with CRM data
  const DAYS_OF_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const entries = [];

  for (let day = startDay; day <= endDay; day++) {
    const date = new Date(year, month - 1, day);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue; // Skip weekends

    const dateKey = date.toISOString().split('T')[0];
    const crmData = dailyCounts[dateKey] || { md_count: 0, unique_doctors: 0 };
    const { tier, amount } = computePerdiemAmount(crmData.md_count, perdiemRate, settings, compProfile);

    entries.push({
      day,
      entry_date: dateKey,
      day_of_week: DAYS_OF_WEEK[dow],
      md_count: crmData.md_count,
      unique_doctors: crmData.unique_doctors,
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
      daily_entries: entries,
      total_md_visits: entries.reduce((s, e) => s + e.md_count, 0),
      total_perdiem: entries.reduce((s, e) => s + e.perdiem_amount, 0),
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

  const bdmUserId = req.bdmId || req.user._id;
  const visits = await getDailyVisitDetails(bdmUserId, date);

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

  // Get all POSTED collections for this BDM with partner tags
  const collections = await Collection.find({
    ...req.tenantFilter,
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

  // Subtract POSTED PRFs for each partner + capture last known bank details
  const allPrfs = await PrfCalf.find({
    ...req.tenantFilter,
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

  // 1. ACCESS expense lines needing CALF
  const expenses = await ExpenseEntry.find({
    ...req.tenantFilter,
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
  const COMPANY_FUEL_MODES = ['FLEET_CARD', 'CARD', 'GCASH'];
  const logbooks = await CarLogbookEntry.find({
    ...req.tenantFilter,
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

  // Filter out items that already have CALF linked
  const existingCalfs = await PrfCalf.find({
    ...req.tenantFilter,
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

  const entry = await ExpenseEntry.create({
    entity_id: req.entityId,
    bdm_id: bdmId,
    recorded_on_behalf_of: isOnBehalf ? bdmId : undefined,
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
 * CompProfile per-person thresholds → Settings global fallback.
 * null/undefined in CompProfile = use global. 0 IS a valid override.
 * Returns: { fullThreshold, halfThreshold, source: 'COMP_PROFILE'|'SETTINGS' }
 */
const getPerdiemConfig = catchAsync(async (req, res) => {
  const settings = await Settings.getSettings();
  const compProfile = await loadBdmCompProfile(req.bdmId, req.entityId);
  const resolved = resolvePerdiemThresholds(settings, compProfile);

  res.json({
    success: true,
    data: {
      fullThreshold: resolved.fullThreshold,
      halfThreshold: resolved.halfThreshold,
      source: resolved.source
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
      lines.push({ account_code: coaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: doc.total_reimbursable, description: desc });
      await createAndPostJournal(doc.entity_id, {
        je_date: doc.posted_at, period: doc.period, description: `SMER: ${desc}`,
        source_module: 'EXPENSE', source_event_id: doc.event_id, source_doc_ref: `SMER-${doc.period}-${doc.cycle}`,
        lines, bir_flag: 'BOTH', vat_flag: 'N/A', bdm_id: doc.bdm_id, created_by: userId
      });
    }
  } catch (jeErr) { console.error('Auto-journal failed for SMER (approval hub):', doc._id, jeErr.message); }
};

const postSingleCarLogbook = async (doc, userId) => {
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
      if (cashTotal > 0) lines.push({ account_code: coaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: cashTotal, description: desc });
      if (fundedTotal > 0 && fundedCoa) lines.push({ account_code: fundedCoa.coa_code, account_name: fundedCoa.coa_name, debit: 0, credit: fundedTotal, description: desc });
      if (lines.length >= 2) {
        await createAndPostJournal(doc.entity_id, {
          je_date: doc.entry_date || new Date(), period: doc.period, description: `Car Logbook: ${desc}`,
          source_module: 'EXPENSE', source_event_id: doc.event_id, source_doc_ref: `LOGBOOK-${doc.period}-${doc.entry_date.toISOString().split('T')[0]}`,
          lines, bir_flag: 'BOTH', vat_flag: 'N/A', bdm_id: doc.bdm_id, created_by: userId
        });
      }
    }
  } catch (jeErr) { console.error('Auto-journal failed for logbook (approval hub):', doc._id, jeErr.message); }
};

const postSingleExpense = async (doc, userId) => {
  // Auto-resolve COA codes before posting (approval hub path)
  await autoClassifyLines(doc.lines, doc.entity_id);
  await doc.save();

  // CALF-POSTED gate — same check as submitExpenses (line 1176)
  for (const line of (doc.lines || [])) {
    if (line.calf_required && line.calf_id) {
      const calf = await PrfCalf.findById(line.calf_id).select('status').lean();
      if (!calf || calf.status !== 'POSTED') {
        throw new Error(`Cannot post: line "${line.establishment || ''}" has CALF that is not POSTED (status: ${calf?.status || 'NOT_FOUND'}). Post the CALF first.`);
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
    if (creditOre > 0) lines.push({ account_code: coaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: creditOre, description: desc });
    if (creditAccess > 0) {
      const coa = accessCoa || { coa_code: coaMap.AP_TRADE || '2000', coa_name: 'Accounts Payable — Trade' };
      lines.push({ account_code: coa.coa_code, account_name: coa.coa_name, debit: 0, credit: creditAccess, description: desc });
    }
    if (lines.length >= 2) {
      await createAndPostJournal(doc.entity_id, {
        je_date: doc.posted_at || new Date(), period: doc.period, description: `Expenses: ${desc}`,
        source_module: 'EXPENSE', source_event_id: doc.event_id, source_doc_ref: `EXP-${doc.period}-${doc.cycle}`,
        lines, bir_flag: doc.bir_flag || 'BOTH', vat_flag: 'N/A', bdm_id: doc.bdm_id, created_by: userId
      });
    }
  } catch (jeErr) { console.error('Auto-journal failed for expense (approval hub):', doc._id, jeErr.message); }
};

const postSinglePrfCalf = async (doc, userId) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
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
    });
  } finally { session.endSession(); }

  await DocumentAttachment.updateMany(
    { source_model: 'PrfCalf', source_id: doc._id },
    { $set: { event_id: doc.event_id } }
  ).catch(() => {});

  // Phase H3: Auto-journal using shared function
  try {
    const jeData = await journalFromPrfCalf(doc, userId);
    if (jeData) {
      jeData.source_event_id = doc.event_id;
      await createAndPostJournal(doc.entity_id, jeData);
    }
  } catch (jeErr) { console.error('Auto-journal failed for PRF/CALF (approval hub):', doc._id, jeErr.message); }

  // Auto-validate+submit linked expense/logbook when CALF is posted (mirrors submitPrfCalf logic)
  if (doc.doc_type === 'CALF' && doc.linked_expense_id) {
    try {
      let source = await ExpenseEntry.findById(doc.linked_expense_id);
      let sourceType = 'EXPENSE';
      if (!source) {
        source = await CarLogbookEntry.findById(doc.linked_expense_id);
        sourceType = 'CARLOGBOOK';
      }
      if (source && source.status !== 'POSTED') {
        // Validate
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
          source.status = 'ERROR';
          source.validation_errors = valErrors;
          await source.save();
        } else {
          // Post atomically
          const autoSession = await mongoose.startSession();
          try {
            await autoSession.withTransaction(async () => {
              source.status = 'POSTED';
              source.posted_at = new Date();
              source.posted_by = userId;
              source.validation_errors = [];
              const [event] = await TransactionEvent.create([{
                entity_id: source.entity_id, bdm_id: source.bdm_id,
                event_type: sourceType === 'EXPENSE' ? 'EXPENSE' : 'CAR_LOGBOOK',
                event_date: new Date(),
                document_ref: sourceType === 'EXPENSE'
                  ? `EXP-${source.period}-${source.cycle}`
                  : `LOGBOOK-${source.period}-${source.entry_date?.toISOString().split('T')[0] || ''}`,
                status: 'ACTIVE', created_by: userId
              }], { session: autoSession });
              source.event_id = event._id;
              await source.save({ session: autoSession });

              // Auto-journal
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
                if (totalOre > 0) jLines.push({ account_code: autoCoaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: totalOre, description: desc });
                if (totalAccess > 0) {
                  const funding = await resolveFundingCoa(source.lines.find(l => l.expense_type === 'ACCESS') || source, autoCoaMap.AP_TRADE);
                  jLines.push({ account_code: funding.coa_code, account_name: funding.coa_name, debit: 0, credit: totalAccess, description: desc });
                }
                if (jLines.length >= 2) {
                  await createAndPostJournal(source.entity_id, {
                    je_date: source.posted_at, period: source.period, description: `Expenses: ${desc}`,
                    source_module: 'EXPENSE', source_event_id: source.event_id, source_doc_ref: desc,
                    lines: jLines, bir_flag: source.bir_flag || 'BOTH', vat_flag: 'N/A', bdm_id: source.bdm_id, created_by: userId
                  }, { session: autoSession });
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
                      { account_code: funding.coa_code, account_name: funding.coa_name, debit: 0, credit: fuelTotal, description: `Car Logbook: ${source.period}` }
                    ],
                    bir_flag: 'BOTH', vat_flag: 'N/A', bdm_id: source.bdm_id, created_by: userId
                  }, { session: autoSession });
                }
              }
            });
          } finally { autoSession.endSession(); }
        }
      }
    } catch (autoErr) { console.error('Auto-submit linked source failed (approval hub):', doc.linked_expense_id, autoErr.message); }
  }
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
  const row = await PrfCalf.findById(req.params.id).select('doc_type').lean();
  if (!row) return res.status(404).json({ success: false, message: 'PRF/CALF not found in your scope' });
  const fn = row.doc_type === 'PRF' ? _reversePrfHandler : _reverseCalfHandler;
  return fn(req, res);
});
const presidentReverseCalf = _reverseCalfHandler;
const presidentReversePrf = _reversePrfHandler;

module.exports = {
  // SMER
  createSmer, updateSmer, getSmerList, getSmerById, deleteDraftSmer,
  validateSmer, submitSmer, reopenSmer,
  overridePerdiemDay, applyPerdiemOverride, getSmerCrmMdCounts, getSmerCrmVisitDetail,
  // Car Logbook
  createCarLogbook, updateCarLogbook, getCarLogbookList, getCarLogbookById, deleteDraftCarLogbook,
  validateCarLogbook, submitCarLogbook, reopenCarLogbook, getSmerDailyByDate,
  // Expenses (ORE/ACCESS)
  createExpense, updateExpense, getExpenseList, getExpenseById, deleteDraftExpense,
  validateExpenses, submitExpenses, reopenExpenses,
  // PRF/CALF
  createPrfCalf, updatePrfCalf, getPrfCalfList, getPrfCalfById, deleteDraftPrfCalf,
  validatePrfCalf, submitPrfCalf, reopenPrfCalf, getPendingPartnerRebates, getPendingCalfLines,
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
