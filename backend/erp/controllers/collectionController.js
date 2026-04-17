/**
 * Collection Controller — SAP-style Validate → Submit → Re-open
 *
 * P5: One CR = One Hospital. Hard gate on submit.
 * AR is computed on-read via arEngine (never stored on SalesLine).
 */
const mongoose = require('mongoose');
const Collection = require('../models/Collection');
const SalesLine = require('../models/SalesLine');
const TransactionEvent = require('../models/TransactionEvent');
const ErpAuditLog = require('../models/ErpAuditLog');
const Hospital = require('../models/Hospital');
const DocumentAttachment = require('../models/DocumentAttachment');
const { catchAsync } = require('../../middleware/errorHandler');
const { getOpenCsis, getArAging, getCollectionRate, getHospitalArBalance } = require('../services/arEngine');
const { enrichArWithDunning } = require('../services/dunningService');
const { generateSoaWorkbook } = require('../services/soaGenerator');
const { journalFromCollection, journalFromCWT, journalFromCommission, resolveFundingCoa } = require('../services/autoJournal');
const { createAndPostJournal, reverseJournal } = require('../services/journalEngine');
const JournalEntry = require('../models/JournalEntry');
const { createVatEntry } = require('../services/vatService');
const { createCwtEntry } = require('../services/cwtService');
const VatLedger = require('../models/VatLedger');
const CwtLedger = require('../models/CwtLedger');
const { notifyDocumentPosted, notifyDocumentReopened } = require('../services/erpNotificationService');
const Settings = require('../models/Settings');
const PettyCashFund = require('../models/PettyCashFund');
const PettyCashTransaction = require('../models/PettyCashTransaction');

// ═══ CRUD ═══

const createCollection = catchAsync(async (req, res) => {
  const data = {
    ...req.body,
    entity_id: req.entityId,
    bdm_id: req.bdmId,
    created_by: req.user._id,
    status: 'DRAFT'
  };
  const collection = await Collection.create(data);
  res.status(201).json({ success: true, data: collection });
});

const updateCollection = catchAsync(async (req, res) => {
  const collection = await Collection.findOne({ _id: req.params.id, ...req.tenantFilter, status: 'DRAFT' });
  if (!collection) return res.status(404).json({ success: false, message: 'Draft collection not found' });

  Object.assign(collection, req.body);
  await collection.save();
  res.json({ success: true, data: collection });
});

const deleteDraftCollection = catchAsync(async (req, res) => {
  const result = await Collection.findOneAndDelete({ _id: req.params.id, ...req.tenantFilter, status: 'DRAFT' });
  if (!result) return res.status(404).json({ success: false, message: 'Draft collection not found' });
  res.json({ success: true, message: 'Draft deleted' });
});

const getCollections = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.hospital_id) filter.hospital_id = req.query.hospital_id;
  if (req.query.cr_date_from || req.query.cr_date_to) {
    filter.cr_date = {};
    if (req.query.cr_date_from) filter.cr_date.$gte = new Date(req.query.cr_date_from);
    if (req.query.cr_date_to) filter.cr_date.$lte = new Date(req.query.cr_date_to);
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Collection.find(filter).sort({ cr_date: -1 }).skip(skip).limit(limit)
      .populate('hospital_id', 'hospital_name')
      .populate('customer_id', 'customer_name customer_type')
      .populate('bdm_id', 'name')
      .populate('petty_cash_fund_id', 'fund_code fund_name')
      .populate('bank_account_id', 'bank_name bank_code')
      .lean(),
    Collection.countDocuments(filter)
  ]);

  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const getCollectionById = catchAsync(async (req, res) => {
  // President sees all; others scoped by entity (+ bdm for employees)
  const filter = { _id: req.params.id, ...req.tenantFilter };
  const collection = await Collection.findOne(filter)
    .populate('hospital_id', 'hospital_name tin cwt_rate payment_terms')
    .populate('customer_id', 'customer_name customer_type tin payment_terms')
    .populate('bdm_id', 'name')
    .populate('petty_cash_fund_id', 'fund_code fund_name')
    .populate('bank_account_id', 'bank_name bank_code')
    .lean();
  if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
  res.json({ success: true, data: collection });
});

// ═══ AR QUERIES ═══

const getOpenCsisEndpoint = catchAsync(async (req, res) => {
  const hospitalId = req.query.hospital_id;
  const customerId = req.query.customer_id;
  if (!hospitalId && !customerId) return res.status(400).json({ success: false, message: 'hospital_id or customer_id required' });

  const entityId = (req.isPresident || req.isAdmin || req.isFinance) && req.query.entity_id
    ? req.query.entity_id : req.entityId;
  const bdmId = (req.isPresident || req.isAdmin || req.isFinance) && req.query.bdm_id
    ? req.query.bdm_id : req.bdmId;

  const csis = await getOpenCsis(entityId, bdmId, hospitalId, customerId);
  res.json({ success: true, data: csis });
});

const getArAgingEndpoint = catchAsync(async (req, res) => {
  const entityId = (req.isPresident || req.isAdmin || req.isFinance) && req.query.entity_id
    ? req.query.entity_id : req.entityId;
  const bdmId = (req.isPresident || req.isAdmin || req.isFinance) && req.query.bdm_id
    ? req.query.bdm_id : req.bdmId;

  const arData = await getArAging(entityId, bdmId, req.query.hospital_id);
  const enriched = enrichArWithDunning(arData);
  res.json({ success: true, data: enriched });
});

const getCollectionRateEndpoint = catchAsync(async (req, res) => {
  const entityId = (req.isPresident || req.isAdmin || req.isFinance) && req.query.entity_id
    ? req.query.entity_id : req.entityId;
  const bdmId = (req.isPresident || req.isAdmin || req.isFinance) && req.query.bdm_id
    ? req.query.bdm_id : req.bdmId;

  const rate = await getCollectionRate(entityId, bdmId, req.query.date_from, req.query.date_to);
  res.json({ success: true, data: rate });
});

// ═══ VALIDATE ═══

const validateCollections = catchAsync(async (req, res) => {
  const filter = { ...req.tenantFilter, status: { $in: ['DRAFT', 'ERROR'] } };
  if (req.body.collection_ids?.length) filter._id = { $in: req.body.collection_ids };

  const rows = await Collection.find(filter);
  if (!rows.length) return res.json({ success: true, valid_count: 0, error_count: 0 });

  let validCount = 0, errorCount = 0;

  for (const row of rows) {
    const errors = [];

    // Required fields — Phase 18: hospital_id OR customer_id
    if (!row.hospital_id && !row.customer_id) errors.push('Hospital or Customer is required');
    if (!row.cr_no) errors.push('CR number is required');
    if (!row.cr_date) errors.push('CR date is required');
    if (!row.cr_amount || row.cr_amount <= 0) errors.push('CR amount must be greater than 0');
    if (!row.settled_csis?.length) errors.push('At least one CSI must be selected');

    // Future date check
    if (row.cr_date && row.cr_date > new Date()) errors.push('CR date cannot be in the future');

    // Hard gate: required documents — CASH mode skips CR photo and deposit slip
    const isCash = row.payment_mode === 'CASH';
    if (!isCash && !row.cr_photo_url) errors.push('CR photo is required');
    if (!isCash && !row.deposit_slip_url) errors.push('Deposit slip photo is required');
    if (!row.cwt_na && !row.cwt_certificate_url) errors.push('CWT certificate is required (or mark CWT as N/A)');

    // Payment mode-specific field validation
    if (row.payment_mode === 'CHECK') {
      if (!row.check_no) errors.push('Check number is required for CHECK payments');
      if (!row.bank) errors.push('Bank name is required for CHECK payments');
    }

    // Validate settled CSIs reference valid POSTED SalesLines (entity_id + hospital_id enforced)
    if (row.settled_csis?.length) {
      if (!row.entity_id) {
        errors.push('Collection must have an entity_id to validate CSIs');
      }

      const slIds = row.settled_csis.map(s => s.sales_line_id);
      const validSales = await SalesLine.find({
        _id: { $in: slIds }, status: 'POSTED', hospital_id: row.hospital_id, entity_id: row.entity_id
      }).select('_id invoice_total').lean();
      const validMap = new Map(validSales.map(s => [s._id.toString(), s]));

      for (const csi of row.settled_csis) {
        if (!validMap.has(csi.sales_line_id?.toString())) {
          errors.push(`CSI ${csi.doc_ref || csi.sales_line_id} is not a valid POSTED sale for this hospital/entity`);
        }
      }

      // Double-settlement check: scoped by entity_id to prevent cross-entity interference
      for (const csi of row.settled_csis) {
        const otherSettlements = await Collection.aggregate([
          { $match: { status: 'POSTED', entity_id: row.entity_id, _id: { $ne: row._id } } },
          { $unwind: '$settled_csis' },
          { $match: { 'settled_csis.sales_line_id': csi.sales_line_id } },
          { $group: { _id: null, total: { $sum: '$settled_csis.invoice_amount' } } }
        ]);
        const alreadyCollected = otherSettlements[0]?.total || 0;
        const originalSale = validMap.get(csi.sales_line_id?.toString());
        if (originalSale && alreadyCollected + csi.invoice_amount > originalSale.invoice_total + 0.01) {
          errors.push(`CSI ${csi.doc_ref} would exceed invoice total (already collected: P${alreadyCollected.toFixed(2)})`);
        }
      }

      // Hospital-wide AR balance check: total collection must not exceed total outstanding AR
      const hospitalArBalance = await getHospitalArBalance(row.hospital_id, row.entity_id);
      const thisCollectionTotal = row.settled_csis.reduce((sum, c) => sum + (c.invoice_amount || 0), 0);
      if (hospitalArBalance > 0 && thisCollectionTotal > hospitalArBalance + 0.01) {
        errors.push(`Total settlement (P${thisCollectionTotal.toFixed(2)}) exceeds hospital AR balance (P${hospitalArBalance.toFixed(2)})`);
      }


    }

    // Petty cash fund validation (defense-in-depth: catch bad refs before submit)
    if (row.petty_cash_fund_id) {
      if (row.bank_account_id) {
        errors.push('Cannot set both bank account and petty cash fund — choose one destination');
      }
      const pcFund = await PettyCashFund.findById(row.petty_cash_fund_id).lean();
      if (!pcFund) {
        errors.push('Petty cash fund not found');
      } else {
        if (pcFund.entity_id?.toString() !== row.entity_id?.toString()) {
          errors.push('Petty cash fund belongs to a different entity');
        }
        if (pcFund.status !== 'ACTIVE') {
          errors.push(`Petty cash fund is ${pcFund.status} — deposits blocked`);
        }
        if ((pcFund.fund_mode || 'REVOLVING') === 'EXPENSE_ONLY') {
          errors.push('Petty cash fund is EXPENSE_ONLY — deposits not allowed');
        }
      }
    }

    // CWT recomputation — backend is authoritative, don't trust frontend cwt_amount
    const totalCsiForCwt = row.total_csi_amount || row.settled_csis?.reduce((s, c) => s + (c.invoice_amount || 0), 0) || 0;
    if (!row.cwt_na && row.cwt_rate > 0) {
      const recomputedCwt = Math.round(totalCsiForCwt * row.cwt_rate * 100) / 100;
      if (Math.abs((row.cwt_amount || 0) - recomputedCwt) > 0.01) {
        errors.push(`CWT amount mismatch: stored P${(row.cwt_amount || 0).toFixed(2)} vs computed P${recomputedCwt.toFixed(2)} (rate: ${(row.cwt_rate * 100).toFixed(1)}%)`);
        row.cwt_amount = recomputedCwt; // auto-correct
      }
    } else if (row.cwt_na) {
      row.cwt_amount = 0;
    }

    // CR formula validation: cr_amount = CSI total - CWT
    const expectedCr = (totalCsiForCwt) - (row.cwt_amount || 0);
    if (Math.abs((row.cr_amount || 0) - expectedCr) > 0.01) {
      errors.push(`CR amount (P${row.cr_amount}) does not match expected (P${expectedCr.toFixed(2)} = CSI total - CWT)`);
    }

    if (errors.length) {
      row.status = 'ERROR';
      row.validation_errors = errors;
      errorCount++;
    } else {
      row.status = 'VALID';
      row.validation_errors = [];
      validCount++;
    }
    await row.save();
  }

  res.json({ success: true, valid_count: validCount, error_count: errorCount });
});

// ═══ SUBMIT ═══

const submitCollections = catchAsync(async (req, res) => {
  let warnings;
  const { collection_ids } = req.body;
  const filter = { ...req.tenantFilter, status: 'VALID' };
  if (collection_ids && collection_ids.length) {
    filter._id = { $in: collection_ids.map(id => new mongoose.Types.ObjectId(id)) };
  }
  const validRows = await Collection.find(filter);
  if (!validRows.length) {
    return res.status(400).json({ success: false, message: 'No VALID collections to submit' });
  }

  const settings = await Settings.getSettings();

  // Authority matrix gate — single gate for batch
  const { gateApproval } = require('../services/approvalService');
  const crTotalAmount = validRows.reduce((sum, r) => sum + (r.cr_amount || 0), 0);
  const gated = await gateApproval({
    entityId: req.entityId,
    module: 'COLLECTIONS',
    docType: 'CR',
    docId: validRows[0]._id,
    docRef: validRows.map(r => r.cr_no).filter(Boolean).join(', '),
    amount: crTotalAmount,
    description: `Submit ${validRows.length} collection${validRows.length === 1 ? '' : 's'} (total ₱${crTotalAmount.toLocaleString()})`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  // Period lock check
  const { checkPeriodOpen, dateToPeriod } = require('../utils/periodLock');
  for (const row of validRows) {
    const period = dateToPeriod(row.cr_date);
    await checkPeriodOpen(row.entity_id, period);
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const row of validRows) {
        const [event] = await TransactionEvent.create([{
          entity_id: row.entity_id,
          bdm_id: row.bdm_id,
          event_type: 'CR',
          event_date: row.cr_date,
          document_ref: row.cr_no,
          payload: {
            hospital_id: row.hospital_id,
            settled_csis: row.settled_csis,
            cr_amount: row.cr_amount,
            cwt_amount: row.cwt_amount,
            total_commission: row.total_commission,
            total_partner_rebates: row.total_partner_rebates,
            payment_mode: row.payment_mode
          },
          created_by: req.user._id
        }], { session });

        row.status = 'POSTED';
        row.posted_at = new Date();
        row.posted_by = req.user._id;
        row.event_id = event._id;
        await row.save({ session });

        // Petty cash auto-deposit (inside transaction for atomicity)
        // Approval is covered by the Collection's gateApproval — no separate petty cash gate
        if (row.petty_cash_fund_id) {
          const fund = await PettyCashFund.findById(row.petty_cash_fund_id).session(session);
          if (!fund) {
            throw new Error(`Petty cash fund not found for CR ${row.cr_no}`);
          }
          // Defense-in-depth: re-check status/mode (could change between validate and submit)
          if (['SUSPENDED', 'CLOSED'].includes(fund.status)) {
            throw new Error(`Fund ${fund.fund_code} is ${fund.status} — cannot deposit for CR ${row.cr_no}`);
          }
          if ((fund.fund_mode || 'REVOLVING') === 'EXPENSE_ONLY') {
            throw new Error(`Fund ${fund.fund_code} is EXPENSE_ONLY — cannot deposit for CR ${row.cr_no}`);
          }
          const depositAmount = row.cr_amount || 0;
          if (depositAmount > 0) {
            await PettyCashTransaction.create([{
              entity_id: row.entity_id,
              fund_id: fund._id,
              txn_type: 'DEPOSIT',
              txn_date: row.cr_date || new Date(),
              amount: depositAmount,
              source_description: `Collection ${row.cr_no || ''}`.trim(),
              linked_collection_id: row._id,
              status: 'POSTED',
              posted_at: new Date(),
              posted_by: req.user._id,
              created_by: req.user._id,
              running_balance: Math.round((fund.current_balance + depositAmount) * 100) / 100
            }], { session });
            await PettyCashFund.findByIdAndUpdate(fund._id, {
              $inc: { current_balance: depositAmount }
            }, { session });
          }
        }
      }
    });

    // Phase 9.1b: Link DocumentAttachments to events (outside transaction — non-blocking)
    for (const row of validRows) {
      if (row.event_id) {
        await DocumentAttachment.updateMany(
          { source_model: 'Collection', source_id: row._id },
          { $set: { event_id: row.event_id } }
        ).catch(() => {});
      }
    }

    // Phase 9.3: Auto-link CR events to settled CSI events (document flow)
    for (const row of validRows) {
      if (!row.event_id || !row.settled_csis?.length) continue;
      try {
        // Find CSI events for the settled sales lines
        const salesLineIds = row.settled_csis.map(c => c.sales_line_id);
        const csiEvents = await TransactionEvent.find({
          entity_id: row.entity_id,
          event_type: 'CSI',
          status: 'ACTIVE',
          'payload.hospital_id': row.hospital_id
        }).lean();

        // Match CSI events by checking if their source SalesLine is in settled list
        const csiSalesLines = await SalesLine.find({
          _id: { $in: salesLineIds },
          event_id: { $ne: null }
        }).select('event_id').lean();

        const csiEventIds = csiSalesLines
          .map(sl => sl.event_id?.toString())
          .filter(Boolean);

        if (csiEventIds.length) {
          const linkedEvents = csiEventIds.map(eid => ({
            event_id: eid,
            relationship: 'SETTLES'
          }));
          await TransactionEvent.findByIdAndUpdate(row.event_id, {
            $push: { linked_events: { $each: linkedEvents } }
          });
        }
      } catch (err) {
        console.error('Document flow linking failed for CR:', row.cr_no, err.message);
      }
    }

    // Phase 11: Auto-journal + VAT/CWT ledger + commission (non-blocking)
    for (const row of validRows) {
      try {
        // Collection JE
        const funding = await resolveFundingCoa(row);
        const jeData = await journalFromCollection(row, funding.coa_code, funding.coa_name, req.user._id);
        jeData.source_event_id = row.event_id;
        await createAndPostJournal(row.entity_id, jeData);

        // CWT journal if applicable
        if (row.cwt_amount > 0) {
          // Enrich with hospital_name for JE description
          const cwtHosp = row.hospital_id ? await Hospital.findById(row.hospital_id).select('hospital_name').lean() : null;
          const cwtInput = { ...row.toObject(), hospital_name: cwtHosp?.hospital_name || '' };
          const cwtData = await journalFromCWT(cwtInput, req.user._id);
          cwtData.source_event_id = row.event_id;
          await createAndPostJournal(row.entity_id, cwtData);
        }

        // Commission journal — for each settled CSI with commission
        for (const csi of (row.settled_csis || [])) {
          if (csi.commission_amount > 0) {
            const commData = await journalFromCommission({
              amount: csi.commission_amount,
              bdm_id: row.bdm_id,
              date: row.cr_date,
              bdm_name: '',
              period: row.period || require('../utils/periodLock').dateToPeriod(row.cr_date),
              event_id: row.event_id,
              _id: row._id
            }, req.user._id);
            if (commData) {
              commData.source_event_id = row.event_id;
              await createAndPostJournal(row.entity_id, commData);
            }
          }
        }

        // VAT Ledger — OUTPUT VAT from collection (skip for EXEMPT/ZERO hospitals)
        const crAmount = row.cr_amount || 0;
        const hospital = row.hospital_id ? await Hospital.findById(row.hospital_id).select('vat_status').lean() : null;
        const hospitalVatStatus = hospital?.vat_status || 'VATABLE';
        if (crAmount > 0 && hospitalVatStatus === 'VATABLE') {
          const vatRate = settings?.VAT_RATE || 0.12;
          const vatAmount = Math.round((crAmount * vatRate / (1 + vatRate)) * 100) / 100;
          await createVatEntry({
            entity_id: row.entity_id,
            period: row.period || require('../utils/periodLock').dateToPeriod(row.cr_date),
            vat_type: 'OUTPUT',
            source_module: 'COLLECTION',
            source_doc_ref: row.cr_no,
            source_event_id: row.event_id,
            hospital_or_vendor: row.hospital_id,
            gross_amount: crAmount,
            vat_amount: vatAmount
          }).catch(async (err) => {
            console.error('VAT entry failed:', row.cr_no, err.message);
            await ErpAuditLog.logChange({ entity_id: row.entity_id, log_type: 'LEDGER_ERROR', target_ref: row.cr_no, target_model: 'VatLedger', field_changed: 'vat_entry', old_value: '', new_value: err.message, changed_by: req.user._id, note: `VAT entry failed for CR ${row.cr_no}` }).catch(() => {});
            if (!warnings) warnings = [];
            warnings.push(`VAT entry failed for ${row.cr_no}: ${err.message}`);
          });
        }

        // CWT Ledger
        if (row.cwt_amount > 0) {
          const quarter = `Q${Math.ceil((new Date(row.cr_date).getMonth() + 1) / 3)}`;
          await createCwtEntry({
            entity_id: row.entity_id,
            bdm_id: row.bdm_id,
            period: row.period || require('../utils/periodLock').dateToPeriod(row.cr_date),
            hospital_id: row.hospital_id,
            cr_no: row.cr_no,
            cr_date: row.cr_date,
            cr_amount: row.cr_amount || 0,
            cwt_amount: row.cwt_amount,
            quarter,
            year: new Date(row.cr_date).getFullYear()
          }).catch(async (err) => {
            console.error('CWT entry failed:', row.cr_no, err.message);
            await ErpAuditLog.logChange({ entity_id: row.entity_id, log_type: 'LEDGER_ERROR', target_ref: row.cr_no, target_model: 'CwtLedger', field_changed: 'cwt_entry', old_value: '', new_value: err.message, changed_by: req.user._id, note: `CWT entry failed for CR ${row.cr_no}` }).catch(() => {});
            if (!warnings) warnings = [];
            warnings.push(`CWT entry failed for ${row.cr_no}: ${err.message}`);
          });
        }
      } catch (jeErr) {
        console.error('Auto-journal failed for collection:', row.cr_no || row._id, jeErr.message);
        await ErpAuditLog.logChange({ entity_id: row.entity_id, log_type: 'LEDGER_ERROR', target_ref: row.cr_no || row._id?.toString(), target_model: 'JournalEntry', field_changed: 'auto_journal', old_value: '', new_value: jeErr.message, changed_by: req.user._id, note: `Auto-journal failed for collection ${row.cr_no}` }).catch(() => {});
        if (!warnings) warnings = [];
        warnings.push(`Journal failed for ${row.cr_no}: ${jeErr.message}`);
      }
    }

    // Petty cash auto-deposit moved inside session.withTransaction() above for atomicity

    res.json({
      success: true,
      message: `${validRows.length} collection(s) posted`,
      warnings: warnings || undefined,
      posted_count: validRows.length
    });

    // Non-blocking: notify management of posted collections
    notifyDocumentPosted({
      entityId: req.entityId,
      module: 'Collections',
      docType: 'CR',
      docRef: validRows.map(r => r.cr_no).filter(Boolean).join(', '),
      postedBy: req.user.name || req.user.email,
      amount: validRows.reduce((sum, r) => sum + (r.cr_amount || 0), 0),
      period: validRows[0]?.cr_date ? new Date(validRows[0].cr_date).toISOString().slice(0, 7) : undefined,
    }).catch(err => console.error('Collection post notification failed:', err.message));
  } finally {
    await session.endSession();
  }
});

// ═══ REOPEN ═══

const reopenCollections = catchAsync(async (req, res) => {
  const { collection_ids } = req.body;
  if (!collection_ids?.length) return res.status(400).json({ success: false, message: 'collection_ids required' });

  const rows = await Collection.find({ _id: { $in: collection_ids }, ...req.tenantFilter, status: 'POSTED' });
  if (!rows.length) return res.status(404).json({ success: false, message: 'No POSTED collections found' });

  // Save event_ids before clearing them inside transaction
  const rowEventMap = rows.map(r => ({ _id: r._id, event_id: r.event_id, cr_no: r.cr_no, entity_id: r.entity_id, bdm_id: r.bdm_id }));

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const row of rows) {
        if (row.event_id) {
          await TransactionEvent.findByIdAndUpdate(row.event_id, { status: 'DELETED' }, { session });
          await VatLedger.deleteMany({ source_event_id: row.event_id }).session(session);
          await CwtLedger.deleteMany({ cr_no: row.cr_no, entity_id: row.entity_id }).session(session);
        }
        // Reverse petty cash deposit (inside transaction for atomicity)
        const pcTxn = await PettyCashTransaction.findOne({
          linked_collection_id: row._id,
          txn_type: 'DEPOSIT',
          status: 'POSTED'
        }).session(session);
        if (pcTxn) {
          pcTxn.status = 'VOIDED';
          pcTxn.voided_at = new Date();
          pcTxn.voided_by = req.user._id;
          pcTxn.void_reason = `Auto-reversed: Collection ${row.cr_no} reopened`;
          await pcTxn.save({ session });
          const fundResult = await PettyCashFund.findByIdAndUpdate(pcTxn.fund_id, {
            $inc: { current_balance: -pcTxn.amount }
          }, { session });
          if (!fundResult) {
            await ErpAuditLog.logChange({
              entity_id: row.entity_id, log_type: 'LEDGER_ERROR',
              target_ref: pcTxn.fund_id?.toString(), target_model: 'PettyCashFund',
              field_changed: 'current_balance', old_value: pcTxn.amount.toString(),
              new_value: 'FUND_NOT_FOUND', changed_by: req.user._id,
              note: `Fund deleted before reopen — balance decrement skipped for CR ${row.cr_no}`
            });
          }
        }

        row.status = 'DRAFT';
        row.reopen_count = (row.reopen_count || 0) + 1;
        row.posted_at = undefined;
        row.posted_by = undefined;
        row.event_id = undefined;
        await row.save({ session });
      }
    });

    // Reverse journal entries outside transaction (non-blocking)
    for (const item of rowEventMap) {
      if (item.event_id) {
        try {
          const jes = await JournalEntry.find({
            source_event_id: item.event_id, status: 'POSTED', is_reversal: { $ne: true }
          });
          for (const je of jes) {
            await reverseJournal(je._id, 'Auto-reversal: Collection reopen', req.user._id);
          }
        } catch (jeErr) {
          console.error('JE reversal failed for collection reopen:', item.cr_no, jeErr.message);
        }
      }

      // Petty cash deposit reversal moved inside session.withTransaction() above for atomicity

      await ErpAuditLog.logChange({
        entity_id: item.entity_id, bdm_id: item.bdm_id,
        log_type: 'STATUS_CHANGE', target_ref: item._id.toString(),
        target_model: 'Collection', field_changed: 'status',
        old_value: 'POSTED', new_value: 'DRAFT',
        changed_by: req.user._id, note: `CR ${item.cr_no} reopened`
      });
    }

    res.json({ success: true, message: `${rows.length} collection(s) reopened` });

    // Non-blocking: notify management of reopened collections
    notifyDocumentReopened({
      entityId: req.entityId,
      module: 'Collections',
      docType: 'CR',
      docRef: rows.map(r => r.cr_no).filter(Boolean).join(', '),
      reopenedBy: req.user.name || req.user.email,
      reason: req.body.reason,
    }).catch(err => console.error('Collection reopen notification failed:', err.message));
  } finally {
    await session.endSession();
  }
});

// ═══ DELETION ═══

const requestDeletion = catchAsync(async (req, res) => {
  const collection = await Collection.findOne({ _id: req.params.id, ...req.tenantFilter, status: 'POSTED' });
  if (!collection) return res.status(404).json({ success: false, message: 'Posted collection not found' });

  collection.status = 'DELETION_REQUESTED';
  await collection.save();

  await ErpAuditLog.logChange({
    entity_id: collection.entity_id, bdm_id: collection.bdm_id,
    log_type: 'STATUS_CHANGE', target_ref: collection._id.toString(),
    target_model: 'Collection', field_changed: 'status',
    old_value: 'POSTED', new_value: 'DELETION_REQUESTED',
    changed_by: req.user._id, note: `CR ${collection.cr_no} deletion requested`
  });

  res.json({ success: true, message: 'Deletion requested' });
});

const approveDeletion = catchAsync(async (req, res) => {
  const collection = await Collection.findOne({ _id: req.params.id, status: 'DELETION_REQUESTED' });
  if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });

  // Reversal event
  const [reversalEvent] = await TransactionEvent.create([{
    entity_id: collection.entity_id, bdm_id: collection.bdm_id,
    event_type: 'CR_REVERSAL', event_date: new Date(),
    document_ref: `REV-${collection.cr_no}`,
    corrects_event_id: collection.event_id,
    // Phase 9.3: Link reversal to original CR
    linked_events: collection.event_id ? [{ event_id: collection.event_id, relationship: 'REVERSES' }] : [],
    payload: { original_cr_no: collection.cr_no, reason: req.body.reason },
    created_by: req.user._id
  }]);

  // Reverse journal entries (collection JE + CWT JE)
  if (collection.event_id) {
    try {
      const jes = await JournalEntry.find({
        source_event_id: collection.event_id, status: 'POSTED', is_reversal: { $ne: true }
      });
      for (const je of jes) {
        await reverseJournal(je._id, 'Auto-reversal: Collection deletion approved', req.user._id);
      }
    } catch (jeErr) {
      console.error('JE reversal failed for collection deletion:', collection.cr_no, jeErr.message);
    }
  }

  collection.deletion_event_id = reversalEvent._id;
  await collection.save();

  res.json({ success: true, message: 'Deletion approved — reversal event created' });
});

// ═══ SOA ═══

const generateSoaEndpoint = catchAsync(async (req, res) => {
  const { hospital_id } = req.body;
  if (!hospital_id) return res.status(400).json({ success: false, message: 'hospital_id required' });

  const entityId = (req.isPresident || req.isAdmin || req.isFinance) && req.body.entity_id
    ? req.body.entity_id : req.entityId;
  const bdmId = (req.isPresident || req.isAdmin || req.isFinance) && req.body.bdm_id
    ? req.body.bdm_id : req.bdmId;

  const buffer = await generateSoaWorkbook(hospital_id, entityId, bdmId);

  const hospital = await Hospital.findById(hospital_id).select('hospital_name').lean();
  const filename = `SOA_${(hospital?.hospital_name || 'Hospital').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

// ═══ Single-document posting helper (called from Approval Hub) ═══

const postSingleCollection = async (doc, userId) => {
  const settings = await Settings.getSettings();

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const [event] = await TransactionEvent.create([{
        entity_id: doc.entity_id, bdm_id: doc.bdm_id, event_type: 'CR',
        event_date: doc.cr_date, document_ref: doc.cr_no,
        payload: {
          hospital_id: doc.hospital_id, settled_csis: doc.settled_csis,
          cr_amount: doc.cr_amount, cwt_amount: doc.cwt_amount,
          total_commission: doc.total_commission, total_partner_rebates: doc.total_partner_rebates,
          payment_mode: doc.payment_mode
        },
        created_by: userId
      }], { session });

      doc.status = 'POSTED';
      doc.posted_at = new Date();
      doc.posted_by = userId;
      doc.event_id = event._id;
      await doc.save({ session });

      // Petty cash auto-deposit (inside transaction for atomicity)
      if (doc.petty_cash_fund_id) {
        const fund = await PettyCashFund.findById(doc.petty_cash_fund_id).session(session);
        if (fund && !['SUSPENDED', 'CLOSED'].includes(fund.status) && (fund.fund_mode || 'REVOLVING') !== 'EXPENSE_ONLY') {
          const depositAmount = doc.cr_amount || 0;
          if (depositAmount > 0) {
            await PettyCashTransaction.create([{
              entity_id: doc.entity_id, fund_id: fund._id, txn_type: 'DEPOSIT',
              txn_date: doc.cr_date || new Date(), amount: depositAmount,
              source_description: `Collection ${doc.cr_no || ''}`.trim(),
              linked_collection_id: doc._id, status: 'POSTED', posted_at: new Date(),
              posted_by: userId, created_by: userId,
              running_balance: Math.round((fund.current_balance + depositAmount) * 100) / 100
            }], { session });
            await PettyCashFund.findByIdAndUpdate(fund._id, { $inc: { current_balance: depositAmount } }, { session });
          }
        }
      }
    });
  } finally { await session.endSession(); }

  // Non-blocking: DocumentAttachments
  await DocumentAttachment.updateMany(
    { source_model: 'Collection', source_id: doc._id },
    { $set: { event_id: doc.event_id } }
  ).catch(() => {});

  // Auto-journal (non-blocking)
  try {
    const funding = await resolveFundingCoa(doc);
    const jeData = await journalFromCollection(doc, funding.coa_code, funding.coa_name, userId);
    jeData.source_event_id = doc.event_id;
    await createAndPostJournal(doc.entity_id, jeData);

    // CWT journal
    if (doc.cwt_amount > 0) {
      const cwtHosp = doc.hospital_id ? await Hospital.findById(doc.hospital_id).select('hospital_name').lean() : null;
      const cwtInput = { ...doc.toObject(), hospital_name: cwtHosp?.hospital_name || '' };
      const cwtData = await journalFromCWT(cwtInput, userId);
      cwtData.source_event_id = doc.event_id;
      await createAndPostJournal(doc.entity_id, cwtData);
    }

    // Commission journals
    for (const csi of (doc.settled_csis || [])) {
      if (csi.commission_amount > 0) {
        const commData = await journalFromCommission({
          amount: csi.commission_amount, bdm_id: doc.bdm_id, date: doc.cr_date, bdm_name: '',
          period: doc.period || require('../utils/periodLock').dateToPeriod(doc.cr_date),
          event_id: doc.event_id, _id: doc._id
        }, userId);
        if (commData) { commData.source_event_id = doc.event_id; await createAndPostJournal(doc.entity_id, commData); }
      }
    }

    // VAT Ledger
    const crAmount = doc.cr_amount || 0;
    const hospital = doc.hospital_id ? await Hospital.findById(doc.hospital_id).select('vat_status').lean() : null;
    if (crAmount > 0 && (hospital?.vat_status || 'VATABLE') === 'VATABLE') {
      const vatRate = settings?.VAT_RATE || 0.12;
      const vatAmount = Math.round((crAmount * vatRate / (1 + vatRate)) * 100) / 100;
      await createVatEntry({
        entity_id: doc.entity_id, period: doc.period || require('../utils/periodLock').dateToPeriod(doc.cr_date),
        vat_type: 'OUTPUT', source_module: 'COLLECTION', source_doc_ref: doc.cr_no,
        source_event_id: doc.event_id, hospital_or_vendor: doc.hospital_id,
        gross_amount: crAmount, vat_amount: vatAmount
      }).catch(err => console.error('VAT entry failed (approval hub):', doc.cr_no, err.message));
    }

    // CWT Ledger
    if (doc.cwt_amount > 0) {
      const quarter = `Q${Math.ceil((new Date(doc.cr_date).getMonth() + 1) / 3)}`;
      await createCwtEntry({
        entity_id: doc.entity_id, bdm_id: doc.bdm_id,
        period: doc.period || require('../utils/periodLock').dateToPeriod(doc.cr_date),
        hospital_id: doc.hospital_id, cr_no: doc.cr_no, cr_date: doc.cr_date,
        cr_amount: doc.cr_amount || 0, cwt_amount: doc.cwt_amount,
        quarter, year: new Date(doc.cr_date).getFullYear()
      }).catch(err => console.error('CWT entry failed (approval hub):', doc.cr_no, err.message));
    }
  } catch (jeErr) {
    console.error('Auto-journal failed for collection (approval hub):', doc.cr_no || doc._id, jeErr.message);
  }
};

module.exports = {
  createCollection, updateCollection, deleteDraftCollection,
  getCollections, getCollectionById, getOpenCsisEndpoint,
  validateCollections, submitCollections, reopenCollections,
  getArAgingEndpoint, getCollectionRateEndpoint, generateSoaEndpoint,
  requestDeletion, approveDeletion,
  postSingleCollection
};
