/**
 * Sales Controller — SAP Park → Check → Post
 *
 * DRAFT → VALIDATE → POSTED → RE-OPEN lifecycle.
 * Uses MongoDB transactions for atomicity on submit.
 */
const mongoose = require('mongoose');
const SalesLine = require('../models/SalesLine');
const InventoryLedger = require('../models/InventoryLedger');
const ErpAuditLog = require('../models/ErpAuditLog');
const TransactionEvent = require('../models/TransactionEvent');
const ConsignmentTracker = require('../models/ConsignmentTracker');
const DocumentAttachment = require('../models/DocumentAttachment');
const { catchAsync } = require('../../middleware/errorHandler');
const { consumeFIFO, consumeSpecificBatch, buildStockSnapshot } = require('../services/fifoEngine');
const { journalFromSale, journalFromServiceRevenue, journalFromCOGS } = require('../services/autoJournal');
const { createAndPostJournal, reverseJournal } = require('../services/journalEngine');
const { presidentReverse } = require('../services/documentReversalService');
const JournalEntry = require('../models/JournalEntry');
const ProductMaster = require('../models/ProductMaster');
const { notifyDocumentPosted, notifyDocumentReopened } = require('../services/erpNotificationService');
const { getEditableStatuses } = require('../services/approvalService');
const PettyCashFund = require('../models/PettyCashFund');
const PettyCashTransaction = require('../models/PettyCashTransaction');
const Collection = require('../models/Collection');
const { validateCsiNumber, markUsed: markCsiUsed, unmarkUsed: unmarkCsiUsed } = require('../services/csiBookletService');
const Lookup = require('../models/Lookup');
// Phase G4.5a — proxy entry (record on behalf of another BDM)
// `assertResourceReadAccess` (Phase 15.3-fix May 07 2026) is the resource-first
// access gate used by `window.open()` flows that lose X-Entity-Id (CSI Draft).
const { resolveOwnerForWrite, widenFilterForProxy, assertResourceReadAccess, canProxyEntry } = require('../utils/resolveOwnerScope');
// Phase R-Storefront — Doctor model used for partner-tag denorm + validation
const Doctor = require('../../models/Doctor');
// Phase R2 — Sales Discount lookup-driven cap
const { getDiscountConfig, canBypassDiscountCap } = require('../../utils/salesDiscountConfig');

/**
 * Read a numeric flag from the per-entity SALES_SETTINGS lookup with a hard
 * fallback when the entry is missing. Mirrors `getGrnSetting` in
 * undertakingService.js — subscription-ready: subscribers tune flags in
 * Control Center → Lookup Tables without a code change. Defaults preserve
 * the pharmacy-ops behavior (photo required) so an entity that never opens
 * Control Center still gets the strict check.
 */
const getSalesSetting = async (entityId, code, fallback) => {
  if (!entityId) return fallback;
  try {
    const entry = await Lookup.findOne({
      entity_id: entityId,
      category: 'SALES_SETTINGS',
      code,
      is_active: true,
    }).lean();
    const value = entry?.metadata?.value;
    if (value === undefined || value === null) return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  } catch (err) {
    console.error(`[salesController] getSalesSetting failed for ${code}:`, err.message);
    return fallback;
  }
};

// ═══════════════════════════════════════════════════════════
// SHARED: Post a single SalesLine row (used by submitSales + approval handler)
// ═══════════════════════════════════════════════════════════

/**
 * Posts a single SalesLine row with full side effects:
 * TransactionEvent, inventory (FIFO/consignment), journal entries.
 *
 * @param {Object} row - Mongoose SalesLine document (mutated in place)
 * @param {ObjectId} userId - The user performing the post
 * @param {Object} [opts] - Optional overrides
 * @param {boolean} [opts.isAdminLike] - true if poster is president/admin/finance (entity-wide FIFO)
 * @returns {Promise<{eventId: ObjectId}>}
 */
const postSaleRow = async (row, userId, opts = {}) => {
  const saleType = row.sale_type || 'CSI';
  const eventType = saleType === 'SERVICE_INVOICE' ? 'SERVICE_INVOICE'
    : saleType === 'CASH_RECEIPT' ? 'CASH_RECEIPT' : 'CSI';

  const session = await mongoose.startSession();
  let eventId;

  try {
    await session.withTransaction(async () => {
      // 1. Create TransactionEvent (immutable)
      const [event] = await TransactionEvent.create([{
        entity_id: row.entity_id,
        bdm_id: row.bdm_id,
        event_type: eventType,
        event_date: row.csi_date,
        document_ref: row.doc_ref || row.invoice_number,
        payload: {
          hospital_id: row.hospital_id,
          customer_id: row.customer_id,
          sale_type: saleType,
          line_items: row.line_items,
          invoice_total: row.invoice_total,
          service_description: row.service_description,
          source: row.source
        },
        created_by: userId
      }], { session });

      eventId = event._id;

      // 2. SERVICE_INVOICE or OPENING_AR: no inventory deduction
      if (saleType === 'SERVICE_INVOICE' || row.source === 'OPENING_AR') {
        row.status = 'POSTED';
        row.posted_at = new Date();
        row.posted_by = userId;
        row.event_id = event._id;
        await row.save({ session });

        // Direct petty cash deposit for SERVICE_INVOICE with CASH payment + fund routing
        if (row.petty_cash_fund_id && saleType === 'SERVICE_INVOICE' && row.payment_mode === 'CASH') {
          // eslint-disable-next-line vip-tenant/require-entity-filter -- petty_cash_fund_id validated at validate-time (entity-scoped check, see L651); row from same-entity-scoped post path
          const fund = await PettyCashFund.findById(row.petty_cash_fund_id).session(session);
          if (!fund) throw new Error(`Petty cash fund not found for ${row.invoice_number || row._id}`);
          if (['SUSPENDED', 'CLOSED'].includes(fund.status)) throw new Error(`Fund ${fund.fund_code} is ${fund.status}`);
          if ((fund.fund_mode || 'REVOLVING') === 'EXPENSE_ONLY') throw new Error(`Fund ${fund.fund_code} is EXPENSE_ONLY`);
          const depositAmount = row.invoice_total || 0;
          if (depositAmount > 0) {
            await PettyCashTransaction.create([{
              entity_id: row.entity_id,
              fund_id: fund._id,
              txn_type: 'DEPOSIT',
              txn_date: row.csi_date || new Date(),
              amount: depositAmount,
              source_description: `${saleType} ${row.invoice_number || row.doc_ref || ''}`.trim(),
              linked_sales_line_id: row._id,
              status: 'POSTED',
              posted_at: new Date(),
              posted_by: userId,
              created_by: userId,
              running_balance: Math.round((fund.current_balance + depositAmount) * 100) / 100
            }], { session });
            // eslint-disable-next-line vip-tenant/require-entity-filter -- fund._id from same-entity-scoped fund above
            await PettyCashFund.findByIdAndUpdate(fund._id, {
              $inc: { current_balance: depositAmount }
            }, { session });
          }
        }

        // Phase R-Storefront Phase 2 — SERVICE_INVOICE storefront rebate routing.
        // Mirrors the CASH_RECEIPT routing block below; SERVICE_INVOICE early-
        // returns from postSaleRow so we attach routing inside this branch too.
        // OPENING_AR (also reaches here when source==='OPENING_AR') is skipped —
        // historical pre-cutover rows never carry storefront attribution.
        if (saleType === 'SERVICE_INVOICE' && row.petty_cash_fund_id) {
          try {
            const { routePrfsForSale } = require('../services/autoPrfRoutingForSale');
            const routed = await routePrfsForSale({
              salesLineId: row._id,
              userId,
              session,
            });
            if (routed.payeesProcessed > 0 || routed.commissionPayouts > 0) {
              console.log(
                `[autoPrfRoutingForSale] ${saleType} ${row.invoice_number || row.doc_ref || row._id}: ` +
                `${routed.prfsCreated} new PRFs, ${routed.prfsExisted} existing, ` +
                `${routed.rebatePayouts} rebate rows, ${routed.commissionPayouts} commission rows, ` +
                `${routed.payeesProcessed} MD payees`
              );
            }
          } catch (routeErr) {
            throw new Error(`autoPrfRoutingForSale failed for ${saleType} ${row.invoice_number || row.doc_ref || row._id}: ${routeErr.message}`);
          }
        }

        return;
      }

      // 3. Inventory deduction for CSI + CASH_RECEIPT (SALES_LINE only)
      for (const item of row.line_items) {
        const consignment = await ConsignmentTracker.findOne({
          entity_id: row.entity_id,
          bdm_id: row.bdm_id,
          hospital_id: row.hospital_id,
          product_id: item.product_id,
          status: 'ACTIVE'
        }).session(session);

        if (consignment) {
          consignment.qty_consumed += item.qty;
          consignment.conversions.push({
            csi_doc_ref: row.doc_ref,
            csi_date: row.csi_date,
            qty_converted: item.qty,
            sales_line_id: row._id
          });
          await consignment.save({ session });
        } else {
          const fifoOpts = { ...(row.warehouse_id && { warehouseId: row.warehouse_id.toString() }), session };
          const submitBdmId = opts.isAdminLike && !row.warehouse_id ? null : row.bdm_id;
          let consumed;
          if (item.fifo_override && item.batch_lot_no) {
            consumed = [await consumeSpecificBatch(
              row.entity_id, submitBdmId, item.product_id, item.batch_lot_no, item.qty, fifoOpts
            )];
          } else {
            consumed = await consumeFIFO(
              row.entity_id, submitBdmId, item.product_id, item.qty, fifoOpts
            );
          }

          for (const c of consumed) {
            await InventoryLedger.create([{
              entity_id: row.entity_id,
              bdm_id: c.bdm_id || row.bdm_id,
              warehouse_id: row.warehouse_id || undefined,
              product_id: item.product_id,
              batch_lot_no: c.batch_lot_no,
              expiry_date: c.expiry_date,
              transaction_type: 'CSI',
              qty_out: c.qty_consumed,
              event_id: event._id,
              fifo_override: item.fifo_override || false,
              override_reason: item.override_reason,
              recorded_by: userId
            }], { session });
          }
        }
      }

      // 4. Update SalesLine status
      row.status = 'POSTED';
      row.posted_at = new Date();
      row.posted_by = userId;
      row.event_id = event._id;
      // Phase A.4 — pre-stamp je_status='POSTED' inside the same txn. The
      // JE call below is also inside this txn (Phase JE-TX); if it throws,
      // the row + JE rollback together so je_status reverts to its prior
      // value (null on first POST). Setting BEFORE the JE call rather than
      // after avoids a second row.save() roundtrip.
      row.je_status = 'POSTED';
      row.je_attempts = (row.je_attempts || 0) + 1;
      row.last_je_attempt_at = new Date();
      await row.save({ session });

      // Direct petty cash deposit for CASH_RECEIPT with CASH payment + fund routing
      if (row.petty_cash_fund_id && saleType === 'CASH_RECEIPT' && row.payment_mode === 'CASH') {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- petty_cash_fund_id validated at validate-time (entity-scoped check, see L651); row from same-entity-scoped post path
        const fund = await PettyCashFund.findById(row.petty_cash_fund_id).session(session);
        if (!fund) throw new Error(`Petty cash fund not found for ${row.invoice_number || row._id}`);
        if (['SUSPENDED', 'CLOSED'].includes(fund.status)) throw new Error(`Fund ${fund.fund_code} is ${fund.status}`);
        if ((fund.fund_mode || 'REVOLVING') === 'EXPENSE_ONLY') throw new Error(`Fund ${fund.fund_code} is EXPENSE_ONLY`);
        const depositAmount = row.invoice_total || 0;
        if (depositAmount > 0) {
          await PettyCashTransaction.create([{
            entity_id: row.entity_id,
            fund_id: fund._id,
            txn_type: 'DEPOSIT',
            txn_date: row.csi_date || new Date(),
            amount: depositAmount,
            source_description: `${saleType} ${row.invoice_number || row.doc_ref || ''}`.trim(),
            linked_sales_line_id: row._id,
            status: 'POSTED',
            posted_at: new Date(),
            posted_by: userId,
            created_by: userId,
            running_balance: Math.round((fund.current_balance + depositAmount) * 100) / 100
          }], { session });
          // eslint-disable-next-line vip-tenant/require-entity-filter -- fund._id from same-entity-scoped fund above
          await PettyCashFund.findByIdAndUpdate(fund._id, {
            $inc: { current_balance: depositAmount }
          }, { session });
        }
      }

      // 5. Auto-journal entries — INSIDE the transaction (Phase JE-TX).
      //    Atomicity contract: if the JE post fails, the source-doc status flip
      //    + FIFO consumption + petty cash deposit ALL roll back together. No
      //    silent ledger drift; the user sees the JE error and retries after fix.
      const jeData = saleType === 'SERVICE_INVOICE'
        ? await journalFromServiceRevenue(row, row.entity_id, userId)
        : await journalFromSale(row, row.entity_id, userId);
      jeData.source_event_id = eventId;
      await createAndPostJournal(row.entity_id, jeData, { session });

      // COGS JE (skip for SERVICE_INVOICE and OPENING_AR)
      if (saleType !== 'SERVICE_INVOICE' && row.source !== 'OPENING_AR' && row.line_items?.length) {
        const productIds = row.line_items.map(li => li.product_id);
        // eslint-disable-next-line vip-tenant/require-entity-filter -- productIds harvested from same-entity-scoped row.line_items; _id is globally unique
        const products = await ProductMaster.find({ _id: { $in: productIds } }).select('purchase_price').session(session).lean();
        const costMap = new Map(products.map(p => [p._id.toString(), p.purchase_price || 0]));
        const totalCogs = row.line_items.reduce((sum, li) => sum + (li.qty || 0) * (costMap.get(li.product_id?.toString()) || 0), 0);
        const cogsData = await journalFromCOGS(row, Math.round(totalCogs * 100) / 100, userId);
        if (cogsData) {
          cogsData.source_event_id = eventId;
          await createAndPostJournal(row.entity_id, cogsData, { session });
        }
      }

      // ───────────────────────────────────────────────────────────────────
      // Phase R-Storefront Phase 2 (May 8 2026) — Auto-route storefront cash
      // attribution → RebatePayout(ACCRUING) + CommissionPayout(ACCRUING) +
      // DRAFT PRFs. Same atomicity contract as Collection.routePrfsForCollection
      // (Phase VIP-1.B): if routing fails, the entire sale post rolls back —
      // FIFO + JE + petty cash deposit + rebate audit ledger stay in lockstep.
      // Predicate matches the lookup-driven STOREFRONT_REBATE_SCOPE.DEFAULT
      // (CASH_RECEIPT/SERVICE_INVOICE routed through petty_cash_fund). Sales
      // without attribution data still post, just with empty routing output.
      // ───────────────────────────────────────────────────────────────────
      if (
        ['CASH_RECEIPT', 'SERVICE_INVOICE'].includes(saleType)
        && row.petty_cash_fund_id
      ) {
        try {
          const { routePrfsForSale } = require('../services/autoPrfRoutingForSale');
          const routed = await routePrfsForSale({
            salesLineId: row._id,
            userId,
            session,
          });
          if (routed.payeesProcessed > 0 || routed.commissionPayouts > 0) {
            console.log(
              `[autoPrfRoutingForSale] ${saleType} ${row.invoice_number || row.doc_ref || row._id}: ` +
              `${routed.prfsCreated} new PRFs, ${routed.prfsExisted} existing, ` +
              `${routed.rebatePayouts} rebate rows, ${routed.commissionPayouts} commission rows, ` +
              `${routed.payeesProcessed} MD payees`
            );
          }
        } catch (routeErr) {
          // Storefront rebate routing failures abort the whole post — same
          // posture as Collection. Subscribers can revisit after fixing the
          // attribution and re-submitting the sale via the Approval Hub.
          throw new Error(`autoPrfRoutingForSale failed for ${saleType} ${row.invoice_number || row.doc_ref || row._id}: ${routeErr.message}`);
        }
      }

      // ───────────────────────────────────────────────────────────────────
      // Phase CSI-X1 — Hospital PO line decrement
      // ───────────────────────────────────────────────────────────────────
      // When the CSI is linked to a HospitalPO, walk line_items and
      // increment qty_served on each linked HospitalPOLine atomically (same
      // session as JE-TX). Recompute parent HospitalPO status + totals from
      // the line aggregate. If any of this fails, the entire sale post rolls
      // back together with FIFO + JE — no orphaned PO state.
      if (row.po_id && Array.isArray(row.line_items) && row.line_items.length) {
        const { HospitalPO, HospitalPOLine } = require('../models/HospitalPO');
        const touchedPoIds = new Set([String(row.po_id)]);
        for (const item of row.line_items) {
          if (!item.po_line_id) continue;
          // eslint-disable-next-line vip-tenant/require-entity-filter -- po_line_id is globally unique; entity scope enforced by HospitalPO header
          const line = await HospitalPOLine.findById(item.po_line_id).session(session);
          if (!line) {
            throw new Error(`Linked HospitalPOLine ${item.po_line_id} not found — refusing to post`);
          }
          if (String(line.entity_id) !== String(row.entity_id)) {
            throw new Error('HospitalPOLine entity mismatch — refusing to post');
          }
          if (String(line.po_id) !== String(row.po_id)) {
            throw new Error(`HospitalPOLine ${item.po_line_id} does not belong to PO ${row.po_id}`);
          }
          if (String(line.product_id) !== String(item.product_id)) {
            throw new Error(`HospitalPOLine product mismatch on ${item.po_line_id}`);
          }
          line.qty_served = (line.qty_served || 0) + (item.qty || 0);
          // Pre-save hook recomputes qty_unserved + line status
          await line.save({ session });
          touchedPoIds.add(String(line.po_id));
        }
        // Recompute parent PO aggregate(s)
        for (const poId of touchedPoIds) {
          await HospitalPO.recomputeFromLines(poId, session);
        }
      }
    });

    // 6. Link DocumentAttachments — outside transaction, non-blocking. A linker
    //    failure does not invalidate the posted sale (attachment is metadata).
    // eslint-disable-next-line vip-tenant/require-entity-filter -- source_id is unique; row from same-entity-scoped post path
    await DocumentAttachment.updateMany(
      { source_model: 'SalesLine', source_id: row._id },
      { $set: { event_id: eventId } }
    ).catch(() => {});

    // 7. Phase 15.2 (softened) — auto-mark CSI number as used. Non-blocking.
    if ((row.sale_type || 'CSI') === 'CSI' && row.doc_ref) {
      try {
        await markCsiUsed(row.entity_id, null, row.doc_ref);
      } catch (csiErr) {
        console.error('CSI markUsed failed (non-blocking, approval hub):', row.doc_ref, csiErr.message);
      }
    }

    // 8. Phase SG-4 #22 — Credit rule assignment. Produces SalesCredit rows
    //    (audit trail of who-earns-what). Always non-blocking: a sale that
    //    posts but fails credit assignment will fall back to sale.bdm_id @
    //    100% on the next engine run, and the failure is logged via
    //    ErpAuditLog. Never reverses the sale itself.
    try {
      const { assign: assignCredits } = require('../services/creditRuleEngine');
      await assignCredits(row, { userId });
    } catch (ceErr) {
      console.error('Credit rule assignment failed (non-blocking):', row.doc_ref || row._id, ceErr.message);
    }

    return { eventId };
  } finally {
    await session.endSession();
  }
};

// ═══════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════

const createSale = catchAsync(async (req, res) => {
  // Determine source first so we can pick the right proxy sub-perm key.
  // Opening AR is gated by `sales.opening_ar_proxy`; live sales by `sales.proxy_entry`.
  const willBeOpeningAr = !!(req.user.live_date && req.body.csi_date &&
    new Date(req.body.csi_date) < new Date(req.user.live_date));
  const proxySubKey = willBeOpeningAr ? 'opening_ar_proxy' : 'proxy_entry';

  let owner;
  try {
    owner = await resolveOwnerForWrite(req, 'sales', { subKey: proxySubKey });
  } catch (err) {
    if (err.statusCode === 403) return res.status(403).json({ success: false, message: err.message });
    throw err;
  }

  // capture_id is a Round 2B / Slice 9 partial signal — when the BDM picked
  // a Capture Hub photo via the "From BDM Captures" picker, the page
  // forwards the source CaptureSubmission._id so the controller can
  // auto-finalize after the sale lands. Extracted out of the body before
  // the spread so it never reaches the SalesLine document.
  const {
    assigned_to: _discardAssignedTo,
    capture_id,
    ...bodyWithoutAssignedTo
  } = req.body || {};
  const saleData = {
    ...bodyWithoutAssignedTo,
    entity_id: req.entityId,
    bdm_id: owner.ownerId,
    recorded_on_behalf_of: owner.proxiedBy,
    created_by: req.user._id,
    status: 'DRAFT'
  };

  // Source routing: OPENING_AR if csi_date < user.live_date
  if (req.user.live_date && saleData.csi_date) {
    saleData.source = new Date(saleData.csi_date) < new Date(req.user.live_date)
      ? 'OPENING_AR' : 'SALES_LINE';
  }

  // Validate line items before saving — catch qty ≤ 0 and unit_price ≤ 0 early
  const saleType = saleData.sale_type || 'CSI';
  // Phase R2 — load lookup-driven discount cap once for all line checks.
  // Privileged users (president/admin/finance) bypass the configurable cap;
  // schema's hard 0..100 still applies via Mongoose validators.
  const discountCfg = await getDiscountConfig(req.entityId);
  const bypassCap = canBypassDiscountCap(req);
  if (saleType !== 'SERVICE_INVOICE' && Array.isArray(saleData.line_items)) {
    for (const item of saleData.line_items) {
      if (!item.qty || item.qty <= 0) {
        return res.status(400).json({
          success: false,
          message: `Quantity must be greater than 0 for ${item.item_key || 'product'}`
        });
      }
      if (!item.unit_price || item.unit_price <= 0) {
        return res.status(400).json({
          success: false,
          message: `Unit price must be greater than 0 for ${item.item_key || 'product'}`
        });
      }
      // Phase R2 — discount cap. Schema enforces 0..100; this is the
      // subscriber-tunable lower ceiling.
      const discPct = Number(item.line_discount_percent) || 0;
      if (discPct < 0 || discPct > 100) {
        return res.status(400).json({
          success: false,
          message: `Discount % must be between 0 and 100 for ${item.item_key || 'product'} (got ${discPct})`
        });
      }
      if (!bypassCap && discPct > discountCfg.max_percent) {
        return res.status(400).json({
          success: false,
          message: `Discount ${discPct}% exceeds cap of ${discountCfg.max_percent}% for ${item.item_key || 'product'}. Ask admin to raise SALES_DISCOUNT_CONFIG.max_percent or escalate.`
        });
      }
    }
  }

  // Phase 18: auto-generate invoice_number for non-CSI sales
  if (saleData.sale_type && saleData.sale_type !== 'CSI' && !saleData.invoice_number) {
    const { generateDocNumber } = require('../services/docNumbering');
    const prefix = saleData.sale_type === 'SERVICE_INVOICE' ? 'SVC' : 'RCT';
    saleData.invoice_number = await generateDocNumber({
      prefix,
      bdmId: req.bdmId,
      date: saleData.csi_date || new Date()
    });
    // Also set doc_ref to invoice_number for non-CSI (used in displays)
    if (!saleData.doc_ref) saleData.doc_ref = saleData.invoice_number;
  }

  const sale = await SalesLine.create(saleData);

  // Phase G4.5a — audit proxy creation so Activity Monitor can surface it.
  if (owner.isOnBehalf) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: owner.ownerId,
      log_type: 'PROXY_CREATE',
      target_ref: sale._id.toString(),
      target_model: 'SalesLine',
      changed_by: req.user._id,
      note: `Proxy create: ${sale.source || 'SALES_LINE'} ${sale.doc_ref || sale._id} keyed by ${req.user.name || req.user._id} (${req.user.role}) on behalf of BDM ${owner.ownerId}`
    }).catch(err => console.error('[createSale] PROXY_CREATE audit failed (non-critical):', err.message));
  }

  // Phase P1.2 Slice 9 partial — auto-finalize the source capture so a sale
  // created via the Round 2B "From BDM Captures" picker stops appearing in
  // the picker drawer and carries an audit-trail back-link. Best-effort:
  // failures here do not break the sale create.
  if (capture_id) {
    try {
      const { linkCaptureToDocument } = require('./captureSubmissionController');
      await linkCaptureToDocument(capture_id, 'SalesLine', sale._id, {
        user: req.user,
        entityId: sale.entity_id,
        isPresident: req.isPresident,
        isAdmin: req.isAdmin,
        isFinance: req.isFinance,
      });
    } catch (err) {
      console.error('[createSale] linkCaptureToDocument failed:', err.message);
    }
  }

  res.status(201).json({ success: true, data: sale });
});

const updateSale = catchAsync(async (req, res) => {
  // Phase G4.5a — proxy can edit any BDM's DRAFT row within the entity when
  // sales.proxy_entry (or opening_ar_proxy) is ticked. Non-proxy callers stay
  // scoped to their own bdm_id via the base tenantFilter.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...scope
  });

  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }
  if (sale.status !== 'DRAFT') {
    return res.status(400).json({ success: false, message: 'Only DRAFT sales can be edited' });
  }

  // Phase G4.5a — ownership is locked on edit. Strip assigned_to / bdm_id /
  // recorded_on_behalf_of from the body so a proxy can't silently reassign a
  // row to a different owner via update. Reassignment requires delete + recreate.
  const { assigned_to: _discardAssigned, bdm_id: _discardBdm, recorded_on_behalf_of: _discardProxy, ...editableBody } = req.body || {};

  // Track changes for audit
  const changes = [];
  for (const [key, val] of Object.entries(editableBody)) {
    if (['_id', 'entity_id', 'bdm_id', 'created_at', 'created_by', 'status'].includes(key)) continue;
    if (JSON.stringify(sale[key]) !== JSON.stringify(val)) {
      changes.push({ field: key, old: sale[key], new: val });
    }
  }

  const isProxyEdit = String(sale.bdm_id) !== String(req.user._id);

  Object.assign(sale, editableBody);
  sale.status = 'DRAFT'; // Reset to DRAFT on edit
  sale.validation_errors = [];

  // Re-route source when csi_date changes (same logic as createSale)
  if (req.user.live_date && sale.csi_date) {
    sale.source = new Date(sale.csi_date) < new Date(req.user.live_date)
      ? 'OPENING_AR' : 'SALES_LINE';
  }

  await sale.save();

  // Audit log — bdm_id tracks the owner (not the editor) so owner-scoped audit
  // filtering still works; log_type flips to PROXY_UPDATE when the editor
  // (req.user) is not the owner (Phase G4.5a).
  for (const change of changes) {
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: sale.bdm_id,
      log_type: isProxyEdit ? 'PROXY_UPDATE' : 'SALES_EDIT',
      target_ref: sale._id.toString(),
      target_model: 'SalesLine',
      field_changed: change.field,
      old_value: change.old,
      new_value: change.new,
      changed_by: req.user._id
    });
  }

  res.json({ success: true, data: sale });
});

const deleteDraftRow = catchAsync(async (req, res) => {
  // Phase G4.5a — proxy can delete another BDM's DRAFT within the entity.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...scope
  });

  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }
  if (sale.status !== 'DRAFT') {
    return res.status(400).json({ success: false, message: 'Only DRAFT rows can be deleted' });
  }

  // eslint-disable-next-line vip-tenant/require-entity-filter -- sale fetched via widenFilterForProxy (entity-scoped) above
  await SalesLine.findByIdAndDelete(sale._id);

  await ErpAuditLog.logChange({
    entity_id: sale.entity_id,
    bdm_id: sale.bdm_id,
    log_type: 'DELETION',
    target_ref: sale._id.toString(),
    target_model: 'SalesLine',
    changed_by: req.user._id,
    note: `Draft deleted: ${sale.doc_ref || sale._id}`
  });

  res.json({ success: true, message: 'Draft row deleted' });
});

// Rule #4 — enrich each sale's line_items[] with product_name + dosage so list/
// detail views can show brand_name + dosage_strength alongside the SKU
// (item_key). Mutates sales in place. Safe on empty line_items.
async function enrichLineItemsWithProductDisplay(sales) {
  const productIds = new Set();
  for (const s of sales) {
    for (const li of s.line_items || []) {
      if (li.product_id) productIds.add(String(li.product_id));
    }
  }
  if (!productIds.size) return;
  // eslint-disable-next-line vip-tenant/require-entity-filter -- productIds harvested from same-entity-scoped sale.line_items; _id is globally unique
  const products = await ProductMaster.find({ _id: { $in: Array.from(productIds) } })
    .select('brand_name dosage_strength')
    .lean();
  const productMap = new Map(products.map(p => [String(p._id), p]));
  for (const s of sales) {
    for (const li of s.line_items || []) {
      const p = productMap.get(String(li.product_id));
      if (p) {
        li.product_name = p.brand_name || '';
        li.dosage = p.dosage_strength || '';
      }
    }
  }
}

const getSales = catchAsync(async (req, res) => {
  // Phase G4.5a — widen filter to all BDMs in entity when caller is an eligible
  // proxy. Non-proxy callers stay scoped to their own bdm_id via tenantFilter.
  const filter = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });

  // Rule #21 — tenantFilter middleware sets {} for president (sees-all-entities by
  // design for create-stamp). On reads that produces a cross-entity leak: a
  // president working on MG and CO. would see VIP Sales / Opening AR rows. Apply
  // the working-entity scope explicitly here, mirroring the pattern in
  // collectionController.getArAgingEndpoint. Privileged callers opt out via
  // ?entity_id=<id> for cross-entity audit views.
  const privileged = req.isPresident || req.isAdmin || req.isFinance;
  if (privileged && req.query.entity_id) {
    filter.entity_id = req.query.entity_id;
  } else if (req.entityId) {
    filter.entity_id = req.entityId;
  }

  if (req.query.status) filter.status = req.query.status;
  if (req.query.hospital_id) filter.hospital_id = req.query.hospital_id;
  if (req.query.customer_id) filter.customer_id = req.query.customer_id;
  if (req.query.sale_type) filter.sale_type = req.query.sale_type;
  if (req.query.source) filter.source = req.query.source;
  if (req.query.csi_date_from || req.query.csi_date_to) {
    filter.csi_date = {};
    if (req.query.csi_date_from) filter.csi_date.$gte = new Date(req.query.csi_date_from);
    if (req.query.csi_date_to) filter.csi_date.$lte = new Date(req.query.csi_date_to);
  }
  if (req.query.csi_search) {
    const safe = String(req.query.csi_search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (safe) {
      const rx = new RegExp(safe, 'i');
      filter.$or = [{ doc_ref: rx }, { invoice_number: rx }];
    }
  }

  // Phase 6 — hide reversed rows by default; opt-in via ?include_reversed=true.
  // Reversed rows stay POSTED for audit, but pollute working lists if shown.
  if (req.query.include_reversed !== 'true') {
    filter.deletion_event_id = { $exists: false };
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const [sales, total] = await Promise.all([
    SalesLine.find(filter)
      .populate('hospital_id', 'hospital_name')
      .populate('customer_id', 'customer_name customer_type')
      .populate('bdm_id', 'name')
      .populate('recorded_on_behalf_of', 'name')
      .populate('created_by', 'name')
      .sort({ csi_date: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SalesLine.countDocuments(filter)
  ]);

  await enrichLineItemsWithProductDisplay(sales);

  res.json({
    success: true,
    data: sales,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

const getSaleById = catchAsync(async (req, res) => {
  // Phase G4.5a — widen for proxy reads.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...scope
  })
    .populate('hospital_id', 'hospital_name')
    .populate('customer_id', 'customer_name customer_type')
    .populate('bdm_id', 'name')
    .populate('recorded_on_behalf_of', 'name')
    .populate('created_by', 'name')
    .lean();

  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }

  await enrichLineItemsWithProductDisplay([sale]);

  res.json({ success: true, data: sale });
});

// ═══════════════════════════════════════════════════════════
// VALIDATE — THE CORE ENDPOINT
// ═══════════════════════════════════════════════════════════

const validateSales = catchAsync(async (req, res) => {
  const editable = await getEditableStatuses(req.entityId, 'SALES');
  // Phase G4.5a — proxy can validate rows owned by other BDMs in the entity.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  const filter = {
    ...scope,
    status: { $in: editable }
  };

  // Optionally validate specific rows
  if (req.body.sale_ids && req.body.sale_ids.length) {
    filter._id = { $in: req.body.sale_ids };
  }

  const rows = await SalesLine.find(filter);
  if (!rows.length) {
    return res.json({ success: true, valid_count: 0, error_count: 0, errors: [] });
  }

  // Per-entity lookup-driven flags — fetched once, applied per-row below.
  //
  // REQUIRE_CSI_PHOTO_OPENING_AR (default 1): gate Validate for OPENING_AR
  // rows only. Historical entries should already have the signed CSI in
  // hand at entry time, so we block VALID until one of csi_photo_url OR
  // csi_received_photo_url is populated ("any proof OK"). Subscribers flip
  // to 0 via Control Center if they're backfilling without scans.
  //
  // Live Sales (source=SALES_LINE) deliberately has NO photo gate at
  // Validate or Submit — the signed CSI is a post-delivery artifact and is
  // attached later via PUT /sales/:id/received-csi on SalesList.
  const requireCsiPhotoOpeningAr = (await getSalesSetting(req.entityId, 'REQUIRE_CSI_PHOTO_OPENING_AR', 1)) ? true : false;

  // Phase R2 — load discount cap once. Privileged roles bypass; schema's
  // hard 0..100 still applies via Mongoose validators.
  const discountCfg = await getDiscountConfig(req.entityId);
  const bypassDiscountCap = canBypassDiscountCap(req);

  // Build fresh stock snapshot from InventoryLedger — per-(bdm_id, warehouse_id) group.
  //
  // Phase 32R-Sales-Validate-Proxy-Scope (May 08 2026): the prior implementation
  // built ONE snapshot for the entire batch using rows[0].warehouse_id and a
  // single bdm_id derived from the requester. Two coupled bugs converged after
  // Phase 32R-Transfer-Stock-Scope (May 07 2026) flipped buildStockMatch from
  // XOR to AND:
  //
  //   (A) Proxy entries (recorded_on_behalf_of set) — req.bdmId is the proxy/
  //       data-entry user, NOT the row owner whose inventory is debited. AND
  //       mode intersects (proxy_bdm ∩ warehouse) → empty → "available 0,
  //       requested N" even when the OWNER has stock at the warehouse. This
  //       blocked Validate on every Proxied row in /erp/sales (the symptom the
  //       president hit on doc 4806 today).
  //
  //   (B) Privileged-caller fallback (May 07 same-day patch) dropped bdm_id to
  //       null for president/admin/finance. That widened validate to "all
  //       stock at this warehouse" but submit (line ~1146) keeps using
  //       row.bdm_id — so a privileged user could pass Validate against
  //       another BDM's stock at a shared warehouse, then hit
  //       INSUFFICIENT_STOCK at Submit time with no advance warning.
  //
  // Fix: build per-(effectiveBdmId, warehouseId) snapshots keyed off ROW
  // attributes, exactly mirroring submitSales's contract at line ~1146-1147:
  //
  //     effectiveBdmId = (privileged && !row.warehouse_id) ? null : row.bdm_id
  //
  // Per-group deducted tracker prevents one row's allocation from bleeding
  // into another group's pool (different BDMs at different warehouses are
  // separate inventory). Snapshot cache means N rows from the same group
  // produce ONE aggregation, not N — perf-equivalent to the prior single-pool
  // approach for the common case (single-BDM, single-warehouse batch).
  //
  // Subscription-readiness preserved: zero new lookups. The privileged-role
  // set still comes from req.isPresident / req.isAdmin / req.isFinance flags
  // stamped by tenantFilter (lookup-driven via PROXY_ENTRY_ROLES + role
  // baselines). Submit-side already harmonized; this commit closes the
  // validate-side gap.
  const snapshotCache = new Map();   // key "bdmId|warehouseId" → productTotals Map
  const deductedCache = new Map();   // key "bdmId|warehouseId" → Map(productId → qty)
  const isPrivilegedCaller = req.isPresident || req.isAdmin || req.isFinance;

  const getStockGroupForRow = async (row) => {
    const wh = row.warehouse_id ? row.warehouse_id.toString() : '';
    const ownerBdm = row.bdm_id ? row.bdm_id.toString() : null;
    // Mirrors submit-side line ~1146-1147 verbatim:
    //   privileged AND no warehouse → entity-wide (bdmId=null, no warehouse filter)
    //   otherwise                   → row.bdm_id ∩ row.warehouse_id (when set)
    const effectiveBdmId = (isPrivilegedCaller && !row.warehouse_id) ? null : ownerBdm;
    const cacheKey = `${effectiveBdmId || ''}|${wh}`;
    if (!snapshotCache.has(cacheKey)) {
      const opts = row.warehouse_id ? { warehouseId: wh } : undefined;
      const { productTotals } = await buildStockSnapshot(req.entityId, effectiveBdmId, opts);
      snapshotCache.set(cacheKey, productTotals);
      deductedCache.set(cacheKey, new Map());
    }
    return {
      productTotals: snapshotCache.get(cacheKey),
      deducted: deductedCache.get(cacheKey),
      effectiveBdmId,
      warehouseId: wh
    };
  };

  const errors = [];
  let validCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    const rowErrors = [];
    const rowWarnings = []; // monitoring-only; never blocks posting

    // Phase 18: type-aware required field validation
    const saleType = row.sale_type || 'CSI';

    // At least one customer reference required
    if (!row.hospital_id && !row.customer_id) {
      rowErrors.push('Hospital or Customer is required');
    }
    if (!row.csi_date) rowErrors.push('Invoice date is required');

    if (saleType === 'CSI') {
      if (!row.doc_ref) rowErrors.push('Document reference (CSI#) is required');
      if (!row.line_items || row.line_items.length === 0) rowErrors.push('At least one line item is required');

      // CSI photo proof — gated by source (see flag comment above).
      // OPENING_AR: any proof OK (entry-time scan OR received signed copy).
      // SALES_LINE: no Validate gate — received photo is a post-posting
      // artifact attached via PUT /sales/:id/received-csi on SalesList.
      if (row.source === 'OPENING_AR' && requireCsiPhotoOpeningAr) {
        const hasAnyProof = !!(row.csi_photo_url || row.csi_received_photo_url);
        if (!hasAnyProof) {
          rowErrors.push('CSI photo is required for Opening AR — attach any scan of the signed historical CSI before validating.');
        }
      }

      // Phase 15.2 (softened) — CSI booklet traceability check.
      // Monitoring only: never blocks posting. A warning is pushed if the
      // CSI # is not in any allocated range, is already used, or was voided.
      // Skipped entirely for BDMs without allocations (Iloilo-based contractors
      // who use booklets directly).
      if (row.doc_ref) {
        try {
          const csiCheck = await validateCsiNumber(row.entity_id, row.bdm_id, row.doc_ref);
          if (!csiCheck.valid && !csiCheck.skipped) {
            rowWarnings.push(`CSI: ${csiCheck.reason}`);
          }
        } catch (csiErr) {
          // Defensive — monitoring call must never block validation
          console.error('CSI booklet check failed (non-blocking):', csiErr.message);
        }
      }
    } else if (saleType === 'CASH_RECEIPT') {
      if (!row.line_items || row.line_items.length === 0) rowErrors.push('At least one line item is required');
    } else if (saleType === 'SERVICE_INVOICE') {
      if (!row.service_description) rowErrors.push('Service description is required');
      if (!row.invoice_total || row.invoice_total <= 0) rowErrors.push('Invoice total must be greater than 0');
    }

    // Petty cash fund validation (CASH_RECEIPT / SERVICE_INVOICE with CASH payment only)
    if (row.petty_cash_fund_id) {
      if (row.payment_mode !== 'CASH') {
        rowErrors.push('Petty cash fund routing is only allowed for CASH payment mode');
      } else if (saleType === 'CSI') {
        rowErrors.push('CSI sales cannot route to petty cash — use Collections');
      } else {
        const pcFund = await PettyCashFund.findOne({ _id: row.petty_cash_fund_id, entity_id: row.entity_id }).lean();
        if (!pcFund) {
          // tenantFilter at find-time enforces the entity bind; the prior post-fetch
          // entity check ('belongs to a different entity') becomes a not-found here.
          rowErrors.push('Petty cash fund not found in this entity');
        } else {
          if (pcFund.status !== 'ACTIVE') {
            rowErrors.push(`Petty cash fund is ${pcFund.status} — deposits blocked`);
          }
          if ((pcFund.fund_mode || 'REVOLVING') === 'EXPENSE_ONLY') {
            rowErrors.push('Petty cash fund is EXPENSE_ONLY — deposits not allowed');
          }
        }
      }
    }

    // No future dates
    if (row.csi_date && row.csi_date > new Date()) {
      rowErrors.push('CSI date cannot be in the future');
    }

    // Credit limit check
    if (row.hospital_id) {
      try {
        const hospital = await require('../models/Hospital').findById(row.hospital_id).select('credit_limit credit_limit_action hospital_name').lean();
        if (hospital?.credit_limit != null && hospital.credit_limit > 0) {
          const { getHospitalArBalance } = require('../services/arEngine');
          const currentAr = await getHospitalArBalance(row.hospital_id, row.entity_id);
          const projectedAr = currentAr + (row.invoice_total || 0);
          if (projectedAr > hospital.credit_limit) {
            const msg = `Credit limit: AR P${currentAr.toFixed(2)} + invoice P${(row.invoice_total || 0).toFixed(2)} = P${projectedAr.toFixed(2)} exceeds limit P${hospital.credit_limit.toFixed(2)} for ${hospital.hospital_name}`;
            if (hospital.credit_limit_action === 'BLOCK') {
              rowErrors.push(msg);
            } else {
              rowErrors.push(`WARNING: ${msg}`);
            }
          }
        }
      } catch { /* AR engine not critical for validation */ }
    }

    // Duplicate check: same doc_ref within the same customer scope, sale_type,
    // and SALE_SOURCE bucket. When no hospital/customer is set, skip — the row
    // already fails with "Hospital or Customer is required" from line 504, so
    // emitting an extra (global-scope) duplicate error is noise.
    //
    // source is a SALE_SOURCE Lookup-driven field (CLAUDE-ERP.md Rule #24).
    // We read it off the row itself (schema default='SALES_LINE') so the rule
    // is not hardcoded to literal enum values — subscribers who rename lookup
    // entries keep coherent behavior as long as writes and reads stay
    // consistent, which they do because source is stamped at create/update.
    if (saleType !== 'SERVICE_INVOICE' && row.doc_ref && (row.hospital_id || row.customer_id)) {
      const dupFilter = {
        _id: { $ne: row._id },
        entity_id: row.entity_id,
        sale_type: saleType,
        source: row.source,
        doc_ref: row.doc_ref,
        status: { $nin: ['DELETION_REQUESTED'] },
        // Reversed sales keep status=POSTED for audit but carry
        // deletion_event_id. Exclude them — the CSI#/doc_ref is free for
        // re-use and the row is hidden from the Reversal Console's reversible
        // tab, so re-uploading the same CSI after a reversal must not be
        // blocked by a ghost row the user cannot reach.
        deletion_event_id: { $exists: false }
      };
      if (row.hospital_id) dupFilter.hospital_id = row.hospital_id;
      if (row.customer_id) dupFilter.customer_id = row.customer_id;

      const dupCheck = await SalesLine.findOne(dupFilter).select('status source').lean();
      if (dupCheck) {
        const scopeLabel = row.hospital_id ? 'this hospital' : 'this customer';
        const bucketLabel = row.source === 'OPENING_AR' ? 'Opening AR' : 'Sales';
        rowErrors.push(
          `Duplicate ${bucketLabel} doc #${row.doc_ref} already exists for ${scopeLabel} (status: ${dupCheck.status}). Edit the existing row instead of creating a new one.`
        );
      }
    }

    // Stock check per line item (skip for SERVICE_INVOICE and OPENING_AR — no inventory)
    if (saleType === 'SERVICE_INVOICE' || row.source === 'OPENING_AR') {
      // SERVICE_INVOICE: no stock check needed, skip line item validation
      // OPENING_AR: pre-live-date CSI — skip allocation check per PRD
      // Still validate basic line item fields for OPENING_AR
      if (row.source === 'OPENING_AR' && saleType !== 'SERVICE_INVOICE') {
        for (const item of row.line_items) {
          if (!item.product_id) rowErrors.push('Product is required for each line item');
          if (!item.qty || item.qty <= 0) rowErrors.push(`Quantity must be greater than 0 for ${item.item_key || 'product'}`);
          if (!item.unit_price || item.unit_price <= 0) rowErrors.push(`Unit price must be greater than 0 for ${item.item_key || 'product'}`);
          if (item.fifo_override && !item.override_reason) rowErrors.push(`FIFO override reason is required for ${item.item_key || 'product'}. Choose: Hospital Policy, QA Replacement, Damaged Batch, or Batch Recall.`);
        }
      }
    } else {
      // Per-(bdm_id, warehouse_id) snapshot for THIS row. Mirrors submit-side
      // contract — proxy entries query the OWNER's stock, not the requester's.
      const stockGroup = await getStockGroupForRow(row);
      for (const item of row.line_items) {
        if (!item.product_id) {
          rowErrors.push('Product is required for each line item');
          continue;
        }
        if (!item.qty || item.qty <= 0) {
          rowErrors.push(`Quantity must be greater than 0 for ${item.item_key || 'product'}`);
          continue;
        }
        if (!item.unit_price || item.unit_price <= 0) {
          rowErrors.push(`Unit price must be greater than 0 for ${item.item_key || 'product'}`);
        }

        // FIFO override requires a reason from the allowed list
        if (item.fifo_override && !item.override_reason) {
          rowErrors.push(`FIFO override reason is required for ${item.item_key || 'product'}. Choose: Hospital Policy, QA Replacement, Damaged Batch, or Batch Recall.`);
        }

        const pid = item.product_id.toString();
        const available = (stockGroup.productTotals.get(pid) || 0) - (stockGroup.deducted.get(pid) || 0);

        if (item.qty > available) {
          // Sharper diagnostic so admins can self-diagnose data-quality cases
          // (e.g. row's warehouse_id points to a warehouse where the owner has
          // no stock, but stock exists at a different warehouse). The scope
          // suffix is omitted when both fields are absent so the simple-case
          // wording is unchanged.
          const scopeBits = [];
          if (stockGroup.warehouseId) scopeBits.push(`warehouse ${stockGroup.warehouseId}`);
          if (stockGroup.effectiveBdmId) scopeBits.push(`BDM ${stockGroup.effectiveBdmId}`);
          const scopeSuffix = scopeBits.length ? ` (scope: ${scopeBits.join(' ∩ ')})` : '';
          rowErrors.push(
            `Insufficient stock for product ${item.item_key || pid}: available ${available}, requested ${item.qty}${scopeSuffix}`
          );
        } else {
          // Deduct from per-group snapshot so subsequent rows in the same
          // (bdm, warehouse) pool see the reduced figure. Different groups
          // (different owner or warehouse) keep separate pools — correct, since
          // they read separate InventoryLedger rows.
          stockGroup.deducted.set(pid, (stockGroup.deducted.get(pid) || 0) + item.qty);
        }
      }
    }

    // VAT balance check — Phase R2: invoice_total is gross-MINUS-discount.
    // Compute the same way pre-save does so this validator matches what
    // SalesLine.pre('save') stored. Per-line discount = gross × (pct / 100).
    if (row.line_items.length > 0) {
      const computedTotal = row.line_items.reduce((sum, li) => {
        const gross = (li.qty || 0) * (li.unit_price || 0);
        const pct = Math.max(0, Math.min(100, Number(li.line_discount_percent) || 0));
        const lineNet = gross - (gross * pct / 100);
        return sum + lineNet;
      }, 0);
      const diff = Math.abs(computedTotal - row.invoice_total);
      if (diff > 0.01) {
        rowErrors.push(`Invoice total mismatch: computed ${computedTotal.toFixed(2)}, recorded ${row.invoice_total.toFixed(2)}`);
      }
    }

    // Phase R2 — Sales Discount cap. Subscribers tune via Control Center →
    // Lookup Tables → SALES_DISCOUNT_CONFIG. Privileged roles bypass.
    if (!bypassDiscountCap && Array.isArray(row.line_items)) {
      for (const li of row.line_items) {
        const discPct = Number(li.line_discount_percent) || 0;
        if (discPct > discountCfg.max_percent) {
          rowErrors.push(`Discount ${discPct}% on ${li.item_key || 'line'} exceeds cap of ${discountCfg.max_percent}%`);
        }
      }
    }

    // Update row status
    row.validation_warnings = rowWarnings;
    if (rowErrors.length > 0) {
      row.status = 'ERROR';
      row.validation_errors = rowErrors;
      errorCount++;
      errors.push({
        sale_id: row._id,
        doc_ref: row.doc_ref,
        messages: rowErrors,
        warnings: rowWarnings
      });
    } else {
      row.status = 'VALID';
      row.validation_errors = [];
      validCount++;
      if (rowWarnings.length > 0) {
        errors.push({
          sale_id: row._id,
          doc_ref: row.doc_ref,
          messages: [],
          warnings: rowWarnings
        });
      }
    }

    await row.save();
  }

  res.json({ success: true, valid_count: validCount, error_count: errorCount, errors });
});

// ═══════════════════════════════════════════════════════════
// SUBMIT — POST ALL VALID ROWS (with MongoDB transaction)
// ═══════════════════════════════════════════════════════════

const submitSales = catchAsync(async (req, res) => {
  const { sale_ids } = req.body;
  // Phase G4.5a — proxy can submit rows on behalf of other BDMs in the entity.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  const filter = { ...scope, status: 'VALID' };
  if (sale_ids && sale_ids.length) {
    filter._id = { $in: sale_ids.map(id => new mongoose.Types.ObjectId(id)) };
  }
  const validRows = await SalesLine.find(filter);

  if (!validRows.length) {
    return res.status(400).json({
      success: false,
      message: 'No VALID rows to submit. Run validation first.'
    });
  }

  // Authority matrix gate — split batch by source so Opening AR (pre-cutover
  // historical AR, higher fraud risk) gates on its own MODULE_DEFAULT_ROLES
  // entry instead of inheriting the regular SALES roles.
  const { gateApproval } = require('../services/approvalService');
  const groups = [];
  const salesRows = validRows.filter(r => r.source !== 'OPENING_AR');
  const openingArRows = validRows.filter(r => r.source === 'OPENING_AR');
  if (salesRows.length) groups.push({ module: 'SALES', label: 'sales', rows: salesRows });
  if (openingArRows.length) groups.push({ module: 'OPENING_AR', label: 'Opening AR', rows: openingArRows });

  for (const group of groups) {
    const groupTotal = group.rows.reduce((sum, r) => sum + (r.invoice_total || 0), 0);
    // Phase G4.5a — if ANY row in the group was proxied (recorded_on_behalf_of
    // is set), force the whole group through Approval Hub regardless of the
    // submitter's role. Conservative: never auto-post a batch that contains a
    // proxied row until Phase G4.5b ships owner-chain approval routing.
    const proxiedRow = group.rows.find(r => r.recorded_on_behalf_of);
    const hasProxy = !!proxiedRow;
    const gated = await gateApproval({
      entityId: req.entityId,
      module: group.module,
      docType: group.rows[0]?.sale_type || 'CSI',
      docId: group.rows[0]._id,
      docRef: group.rows.map(r => r.doc_ref || r.invoice_number).filter(Boolean).join(', '),
      amount: groupTotal,
      description: hasProxy
        ? `Submit ${group.rows.length} ${group.label} entr${group.rows.length === 1 ? 'y' : 'ies'} (total ₱${groupTotal.toLocaleString()}) — proxy entry, owner approval required`
        : `Submit ${group.rows.length} ${group.label} entr${group.rows.length === 1 ? 'y' : 'ies'} (total ₱${groupTotal.toLocaleString()})`,
      requesterId: req.user._id,
      requesterName: req.user.name || req.user.email,
      forceApproval: hasProxy,
      ownerBdmId: proxiedRow?.bdm_id,
    }, res);
    if (gated) return;
  }

  // Period lock check — prevent posting to closed/locked months
  // OPENING_AR rows bypass the lock (pre-cutover dates fall in closed periods by design)
  const { checkPeriodOpen, dateToPeriod } = require('../utils/periodLock');
  for (const row of validRows) {
    const period = dateToPeriod(row.csi_date);
    await checkPeriodOpen(row.entity_id, period, { source: row.source });
  }

  const session = await mongoose.startSession();
  const eventIds = [];

  try {
    await session.withTransaction(async () => {
      for (const row of validRows) {
        const saleType = row.sale_type || 'CSI';
        const skipInventory = saleType === 'SERVICE_INVOICE' || row.source === 'OPENING_AR';

        // 1. Create TransactionEvent (immutable)
        const eventType = saleType === 'SERVICE_INVOICE' ? 'SERVICE_INVOICE'
          : saleType === 'CASH_RECEIPT' ? 'CASH_RECEIPT' : 'CSI';

        const [event] = await TransactionEvent.create([{
          entity_id: row.entity_id,
          bdm_id: row.bdm_id,
          event_type: eventType,
          event_date: row.csi_date,
          document_ref: row.doc_ref || row.invoice_number,
          payload: {
            hospital_id: row.hospital_id,
            customer_id: row.customer_id,
            sale_type: saleType,
            line_items: row.line_items,
            invoice_total: row.invoice_total,
            service_description: row.service_description,
            source: row.source
          },
          created_by: req.user._id
        }], { session });

        eventIds.push(event._id);

        // 2. Inventory deduction (skipped for SERVICE_INVOICE + OPENING_AR)
        if (skipInventory) {
          row.status = 'POSTED';
          row.posted_at = new Date();
          row.posted_by = req.user._id;
          row.event_id = event._id;
          await row.save({ session });
        } else {

        for (const item of row.line_items) {
          // Check if this CSI references a DR (consignment)
          const consignment = await ConsignmentTracker.findOne({
            entity_id: row.entity_id,
            bdm_id: row.bdm_id,
            hospital_id: row.hospital_id,
            product_id: item.product_id,
            status: 'ACTIVE'
          }).session(session);

          if (consignment) {
            // CSI-DR: inventory already deducted at DR. Update ConsignmentTracker only
            consignment.qty_consumed += item.qty;
            consignment.conversions.push({
              csi_doc_ref: row.doc_ref,
              csi_date: row.csi_date,
              qty_converted: item.qty,
              sales_line_id: row._id
            });
            await consignment.save({ session });
          } else {
            // Regular CSI: consume inventory via FIFO
            // Phase 17: warehouse-scoped FIFO consumption
            const fifoOpts = { ...(row.warehouse_id && { warehouseId: row.warehouse_id.toString() }), session };
            // President/admin/finance without warehouse → entity-wide FIFO
            const submitBdmId = (req.isPresident || req.isAdmin || req.isFinance) && !row.warehouse_id
              ? null : row.bdm_id;
            let consumed;
            if (item.fifo_override && item.batch_lot_no) {
              consumed = [await consumeSpecificBatch(
                row.entity_id, submitBdmId, item.product_id, item.batch_lot_no, item.qty, fifoOpts
              )];
            } else {
              consumed = await consumeFIFO(
                row.entity_id, submitBdmId, item.product_id, item.qty, fifoOpts
              );
            }

            // Create ledger entries for each consumed batch
            for (const c of consumed) {
              await InventoryLedger.create([{
                entity_id: row.entity_id,
                bdm_id: c.bdm_id || row.bdm_id,
                warehouse_id: row.warehouse_id || undefined,
                product_id: item.product_id,
                batch_lot_no: c.batch_lot_no,
                expiry_date: c.expiry_date,
                transaction_type: 'CSI',
                qty_out: c.qty_consumed,
                event_id: event._id,
                fifo_override: item.fifo_override || false,
                override_reason: item.override_reason,
                recorded_by: req.user._id
              }], { session });
            }
          }
        }

        // 3. Update SalesLine status
        row.status = 'POSTED';
        row.posted_at = new Date();
        row.posted_by = req.user._id;
        row.event_id = event._id;
        // Phase A.4 — pre-stamp je_status (see line ~205 for rationale).
        row.je_status = 'POSTED';
        row.je_attempts = (row.je_attempts || 0) + 1;
        row.last_je_attempt_at = new Date();
        await row.save({ session });
        }  // end of: skipInventory else-branch

        // 4. Auto-journal entries — INSIDE the transaction (Phase JE-TX).
        //    Atomicity contract: a JE failure rolls back THIS row's event +
        //    status flip + FIFO consumption AND every prior row in this batch.
        //    Bulk-submit is now all-or-nothing on the ledger; partial-batch
        //    success-with-no-JE was the worse failure mode (Romela incident).
        const jeData = saleType === 'SERVICE_INVOICE'
          ? await journalFromServiceRevenue(row, row.entity_id, req.user._id)
          : await journalFromSale(row, row.entity_id, req.user._id);
        jeData.source_event_id = event._id;
        await createAndPostJournal(row.entity_id, jeData, { session });

        // COGS JE (skip for SERVICE_INVOICE and OPENING_AR — no inventory consumed)
        if (!skipInventory && row.line_items?.length) {
          const productIds = row.line_items.map(li => li.product_id);
          // eslint-disable-next-line vip-tenant/require-entity-filter -- productIds harvested from same-entity-scoped row.line_items; _id is globally unique
          const products = await ProductMaster.find({ _id: { $in: productIds } }).select('purchase_price').session(session).lean();
          const costMap = new Map(products.map(p => [p._id.toString(), p.purchase_price || 0]));
          const totalCogs = row.line_items.reduce((sum, li) => sum + (li.qty || 0) * (costMap.get(li.product_id?.toString()) || 0), 0);
          const cogsData = await journalFromCOGS(row, Math.round(totalCogs * 100) / 100, req.user._id);
          if (cogsData) {
            cogsData.source_event_id = event._id;
            await createAndPostJournal(row.entity_id, cogsData, { session });
          }
        }

        // Phase R-Storefront Phase 2 — Auto-route storefront cash attribution
        // → RebatePayout(ACCRUING) + CommissionPayout(ACCRUING) + DRAFT PRFs.
        // Same atomicity as Collection.routePrfsForCollection (Phase VIP-1.B):
        // failure aborts the whole batch — FIFO + JE + petty cash + rebate audit
        // ledger stay in lockstep. Predicate matches lookup-driven
        // STOREFRONT_REBATE_SCOPE.DEFAULT (CASH_RECEIPT/SERVICE_INVOICE routed
        // through petty_cash_fund). Sales without partner_tags/commission still
        // post; routing emits zero rows for them.
        if (
          ['CASH_RECEIPT', 'SERVICE_INVOICE'].includes(saleType)
          && row.petty_cash_fund_id
        ) {
          try {
            const { routePrfsForSale } = require('../services/autoPrfRoutingForSale');
            const routed = await routePrfsForSale({
              salesLineId: row._id,
              userId: req.user._id,
              session,
            });
            if (routed.payeesProcessed > 0 || routed.commissionPayouts > 0) {
              console.log(
                `[autoPrfRoutingForSale] (submit) ${saleType} ${row.invoice_number || row.doc_ref || row._id}: ` +
                `${routed.prfsCreated} new PRFs, ${routed.prfsExisted} existing, ` +
                `${routed.rebatePayouts} rebate rows, ${routed.commissionPayouts} commission rows, ` +
                `${routed.payeesProcessed} MD payees`
              );
            }
          } catch (routeErr) {
            throw new Error(`autoPrfRoutingForSale failed for ${saleType} ${row.invoice_number || row.doc_ref || row._id}: ${routeErr.message}`);
          }
        }
      }
    });

    // Phase 9.1b: Link DocumentAttachments to events (outside transaction — non-blocking)
    for (let i = 0; i < validRows.length; i++) {
      // eslint-disable-next-line vip-tenant/require-entity-filter -- source_id is unique; validRows fetched with entity-scoped tenantFilter upstream
      await DocumentAttachment.updateMany(
        { source_model: 'SalesLine', source_id: validRows[i]._id },
        { $set: { event_id: eventIds[i] } }
      ).catch(() => {});
    }

    // Phase 15.2 (softened) — auto-mark CSI numbers as used on POSTED.
    // Non-blocking: a CSI booklet update failure must never fail the post.
    for (const row of validRows) {
      if ((row.sale_type || 'CSI') !== 'CSI') continue;
      if (!row.doc_ref) continue;
      try {
        const result = await markCsiUsed(row.entity_id, null, row.doc_ref);
        if (!result.ok) {
          // Advisory only — stash for audit, do not fail the post
          ErpAuditLog.logChange({
            entity_id: row.entity_id, bdm_id: row.bdm_id,
            log_type: 'CSI_TRACE',
            target_ref: row.doc_ref, target_model: 'CsiBooklet',
            field_changed: 'used_numbers',
            new_value: `mark-used skipped: ${result.reason}`,
            changed_by: req.user._id,
            note: `CSI ${row.doc_ref} posted on sale ${row._id} but booklet mark-used skipped`
          }).catch(() => {});
        }
      } catch (csiErr) {
        console.error('CSI markUsed failed (non-blocking):', row.doc_ref, csiErr.message);
      }
    }

    res.json({
      success: true,
      message: `${validRows.length} sales posted successfully`,
      posted_count: validRows.length,
      event_ids: eventIds
    });

    // Non-blocking: notify management of posted sales
    notifyDocumentPosted({
      entityId: req.entityId,
      module: 'Sales',
      docType: 'CSI',
      docRef: validRows.map(r => r.doc_ref).filter(Boolean).join(', '),
      postedBy: req.user.name || req.user.email,
      amount: validRows.reduce((sum, r) => sum + (r.invoice_total || 0), 0),
      period: validRows[0]?.csi_date ? new Date(validRows[0].csi_date).toISOString().slice(0, 7) : undefined,
    }).catch(err => console.error('Sales post notification failed:', err.message));
  } finally {
    await session.endSession();
  }
});

// ═══════════════════════════════════════════════════════════
// REOPEN — Un-post for corrections
// ═══════════════════════════════════════════════════════════

const reopenSales = catchAsync(async (req, res) => {
  const { sale_ids } = req.body;
  if (!sale_ids || !sale_ids.length) {
    return res.status(400).json({ success: false, message: 'sale_ids required' });
  }

  // Phase G4.5a — widen filter so proxies can reopen on behalf of other BDMs.
  // Reopen action itself is still gated by the sales.reopen sub-perm middleware.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  const rows = await SalesLine.find({
    _id: { $in: sale_ids },
    ...scope,
    status: 'POSTED'
  });

  if (!rows.length) {
    return res.status(400).json({ success: false, message: 'No POSTED rows found to reopen' });
  }

  const reopened = [];
  const failed = [];

  for (const row of rows) {
    // Step 0: Block reopen if CSI is settled by a POSTED collection.
    // Entity-scoped to prevent cross-entity leaks. Reopen the collection first
    // to release the CSI, then the CSI becomes reopenable.
    const settledBy = await Collection.findOne({
      entity_id: row.entity_id,
      status: 'POSTED',
      deletion_event_id: { $exists: false },
      'settled_csis.sales_line_id': row._id
    }).select('_id cr_no').lean();
    if (settledBy) {
      failed.push({
        _id: row._id,
        doc_ref: row.doc_ref,
        error: `Cannot reopen: settled by Collection ${settledBy.cr_no || settledBy._id}. Reopen the collection first to release this CSI.`
      });
      continue;
    }

    // Step 1: Reverse JEs FIRST — if fails, skip this row (keep POSTED, ledger stays balanced)
    if (row.event_id) {
      try {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- source_event_id is unique; row from entity-scoped reopen path
        const jes = await JournalEntry.find({
          source_event_id: row.event_id, status: 'POSTED', is_reversal: { $ne: true }
        });
        for (const je of jes) {
          await reverseJournal(je._id, 'Auto-reversal: SalesLine reopen', req.user._id);
        }
      } catch (jeErr) {
        console.error('JE reversal failed for sale reopen:', row._id, jeErr.message);
        failed.push({ _id: row._id, doc_ref: row.doc_ref, error: `Journal reversal failed: ${jeErr.message}` });
        continue; // Do NOT mark as DRAFT — ledger would be unbalanced
      }
    }

    // Step 2: JE reversed successfully — now do inventory/status reversal in a transaction
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Create reversal InventoryLedger entries
        // eslint-disable-next-line vip-tenant/require-entity-filter -- event_id is unique; row from entity-scoped reopen path
        const originalEntries = await InventoryLedger.find({ event_id: row.event_id }).session(session);
        for (const entry of originalEntries) {
          await InventoryLedger.create([{
            entity_id: entry.entity_id,
            bdm_id: entry.bdm_id,
            warehouse_id: entry.warehouse_id || undefined,
            product_id: entry.product_id,
            batch_lot_no: entry.batch_lot_no,
            expiry_date: entry.expiry_date,
            transaction_type: 'ADJUSTMENT',
            qty_in: entry.qty_out,
            qty_out: entry.qty_in,
            event_id: row.event_id,
            recorded_by: req.user._id
          }], { session });
        }

        // Reverse ConsignmentTracker if applicable
        for (const item of row.line_items) {
          const consignment = await ConsignmentTracker.findOne({
            entity_id: row.entity_id,
            hospital_id: row.hospital_id,
            product_id: item.product_id,
            'conversions.sales_line_id': row._id
          }).session(session);
          if (consignment) {
            consignment.conversions = consignment.conversions.filter(
              c => !c.sales_line_id || c.sales_line_id.toString() !== row._id.toString()
            );
            consignment.qty_consumed = Math.max(0, consignment.qty_consumed - item.qty);
            await consignment.save({ session });
          }
        }

        // Reverse petty cash deposit if sale was routed to a fund
        if (row.petty_cash_fund_id) {
          // eslint-disable-next-line vip-tenant/require-entity-filter -- linked_sales_line_id is unique; row from entity-scoped reopen path
          const pcTxn = await PettyCashTransaction.findOne({
            linked_sales_line_id: row._id,
            txn_type: 'DEPOSIT',
            status: 'POSTED'
          }).session(session);
          if (pcTxn) {
            pcTxn.status = 'VOIDED';
            pcTxn.voided_at = new Date();
            pcTxn.voided_by = req.user._id;
            pcTxn.void_reason = `Auto-reversed: ${row.sale_type} ${row.invoice_number || row.doc_ref || ''} reopened`;
            await pcTxn.save({ session });
            // eslint-disable-next-line vip-tenant/require-entity-filter -- fund_id from same-entity-scoped pcTxn above
            const fundResult = await PettyCashFund.findByIdAndUpdate(pcTxn.fund_id, {
              $inc: { current_balance: -pcTxn.amount }
            }, { session });
            if (!fundResult) {
              await ErpAuditLog.logChange({
                entity_id: row.entity_id, log_type: 'LEDGER_ERROR',
                target_ref: pcTxn.fund_id?.toString(), target_model: 'PettyCashFund',
                field_changed: 'current_balance', old_value: pcTxn.amount.toString(),
                new_value: 'FUND_NOT_FOUND', changed_by: req.user._id,
                note: `Fund deleted before reopen — balance decrement skipped for ${row.invoice_number || row.doc_ref}`
              });
            }
          }
        }

        // Phase CSI-X1 — Hospital PO line giveback on reopen. Mirrors the
        // increment in postSaleRow: walk line_items, decrement qty_served on
        // each linked HospitalPOLine, recompute parent HospitalPO. Inside the
        // same session as the FIFO + JE reversals so failures roll back together.
        if (row.po_id && Array.isArray(row.line_items) && row.line_items.length) {
          const { HospitalPO, HospitalPOLine } = require('../models/HospitalPO');
          const touchedPoIds = new Set([String(row.po_id)]);
          for (const item of row.line_items) {
            if (!item.po_line_id) continue;
            // eslint-disable-next-line vip-tenant/require-entity-filter -- po_line_id globally unique; entity scope on header
            const line = await HospitalPOLine.findById(item.po_line_id).session(session);
            if (!line) continue;  // line may have been cancelled — non-blocking on reopen
            line.qty_served = Math.max(0, (line.qty_served || 0) - (item.qty || 0));
            await line.save({ session });
            touchedPoIds.add(String(line.po_id));
          }
          for (const poId of touchedPoIds) {
            await HospitalPO.recomputeFromLines(poId, session);
          }
        }

        // Update SalesLine
        row.status = 'DRAFT';
        row.reopen_count += 1;
        row.posted_at = undefined;
        row.posted_by = undefined;
        row.event_id = undefined;
        row.validation_errors = [];
        await row.save({ session });
      });

      reopened.push(row._id);

      // Phase 15.2 (softened) — release the CSI number back to the BDM's
      // available pool when the sale is reopened. Non-blocking audit on failure.
      if ((row.sale_type || 'CSI') === 'CSI' && row.doc_ref) {
        try {
          await unmarkCsiUsed(row.entity_id, row.doc_ref);
        } catch (csiErr) {
          console.error('CSI unmarkUsed failed on reopen (non-blocking):', row.doc_ref, csiErr.message);
        }
      }

      await ErpAuditLog.logChange({
        entity_id: row.entity_id, bdm_id: row.bdm_id,
        log_type: 'REOPEN', target_ref: row._id.toString(),
        target_model: 'SalesLine', changed_by: req.user._id,
        note: `Reopened CSI ${row.doc_ref || ''}`
      });
    } catch (txErr) {
      console.error('Reopen transaction failed for sale:', row._id, txErr.message);
      failed.push({ _id: row._id, doc_ref: row.doc_ref, error: `Transaction failed: ${txErr.message}` });
    } finally {
      session.endSession();
    }
  }

  if (failed.length && !reopened.length) {
    return res.status(500).json({ success: false, message: 'All sale reopens failed', failed });
  }
  res.json({ success: true, message: `Reopened ${reopened.length} sale(s)${failed.length ? `, ${failed.length} failed` : ''}`, reopened, failed });

  // Non-blocking: notify management of reopened sales
  if (reopened.length) {
    const reopenedRefs = rows.filter(r => reopened.includes(r._id)).map(r => r.doc_ref).filter(Boolean).join(', ');
    notifyDocumentReopened({
      entityId: req.entityId,
      module: 'Sales',
      docType: 'CSI',
      docRef: reopenedRefs,
      reopenedBy: req.user.name || req.user.email,
      reason: req.body.reason,
    }).catch(err => console.error('Sales reopen notification failed:', err.message));
  }
});

// ═══════════════════════════════════════════════════════════
// DELETION — BDM request + Finance/Admin approve (SAP Storno)
// ═══════════════════════════════════════════════════════════

const requestDeletion = catchAsync(async (req, res) => {
  // Phase G4.5a — proxy can request deletion for rows owned by other BDMs.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...scope,
    status: 'POSTED'
  });

  if (!sale) {
    return res.status(404).json({ success: false, message: 'Posted sale not found' });
  }

  sale.status = 'DELETION_REQUESTED';
  await sale.save();

  await ErpAuditLog.logChange({
    entity_id: sale.entity_id,
    bdm_id: sale.bdm_id,
    log_type: 'DELETION',
    target_ref: sale._id.toString(),
    target_model: 'SalesLine',
    changed_by: req.user._id,
    note: 'Deletion requested by BDM'
  });

  res.json({ success: true, message: 'Deletion requested', data: sale });
});

const approveDeletion = catchAsync(async (req, res) => {
  // Phase G4.5a — proxy sees deletion-requested rows across BDMs; gate is the
  // accounting.approve_deletion sub-perm at route middleware, not here.
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...scope,
    status: 'DELETION_REQUESTED'
  });

  if (!sale) {
    return res.status(404).json({ success: false, message: 'Deletion-requested sale not found' });
  }

  // Block deletion if CSI is settled by a POSTED collection — keeps AR balanced.
  // Entity-scoped. Collection must be reopened first to release the CSI.
  const settledBy = await Collection.findOne({
    entity_id: sale.entity_id,
    status: 'POSTED',
    deletion_event_id: { $exists: false },
    'settled_csis.sales_line_id': sale._id
  }).select('_id cr_no').lean();
  if (settledBy) {
    return res.status(409).json({
      success: false,
      message: `Cannot delete: CSI is settled by Collection ${settledBy.cr_no || settledBy._id}. Reopen the collection first to release this CSI.`
    });
  }

  // SAP Storno: create reversal TransactionEvent
  const reversalEvent = await TransactionEvent.create({
    entity_id: sale.entity_id,
    bdm_id: sale.bdm_id,
    event_type: 'CSI_REVERSAL',
    event_date: new Date(),
    document_ref: `REV-${sale.doc_ref}`,
    payload: {
      original_sale_id: sale._id,
      original_event_id: sale.event_id,
      reason: req.body.reason || 'Approved deletion'
    },
    corrects_event_id: sale.event_id,
    created_by: req.user._id
  });

  // Reverse InventoryLedger entries
  // eslint-disable-next-line vip-tenant/require-entity-filter -- event_id is unique; sale fetched with entity-scoped tenantFilter upstream
  const originalEntries = await InventoryLedger.find({ event_id: sale.event_id });
  for (const entry of originalEntries) {
    await InventoryLedger.create({
      entity_id: entry.entity_id,
      bdm_id: entry.bdm_id,
      warehouse_id: entry.warehouse_id || undefined,
      product_id: entry.product_id,
      batch_lot_no: entry.batch_lot_no,
      expiry_date: entry.expiry_date,
      transaction_type: 'ADJUSTMENT',
      qty_in: entry.qty_out,
      qty_out: entry.qty_in,
      event_id: reversalEvent._id,
      recorded_by: req.user._id
    });
  }

  // Reverse journal entries (SAP Storno)
  if (sale.event_id) {
    try {
      // eslint-disable-next-line vip-tenant/require-entity-filter -- source_event_id is unique; sale fetched with entity-scoped tenantFilter upstream
      const jes = await JournalEntry.find({
        source_event_id: sale.event_id, status: 'POSTED', is_reversal: { $ne: true }
      });
      for (const je of jes) {
        await reverseJournal(je._id, `Auto-reversal: SalesLine deletion approved`, req.user._id);
      }
    } catch (jeErr) {
      console.error('JE reversal failed for sale deletion:', sale._id, jeErr.message);
    }
  }

  // Phase CSI-X1 — Hospital PO line giveback on deletion-approve. Best-effort:
  // approveDeletion does not run inside a Mongo session, so a giveback failure
  // is logged but does not unwind the SAP Storno (which has already happened).
  if (sale.po_id && Array.isArray(sale.line_items) && sale.line_items.length) {
    try {
      const { HospitalPO, HospitalPOLine } = require('../models/HospitalPO');
      const touchedPoIds = new Set([String(sale.po_id)]);
      for (const item of sale.line_items) {
        if (!item.po_line_id) continue;
        // eslint-disable-next-line vip-tenant/require-entity-filter -- po_line_id globally unique
        const line = await HospitalPOLine.findById(item.po_line_id);
        if (!line) continue;
        line.qty_served = Math.max(0, (line.qty_served || 0) - (item.qty || 0));
        await line.save();
        touchedPoIds.add(String(line.po_id));
      }
      for (const poId of touchedPoIds) {
        await HospitalPO.recomputeFromLines(poId);
      }
    } catch (poErr) {
      console.error('[approveDeletion] HospitalPO giveback failed (non-blocking):', sale._id, poErr.message);
      await ErpAuditLog.logChange({
        entity_id: sale.entity_id, bdm_id: sale.bdm_id,
        log_type: 'LEDGER_ERROR', target_ref: sale._id.toString(),
        target_model: 'SalesLine', changed_by: req.user._id,
        note: `HospitalPO giveback failed on deletion approval: ${poErr.message}`
      }).catch(() => {});
    }
  }

  // Mark original with deletion_event_id (original stays POSTED for audit trail)
  sale.deletion_event_id = reversalEvent._id;
  await sale.save();

  // Audit log
  await ErpAuditLog.logChange({
    entity_id: sale.entity_id,
    bdm_id: sale.bdm_id,
    log_type: 'DELETION',
    target_ref: sale._id.toString(),
    target_model: 'SalesLine',
    changed_by: req.user._id,
    note: `Deletion approved. Reversal event: ${reversalEvent._id}`
  });

  res.json({
    success: true,
    message: 'Deletion approved — reversal created (SAP Storno)',
    reversal_event_id: reversalEvent._id
  });
});

// ═══════════════════════════════════════════════════════════
// PRESIDENT REVERSE — sub-permission gated, applies to any status
// (DRAFT/ERROR → hard delete, POSTED/DELETION_REQUESTED → SAP Storno)
// ═══════════════════════════════════════════════════════════

const presidentReverseSale = catchAsync(async (req, res) => {
  const { reason, confirm } = req.body || {};
  if (confirm !== 'DELETE') {
    return res.status(400).json({ success: false, message: 'Type DELETE in the confirmation field to proceed' });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ success: false, message: 'Reason is required' });
  }

  try {
    // Phase G4.5a — proxy reverse still gated by accounting.reverse_posted danger perm.
    const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
    const result = await presidentReverse({
      doc_type: 'SALES_LINE',
      doc_id: req.params.id,
      reason,
      user: req.user,
      tenantFilter: scope,
    });
    res.json({
      success: true,
      message: result.mode === 'HARD_DELETE'
        ? `Deleted ${result.doc_ref || result.doc_id} (no posting side effects)`
        : `Reversed ${result.doc_ref || result.doc_id} (SAP Storno) — original retained for audit`,
      data: result,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ATTACH RECEIVED CSI — post-delivery dunning proof (t=4)
// ═══════════════════════════════════════════════════════════
// Writes csi_received_photo_url + csi_received_attachment_id + csi_received_at
// ONLY. Allowed on DRAFT / VALID / POSTED. Blocked on DELETION_REQUESTED and
// on rows already marked with a deletion_event_id (reversed). Period-lock
// applies so we don't retroactively attach proof to a closed period.
//
// No status transition — the row stays where it was. BDM captures the signed
// pink/yellow/duplicate copy of the CSI after the hospital acknowledges
// delivery; this writes that artifact to the ledger-of-record without
// touching posted inventory/AR side effects.
const attachReceivedCsi = catchAsync(async (req, res) => {
  const { csi_received_photo_url, csi_received_attachment_id, capture_id } = req.body || {};
  if (!csi_received_photo_url) {
    return res.status(400).json({
      success: false,
      message: 'csi_received_photo_url is required'
    });
  }

  const sale = await SalesLine.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  });
  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }

  // Status gate — signed-CSI upload is meaningful only while the row is
  // part of the active ledger. Reversed rows (deletion_event_id) and
  // DELETION_REQUESTED rows are out of scope. ERROR is included so BDMs
  // can pre-stage the signed photo while fixing unrelated validation
  // issues (credit limit, duplicate doc_ref, etc.) — delivery already
  // happened, don't block proof capture on a transient error state.
  if (sale.deletion_event_id) {
    return res.status(400).json({ success: false, message: 'Sale has been reversed — cannot attach received CSI' });
  }
  const attachableStatuses = ['DRAFT', 'VALID', 'ERROR', 'POSTED'];
  if (!attachableStatuses.includes(sale.status)) {
    return res.status(400).json({
      success: false,
      message: `Cannot attach received CSI on a ${sale.status} row`
    });
  }

  // Period-lock — don't let a user retroactively stamp evidence on a
  // closed period. OPENING_AR bypasses by convention (same as submit).
  try {
    const { checkPeriodOpen, dateToPeriod } = require('../utils/periodLock');
    await checkPeriodOpen(sale.entity_id, dateToPeriod(sale.csi_date), { source: sale.source });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }

  const previousUrl = sale.csi_received_photo_url || null;
  sale.csi_received_photo_url = csi_received_photo_url;
  sale.csi_received_attachment_id = csi_received_attachment_id || undefined;
  sale.csi_received_at = new Date();
  await sale.save();

  await ErpAuditLog.logChange({
    entity_id: sale.entity_id,
    bdm_id: sale.bdm_id,
    log_type: 'SALES_EDIT',
    target_ref: sale._id.toString(),
    target_model: 'SalesLine',
    field_changed: 'csi_received_photo_url',
    old_value: previousUrl,
    new_value: csi_received_photo_url,
    changed_by: req.user._id,
    note: previousUrl ? 'Received CSI photo replaced' : 'Received CSI photo attached (dunning proof)'
  });

  // Phase P1.2 Slice 9 partial — auto-finalize the source capture so a row
  // attached via the Round 2A picker stops appearing in the picker drawer
  // and carries an audit trail back-link. Best-effort: failures here do
  // not break the attach.
  if (capture_id) {
    try {
      const { linkCaptureToDocument } = require('./captureSubmissionController');
      await linkCaptureToDocument(capture_id, 'SalesLine', sale._id, {
        user: req.user,
        entityId: sale.entity_id,
        isPresident: req.isPresident,
        isAdmin: req.isAdmin,
        isFinance: req.isFinance,
      });
    } catch (err) {
      console.error('[attachReceivedCsi] linkCaptureToDocument failed:', err.message);
    }
  }

  res.json({ success: true, data: sale });
});

// ═══════════════════════════════════════════════════════════
// CSI DRAFT OVERLAY (Phase 15.3)
// ═══════════════════════════════════════════════════════════

/**
 * Generate a draft-CSI PDF for a single sale. The PDF overlays only the
 * variable fields (customer, date, lines, totals) — BDM feeds the physical
 * BIR booklet page into their printer and the ink lands on pre-printed
 * blanks. Never a valid BIR receipt. See Phase 15.3 plan for compliance.
 *
 * Access (Phase 15.3-fix May 07 2026 — resource-first):
 *   This URL is opened via `window.open()` (the only way to get the browser
 *   to download a PDF using the auth cookie), which bypasses the SPA's
 *   X-Entity-Id header. So matching the caller's working entity against the
 *   sale's entity_id was producing false 404s for admin/finance whenever
 *   their primary entity ≠ the sale's entity (e.g. an MG and CO CSI viewed
 *   by an admin whose primary is VIP).
 *
 *   Fix: look up the sale by _id only (cross-entity lookup is safe because
 *   _id is globally unique), then enforce access via `assertResourceReadAccess`
 *   which checks the sale's OWN entity_id against the caller's allowlist
 *   (entity_ids). President/CEO always pass. BDMs still gate on ownership +
 *   proxy. No Rule #21 silent self-fill.
 */
const generateCsiDraft = catchAsync(async (req, res) => {
  const { renderCsiDraft } = require('../services/csiDraftRenderer');
  const Entity = require('../models/Entity');
  const User = require('../../models/User');

  // eslint-disable-next-line vip-tenant/require-entity-filter -- resource-first read; entity gate enforced by assertResourceReadAccess on sale.entity_id
  const sale = await SalesLine.findById(req.params.id)
    .populate('hospital_id', 'hospital_name address payment_terms')
    .populate('customer_id', 'customer_name address payment_terms')
    .lean();

  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }

  // 403 if caller can't read this sale's entity. Privileged short-circuit for
  // president/CEO; admin/finance need the entity in their allowlist; staff
  // need ownership or eligible proxy access.
  await assertResourceReadAccess(req, sale, {
    moduleKey: 'sales',
    subKey: 'proxy_entry',
    resourceLabel: 'sale',
  });

  if (!sale.line_items || sale.line_items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Draft CSI unavailable — this sale has no line items.',
      code: 'CSI_DRAFT_EMPTY_LINES',
    });
  }

  const entity = await Entity.findById(sale.entity_id).lean();
  if (!entity) {
    return res.status(400).json({ success: false, message: 'Entity not found for sale.' });
  }

  const template = await Lookup.findOne({
    entity_id: sale.entity_id,
    category: 'CSI_TEMPLATE',
    is_active: true,
  }).lean();

  if (!template) {
    return res.status(400).json({
      success: false,
      message: `Admin must configure CSI_TEMPLATE for ${entity.entity_name} in Control Center → Lookup Tables before drafts can be generated.`,
      code: 'CSI_TEMPLATE_NOT_CONFIGURED',
    });
  }

  // Load the printing user for the per-user printer offset. The PRINTING
  // user is whoever clicks Download — that's the printer being used right
  // now. Falls back to the sale owner if req.user has no calibrated offset
  // (covers the legacy case where each BDM prints their own sales).
  const printingUser = await User.findById(req.user._id)
    .select('name csi_printer_offset_x_mm csi_printer_offset_y_mm')
    .lean();
  let owner = printingUser;
  if (!printingUser?.csi_printer_offset_x_mm && !printingUser?.csi_printer_offset_y_mm) {
    const fallback = await User.findById(sale.bdm_id)
      .select('name csi_printer_offset_x_mm csi_printer_offset_y_mm')
      .lean();
    if (fallback?.csi_printer_offset_x_mm || fallback?.csi_printer_offset_y_mm) {
      owner = fallback;
    }
  }

  // Resolve product names (Rule #4: brand_name + dosage_strength) and
  // batch expiry dates from InventoryLedger.
  const productIds = sale.line_items.map((li) => li.product_id).filter(Boolean);
  const products = productIds.length
    // eslint-disable-next-line vip-tenant/require-entity-filter -- productIds harvested from same-entity-scoped sale.line_items; _id is globally unique
    ? await ProductMaster.find({ _id: { $in: productIds } })
        .select('brand_name generic_name dosage_strength')
        .lean()
    : [];
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  // Resolve batch + expiry per line. FIFO is allocated at POST time, not at
  // line-entry time, so SalesLine.line_items[].batch_lot_no is empty for the
  // common auto-FIFO path. Two truth sources, picked by status:
  //   POSTED → InventoryLedger by event_id (actual batches that shipped)
  //   DRAFT/VALID → consumeFIFO() preview (read-only) for the batch we WILL
  //                 ship; InventoryLedger lookup honored when fifo_override
  //                 set the batch manually.
  // Renderer prints one Batch+Exp pair per line, so when FIFO splits a line
  // across batches we display the oldest-expiry batch (FEFO order).
  const batchByLineIdx = new Map();

  if (sale.status === 'POSTED' && sale.event_id) {
    // eslint-disable-next-line vip-tenant/require-entity-filter -- entity_id explicit; event_id scopes to this sale's posting
    const ledgerRows = await InventoryLedger.find({
      entity_id: sale.entity_id,
      event_id: sale.event_id,
      transaction_type: 'CSI',
    })
      .select('product_id batch_lot_no expiry_date')
      .sort({ expiry_date: 1 })
      .lean();
    const byProduct = new Map();
    for (const r of ledgerRows) {
      const pid = String(r.product_id);
      if (!byProduct.has(pid)) byProduct.set(pid, r); // first = oldest expiry
    }
    sale.line_items.forEach((li, idx) => {
      const r = byProduct.get(String(li.product_id));
      if (r) batchByLineIdx.set(idx, { batch_lot_no: r.batch_lot_no, expiry_date: r.expiry_date });
    });
  } else {
    // DRAFT/VALID — project the batch the customer will receive at post time
    const fifoOpts = sale.warehouse_id ? { warehouseId: sale.warehouse_id.toString() } : {};
    for (let idx = 0; idx < sale.line_items.length; idx++) {
      const li = sale.line_items[idx];
      if (!li.product_id || !li.qty) continue;
      if (li.fifo_override && li.batch_lot_no) {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- entity_id explicit
        const r = await InventoryLedger.findOne({
          entity_id: sale.entity_id,
          product_id: li.product_id,
          batch_lot_no: li.batch_lot_no,
        }).select('batch_lot_no expiry_date').lean();
        batchByLineIdx.set(idx, {
          batch_lot_no: li.batch_lot_no,
          expiry_date: r?.expiry_date || null,
        });
        continue;
      }
      try {
        const consumed = await consumeFIFO(sale.entity_id, sale.bdm_id, li.product_id, li.qty, fifoOpts);
        if (consumed.length) {
          batchByLineIdx.set(idx, {
            batch_lot_no: consumed[0].batch_lot_no,
            expiry_date: consumed[0].expiry_date,
          });
        }
      } catch (err) {
        // Insufficient stock during preview shouldn't fail PDF — render blank
        // batch row so the BDM still gets the layout. The submit-time gate
        // will block the actual post if stock truly isn't there.
        if (err.code !== 'INSUFFICIENT_STOCK') {
          console.warn('[generateCsiDraft] FIFO preview failed for line', idx, err.message);
        }
      }
    }
  }

  const lineDisplay = sale.line_items.map((li, idx) => {
    const p = productMap.get(String(li.product_id)) || {};
    // CSI display format: "Brand Name (Generic Name) Dosage Strength".
    // Falls back to generic-only when no brand exists, "Item" if neither.
    let desc;
    if (p.brand_name) {
      const parts = [p.brand_name];
      if (p.generic_name && p.generic_name.trim() !== p.brand_name.trim()) {
        parts.push(`(${p.generic_name})`);
      }
      if (p.dosage_strength) parts.push(p.dosage_strength);
      desc = parts.join(' ');
    } else {
      desc = p.generic_name || 'Item';
    }
    const resolved = batchByLineIdx.get(idx) || {};
    // Phase R2 — CSI face shows GROSS line amount (qty × unit_price) so the
    // booklet's printed math reconciles with the customer's eye. The discount
    // is summarized in the totals block ("Less: Discount → Amount Due").
    // line_gross_amount is populated by the SalesLine pre-save hook; fall back
    // to qty × unit_price for legacy rows saved before Phase R2.
    const grossAmount = Number(li.line_gross_amount)
      || (Number(li.qty) || 0) * (Number(li.unit_price) || 0);
    return {
      description: desc,
      qty: li.qty,
      unit: li.unit || '',
      unit_price: li.unit_price,
      amount: grossAmount,
      batch_lot_no: resolved.batch_lot_no || li.batch_lot_no || null,
      exp_date: resolved.expiry_date || null,
    };
  });

  // Terms — prefer hospital/customer payment_terms over template default.
  const termsDays = sale.hospital_id?.payment_terms
    || sale.customer_id?.payment_terms
    || null;
  const terms = termsDays ? `${termsDays} days`
    : (template.metadata?.text?.default_terms || '30 days');

  const customerLabel = sale.hospital_id?.hospital_name
    || sale.customer_id?.customer_name
    || '';
  const customerAddress = sale.hospital_id?.address
    || sale.customer_id?.address
    || '';

  let pdfBuffer;
  try {
    pdfBuffer = await renderCsiDraft({
      sale,
      entity,
      template,
      user: owner || {},
      customerLabel,
      customerAddress,
      lineDisplay,
      terms,
    });
  } catch (err) {
    console.error('[generateCsiDraft] render failed:', err);
    return res.status(500).json({
      success: false,
      message: `CSI draft render failed: ${err.message}`,
    });
  }

  // Audit crumb — not security-critical but useful for "who printed what"
  // investigations. Uses CSI_TRACE log_type (Phase 35 generic CSI event
  // channel) since "draft-print" is a pre-posting event.
  try {
    const chunkCount = Math.ceil(
      sale.line_items.length /
        (template.metadata?.body?.max_items_per_page || 3)
    );
    await ErpAuditLog.create({
      entity_id: sale.entity_id,
      bdm_id: sale.bdm_id,
      log_type: 'CSI_TRACE',
      target_ref: sale.doc_ref || String(sale._id),
      target_model: 'SalesLine',
      changed_by: req.user._id,
      note: `Draft CSI overlay generated (${template.code}, ${sale.line_items.length} lines, ${chunkCount} page(s))`,
    });
  } catch (err) {
    // Non-fatal — never block a print on a logging hiccup.
    console.warn('[generateCsiDraft] audit log failed:', err.message);
  }

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const safeRef = (sale.doc_ref || sale._id.toString()).replace(/[^a-zA-Z0-9-]/g, '');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `attachment; filename="CSI-DRAFT-${safeRef}-${dateStr}.pdf"`);
  res.send(pdfBuffer);
});

/**
 * Calibration grid PDF for a given entity — BDM prints once onto a blank
 * booklet page, measures the mm offset between booklet anchors and grid
 * anchors, enters the delta on the My CSI calibration panel.
 *
 * Query: ?entity_id= (required). Uses req.user for offset (shows current
 * calibration on the grid header so BDM can see if they've already tuned).
 */
const getCsiCalibrationGrid = catchAsync(async (req, res) => {
  const { renderCalibrationGrid } = require('../services/csiDraftRenderer');
  const User = require('../../models/User');

  const entityId = req.query.entity_id || req.entityId;
  if (!entityId) {
    return res.status(400).json({ success: false, message: 'entity_id is required.' });
  }

  const template = await Lookup.findOne({
    entity_id: entityId,
    category: 'CSI_TEMPLATE',
    is_active: true,
  }).lean();

  if (!template) {
    return res.status(400).json({
      success: false,
      message: 'No CSI_TEMPLATE configured for this entity.',
      code: 'CSI_TEMPLATE_NOT_CONFIGURED',
    });
  }

  const user = await User.findById(req.user._id)
    .select('name csi_printer_offset_x_mm csi_printer_offset_y_mm')
    .lean();

  let pdfBuffer;
  try {
    pdfBuffer = await renderCalibrationGrid({ template, user: user || {} });
  } catch (err) {
    console.error('[getCsiCalibrationGrid] render failed:', err);
    return res.status(500).json({ success: false, message: err.message });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `attachment; filename="CSI-Calibration-Grid-${template.code}.pdf"`);
  res.send(pdfBuffer);
});

/**
 * List sales owned by (or proxy-accessible to) the caller that still lack
 * a written CSI# — i.e. drafts waiting for the BDM to print and scan back.
 * Feeds the "My CSI → Drafts Pending Print" tab.
 */
const getDraftsPendingCsi = catchAsync(async (req, res) => {
  const scope = await widenFilterForProxy(req, 'sales', { subKey: 'proxy_entry' });
  // "pending CSI" = CSI-type sales where doc_ref is still a proxy-placeholder
  // (starts with PROXY- or PENDING-) OR csi_photo_url is absent. BDMs use the
  // existing ScanCSIModal to write the real doc_ref back after printing.
  const filter = {
    ...scope,
    sale_type: 'CSI',
    status: { $in: ['DRAFT', 'VALID', 'POSTED'] },
    $or: [
      { doc_ref: { $regex: /^(PROXY|PENDING)-/i } },
      { csi_photo_url: { $in: [null, ''] } },
    ],
  };

  const rows = await SalesLine.find(filter)
    .populate('hospital_id', 'hospital_name')
    .populate('customer_id', 'customer_name')
    .populate('bdm_id', 'name')
    .sort({ csi_date: -1 })
    .limit(200)
    .lean();

  res.json({
    success: true,
    data: rows.map((r) => ({
      _id: r._id,
      doc_ref: r.doc_ref,
      csi_date: r.csi_date,
      bdm_name: r.bdm_id?.name,
      customer_name: r.hospital_id?.hospital_name || r.customer_id?.customer_name,
      line_count: r.line_items?.length || 0,
      total_amount_due: r.invoice_total,
      status: r.status,
      has_csi_photo: Boolean(r.csi_photo_url),
    })),
  });
});

// ═══════════════════════════════════════════════════════════
// PHASE R-STOREFRONT — MD Rebate + BDM Commission Attribution
// (May 8 2026 — manual proxy entry on storefront cash sales)
// ═══════════════════════════════════════════════════════════

/**
 * Attach MD rebate / BDM commission % to a storefront cash sale.
 *
 * Storefront cash sales (CASH_RECEIPT + SERVICE_INVOICE routed through
 * petty_cash_fund) bypass AR — see arEngine.js:16 — so the Collection-side
 * rebate engine never fires for them. This endpoint is the manual fallback:
 * proxy/admin attaches MD partners + rebate % per line item (or top-level
 * for SERVICE_INVOICE which has no line items) and BDM commission % per
 * sale, mirroring the green panel from /erp/collection.
 *
 * Editable post-POSTED per user direction May 08 2026 — once posted, the
 * sale is paid; admin attributes attribution after the fact when the MD
 * is identified. No period-lock check at this phase: this is data capture
 * only, no JE side effect. Phase R-Storefront-2 will route POSTED rebates
 * to PrfCalf via a period-aware batch (autoPrfRoutingForSale), at which
 * point period-lock guards on the routing engine, not this endpoint.
 *
 * Access (lookup-driven, Rule #3):
 *   - PROXY_ENTRY_ROLES.SALES_REBATE_ENTRY (default admin/finance/president)
 *   - sub-perm sales.proxy_rebate_entry on the caller's Access Template
 *   - President/CEO: president always passes; CEO denied (view-only).
 *
 * Predicate (lookup-driven via STOREFRONT_REBATE_SCOPE.DEFAULT):
 *   - sale.sale_type ∈ metadata.sale_types (default ['CASH_RECEIPT', 'SERVICE_INVOICE'])
 *   - if metadata.require_petty_cash_fund (default true):
 *       sale.petty_cash_fund_id must be set
 *   These guard against double-counting rebate from Collection-side bridge
 *   (which already handles credit-paid CSI/SERVICE_INVOICE).
 *
 * Body:
 *   {
 *     commission_pct: Number,                // BDM commission % (top-level)
 *     partner_tags: [{ doctor_id, rebate_pct }],   // SERVICE_INVOICE only (no line_items)
 *     line_items: [{ _id, partner_tags: [{ doctor_id, rebate_pct }] }]  // CASH_RECEIPT
 *   }
 *
 * Validation:
 *   - rebate_pct ≤ Settings.MAX_MD_REBATE_PCT (default 25, lookup-driven)
 *   - doctor_id resolves to existing Doctor; doctor_name + role denormalized
 *   - status not in {DELETION_REQUESTED}; deletion_event_id not set
 *
 * Audit:
 *   - partner_rebate_entry_mode = 'MANUAL_PROXY'
 *   - proxy_rebate_entered_by, proxy_rebate_entered_at stamped
 *   - proxy_rebate_edit_history append with pre-edit snapshot
 *   - ErpAuditLog row (log_type SALES_REBATE_ATTRIBUTION) for system audit
 */
const attachStorefrontRebate = catchAsync(async (req, res) => {
  const { commission_pct, partner_tags, line_items: bodyLineItems } = req.body || {};

  // 1. Find sale (entity-scoped via tenantFilter — this is a JSON POST, X-Entity-Id is intact)
  const sale = await SalesLine.findOne({ _id: req.params.id, ...req.tenantFilter });
  if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });

  // 2. Permission gate — proxy entry sub-perm + lookup-driven role allowlist.
  // President bypass implicit in canProxyEntry.
  const { canProxy } = await canProxyEntry(req, 'sales', {
    subKey: 'proxy_rebate_entry',
    lookupCode: 'SALES_REBATE_ENTRY',
  });
  const privileged = req.isPresident || req.isAdmin || req.isFinance || canProxy;
  if (!privileged) {
    return res.status(403).json({
      success: false,
      message: 'Storefront rebate attribution denied. Ask admin to grant sales.proxy_rebate_entry sub-permission and add your role to PROXY_ENTRY_ROLES.SALES_REBATE_ENTRY.'
    });
  }

  // 3. Status gate — reversed/deletion-requested rows are out of scope.
  if (sale.deletion_event_id) {
    return res.status(400).json({ success: false, message: 'Sale has been reversed — cannot edit attribution' });
  }
  if (sale.status === 'DELETION_REQUESTED') {
    return res.status(400).json({ success: false, message: 'Cannot edit attribution on a row pending deletion approval' });
  }

  // 3b. Phase R-Storefront Phase 2 — Period-lock guard. Phase 2 routes
  //     POSTED storefront attributions to RebatePayout/CommissionPayout +
  //     DRAFT PRFs (autoPrfRoutingForSale). Writing those into a closed
  //     period would leak past close, so block edits to closed-period
  //     storefront sales unless caller has accounting.reverse_posted (matches
  //     Collection reopen pattern, RR 2-2014 audit-trail compliant).
  //     Bypass: caller is president (pres always passes lookup gates) OR
  //     caller has the reverse_posted sub-perm explicitly.
  const { checkPeriodOpen, dateToPeriod } = require('../utils/periodLock');
  const periodOfSale = dateToPeriod(sale.csi_date);
  try {
    await checkPeriodOpen(sale.entity_id, periodOfSale, { source: sale.source });
  } catch (err) {
    // Allow privileged reopen-style override: president (always), OR a caller
    // with the accounting.reverse_posted sub-perm explicitly granted (same
    // sub-perm Collection.reopen / president-reverse uses).
    const subPerms = req.user?.erp_access?.sub_permissions || {};
    const canBypass = req.isPresident || subPerms.accounting?.reverse_posted === true;
    if (!canBypass) {
      return res.status(err.statusCode || 403).json({
        success: false,
        code: 'PERIOD_LOCKED',
        message: `${err.message} (Phase R-Storefront Phase 2: storefront attribution writes a PRF into the period of csi_date — closed periods need accounting.reverse_posted to bypass.)`
      });
    }
    // Privileged bypass — log to audit so the override is auditable.
    await ErpAuditLog.logChange({
      entity_id: sale.entity_id,
      bdm_id: sale.bdm_id,
      log_type: 'PERIOD_LOCK_BYPASS',
      target_ref: sale._id.toString(),
      target_model: 'SalesLine',
      changed_by: req.user._id,
      note: `Storefront rebate attribution edit on locked period ${periodOfSale} — bypassed by ${req.user.role}`
    }).catch(() => {});
  }

  // 4. Predicate — STOREFRONT_REBATE_SCOPE.DEFAULT (lookup-driven, 60s cache TTL
  // not yet wired since this is per-request and storefront sales are not
  // high-volume). Without this gate, attaching attribution to a CSI on credit
  // would double-count when Collection later settles it via the bridge.
  const scopeLookup = await Lookup.findOne({
    entity_id: sale.entity_id,
    category: 'STOREFRONT_REBATE_SCOPE',
    code: 'DEFAULT',
    is_active: true,
  }).lean();
  const allowedTypes = scopeLookup?.metadata?.sale_types || ['CASH_RECEIPT', 'SERVICE_INVOICE'];
  const requireFund = scopeLookup?.metadata?.require_petty_cash_fund !== false; // default true
  if (!allowedTypes.includes(sale.sale_type)) {
    return res.status(422).json({
      success: false,
      code: 'STOREFRONT_REBATE_NOT_APPLICABLE',
      message: `Storefront rebate attribution is not enabled for sale_type=${sale.sale_type}. Allowed types (lookup STOREFRONT_REBATE_SCOPE.DEFAULT.metadata.sale_types): ${allowedTypes.join(', ')}. CSI sales settle through Collection's rebate bridge.`
    });
  }
  if (requireFund && !sale.petty_cash_fund_id) {
    return res.status(422).json({
      success: false,
      code: 'STOREFRONT_REBATE_REQUIRES_PETTY_CASH_FUND',
      message: 'This sale is not routed through a petty cash fund — it will settle through Collection. Use the Collection-side rebate flow instead, or admin can flip STOREFRONT_REBATE_SCOPE.DEFAULT.metadata.require_petty_cash_fund to false in Control Center to opt-in (NOT recommended — duplicates rebate from Collection bridge).'
    });
  }

  // 5. Read MAX_MD_REBATE_PCT for clear validation error.
  const Settings = require('../models/Settings');
  const settingsDoc = await Settings.getSettings();
  const MAX_REBATE_PCT = Number(settingsDoc?.MAX_MD_REBATE_PCT ?? 25);

  // 6. Validate + denorm partner_tags (helper used for both top-level and per-line).
  const validateAndDenorm = async (tags, where) => {
    if (!Array.isArray(tags)) return [];
    for (const t of tags) {
      if (!t.doctor_id) {
        const e = new Error(`Partner tag in ${where} requires doctor_id`);
        e.statusCode = 400;
        throw e;
      }
      const pct = Number(t.rebate_pct);
      if (!Number.isFinite(pct) || pct < 0) {
        const e = new Error(`Partner tag rebate_pct must be a non-negative number in ${where}`);
        e.statusCode = 400;
        throw e;
      }
      if (pct > MAX_REBATE_PCT) {
        const e = new Error(`Partner tag rebate_pct ${pct}% exceeds MAX_MD_REBATE_PCT (${MAX_REBATE_PCT}%) in ${where}. Adjust the rebate or have admin raise the ceiling via Control Center → ERP Settings → MAX_MD_REBATE_PCT.`);
        e.statusCode = 422;
        throw e;
      }
    }
    if (!tags.length) return [];
    const ids = [...new Set(tags.map(t => String(t.doctor_id)))];
    const docs = await Doctor.find({ _id: { $in: ids } }).select('firstName lastName role').lean();
    const docMap = new Map(docs.map(d => [String(d._id), d]));
    // Reject any doctor_id that didn't resolve — prevents typo'd refs from
    // landing in partner_tags and breaking the rebate roll-up downstream.
    for (const t of tags) {
      if (!docMap.has(String(t.doctor_id))) {
        const e = new Error(`Partner doctor_id ${t.doctor_id} not found in ${where}`);
        e.statusCode = 400;
        throw e;
      }
    }
    return tags.map(t => {
      const d = docMap.get(String(t.doctor_id));
      const fullName = `${d.firstName || ''} ${d.lastName || ''}`.trim() || (t.doctor_name || '');
      return {
        doctor_id: t.doctor_id,
        doctor_name: fullName,
        role: d.role || t.role || '',
        rebate_pct: Number(t.rebate_pct) || 0,
        calculation_mode: 'STOREFRONT_LINE_NET',
        // rebate_amount is computed by pre-save against the line/sale net_of_vat
      };
    });
  };

  // 7. Snapshot pre-edit state for the audit history.
  const preSnapshot = {
    commission_pct: sale.commission_pct,
    commission_amount: sale.commission_amount,
    partner_tags: JSON.parse(JSON.stringify(sale.partner_tags || [])),
    line_items_partner_tags: (sale.line_items || []).map(li => ({
      _id: String(li._id),
      partner_tags: JSON.parse(JSON.stringify(li.partner_tags || []))
    })),
    total_partner_rebates: sale.total_partner_rebates,
  };

  // 8. Apply commission_pct (top-level on sale).
  if (commission_pct !== undefined && commission_pct !== null) {
    const pct = Math.max(0, Number(commission_pct) || 0);
    sale.commission_pct = pct;
  }

  // 9. Apply partner_tags. SERVICE_INVOICE has no line items — top-level
  //    partner_tags are the only seat. CASH_RECEIPT (and any other line-bearing
  //    sale_type) uses per-line partner_tags only.
  if (sale.sale_type === 'SERVICE_INVOICE') {
    if (Array.isArray(partner_tags)) {
      sale.partner_tags = await validateAndDenorm(partner_tags, 'SERVICE_INVOICE attribution');
    }
  } else {
    if (Array.isArray(bodyLineItems)) {
      const lineMap = new Map(bodyLineItems.map(li => [String(li._id), li]));
      for (const item of sale.line_items) {
        const incoming = lineMap.get(String(item._id));
        if (incoming && Array.isArray(incoming.partner_tags)) {
          item.partner_tags = await validateAndDenorm(incoming.partner_tags, `line ${item._id}`);
        }
      }
    }
  }

  // 10. Stamp audit fields.
  sale.partner_rebate_entry_mode = 'MANUAL_PROXY';
  sale.proxy_rebate_entered_by = req.user._id;
  sale.proxy_rebate_entered_at = new Date();
  sale.proxy_rebate_edit_history = sale.proxy_rebate_edit_history || [];
  const hadPriorAttribution = preSnapshot.partner_tags.length
    || preSnapshot.line_items_partner_tags.some(li => li.partner_tags.length)
    || preSnapshot.commission_pct > 0;
  sale.proxy_rebate_edit_history.push({
    user_id: req.user._id,
    user_role: req.user.role,
    user_name: req.user.name,
    at: new Date(),
    action: hadPriorAttribution ? 'UPDATE' : 'CREATE',
    pre_snapshot: preSnapshot,
  });

  // 11. Save + route inside a single Mongo transaction. If autoPrfRoutingForSale
  //     fails, the attribution edit also rolls back — the audit ledger and
  //     the PRF stay in lockstep (mirrors Collection POST atomicity contract).
  //     For DRAFT sales the routing is a no-op (skipped on status check) — the
  //     real POST-time routing in submitSales/postSaleRow will pick it up.
  const session = await mongoose.startSession();
  let routingResult = { rebatePayouts: 0, commissionPayouts: 0, prfsCreated: 0, prfsExisted: 0, payeesProcessed: 0, skipped: null };
  try {
    await session.withTransaction(async () => {
      await sale.save({ session });

      // 12. ErpAuditLog row inside the txn so audit + save + routing roll
      //     back together on routing failure. logChange() is `this.create(data)`
      //     and doesn't accept a session option, so go through Model.create()
      //     directly with the {session} option.
      await ErpAuditLog.create([{
        entity_id: sale.entity_id,
        bdm_id: sale.bdm_id,
        log_type: 'SALES_REBATE_ATTRIBUTION',
        target_ref: sale._id.toString(),
        target_model: 'SalesLine',
        field_changed: 'partner_tags + commission_pct',
        old_value: JSON.stringify({
          commission_pct: preSnapshot.commission_pct,
          total_partner_rebates: preSnapshot.total_partner_rebates,
        }),
        new_value: JSON.stringify({
          commission_pct: sale.commission_pct,
          total_partner_rebates: sale.total_partner_rebates,
        }),
        changed_by: req.user._id,
        note: `Storefront rebate attribution ${hadPriorAttribution ? 'updated' : 'created'} on ${sale.sale_type} ${sale.invoice_number || sale.doc_ref}: commission ${sale.commission_pct}% = ₱${sale.commission_amount}, partner rebates ₱${sale.total_partner_rebates}`,
      }], { session });

      // 13. Phase R-Storefront Phase 2 — Route to PrfCalf + RebatePayout +
      //     CommissionPayout. Only fires on POSTED sales (DRAFT routing is
      //     deferred to submit-time). Idempotent — on edits, existing PRFs/
      //     payouts are reused via metadata.source_sales_line_id. The Phase 1
      //     pre-save hook recomputes commission_amount and total_partner_rebates
      //     so the routed PRF reflects the latest inputs.
      if (sale.status === 'POSTED') {
        const { routePrfsForSale } = require('../services/autoPrfRoutingForSale');
        routingResult = await routePrfsForSale({
          salesLineId: sale._id,
          userId: req.user._id,
          session,
        });
      }
    });
  } finally {
    await session.endSession();
  }

  res.json({
    success: true,
    data: sale,
    routing: routingResult,
  });
});

/**
 * Phase R-Storefront Phase 2 (May 8 2026) — Period-close batch sweep.
 *
 * Belt-and-suspenders pair to the real-time route inside postSaleRow/submitSales.
 * Catches storefront sales whose attribution was attached or edited AFTER the
 * initial POST (the editable-post-POSTED path) — admin runs this manually
 * before period close to ensure all storefront rebate accruals + DRAFT PRFs
 * are in place.
 *
 * Idempotent — re-running emits zero new rows on a clean period.
 *
 * Permission: president OR admin/finance with sales.proxy_rebate_entry sub-perm.
 *   The same gate as attachStorefrontRebate — anyone authorized to attach
 *   attribution is also authorized to run the batch sweep.
 *
 * Body: { period: "YYYY-MM" }
 *
 * Period-lock guard: rejects sweeps on a CLOSED/LOCKED period (autoPrfRoutingForSale
 * throws PERIOD_LOCKED). Admin must reopen the period first or run the sweep
 * BEFORE close. President can pre-emptively run a final sweep before locking.
 */
const storefrontRebateSweepHandler = catchAsync(async (req, res) => {
  const { period } = req.body || {};
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({
      success: false,
      message: 'period (YYYY-MM) required'
    });
  }

  // Permission gate — same as attachStorefrontRebate.
  const { canProxy } = await canProxyEntry(req, 'sales', {
    subKey: 'proxy_rebate_entry',
    lookupCode: 'SALES_REBATE_ENTRY',
  });
  const privileged = req.isPresident || req.isAdmin || req.isFinance || canProxy;
  if (!privileged) {
    return res.status(403).json({
      success: false,
      message: 'Storefront rebate sweep denied. Ask admin to grant sales.proxy_rebate_entry sub-permission and add your role to PROXY_ENTRY_ROLES.SALES_REBATE_ENTRY.'
    });
  }

  const { storefrontRebateSweep } = require('../services/autoPrfRoutingForSale');
  try {
    const result = await storefrontRebateSweep({
      entityId: req.entityId,
      period,
      userId: req.user._id,
    });

    // Audit row — admin sweep runs are audit-worthy even if they emit zero rows.
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      bdm_id: req.user._id,
      log_type: 'STOREFRONT_REBATE_SWEEP',
      target_ref: period,
      target_model: 'Period',
      changed_by: req.user._id,
      note: `Storefront rebate sweep for ${period}: scanned ${result.scanned} sales, routed ${result.routed}, skipped ${result.skipped}`
    }).catch(err => console.error('[storefrontRebateSweep] audit failed (non-fatal):', err.message));

    res.json({ success: true, data: result });
  } catch (err) {
    if (err.code === 'PERIOD_LOCKED') {
      return res.status(err.status || 400).json({
        success: false,
        code: 'PERIOD_LOCKED',
        message: err.message,
      });
    }
    throw err;
  }
});

module.exports = {
  createSale,
  updateSale,
  deleteDraftRow,
  getSales,
  getSaleById,
  validateSales,
  submitSales,
  reopenSales,
  requestDeletion,
  approveDeletion,
  presidentReverseSale,
  attachReceivedCsi,
  postSaleRow, // shared helper for approval handler
  // Phase 15.3 — CSI Draft Overlay
  generateCsiDraft,
  getCsiCalibrationGrid,
  getDraftsPendingCsi,
  // Phase R-Storefront — manual MD rebate + BDM commission attribution
  attachStorefrontRebate,
  // Phase R-Storefront Phase 2 — period-close batch sweep
  storefrontRebateSweepHandler,
};
