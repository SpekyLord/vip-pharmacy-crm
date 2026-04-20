/**
 * Document Detail Builder — Shared per-module detail assembly
 *
 * Pure functions that take a hydrated (populated + .lean()) document and return
 * the `details` object consumed by BOTH the Approval Hub (pending decisions) and
 * the President Reversal Console (posted audit view).
 *
 * Subscription/scalability:
 *   - One builder per module key. Adding a new module = add one builder + register
 *     it in DETAIL_BUILDERS. Both hubs pick it up automatically.
 *   - Builders are pure — no DB calls. The caller hydrates the doc; the builder
 *     transforms the fields into the UI-facing shape. This lets the reversal
 *     detail endpoint reuse the SAME builder as the approval pending list without
 *     running duplicate queries.
 *   - No hardcoded business values (Rule #3). Labels/cycles come from Lookup
 *     categories resolved in the frontend layer; photo URLs and numeric fields
 *     pass through as-is.
 *   - Rule #4 (full identifiers): product display should combine brand + dosage
 *     upstream at the query layer; this builder preserves whatever `product_id`
 *     or `product_name` the caller hydrated.
 *
 * Builders lifted verbatim from universalApprovalService.js MODULE_QUERIES
 * (Phase 31 extraction, April 2026). Behavior is byte-identical — the inline
 * `details: {...}` blocks now live here as named functions.
 */

// ─── 12 existing builders (Phase 1 extraction — byte-identical behavior) ───

function buildDeductionScheduleDetails(item) {
  return {
    schedule_code: item.schedule_code || null,
    deduction_type: item.deduction_type,
    deduction_label: item.deduction_label,
    total_amount: item.total_amount,
    term_months: item.term_months,
    installment_amount: item.installment_amount,
    start_period: item.start_period,
    target_cycle: item.target_cycle || 'C2',
    description: item.description,
    status: item.status,
    remaining_balance: item.remaining_balance,
    approved_by: item.approved_by?.name || null,
    approved_at: item.approved_at || null,
    reject_reason: item.reject_reason || null,
    installments: (item.installments || []).map(i => ({
      period: i.period, installment_no: i.installment_no, amount: i.amount, status: i.status,
      verified_at: i.verified_at || null,
    })),
  };
}

function buildIncomeDetails(item) {
  return {
    period: item.period,
    cycle: item.cycle,
    status: item.status,
    earnings: item.earnings,
    total_earnings: item.total_earnings,
    deduction_lines: (item.deduction_lines || []).map(l => ({
      deduction_label: l.deduction_label, amount: l.amount, status: l.status,
      auto_source: l.auto_source, description: l.description,
      original_amount: l.original_amount || null,
      finance_note: l.finance_note || null,
    })),
    total_deductions: item.total_deductions,
    net_pay: item.net_pay,
    generated_at: item.generated_at || null,
    reviewed_by: item.reviewed_by?.name || null,
    reviewed_at: item.reviewed_at || null,
    return_reason: item.return_reason || null,
    confirmed_at: item.confirmed_at || null,
    credited_at: item.credited_at || null,
    credited_by: item.credited_by?.name || null,
    notes: item.notes || null,
  };
}

function buildInventoryDetails(item) {
  return {
    grn_date: item.grn_date,
    status: item.status,
    warehouse_name: item.warehouse_id?.warehouse_name
      ? `${item.warehouse_id.warehouse_name} (${item.warehouse_id.warehouse_code})`
      : null,
    source_type: item.source_type || 'STANDALONE',
    po_number: item.po_number || null,
    vendor_name: item.vendor_id?.vendor_name || null,
    _warehouse_id: item.warehouse_id?._id || item.warehouse_id,
    _bdm_id: item.bdm_id?._id || item.bdm_id,
    line_items: (item.line_items || []).map(li => ({
      product_id: li.product_id, item_key: li.item_key, batch_lot_no: li.batch_lot_no,
      expiry_date: li.expiry_date, qty: li.qty,
      purchase_uom: li.purchase_uom || null, selling_uom: li.selling_uom || null,
      conversion_factor: li.conversion_factor || 1,
      qty_selling_units: li.qty_selling_units || null,
    })),
    notes: item.notes,
    rejection_reason: item.rejection_reason || null,
    reviewed_by: item.reviewed_by?.name || null,
    reviewed_at: item.reviewed_at || null,
    waybill_photo_url: item.waybill_photo_url,
    undertaking_photo_url: item.undertaking_photo_url,
  };
}

/**
 * Phase 32 — Undertaking detail builder for the Approval Hub.
 *
 * The approver needs every signal on one card to acknowledge confidently:
 *   - Undertaking header (number, receipt date, scan-confirmed ratio, variance count)
 *   - Linked GRN summary (source, vendor/warehouse, current GRN status)
 *   - Waybill photo from the GRN (courier delivery evidence — clickable enlarge)
 *   - Per-line: product brand + dosage (rule #4), expected vs received qty,
 *     batch_lot_no, expiry + days-to-expiry, variance_flag badge, scan flag
 *
 * The `linked_grn_id` populate happens in MODULE_QUERIES.UNDERTAKING.query;
 * this builder safely reads through the populated object or bare ID.
 */
function buildUndertakingDetails(item) {
  const grn = (item.linked_grn_id && typeof item.linked_grn_id === 'object')
    ? item.linked_grn_id
    : null;
  const totalLines = (item.line_items || []).length;
  const scanned = (item.line_items || []).filter(l => l.scan_confirmed).length;
  const variances = (item.line_items || []).filter(l => l.variance_flag).length;

  return {
    undertaking_number: item.undertaking_number,
    status: item.status,
    receipt_date: item.receipt_date,
    acknowledged_by: item.acknowledged_by?.name || null,
    acknowledged_at: item.acknowledged_at || null,
    reopen_count: item.reopen_count || 0,
    rejection_reason: item.rejection_reason || null,
    notes: item.notes || null,

    // Scan-quality signals
    scan_confirmed_count: scanned,
    scan_manual_count: totalLines - scanned,
    scan_total_count: totalLines,
    variance_count: variances,

    // Linked GRN summary (for approver context)
    linked_grn: grn ? {
      _id: grn._id,
      grn_number: grn.grn_number || null,
      grn_date: grn.grn_date,
      source_type: grn.source_type || 'STANDALONE',
      po_number: grn.po_number || null,
      vendor_name: grn.vendor_id?.vendor_name || null,
      reassignment_id: grn.reassignment_id || null,
      status: grn.status
    } : { _id: item.linked_grn_id },

    // Waybill + legacy evidence — keys come from the linked GRN. They'll be signed
    // by universalApprovalService URL-signing switch (case 'UNDERTAKING').
    waybill_photo_url: grn?.waybill_photo_url || null,
    undertaking_photo_url: grn?.undertaking_photo_url || null,

    // Warehouse/BDM for enrichment (same pattern as buildInventoryDetails)
    warehouse_name: item.warehouse_id?.warehouse_name
      ? `${item.warehouse_id.warehouse_name} (${item.warehouse_id.warehouse_code})`
      : null,
    _warehouse_id: item.warehouse_id?._id || item.warehouse_id,
    _bdm_id: item.bdm_id?._id || item.bdm_id,

    line_items: (item.line_items || []).map(li => ({
      product_id: li.product_id,
      item_key: li.item_key,
      expected_qty: li.expected_qty,
      received_qty: li.received_qty,
      qty: li.received_qty, // alias for enrichment (product_name + available_stock reuse)
      batch_lot_no: li.batch_lot_no,
      expiry_date: li.expiry_date,
      days_to_expiry: li.expiry_date
        ? Math.round((new Date(li.expiry_date) - new Date()) / (1000 * 60 * 60 * 24))
        : null,
      scan_confirmed: !!li.scan_confirmed,
      variance_flag: li.variance_flag || null,
      purchase_uom: li.purchase_uom || null,
      selling_uom: li.selling_uom || null,
      conversion_factor: li.conversion_factor || 1,
      qty_selling_units: li.qty_selling_units || null,
    })),
  };
}

function buildPayrollDetails(item) {
  return {
    period: item.period, cycle: item.cycle,
    status: item.status,
    person_name: item.person_id?.full_name || item.person_id?.name || null,
    person_type: item.person_type || null,
    earnings: item.earnings, deductions: item.deductions,
    total_earnings: item.total_earnings, total_deductions: item.total_deductions,
    employer_contributions: item.employer_contributions || null,
    net_pay: item.net_pay,
    computed_at: item.computed_at || null,
    reviewed_by: item.reviewed_by?.name || null,
    reviewed_at: item.reviewed_at || null,
    approved_by: item.approved_by?.name || null,
    approved_at: item.approved_at || null,
    rejection_reason: item.rejection_reason || null,
    notes: item.notes || null,
  };
}

function buildKpiDetails(item) {
  return {
    period: item.period, period_type: item.period_type,
    fiscal_year: item.fiscal_year || null,
    status: item.status,
    person_name: item.person_id?.full_name || item.person_id?.name || null,
    reviewer_name: item.reviewer_id?.full_name || item.reviewer_id?.name || null,
    kpi_ratings: (item.kpi_ratings || []).map(k => ({
      kpi_code: k.kpi_code, kpi_name: k.kpi_label || k.kpi_name,
      target_value: k.target_value, actual_value: k.actual_value,
      self_score: k.self_score, self_comment: k.self_comment,
      manager_score: k.manager_score, manager_comment: k.manager_comment,
    })),
    competency_ratings: (item.competency_ratings || []).map(c => ({
      competency_code: c.competency_code, competency_label: c.competency_label,
      self_score: c.self_score, manager_score: c.manager_score,
    })),
    overall_self_score: item.overall_self_score,
    overall_self_comment: item.overall_self_comment || null,
    overall_manager_score: item.overall_manager_score,
    overall_manager_comment: item.overall_manager_comment || null,
    submitted_at: item.submitted_at || null,
    reviewed_at: item.reviewed_at || null,
    approved_at: item.approved_at || null,
    return_reason: item.return_reason || null,
  };
}

function buildSalesDetails(item) {
  const lines = (item.line_items || []).map(li => ({
    product_id: li.product_id, qty: li.qty, unit_price: li.unit_price,
    line_total: li.line_total, vat_amount: li.vat_amount,
    batch_lot_no: li.batch_lot_no || null,
    fifo_override: !!li.fifo_override,
    override_reason: li.override_reason || null,
  }));
  const overrideLineCount = lines.filter(l => l.fifo_override).length;
  return {
    sale_type: item.sale_type,
    csi_date: item.csi_date,
    doc_ref: item.doc_ref || null,
    invoice_number: item.invoice_number,
    status: item.status,
    hospital: item.hospital_id?.hospital_name,
    customer: item.customer_id?.customer_name,
    payment_mode: item.payment_mode,
    service_description: item.service_description || null,
    invoice_total: item.invoice_total,
    total_vat: item.total_vat,
    total_net_of_vat: item.total_net_of_vat,
    csi_photo_url: item.csi_photo_url,
    _warehouse_id: item.warehouse_id,
    _bdm_id: item.bdm_id?._id || item.bdm_id,
    line_items: lines,
    fifo_override_count: overrideLineCount,
    rejection_reason: item.rejection_reason || null,
    validation_errors: item.validation_errors || [],
    validation_warnings: item.validation_warnings || [],
  };
}

function buildCollectionDetails(item) {
  return {
    cr_no: item.cr_no || null,
    cr_date: item.cr_date,
    cr_amount: item.cr_amount,
    status: item.status,
    hospital: item.hospital_id?.hospital_name,
    customer: item.customer_id?.customer_name,
    payment_mode: item.payment_mode,
    check_no: item.check_no,
    check_date: item.check_date || null,
    bank: item.bank || null,
    deposit_date: item.deposit_date || null,
    total_csi_amount: item.total_csi_amount,
    total_net_of_vat: item.total_net_of_vat,
    total_commission: item.total_commission,
    total_partner_rebates: item.total_partner_rebates,
    cwt_rate: item.cwt_rate || 0,
    cwt_amount: item.cwt_amount,
    cwt_na: !!item.cwt_na,
    settled_csis: (item.settled_csis || []).map(c => ({
      doc_ref: c.doc_ref, csi_date: c.csi_date,
      invoice_amount: c.invoice_amount,
      net_of_vat: c.net_of_vat,
      commission_rate: c.commission_rate,
      commission_amount: c.commission_amount,
    })),
    deposit_slip_url: item.deposit_slip_url,
    cr_photo_url: item.cr_photo_url,
    cwt_certificate_url: item.cwt_certificate_url,
    csi_photo_urls: item.csi_photo_urls,
    notes: item.notes || null,
    rejection_reason: item.rejection_reason || null,
    validation_errors: item.validation_errors || [],
  };
}

function buildSmerDetails(item) {
  // Surface per-day breakdown — schema stores day_of_week, md_count, hospital_covered
  // and override fields; the count-only summary hides whether any day was overridden.
  const daily = (item.daily_entries || []).map(e => ({
    day: e.day,
    day_of_week: e.day_of_week,
    entry_date: e.entry_date,
    activity_type: e.activity_type || null,
    hospital_covered: e.hospital_covered || null,
    md_count: e.md_count || 0,
    perdiem_tier: e.perdiem_tier || null,
    perdiem_amount: e.perdiem_amount || 0,
    transpo_p2p: e.transpo_p2p || 0,
    transpo_special: e.transpo_special || 0,
    ore_amount: e.ore_amount || 0,
    notes: e.notes || null,
    perdiem_override: !!e.perdiem_override,
    override_tier: e.override_tier || null,
    override_reason: e.override_reason || null,
    override_status: e.override_status || null,
    requested_override_tier: e.requested_override_tier || null,
    overridden_at: e.overridden_at || null,
    overridden_by: e.overridden_by?.name || null,
  }));
  const overrideCount = daily.filter(d => d.perdiem_override).length;
  return {
    period: item.period,
    cycle: item.cycle,
    status: item.status,
    working_days: item.working_days,
    total_perdiem: item.total_perdiem,
    total_transpo: item.total_transpo,
    total_ore: item.total_ore,
    total_reimbursable: item.total_reimbursable,
    travel_advance: item.travel_advance,
    balance_on_hand: item.balance_on_hand,
    daily_entries_count: daily.length,
    daily_entries: daily,
    override_count: overrideCount,
    rejection_reason: item.rejection_reason || null,
    validation_errors: item.validation_errors || [],
  };
}

function buildCarLogbookDetails(item) {
  // Derive day-of-week in PH timezone (matches SMER daily_entries day_of_week semantics)
  let dayOfWeek = null;
  if (item.entry_date) {
    try {
      dayOfWeek = new Date(item.entry_date).toLocaleDateString('en-US', {
        weekday: 'long', timeZone: 'Asia/Manila',
      });
    } catch { dayOfWeek = null; }
  }
  return {
    period: item.period,
    cycle: item.cycle,
    status: item.status,
    entry_date: item.entry_date,
    day_of_week: dayOfWeek,
    starting_km: item.starting_km,
    ending_km: item.ending_km,
    starting_km_photo_url: item.starting_km_photo_url,
    ending_km_photo_url: item.ending_km_photo_url,
    total_km: item.total_km,
    official_km: item.official_km,
    personal_km: item.personal_km,
    total_fuel_amount: item.total_fuel_amount,
    official_gas_amount: item.official_gas_amount,
    personal_gas_amount: item.personal_gas_amount,
    actual_liters: item.actual_liters,
    expected_official_liters: item.expected_official_liters,
    expected_personal_liters: item.expected_personal_liters,
    efficiency_variance: item.efficiency_variance,
    km_per_liter: item.km_per_liter,
    overconsumption_flag: item.overconsumption_flag,
    destination: item.destination,
    notes: item.notes,
    rejection_reason: item.rejection_reason || null,
    validation_errors: item.validation_errors || [],
    fuel_entries_count: (item.fuel_entries || []).length,
    fuel_receipts: (item.fuel_entries || [])
      .filter(fe => fe.receipt_url || fe.starting_km_photo_url || fe.ending_km_photo_url)
      .map(fe => ({
        day: fe.day, receipt_url: fe.receipt_url,
        starting_km_photo_url: fe.starting_km_photo_url,
        ending_km_photo_url: fe.ending_km_photo_url,
      })),
    // crm_visits, cities_visited are injected by the caller (universalApprovalService)
    // via smerCrmBridge after this pure builder runs.
  };
}

function buildExpensesDetails(item) {
  return {
    period: item.period,
    cycle: item.cycle,
    status: item.status,
    bir_flag: item.bir_flag || null,
    recorded_on_behalf_of: item.recorded_on_behalf_of?.name || null,
    total_ore: item.total_ore,
    total_access: item.total_access,
    total_amount: item.total_amount,
    total_vat: item.total_vat,
    line_count: item.line_count || (item.lines || []).length,
    lines: (item.lines || []).slice(0, 10).map(l => ({
      expense_date: l.expense_date,
      expense_type: l.expense_type, expense_category: l.expense_category,
      coa_code: l.coa_code || null,
      establishment: l.establishment || null,
      particulars: l.particulars || null,
      amount: l.amount, vat_amount: l.vat_amount || 0, net_of_vat: l.net_of_vat || 0,
      or_number: l.or_number, payment_mode: l.payment_mode,
      calf_required: l.calf_required,
      or_photo_url: l.or_photo_url,
      notes: l.notes || null,
    })),
    rejection_reason: item.rejection_reason || null,
    validation_errors: item.validation_errors || [],
  };
}

function buildPrfCalfDetails(item) {
  return {
    doc_type: item.doc_type,
    prf_number: item.prf_number || null,
    calf_number: item.calf_number || null,
    period: item.period,
    cycle: item.cycle,
    status: item.status,
    prf_type: item.prf_type,
    payee_name: item.payee_name,
    payee_type: item.payee_type,
    purpose: item.purpose,
    payment_mode: item.payment_mode,
    partner_bank: item.partner_bank || null,
    partner_account_name: item.partner_account_name || null,
    partner_account_no: item.partner_account_no || null,
    rebate_amount: item.rebate_amount,
    advance_amount: item.advance_amount,
    liquidation_amount: item.liquidation_amount,
    balance: item.balance,
    bir_flag: item.bir_flag,
    check_no: item.check_no || null,
    bank: item.bank || null,
    photo_urls: item.photo_urls,
    notes: item.notes || null,
    rejection_reason: item.rejection_reason || null,
    validation_errors: item.validation_errors || [],
  };
}

function buildPerdiemOverrideDetails(req) {
  const cov = req._coverage || null;
  return {
    module: 'PERDIEM_OVERRIDE',
    doc_type: req.doc_type || 'SMER_DAILY_ENTRY',
    doc_ref: req.doc_ref,
    description: req.description,
    amount: req.amount,
    requested_by: req.requested_by?.name || null,
    requested_at: req.requested_at,
    status: req.status || null,
    rule_id: req.rule_id || null,
    decided_by: req.decided_by?.name || null,
    decided_at: req.decided_at || null,
    decision_reason: req.decision_reason || req.reject_reason || null,
    requested_override_tier: cov?.requested_tier || req.requested_override_tier || null,
    // Coverage summary — dereferenced from the SMER daily entry so the approver has
    // the exact calendar date, day-of-week, MD count, hospitals, and amount delta
    // without having to cross-reference the source SMER.
    entry_date: cov?.entry_date || null,
    day_of_week: cov?.day_of_week || null,
    day_number: cov?.day_number || null,
    period: cov?.period || null,
    cycle: cov?.cycle || null,
    md_count: cov?.md_count != null ? cov.md_count : null,
    hospital_covered: cov?.hospital_covered || null,
    activity_type: cov?.activity_type || null,
    current_tier: cov?.current_tier || null,
    current_amount: cov?.current_amount != null ? cov.current_amount : null,
    requested_amount: cov?.requested_amount != null ? cov.requested_amount : null,
    amount_difference: cov?.difference != null ? cov.difference : null,
    override_reason: cov?.override_reason || null,
  };
}

// ─── Phase 2 — new builders for gap modules ───

/**
 * IC_TRANSFER — covers InterCompanyTransfer (SOURCE→TARGET stock shipment) AND
 * IcSettlement (subsidiary paying VIP). Both share the IC_TRANSFER module key
 * via gateApproval.
 */
function buildIcTransferDetails(item) {
  const isSettlement = !!item.cr_no;
  if (isSettlement) {
    return {
      kind: 'IC_SETTLEMENT',
      cr_no: item.cr_no,
      cr_date: item.cr_date,
      cr_amount: item.cr_amount,
      status: item.status,
      creditor_entity: item.creditor_entity_id?.entity_name || null,
      debtor_entity: item.debtor_entity_id?.entity_name || null,
      payment_mode: item.payment_mode,
      check_no: item.check_no,
      check_date: item.check_date,
      bank: item.bank,
      deposit_slip_url: item.deposit_slip_url,
      cr_photo_url: item.cr_photo_url,
      cwt_rate: item.cwt_rate || 0,
      cwt_amount: item.cwt_amount || 0,
      cwt_na: !!item.cwt_na,
      total_transfer_amount: item.total_transfer_amount || 0,
      total_settled: item.total_settled || 0,
      settled_transfers: (item.settled_transfers || []).map(t => ({
        transfer_ref: t.transfer_ref, vip_csi_ref: t.vip_csi_ref || null,
        transfer_amount: t.transfer_amount, amount_settled: t.amount_settled,
      })),
      posted_at: item.posted_at || null,
      posted_by: item.posted_by?.name || null,
    };
  }
  return {
    kind: 'IC_TRANSFER',
    transfer_ref: item.transfer_ref,
    csi_ref: item.csi_ref || null,
    transfer_date: item.transfer_date,
    status: item.status,
    source_entity: item.source_entity_id?.entity_name || null,
    target_entity: item.target_entity_id?.entity_name || null,
    source_warehouse: item.source_warehouse_id?.warehouse_name || null,
    target_warehouse: item.target_warehouse_id?.warehouse_name || null,
    total_amount: item.total_amount,
    total_items: item.total_items,
    // Workflow timestamps — multi-step lifecycle: approve → ship → receive → post
    approved_by: item.approved_by?.name || null,
    approved_at: item.approved_at || null,
    shipped_by: item.shipped_by?.name || null,
    shipped_at: item.shipped_at || null,
    received_by: item.received_by?.name || null,
    received_at: item.received_at || null,
    posted_by: item.posted_by?.name || null,
    posted_at: item.posted_at || null,
    cancelled_by: item.cancelled_by?.name || null,
    cancelled_at: item.cancelled_at || null,
    cancel_reason: item.cancel_reason || null,
    // Markers for universalApprovalService.enrichLineItems — scopes the stock
    // lookup to the SOURCE warehouse (what's actually being shipped out) so the
    // approver sees "available: 50" against a transfer of 100 and can reject
    // before stock runs negative. Matches the Sales/GRN builder pattern.
    _warehouse_id: item.source_warehouse_id?._id || item.source_warehouse_id,
    _bdm_id: item.source_bdm_id?._id || item.source_bdm_id,
    line_items: (item.line_items || []).map(li => ({
      product_id: li.product_id, item_key: li.item_key,
      qty: li.qty, unit: li.unit,
      batch_lot_no: li.batch_lot_no, expiry_date: li.expiry_date,
      transfer_price: li.transfer_price, line_total: li.line_total,
    })),
    notes: item.notes,
  };
}

/**
 * JOURNAL — covers manual Journal Entries (JOURNAL_ENTRY), depreciation batches
 * (DEPRECIATION), and interest batches (INTEREST). All go through the JOURNAL
 * module sub-permission.
 */
function buildJournalDetails(item) {
  // Batch shape — DEPRECIATION / INTEREST monthly batches. The universal service
  // hydrates asset / loan staging and passes it via `_batch_kind`. For these we
  // render a staging table (one row per asset/loan) instead of a JE line table.
  if (item._batch_kind === 'DEPRECIATION' || item._batch_kind === 'INTEREST') {
    const lines = (item.staging || []).map(r =>
      item._batch_kind === 'DEPRECIATION'
        ? {
            line_kind: 'DEPRECIATION',
            ref_code: r.asset_code,
            ref_name: r.asset_name,
            amount: r.amount || 0,
            period: r.period,
          }
        : {
            line_kind: 'INTEREST',
            ref_code: r.loan_code,
            ref_name: r.lender,
            interest_amount: r.interest_amount || 0,
            principal_amount: r.principal_amount || 0,
            outstanding_balance: r.outstanding_balance || 0,
            period: r.period,
          }
    );
    return {
      is_batch:     true,
      batch_kind:   item._batch_kind,
      period:       item.period,
      doc_ref:      item.doc_ref,
      status:       item.status,
      memo:         item.memo,
      line_count:   lines.length,
      total_amount: item.total_amount || 0,
      batch_lines:  lines,
    };
  }

  const totalDebit = (item.lines || []).reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = (item.lines || []).reduce((s, l) => s + (l.credit || 0), 0);
  return {
    je_number: item.je_number,
    je_date: item.je_date,
    period: item.period,
    status: item.status,
    source_module: item.source_module,
    source_doc_ref: item.source_doc_ref,
    memo: item.memo || item.description,
    bir_flag: item.bir_flag || null,
    vat_flag: item.vat_flag || null,
    is_reversal: item.is_reversal,
    corrects_je_id: item.corrects_je_id?._id || item.corrects_je_id || null,
    corrects_je_number: item.corrects_je_id?.je_number || null,
    total_debits: totalDebit,
    total_credits: totalCredit,
    posted_by: item.posted_by?.name || null,
    posted_at: item.posted_at || null,
    created_by: item.created_by?.name || null,
    lines: (item.lines || []).map(l => ({
      account_code: l.account_code, account_name: l.account_name,
      debit: l.debit || 0, credit: l.credit || 0,
      description: l.description || l.memo || null,
      memo: l.memo, cost_center: l.cost_center, bdm_id: l.bdm_id,
    })),
  };
}

/**
 * BANKING — BankStatement being finalized (reconciliation).
 */
function buildBankingDetails(item) {
  const entries = item.entries || [];
  const matchedList = entries.filter(e => e.match_status === 'MATCHED');
  const unmatchedList = entries.filter(e => e.match_status === 'UNMATCHED');
  const reconcilingList = entries.filter(e => e.match_status === 'RECONCILING_ITEM');
  // Cap the total serialized payload so a huge statement (200+ lines) doesn't
  // bloat the Approval Hub response. Full unmatched + reconciling are always
  // included (that's the approver's job); matched entries are capped.
  const MATCHED_CAP = 20;
  const serializeEntry = (e) => ({
    txn_date: e.txn_date, description: e.description, reference: e.reference,
    debit: e.debit, credit: e.credit, balance: e.balance, match_status: e.match_status,
  });
  return {
    bank_account: item.bank_account_id?.bank_name
      ? `${item.bank_account_id.bank_name}${item.bank_account_id.bank_code ? ` (${item.bank_account_id.bank_code})` : ''}`
      : null,
    coa_code: item.bank_account_id?.coa_code || null,
    statement_date: item.statement_date,
    period: item.period,
    status: item.status,
    closing_balance: item.closing_balance,
    entries_count: entries.length,
    matched_count: matchedList.length,
    unmatched_count: unmatchedList.length,
    reconciling_items_count: reconcilingList.length,
    uploaded_at: item.uploaded_at,
    uploaded_by: item.uploaded_by?.name || null,
    // Full unmatched + reconciling lists — the approver must review every one
    // of these to decide whether to post or send back for fixes.
    unmatched_entries: unmatchedList.map(serializeEntry),
    reconciling_entries: reconcilingList.map(serializeEntry),
    // Matched entries capped — surfaced as preview only. `matched_truncated`
    // lets the UI render a "Showing first N of M matched" hint.
    matched_preview: matchedList.slice(0, MATCHED_CAP).map(serializeEntry),
    matched_truncated: matchedList.length > MATCHED_CAP,
  };
}

/**
 * PURCHASING — supplier invoice (bill) pending approval.
 */
function buildPurchasingDetails(item) {
  const totalAmount = item.total_amount || 0;
  const amountPaid = item.amount_paid || 0;
  const balanceDue = Math.round((totalAmount - amountPaid) * 100) / 100;
  const overdue = item.due_date && new Date(item.due_date) < new Date() && balanceDue > 0;
  return {
    invoice_ref: item.invoice_ref,
    invoice_date: item.invoice_date,
    status: item.status,
    match_status: item.match_status || null,
    payment_status: item.payment_status || null,
    vendor_name: item.vendor_id?.vendor_name || item.vendor_name || null,
    vendor_tin: item.vendor_id?.tin || null,
    po_number: item.po_id?.po_number || item.po_number || null,
    grn_id: item.grn_id || null,
    total_amount: totalAmount,
    vat_amount: item.vat_amount,
    net_amount: item.net_amount,
    input_vat: item.input_vat,
    amount_paid: amountPaid,
    balance_due: balanceDue,
    due_date: item.due_date,
    overdue,
    line_items: (item.line_items || []).map(li => ({
      product_id: li.product_id, item_key: li.item_key, description: li.description,
      qty: li.qty_invoiced || li.qty, unit_price: li.unit_price, line_total: li.line_total,
      po_line_matched: !!li.po_line_matched,
      grn_line_matched: !!li.grn_line_matched,
    })),
  };
}

/**
 * CREDIT_NOTE — product return credit note (Phase 31R).
 */
function buildCreditNoteDetails(item) {
  return {
    cn_number: item.cn_number || null,
    cn_date: item.cn_date,
    status: item.status,
    hospital: item.hospital_id?.hospital_name || null,
    customer: item.customer_id?.customer_name || null,
    original_doc_ref: item.original_doc_ref || null,
    original_sale_id: item.original_sale_id || null,
    credit_total: item.credit_total,
    total_vat: item.total_vat,
    total_net_of_vat: item.total_net_of_vat,
    _warehouse_id: item.warehouse_id?._id || item.warehouse_id,
    _bdm_id: item.bdm_id?._id || item.bdm_id,
    line_items: (item.line_items || []).map(li => ({
      product_id: li.product_id,
      item_key: li.item_key,
      batch_lot_no: li.batch_lot_no,
      expiry_date: li.expiry_date,
      qty: li.qty,
      unit: li.unit,
      unit_price: li.unit_price,
      line_total: li.line_total,
      return_reason: li.return_reason,
      return_condition: li.return_condition,
      notes: li.notes || null,
    })),
    photo_urls: item.photo_urls || [],
    notes: item.notes || null,
    posted_at: item.posted_at || null,
    posted_by: item.posted_by?.name || null,
    validation_errors: item.validation_errors || [],
  };
}

/**
 * PETTY_CASH — disbursement or deposit pending fund admin's approval.
 */
function buildPettyCashDetails(item) {
  return {
    txn_number: item.txn_number,
    txn_type: item.txn_type,
    txn_date: item.txn_date,
    status: item.status,
    fund_label: item.fund_id?.fund_name
      || (item.fund_id?.fund_code ? `Fund ${item.fund_id.fund_code}` : null),
    amount: item.amount,
    running_balance: item.running_balance,
    fund_current_balance: item.fund_id?.current_balance,
    // Requester context — for disbursements the approver needs to know who cut
    // the PCV. PettyCashTransaction uses `created_by` as the requester / BDM scope
    // (model has no separate bdm_id field — see PettyCashTransaction.js line 79).
    requested_by: item.created_by?.name || null,
    requested_by_email: item.created_by?.email || null,
    // DEPOSIT-flavored
    source_description: item.source_description,
    linked_collection_id: item.linked_collection_id || null,
    linked_sales_line_id: item.linked_sales_line_id || null,
    // DISBURSEMENT-flavored
    payee: item.payee,
    particulars: item.particulars,
    expense_category: item.expense_category,
    or_number: item.or_number,
    or_photo_url: item.or_photo_url,
    is_pcv: item.is_pcv,
    pcv_remarks: item.pcv_remarks,
    vat_amount: item.vat_amount,
    net_of_vat: item.net_of_vat,
    // Approval / void audit trail
    approved_by: item.approved_by?.name || null,
    posted_at: item.posted_at || null,
    posted_by: item.posted_by?.name || null,
    voided_at: item.voided_at || null,
    voided_by: item.voided_by?.name || null,
    void_reason: item.void_reason || null,
    validation_errors: item.validation_errors || [],
  };
}

// ─── Phase 31R-OS — Office Supplies (master + transactions) ───
// Shared by President Reversal Console's detail endpoint. Approval Hub does
// not use this (office supplies are not gated through gateApproval — see plan).

function buildOfficeSupplyDetails(item) {
  // Handle both shapes: master item (has item_name) OR transaction (has txn_type).
  if (item.txn_type) {
    // OFFICE_SUPPLY_TXN
    const parent = item.supply_id || {};
    return {
      doc_class:       'OFFICE_SUPPLY_TXN',
      txn_type:        item.txn_type,
      txn_date:        item.txn_date,
      qty:             item.qty,
      unit_cost:       item.unit_cost,
      total_cost:      item.total_cost,
      issued_to:       item.issued_to || null,
      or_number:       item.or_number || null,
      notes:           item.notes || null,
      item_label:      parent.item_code
        ? `${parent.item_name} (${parent.item_code})`
        : parent.item_name || null,
      item_category:   parent.category || null,
      item_unit:       parent.unit || null,
      item_qty_on_hand: parent.qty_on_hand,
      cost_center:     item.cost_center_id?.cost_center_name
        || item.cost_center_id?.cost_center_code
        || null,
      created_by:      item.created_by?.name || null,
      reversal_event_id: item.reversal_event_id || null,
      deletion_event_id: item.deletion_event_id || null,
    };
  }
  // OFFICE_SUPPLY_ITEM
  return {
    doc_class:           'OFFICE_SUPPLY_ITEM',
    item_name:           item.item_name,
    item_code:           item.item_code || null,
    category:            item.category || null,
    unit:                item.unit || null,
    qty_on_hand:         item.qty_on_hand,
    reorder_level:       item.reorder_level,
    last_purchase_price: item.last_purchase_price,
    is_active:           item.is_active,
    warehouse:           item.warehouse_id?.warehouse_name
      || item.warehouse_id?.warehouse_code
      || null,
    cost_center:         item.cost_center_id?.cost_center_name
      || item.cost_center_id?.cost_center_code
      || null,
    created_by:          item.created_by?.name || null,
    created_at:          item.created_at || item.createdAt || null,
    deletion_event_id:   item.deletion_event_id || null,
    reorder_alert:       (item.qty_on_hand || 0) <= (item.reorder_level || 0),
    notes:               item.notes || null,
  };
}

/**
 * SALES_GOAL_PLAN — fiscal-year sales/incentive plan pending president approval.
 * Surfaces the commitments (baseline → target revenue, collection target %),
 * growth-driver and incentive-program counts, and plan identifiers so the
 * approver can judge the plan without opening the source page.
 */
function buildSalesGoalPlanDetails(item) {
  const drivers = item.growth_drivers || [];
  const programs = item.incentive_programs || [];
  const growthPct = item.baseline_revenue
    ? ((item.target_revenue - item.baseline_revenue) / item.baseline_revenue) * 100
    : null;
  return {
    doc_class:             'SALES_GOAL_PLAN',
    fiscal_year:           item.fiscal_year,
    plan_name:             item.plan_name,
    reference:             item.reference || null,
    status:                item.status,
    baseline_revenue:      item.baseline_revenue || 0,
    target_revenue:        item.target_revenue || 0,
    growth_pct:            growthPct,
    revenue_delta:         (item.target_revenue || 0) - (item.baseline_revenue || 0),
    collection_target_pct: item.collection_target_pct || 0,
    growth_driver_count:   drivers.length,
    growth_drivers:        drivers.map(d => ({
      driver_code: d.driver_code,
      driver_label: d.driver_label,
      revenue_target_min: d.revenue_target_min,
      revenue_target_max: d.revenue_target_max,
      kpi_count: (d.kpi_definitions || []).length,
    })),
    incentive_program_count: programs.length,
    incentive_programs:      programs.map(p => ({
      program_code: p.program_code,
      program_name: p.program_name,
      qualification_metric: p.qualification_metric,
      use_tiers: p.use_tiers,
    })),
    version_no:     item.version_no || 1,
    effective_from: item.effective_from || null,
    effective_to:   item.effective_to || null,
    created_by:     item.created_by?.name || null,
    approved_by:    item.approved_by?.name || null,
    approved_at:    item.approved_at || null,
    rejection_reason: item.rejection_reason || null,
  };
}

/**
 * INCENTIVE_PAYOUT — accrued commission awaiting president/finance approval
 * before payment. Surfaces the attainment math (target vs actual + percentage)
 * and the cap delta (uncapped vs capped) so the approver can see if the tier
 * was capped and by how much.
 */
function buildIncentivePayoutDetails(item) {
  const uncapped = item.uncapped_budget || 0;
  const capped = item.tier_budget || 0;
  return {
    doc_class:        'INCENTIVE_PAYOUT',
    status:           item.status,
    bdm:              item.bdm_id?.name || null,
    bdm_email:        item.bdm_id?.email || null,
    plan_name:        item.plan_id?.plan_name || null,
    plan_reference:   item.plan_id?.reference || null,
    fiscal_year:      item.fiscal_year,
    period:           item.period,
    period_type:      item.period_type,
    program_code:     item.program_code || null,
    tier_code:        item.tier_code,
    tier_label:       item.tier_label || null,
    sales_target:     item.sales_target || 0,
    sales_actual:     item.sales_actual || 0,
    sales_gap:        (item.sales_actual || 0) - (item.sales_target || 0),
    attainment_pct:   item.attainment_pct || 0,
    tier_budget:      capped,
    uncapped_budget:  uncapped,
    cap_applied:      uncapped > capped,
    cap_delta:        Math.max(0, uncapped - capped),
    journal_number:   item.journal_id?.je_number || item.journal_number || null,
    journal_date:     item.journal_id?.je_date || null,
    approved_by:      item.approved_by?.name || null,
    approved_at:      item.approved_at || null,
    paid_via:         item.paid_via || null,
    paid_at:          item.paid_at || null,
    notes:            item.notes || null,
    rejection_reason: item.rejection_reason || null,
  };
}

// ─── Registry ───

const DETAIL_BUILDERS = {
  // Existing 12 (Phase 1 extraction)
  DEDUCTION_SCHEDULE: buildDeductionScheduleDetails,
  INCOME:             buildIncomeDetails,
  INVENTORY:          buildInventoryDetails,
  PAYROLL:            buildPayrollDetails,
  KPI:                buildKpiDetails,
  SALES:              buildSalesDetails,
  COLLECTION:         buildCollectionDetails,
  SMER:               buildSmerDetails,
  CAR_LOGBOOK:        buildCarLogbookDetails,
  EXPENSES:           buildExpensesDetails,
  PRF_CALF:           buildPrfCalfDetails,
  PERDIEM_OVERRIDE:   buildPerdiemOverrideDetails,
  // Phase 2 new
  IC_TRANSFER:        buildIcTransferDetails,
  JOURNAL:            buildJournalDetails,
  BANKING:            buildBankingDetails,
  PURCHASING:         buildPurchasingDetails,
  PETTY_CASH:         buildPettyCashDetails,
  // Phase 31R
  CREDIT_NOTE:        buildCreditNoteDetails,
  // Phase 31R-OS — shared builder handles both item and txn shapes
  OFFICE_SUPPLY:      buildOfficeSupplyDetails,
  // Phase G6.7 closeout — sales-goal / incentive approval hub panels
  SALES_GOAL_PLAN:    buildSalesGoalPlanDetails,
  INCENTIVE_PAYOUT:   buildIncentivePayoutDetails,
  // Phase 32 — Undertaking (GRN receipt confirmation)
  UNDERTAKING:        buildUndertakingDetails,
};

/**
 * Main entry point. Returns `null` when no builder is registered (APPROVAL_REQUEST
 * intentionally has none — its items pass through without a `details` field).
 */
function buildDocumentDetails(module, doc) {
  const fn = DETAIL_BUILDERS[module];
  if (!fn || !doc) return null;
  return fn(doc);
}

/**
 * Map a REVERSAL_HANDLERS doc_type back to the MODULE key used by the builder
 * registry. Used by the President Reversal Console's detail endpoint — lets the
 * same builder serve both hubs without duplicating the mapping logic.
 */
const REVERSAL_DOC_TYPE_TO_MODULE = {
  SALES_LINE:           'SALES',
  COLLECTION:           'COLLECTION',
  EXPENSE:              'EXPENSES',
  CALF:                 'PRF_CALF',
  PRF:                  'PRF_CALF',
  GRN:                  'INVENTORY',
  IC_TRANSFER:          'IC_TRANSFER',
  CONSIGNMENT_TRANSFER: 'INVENTORY', // DR is inventory-adjacent; reuse GRN-style panel for now
  INCOME_REPORT:        'INCOME',
  PAYSLIP:              'PAYROLL',
  PETTY_CASH_TXN:       'PETTY_CASH',
  JOURNAL_ENTRY:        'JOURNAL',
  // Phase 31R — reuse existing builders where shape is identical
  SMER_ENTRY:           'SMER',            // buildSmerDetails
  CAR_LOGBOOK:          'CAR_LOGBOOK',     // buildCarLogbookDetails
  SUPPLIER_INVOICE:     'PURCHASING',      // buildPurchasingDetails
  CREDIT_NOTE:          'CREDIT_NOTE',     // buildCreditNoteDetails (new)
  IC_SETTLEMENT:        'IC_TRANSFER',     // buildIcTransferDetails branches on item.cr_no
  // Phase 31R-OS — both office supply doc_types share one builder that branches
  // on the `txn_type` field to render item vs txn shape.
  OFFICE_SUPPLY_ITEM:   'OFFICE_SUPPLY',
  OFFICE_SUPPLY_TXN:    'OFFICE_SUPPLY',
  // Phase G6.7 closeout — Reversal Console reuses the Approval Hub panel for
  // Sales Goal plan reversals. IncentivePayout has no entry in REVERSAL_HANDLERS
  // (its own route handles reversal), so it is intentionally omitted here.
  SALES_GOAL_PLAN:      'SALES_GOAL_PLAN',
  // Phase 32 — Reversal Console reuses the Approval Hub panel for Undertaking.
  UNDERTAKING:          'UNDERTAKING',
};

module.exports = {
  buildDocumentDetails,
  DETAIL_BUILDERS,
  REVERSAL_DOC_TYPE_TO_MODULE,
};
