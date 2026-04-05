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
const { computePerdiemAmount } = require('../services/perdiemCalc');
// fuelTracker computations handled by CarLogbookEntry pre-save hook
const { generateExpenseSummary } = require('../services/expenseSummary');
const { getDailyMdCounts, getDailyVisitDetails } = require('../services/smerCrmBridge');

// ═══════════════════════════════════════════
// SMER ENDPOINTS
// ═══════════════════════════════════════════

const createSmer = catchAsync(async (req, res) => {
  const settings = await Settings.getSettings();
  const perdiemRate = req.body.perdiem_rate || settings.PERDIEM_RATE_DEFAULT || 800;

  // Auto-compute per diem for each daily entry (skip overridden entries)
  const dailyEntries = (req.body.daily_entries || []).map(entry => {
    if (entry.perdiem_override && entry.override_tier) {
      // Override set — use override_tier for amount, preserve CRM md_count
      const { amount } = computePerdiemAmount(entry.override_tier === 'FULL' ? 999 : 3, perdiemRate, settings);
      return { ...entry, perdiem_tier: entry.override_tier, perdiem_amount: amount };
    }
    const { tier, amount } = computePerdiemAmount(entry.md_count || 0, perdiemRate, settings);
    return { ...entry, perdiem_tier: tier, perdiem_amount: amount };
  });

  const smer = await SmerEntry.create({
    ...req.body,
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

  // Re-compute per diem if daily entries changed (skip overridden entries)
  if (req.body.daily_entries) {
    req.body.daily_entries = req.body.daily_entries.map(entry => {
      if (entry.perdiem_override && entry.override_tier) {
        const { amount } = computePerdiemAmount(entry.override_tier === 'FULL' ? 999 : 3, perdiemRate, settings);
        return { ...entry, perdiem_tier: entry.override_tier, perdiem_amount: amount };
      }
      const { tier, amount } = computePerdiemAmount(entry.md_count || 0, perdiemRate, settings);
      return { ...entry, perdiem_tier: tier, perdiem_amount: amount };
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

  res.json({ success: true, message: `Posted ${smers.length} SMER(s)` });
});

const reopenSmer = catchAsync(async (req, res) => {
  const { smer_ids } = req.body;
  const smers = await SmerEntry.find({ _id: { $in: smer_ids }, ...req.tenantFilter, status: 'POSTED' });
  if (!smers.length) return res.status(400).json({ success: false, message: 'No POSTED SMERs to reopen' });

  for (const smer of smers) {
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
  }

  res.json({ success: true, message: `Reopened ${smers.length} SMER(s)` });
});

/**
 * POST /expenses/smer/:id/override-perdiem
 * Finance/Manager/President overrides per diem tier for a specific day.
 * CRM md_count stays as-is for audit. Override tier drives perdiem_amount.
 * Body: { entry_id, override_tier: 'FULL'|'HALF', override_reason: 'Meeting with President' }
 * To remove override: { entry_id, remove_override: true }
 */
const overridePerdiemDay = catchAsync(async (req, res) => {
  const { entry_id, override_tier, override_reason, remove_override } = req.body;
  if (!entry_id) return res.status(400).json({ success: false, message: 'entry_id is required' });

  const smer = await SmerEntry.findOne({ _id: req.params.id, status: { $in: ['DRAFT', 'ERROR'] } });
  if (!smer) return res.status(404).json({ success: false, message: 'SMER not found or not editable' });

  const entry = smer.daily_entries.id(entry_id);
  if (!entry) return res.status(404).json({ success: false, message: 'Daily entry not found' });

  const settings = await Settings.getSettings();
  const perdiemRate = smer.perdiem_rate;

  if (remove_override) {
    // Remove override — revert to CRM-computed tier
    const { tier, amount } = computePerdiemAmount(entry.md_count || 0, perdiemRate, settings);
    entry.perdiem_override = false;
    entry.override_tier = undefined;
    entry.override_reason = undefined;
    entry.overridden_by = undefined;
    entry.overridden_at = undefined;
    entry.perdiem_tier = tier;
    entry.perdiem_amount = amount;

    await ErpAuditLog.logChange({
      entity_id: smer.entity_id, bdm_id: smer.bdm_id,
      log_type: 'ITEM_CHANGE', target_ref: smer._id.toString(), target_model: 'SmerEntry',
      field_changed: `daily_entries.${entry.day}.perdiem_override`,
      old_value: true, new_value: false,
      changed_by: req.user._id, note: `Override removed for day ${entry.day}`
    });
  } else {
    // Apply override
    if (!override_tier || !['FULL', 'HALF'].includes(override_tier)) {
      return res.status(400).json({ success: false, message: 'override_tier must be FULL or HALF' });
    }
    if (!override_reason) {
      return res.status(400).json({ success: false, message: 'override_reason is required' });
    }

    const { amount } = computePerdiemAmount(override_tier === 'FULL' ? 999 : 3, perdiemRate, settings);
    const oldTier = entry.perdiem_tier;

    entry.perdiem_override = true;
    entry.override_tier = override_tier;
    entry.override_reason = override_reason;
    entry.overridden_by = req.user._id;
    entry.overridden_at = new Date();
    entry.perdiem_tier = override_tier;
    entry.perdiem_amount = amount;

    await ErpAuditLog.logChange({
      entity_id: smer.entity_id, bdm_id: smer.bdm_id,
      log_type: 'ITEM_CHANGE', target_ref: smer._id.toString(), target_model: 'SmerEntry',
      field_changed: `daily_entries.${entry.day}.perdiem_tier`,
      old_value: `${oldTier} (md_count: ${entry.md_count})`, new_value: `${override_tier} (override: ${override_reason})`,
      changed_by: req.user._id, note: `Per diem override day ${entry.day}: ${oldTier} → ${override_tier} — ${override_reason}`
    });
  }

  await smer.save();  // pre-save recomputes totals
  res.json({ success: true, data: smer });
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
  res.status(201).json({ success: true, data: entry });
});

const updateCarLogbook = catchAsync(async (req, res) => {
  const entry = await CarLogbookEntry.findOne({ _id: req.params.id, ...req.tenantFilter, status: { $in: ['DRAFT', 'ERROR'] } });
  if (!entry) return res.status(404).json({ success: false, message: 'Draft car logbook entry not found' });

  Object.assign(entry, req.body);
  await entry.save();
  res.json({ success: true, data: entry });
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
    if (!entry.starting_km && entry.starting_km !== 0) errors.push('Starting KM is required');
    if (!entry.ending_km && entry.ending_km !== 0) errors.push('Ending KM is required');
    if (entry.ending_km < entry.starting_km) errors.push('Ending KM must be >= Starting KM');
    if (entry.personal_km > entry.total_km) errors.push('Personal KM cannot exceed total KM');

    // CALF gate: non-cash fuel entries require CALF to be linked AND POSTED
    for (let j = 0; j < (entry.fuel_entries || []).length; j++) {
      const fuel = entry.fuel_entries[j];
      if (fuel.calf_required && req.user.role !== 'president') {
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

  // Period lock check
  const { checkPeriodOpen } = require('../utils/periodLock');
  for (const entry of entries) { await checkPeriodOpen(entry.entity_id, entry.period); }

  // Pre-submit gate: verify all linked CALFs are POSTED
  for (const entry of entries) {
    for (const fuel of (entry.fuel_entries || [])) {
      if (fuel.calf_required && fuel.calf_id && req.user.role !== 'president') {
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

  res.json({ success: true, message: `Posted ${entries.length} logbook(s)` });
});

const reopenCarLogbook = catchAsync(async (req, res) => {
  const { logbook_ids } = req.body;
  const entries = await CarLogbookEntry.find({ _id: { $in: logbook_ids }, ...req.tenantFilter, status: 'POSTED' });
  if (!entries.length) return res.status(400).json({ success: false, message: 'No POSTED logbooks to reopen' });

  for (const entry of entries) {
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
  }

  res.json({ success: true, message: `Reopened ${entries.length} logbook(s)` });
});

// ═══════════════════════════════════════════
// EXPENSE ENTRY (ORE/ACCESS) ENDPOINTS
// ═══════════════════════════════════════════

const createExpense = catchAsync(async (req, res) => {
  const entry = await ExpenseEntry.create({
    ...req.body,
    entity_id: req.entityId,
    bdm_id: req.bdmId,
    created_by: req.user._id,
    status: 'DRAFT'
  });
  res.status(201).json({ success: true, data: entry });
});

const updateExpense = catchAsync(async (req, res) => {
  const entry = await ExpenseEntry.findOne({ _id: req.params.id, ...req.tenantFilter, status: { $in: ['DRAFT', 'ERROR'] } });
  if (!entry) return res.status(404).json({ success: false, message: 'Draft expense not found' });

  Object.assign(entry, req.body);
  await entry.save();
  res.json({ success: true, data: entry });
});

const getExpenseList = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.period) filter.period = req.query.period;
  if (req.query.cycle) filter.cycle = req.query.cycle;

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
    const errors = [];

    if (!entry.lines.length) errors.push('No expense lines');
    if (!entry.period) errors.push('Period is required');
    if (!entry.cycle) errors.push('Cycle is required');

    for (let i = 0; i < entry.lines.length; i++) {
      const line = entry.lines[i];
      if (!line.expense_date) errors.push(`Line ${i + 1}: date is required`);
      if (!line.amount || line.amount <= 0) errors.push(`Line ${i + 1}: valid amount required`);
      if (!line.establishment) errors.push(`Line ${i + 1}: establishment is required`);

      // OR proof gate: ORE and ACCESS lines require OR photo or OR number (PRD v5 §8.3)
      if (!line.or_photo_url && !line.or_number) {
        errors.push(`Line ${i + 1}: OR photo or OR number required for ${line.expense_type} expense`);
      }

      // CALF gate: ACCESS with non-cash requires CALF to be linked AND POSTED
      if (line.calf_required && req.user.role !== 'president') {
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

  // Period lock check
  const { checkPeriodOpen } = require('../utils/periodLock');
  for (const entry of entries) { await checkPeriodOpen(entry.entity_id, entry.period); }

  // Pre-submit gate: verify all linked CALFs are POSTED
  for (const entry of entries) {
    for (const line of (entry.lines || [])) {
      if (line.calf_required && line.calf_id && req.user.role !== 'president') {
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

  res.json({ success: true, message: `Posted ${entries.length} expense(s)` });
});

const reopenExpenses = catchAsync(async (req, res) => {
  const { expense_ids } = req.body;
  const entries = await ExpenseEntry.find({ _id: { $in: expense_ids }, ...req.tenantFilter, status: 'POSTED' });
  if (!entries.length) return res.status(400).json({ success: false, message: 'No POSTED expenses to reopen' });

  for (const entry of entries) {
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
  }

  res.json({ success: true, message: `Reopened ${entries.length} expense(s)` });
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

    // Try ExpenseEntry first (ACCESS lines)
    const expense = await ExpenseEntry.findById(doc.linked_expense_id);
    if (expense) {
      for (const line of expense.lines) {
        if (doc.linked_expense_line_ids.some(lid => lid.toString() === line._id.toString())) {
          line.calf_id = doc._id;
          if (line.or_photo_url) collectedPhotos.push(line.or_photo_url);
        }
      }
      await expense.save();
    } else {
      // Try CarLogbookEntry (fuel entries)
      const logbook = await CarLogbookEntry.findById(doc.linked_expense_id);
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

  Object.assign(doc, req.body);
  await doc.save();
  res.json({ success: true, data: doc });
});

const getPrfCalfList = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };
  if (req.query.doc_type) filter.doc_type = req.query.doc_type;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.period) filter.period = req.query.period;

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

  res.json({ success: true, message: `Posted ${docs.length} PRF/CALF(s)` });
});

const reopenPrfCalf = catchAsync(async (req, res) => {
  const { prf_calf_ids } = req.body;
  const docs = await PrfCalf.find({ _id: { $in: prf_calf_ids }, ...req.tenantFilter, status: 'POSTED' });
  if (!docs.length) return res.status(400).json({ success: false, message: 'No POSTED PRF/CALFs to reopen' });

  for (const doc of docs) {
    doc.status = 'DRAFT';
    doc.reopen_count = (doc.reopen_count || 0) + 1;
    doc.posted_at = undefined;
    doc.posted_by = undefined;
    await doc.save();

    await ErpAuditLog.logChange({
      entity_id: doc.entity_id,
      bdm_id: doc.bdm_id,
      log_type: 'REOPEN',
      target_ref: doc._id.toString(),
      target_model: 'PrfCalf',
      changed_by: req.user._id,
      note: `Reopened ${doc.doc_type} (count: ${doc.reopen_count})`
    });
  }

  res.json({ success: true, message: `Reopened ${docs.length} PRF/CALF(s)` });
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

  // Build daily entries with CRM data
  const DAYS_OF_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const entries = [];

  for (let day = startDay; day <= endDay; day++) {
    const date = new Date(year, month - 1, day);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue; // Skip weekends

    const dateKey = date.toISOString().split('T')[0];
    const crmData = dailyCounts[dateKey] || { md_count: 0, unique_doctors: 0 };
    const { tier, amount } = computePerdiemAmount(crmData.md_count, perdiemRate, settings);

    entries.push({
      day,
      entry_date: dateKey,
      day_of_week: DAYS_OF_WEEK[dow],
      md_count: crmData.md_count,
      unique_doctors: crmData.unique_doctors,
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
        or_photo_url: l.or_photo_url || null
      }))
    });
  }

  // 2. Car Logbook fuel entries paid with company funds (non-cash)
  const COMPANY_FUEL_MODES = ['SHELL_FLEET_CARD', 'CARD', 'GCASH'];
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

module.exports = {
  // SMER
  createSmer, updateSmer, getSmerList, getSmerById, deleteDraftSmer,
  validateSmer, submitSmer, reopenSmer,
  overridePerdiemDay, getSmerCrmMdCounts, getSmerCrmVisitDetail,
  // Car Logbook
  createCarLogbook, updateCarLogbook, getCarLogbookList, getCarLogbookById, deleteDraftCarLogbook,
  validateCarLogbook, submitCarLogbook, reopenCarLogbook,
  // Expenses (ORE/ACCESS)
  createExpense, updateExpense, getExpenseList, getExpenseById, deleteDraftExpense,
  validateExpenses, submitExpenses, reopenExpenses,
  // PRF/CALF
  createPrfCalf, updatePrfCalf, getPrfCalfList, getPrfCalfById, deleteDraftPrfCalf,
  validatePrfCalf, submitPrfCalf, reopenPrfCalf, getPendingPartnerRebates, getPendingCalfLines,
  // Summary
  getExpenseSummary
};
