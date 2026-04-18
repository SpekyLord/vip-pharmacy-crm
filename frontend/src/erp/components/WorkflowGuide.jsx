/**
 * WorkflowGuide — Phase 24
 *
 * Contextual workflow guidance banner for BDM-facing ERP pages.
 * Shows what the page is for, what to do, and what comes next.
 * Dismissible per session via sessionStorage.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const styles = `
  .wfg { background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%); border: 1px solid #bfdbfe; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; position: relative; font-size: 12px; line-height: 1.7; }
  .wfg-dismiss { position: absolute; top: 8px; right: 10px; background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 6px; border-radius: 4px; }
  .wfg-dismiss:hover { background: #dbeafe; color: #1e40af; }
  .wfg-title { font-size: 13px; font-weight: 700; color: #1e40af; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
  .wfg-title svg { width: 16px; height: 16px; }
  .wfg-steps { display: flex; flex-direction: column; gap: 3px; }
  .wfg-step { display: flex; align-items: flex-start; gap: 6px; color: #334155; }
  .wfg-num { background: #2563eb; color: #fff; width: 18px; height: 18px; border-radius: 50%; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
  .wfg-next { margin-top: 8px; padding-top: 8px; border-top: 1px solid #bfdbfe; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .wfg-next-label { font-weight: 700; color: #1e40af; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
  .wfg-link { background: #2563eb; color: #fff; border: none; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; text-decoration: none; }
  .wfg-link:hover { background: #1d4ed8; }
  .wfg-link-outline { background: transparent; border: 1px solid #bfdbfe; color: #2563eb; }
  .wfg-link-outline:hover { background: #eff6ff; }
  .wfg-tip { margin-top: 6px; color: #64748b; font-style: italic; font-size: 11px; }
  body.dark-mode .wfg { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-color: #334155; }
  body.dark-mode .wfg-title { color: #93c5fd; }
  body.dark-mode .wfg-step { color: #cbd5e1; }
  body.dark-mode .wfg-next { border-color: #334155; }
  body.dark-mode .wfg-next-label { color: #93c5fd; }
  body.dark-mode .wfg-tip { color: #64748b; }
  body.dark-mode .wfg-dismiss:hover { background: #334155; color: #93c5fd; }
  @media(max-width: 600px) {
    .wfg { padding: 12px 12px 10px; font-size: 11px; overflow: hidden; word-break: break-word; overflow-wrap: break-word; }
    .wfg-title { font-size: 12px; padding-right: 20px; }
    .wfg-step span:last-child { word-break: break-word; overflow-wrap: break-word; white-space: normal; min-width: 0; flex: 1; }
    .wfg-tip { word-break: break-word; overflow-wrap: break-word; white-space: normal; }
    .wfg-next { flex-direction: column; align-items: stretch; gap: 6px; }
    .wfg-next-label { margin-bottom: 2px; }
    .wfg-link { width: 100%; text-align: center; padding: 8px 12px; font-size: 12px; box-sizing: border-box; white-space: normal; word-break: break-word; }
  }
`;

// ── Complete BDM workflow guide config ──
const WORKFLOW_GUIDES = {
  'erp-dashboard': {
    title: 'Your Daily Workflow',
    steps: [
      'Check your targets and MTD performance here',
      'Create Sales (CSI) for hospital visits',
      'Record field expenses (SMER, Car Logbook, ORE/ACCESS)',
      'Collect payments from customers',
      'Review your P&L and profit sharing at month-end',
    ],
    next: [
      { label: 'Create Sale', path: '/erp/sales/entry' },
      { label: 'Record Expenses', path: '/erp/expenses' },
      { label: 'Collect Payment', path: '/erp/collections' },
    ],
    tip: 'Complete all DRAFT documents before end of day. Unfinished drafts will not appear in reports.',
  },
  'sales-entry': {
    title: 'Creating a Sale (CSI / Cash Receipt / Service Invoice)',
    steps: [
      'Select sale type: CSI (credit), Cash Receipt (cash), or Service Invoice (services)',
      'Select the hospital/customer and set the invoice date',
      'CSI/Cash Receipt: add line items — product, quantity, price. Service Invoice: enter description + total.',
      'For Cash Receipt or Service Invoice with CASH payment: optionally select a Petty Cash Fund to deposit cash directly',
      'Save as DRAFT, then Validate to check for errors',
      'Post to finalize — CSI creates AR; Cash Receipt/Service Invoice with fund creates direct petty cash deposit instead of AR',
      'Re-open a POSTED sale to correct it — reverses stock, petty-cash deposit, and journal entries (SAP Storno). Blocked if a POSTED Collection already settled this CSI; reopen the collection first to release it.',
    ],
    next: [
      { label: 'View All Sales', path: '/erp/sales' },
      { label: 'Check Inventory', path: '/erp/my-stock' },
      { label: 'Collect Payment', path: '/erp/collections' },
      { label: 'Petty Cash', path: '/erp/petty-cash' },
    ],
    tip: 'CSI sales always create AR (collect via Collections). Cash Receipt and Service Invoice with CASH payment can route directly to a Petty Cash Fund — bypassing AR and auto-creating a deposit on posting. Only ACTIVE funds with REVOLVING or DEPOSIT_ONLY mode are available. Re-opening a CSI that a Collection already settled is blocked to keep AR and GL balanced — reopen the Collection first.',
  },
  'sales-list': {
    title: 'Sales Management',
    steps: [
      'Review all your CSI documents and their statuses',
      'DRAFT — still editable, not yet validated',
      'VALID — passed checks, ready to post',
      'POSTED — finalized, AR created, appears in reports',
      'Opening AR — pre-live-date entries skip stock deduction (AR only, no COGS)',
      'Re-open — reverses stock, consignment, petty cash deposit, and journal entries (SAP Storno). Blocked if CSI is already settled by a POSTED Collection — reopen the collection first to release the CSI.',
      'President Delete — for the President (or anyone granted accounting.reverse_posted in Access Templates): one-click delete of bad rows. POSTED rows trigger SAP Storno (reversal entries in current period; original kept for audit); DRAFT/ERROR rows are hard-deleted. All actions logged.',
    ],
    next: [
      { label: 'Create New Sale', path: '/erp/sales/entry' },
      { label: 'Collect Payment', path: '/erp/collections' },
      { label: 'View AR Aging', path: '/erp/collections/ar' },
    ],
    tip: 'Post valid sales promptly. Unposted sales do not count in MTD targets or P&L. Posting routes through the Approval Hub for users not in MODULE_DEFAULT_ROLES.SALES (lookup-driven, per-entity). When Authority Matrix is enabled, additional escalation rules can layer on top. Use the Source filter to view Opening AR entries separately. To re-open a POSTED CSI that has already been collected, first reopen the Collection that settles it — only unsettled CSIs are reopenable. Stuck on an ERROR row? The President can delete + reverse it from this list.',
  },
  'my-stock': {
    title: 'Inventory Overview',
    steps: [
      'Stock on Hand — your current available quantity per product',
      'Transaction Ledger — all stock movements (in/out)',
      'Check stock before creating sales to avoid over-selling',
      'Request transfers from main warehouse if stock is low',
    ],
    next: [
      { label: 'Create Sale', path: '/erp/sales/entry' },
      { label: 'Request Transfer', path: '/erp/transfers' },
      { label: 'View Consignment', path: '/erp/consignment' },
    ],
    tip: 'FIFO (First In, First Out) is enforced. Oldest batches are sold first automatically.',
  },
  'dr-entry': {
    title: 'Delivery Receipt / Consignment',
    steps: [
      'Select DR type: Consignment, Sampling, or Donation',
      'Choose the hospital/customer receiving the goods',
      'Add products and quantities being delivered',
      'Save as DRAFT, Validate, then Post to deduct from inventory',
    ],
    next: [
      { label: 'View Inventory', path: '/erp/my-stock' },
      { label: 'Track Consignment', path: '/erp/consignment' },
      { label: 'Create Sale', path: '/erp/sales/entry' },
    ],
    tip: 'Consignment goods remain your inventory until the customer sells or returns them. Track aging in Consignment Dashboard.',
  },
  'collections': {
    title: 'Collections Process',
    steps: [
      'View all receivables and their aging status',
      'Click "New Collection" to record a payment received',
      'Select the CSI invoices being paid (partial or full)',
      'Enter payment details (mode, amount, check number if applicable)',
      'For CASH payments, choose destination: Bank Account or Petty Cash Fund — auto-deposit happens on posting',
      'Validate and Post — this clears the customer\'s AR balance and creates deposit/journal entries',
    ],
    next: [
      { label: 'New Collection', path: '/erp/collections/session' },
      { label: 'View AR Aging', path: '/erp/collections/ar' },
      { label: 'Generate SOA', path: '/erp/collections/soa' },
      { label: 'Petty Cash', path: '/erp/petty-cash' },
    ],
    tip: 'Overdue accounts (>30 days) are flagged. Cash payments routed to a Petty Cash Fund auto-create a POSTED deposit on submission and auto-void on reopen. Only ACTIVE funds that accept deposits (REVOLVING or DEPOSIT_ONLY mode) are available.',
  },
  'collection-session': {
    title: 'Recording a Collection',
    steps: [
      'Select the customer/hospital (auto-filled when you arrive here via the AR Aging "Collect" button)',
      'Choose which invoices (CSIs) are being paid (the CSI you clicked from AR Aging is pre-selected; add more if the same CR settles multiple invoices)',
      'Enter the payment mode (Cash, Check, Bank Transfer, GCash)',
      'Choose payment destination — Petty Cash Fund (ACTIVE, deposit-enabled) or Bank Account',
      'Enter amount received — can be partial or full payment',
      'Validate and Post to clear the AR and create deposit journal',
    ],
    next: [
      { label: 'View All Collections', path: '/erp/collections' },
      { label: 'View AR Aging', path: '/erp/collections/ar' },
    ],
    tip: 'Collections support both hospital and customer targets — the system validates CSIs and AR balance for whichever entity type is used. Opening AR (pre-go-live) CSIs are fully collectable. CWT is auto-computed if applicable. When routed to a petty cash fund, a POSTED deposit is auto-created on submission and auto-voided on reopen. The fund must be ACTIVE and accept deposits (REVOLVING or DEPOSIT_ONLY). Arriving from AR Aging? The hospital and invoice are pre-filled — entity/BDM scope is still enforced by the backend so out-of-scope URLs resolve to an empty form. Role visibility: President/admin/finance see every BDM\'s open CSIs for the selected hospital by default (use the BDM filter to narrow); BDMs see only their own.',
  },
  'ar-aging': {
    title: 'Accounts Receivable Aging',
    steps: [
      'Review outstanding balances by customer and age bracket',
      'Current (0-30 days), Overdue (31-60), Critical (60+)',
      'Prioritize collection on oldest receivables first',
      'Click "Collect" on a hospital row to open the Collection form with the hospital pre-filled; click "Collect" on a specific CSI (expanded detail) to also pre-select that invoice',
      'Generate SOA for customers with high balances',
    ],
    next: [
      { label: 'Collect Payment', path: '/erp/collections/session' },
      { label: 'Generate SOA', path: '/erp/collections/soa' },
    ],
    tip: 'High AR aging affects your collection rate and profit sharing eligibility. The "Collect" quick-action deep-links to the Collection form with the hospital (and optionally the specific invoice) pre-selected — posting logic, authority gating, and journal entries still run through the single Collections workflow so the ledger stays consistent across entities and subscribers. Role visibility: President/admin/finance see all BDMs\' CSIs across the working entity by default (use the BDM filter to scope); BDMs see only their own.',
  },
  'expenses': {
    title: 'Recording Expenses (ORE / ACCESS)',
    steps: [
      'Choose expense type: ORE (reimbursable from revolving fund) or ACCESS (company-funded)',
      'For transport: use "Transport — P2P" (jeepney/bus/tricycle) or "Transport — Grab/Taxi" categories. Receipt is optional for transport.',
      'Use the OCR scanner to auto-extract receipt data, or enter manually',
      'Select category — COA code auto-resolves from vendor/keyword classification',
      'Attach receipt photo as proof (batch upload available for bulk OR processing)',
      'Verify COA code is NOT 6900 (Miscellaneous) — posting is blocked until mapped to correct account',
      'Save as DRAFT → Validate → Post to generate expense journal',
    ],
    next: [
      { label: 'Record SMER', path: '/erp/smer' },
      { label: 'Record Car Logbook', path: '/erp/car-logbook' },
      { label: 'PRF / CALF', path: '/erp/prf-calf' },
      { label: 'COA Settings', path: '/erp/settings' },
    ],
    tip: 'Expenses with COA 6900 (Misc) are BLOCKED from posting — map to correct account first. ACCESS expenses with non-cash payment auto-create a CALF. CALF must be POSTED before expense can post. COA codes are configurable in Settings → COA Mapping. OCR scanning is optional — if it fails or is disabled, the photo still uploads as proof and you fill the form manually.',
  },
  'smer': {
    title: 'SMER (Sales/Marketing Expense Report)',
    steps: [
      'Select the period/cycle — SMER is submitted once per cycle (C1: 1st-15th, C2: 16th-end of month)',
      'Click "Pull from CRM" to auto-fill MD counts and areas visited from your logged visits',
      'Fill in each day\'s activity type (Office/Field/Other/NO_WORK)',
      'Per Diem too low? Click the [+] button to request an override — you can do this anytime while the SMER is still DRAFT, no need to wait for submit',
      'Select "NO_WORK" for days you did not work — per diem is automatically zero, no overrides allowed',
      'Transport, ORE, and other cash expenses → enter in Expenses (ORE) for mobile-friendly input. These flow into your income automatically.',
      'When all days are filled → Save → Validate → Submit to post per diem journal entries',
    ],
    next: [
      { label: 'Record Car Logbook', path: '/erp/car-logbook' },
      { label: 'Record Expenses', path: '/erp/expenses' },
      { label: 'View Reports', path: '/erp/reports' },
      { label: 'People (CompProfile)', path: '/erp/people' },
    ],
    tip: 'SMER is submitted per cycle (every ~15 days), not daily. You can save your SMER as DRAFT and update it daily — submit when the cycle ends. Per diem override: click [+] beside any day to request FULL or HALF tier with a reason. Overrides go to the Approval Hub immediately (even while SMER is DRAFT). Once approved, the override applies automatically. Per diem thresholds are per-person (CompProfile). "NO_WORK" days do NOT count as working days and cannot have overrides.',
  },
  'car-logbook': {
    title: 'Car Logbook',
    steps: [
      'Select period and cycle — all days (including weekends) are shown in a grid',
      'Fill in Start KM and End KM for each day — use [S] and [E] buttons to scan odometer photos via OCR',
      'Destination is auto-filled from your SMER entry for that date — you can edit it manually',
      'Click the Fuel cell to expand and add fuel entries: station, liters, ₱/L, payment mode',
      'Use "Scan Receipt" to OCR gas receipts — station, liters, and price are auto-extracted. If OCR fails the photo still attaches; just type the values in.',
      'Non-cash fuel entries require CALF — create in PRF/CALF before submitting',
      'Rows auto-save when you move to the next row. Validate → Submit to post journal entries.',
    ],
    next: [
      { label: 'Record SMER', path: '/erp/smer' },
      { label: 'Record Expenses', path: '/erp/expenses' },
      { label: 'PRF / CALF', path: '/erp/prf-calf' },
      { label: 'Fuel Efficiency', path: '/erp/fuel-efficiency' },
    ],
    tip: 'Weekends are included so no odometer days are missed. The * indicator means unsaved changes — rows save automatically on blur. Non-cash fuel entries show CALF status per entry. Posting is blocked until all CALF documents are POSTED. COA code for fuel is configurable in Settings.',
  },
  'prf-calf': {
    title: 'PRF / CALF',
    steps: [
      'PRF (Partner Rebate Form) — record partner rebate payments. Rebates accumulate from collections; BDM creates PRF when ready to pay partner.',
      'CALF (Cash Advance Liquidation) — liquidate cash advances against expenses',
      'For PRF: enter partner details, rebate amount, payment mode',
      'For CALF: link to related expenses — system validates all linked line IDs belong to the expense',
      'Verify advance vs. liquidation balance before posting',
      'Validate and Post — auto-journal uses COA codes: AR_BDM (1110) for CALF, PARTNER_REBATE (5200) for PRF',
    ],
    next: [
      { label: 'Record Expenses', path: '/erp/expenses' },
      { label: 'View Sales', path: '/erp/sales' },
      { label: 'COA Settings', path: '/erp/settings' },
    ],
    tip: 'Partner rebates follow accrual basis — journal entry (DR 5200 PARTNER_REBATE, CR funding) is created only when PRF is posted, not when the collection is recorded. CALF validates that linked expense line IDs actually belong to the referenced expense entry. Document numbers auto-generate from Territory + date + sequence — if generation fails, check Territory setup for the BDM. All COA codes are admin-configurable in Settings.',
  },
  'collaterals': {
    title: 'Marketing Collaterals',
    steps: [
      'Track promotional materials (brochures, samples, merchandise)',
      'Record quantities received, distributed, and returned',
      'Assign collaterals to specific hospitals/customers',
    ],
    next: [
      { label: 'View Inventory', path: '/erp/my-stock' },
      { label: 'View Reports', path: '/erp/reports' },
      { label: 'Access Templates', path: '/erp/control-center?section=access' },
    ],
    tip: 'Access is template-driven — only users with the inventory.collaterals sub-permission can see this page. Keep collateral records up to date — unaccounted materials may be flagged in audits.',
  },
  'transfers': {
    title: 'Stock Transfers',
    steps: [
      'Create a transfer order to move stock between warehouses',
      'Select source warehouse, target warehouse, and products',
      'Subsidiary entities can browse parent company products — configurable via PRODUCT_CATALOG_ACCESS lookup',
      'Enter quantities to transfer',
      'Validate and Post — updates inventory in both warehouses',
    ],
    next: [
      { label: 'Receive Transfer', path: '/erp/transfers/receive' },
      { label: 'View Inventory', path: '/erp/my-stock' },
    ],
    tip: 'Inter-company transfers (between entities) use transfer prices set by the president. Subsidiary product catalog access is lookup-driven.',
  },
  'transfers-receive': {
    title: 'Receiving Stock Transfers',
    steps: [
      'View incoming transfer orders from other warehouses',
      'Verify quantities match the transfer document',
      'Confirm receipt to update your warehouse inventory',
    ],
    next: [
      { label: 'View Inventory', path: '/erp/my-stock' },
      { label: 'Create Sale', path: '/erp/sales/entry' },
    ],
  },
  // 'reports' key removed — use 'erp-reports' pageKey instead (stale duplicate cleaned up)
  'myIncome': {
    title: 'My Income — How It Works',
    steps: [
      '1. Income Projection shows real-time earnings from SMER, Collections, and Profit Sharing — always available, updates as you post documents.',
      '2. Click "Request Payslip Generation" to create your official income report. You can regenerate anytime new data comes in (e.g., new collection posted).',
      '3. Add one-off deduction lines (CC personal, purchased goods, etc.) — Finance verifies each line.',
      '4. Deduction Schedules: create installment plans — approved installments auto-inject into future payslips. You can edit or withdraw pending schedules, and resubmit rejected ones with changes.',
      '5. Click "View Breakdown" on any payslip to see detailed source data — SMER daily entries with per diem tiers, collection-level commission (CR# and CSI details), car logbook gas computation (daily odometer + fuel), ORE receipts, and CALF documents.',
      '6. When Finance marks your payslip REVIEWED, review final numbers and click "Confirm". Once confirmed, payslip is locked.',
      '7. Finance credits your confirmed payslip. Travel advance auto-resolves from your CompProfile revolving fund amount.',
    ],
    next: [
      { label: 'Expenses', path: '/erp/expenses' },
      { label: 'SMER', path: '/erp/smer' },
      { label: 'Collections', path: '/erp/collections' },
    ],
    tip: 'Click any earnings or deduction row to expand and see where the number comes from. Each regeneration recalculates SMER, commission, CALF settlement, and personal gas — your manual deduction lines are preserved.',
  },
  'income': {
    title: 'Income Reports — Finance View',
    steps: [
      '1. BDMs can now request payslip generation themselves (My Income → Request Payslip). You will see it in GENERATED status for review.',
      '2. Payslips tab: Generate or regenerate payslips → review BDM-entered deduction lines (verify ✓, correct ✎, reject ✕) → mark Reviewed → BDM confirms → Credit.',
      '3. Schedules tab: Review and approve BDM deduction schedules. Filter by status/BDM, create schedules for BDMs, adjust installment amounts, or apply early payoff.',
      '4. Approved schedule installments auto-inject into payslips when generated. Use bulk approve to process multiple pending schedules at once.',
      '5. Auto-deductions: CALF settlement (excess returned or shortfall reimbursed) and Personal Gas usage are computed automatically on each generation.',
      '6. Click "View Breakdown" to drill into source data for any payslip — verify SMER daily entries, per diem overrides, commission per CR/CSI, car logbook gas computation, ORE receipts, and CALF documents.',
    ],
    next: [
      { label: 'View P&L', path: '/erp/pnl' },
      { label: 'Profit Sharing', path: '/erp/profit-sharing' },
    ],
    tip: 'Click any earnings or deduction row to expand source details. Use "Expand All" to see full breakdown for verification before approving.',
  },
  'pnl': {
    title: 'Profit & Loss Statement',
    steps: [
      'Revenue minus COGS = Gross Profit',
      'Gross Profit minus Operating Expenses = Net Income',
      'This is the GL-based (authoritative) P&L from posted journal entries',
    ],
    next: [
      { label: 'Profit Sharing', path: '/erp/profit-sharing' },
      { label: 'View Income', path: '/erp/income' },
    ],
    tip: 'Only POSTED transactions appear here. Draft/valid documents are excluded.',
  },
  'profit-sharing': {
    title: 'Profit Sharing',
    steps: [
      'View your allocated profit share based on sales performance',
      'Eligibility requires minimum products and hospitals (see ERP Settings)',
      'Consecutive months of eligibility required before payout',
    ],
    next: [
      { label: 'View P&L', path: '/erp/pnl' },
      { label: 'View Sales', path: '/erp/sales' },
    ],
    tip: 'BDM share and VIP share percentages are configured in ERP Settings by admin/finance.',
  },

  // ═══ Supply Chain & Procurement ═══
  'product-master': {
    title: 'Product Master',
    steps: [
      'Search/filter products by name, status, or stock type (Pharma, F&B, Office)',
      'Subsidiary entities see parent company products tagged "Parent" (read-only) — you can add your own products with "+ New Product"',
      'Click "+ New Product" to add — set prices, VAT status, and unit',
      'Set Purchase UOM + Selling UOM + Conversion Factor when supplier unit differs from selling unit (e.g., 1 CASE = 10 BOX)',
      'Use Export/Import Prices buttons for bulk price updates via Excel',
      'Use "Refresh Master" to sync from the cleaned Item Master CSV — deduplicates, updates, and deactivates stale products',
      'Tag products to warehouses for inventory tracking',
    ],
    next: [
      { label: 'My Stock', path: '/erp/my-stock' },
      { label: 'GRN', path: '/erp/grn' },
      { label: 'Transfer Prices', path: '/erp/control-center?section=transfer-prices' },
    ],
    tip: 'Products tagged "Parent" are inherited from the parent entity — you can use them in POs and GRNs but only the parent admin can edit them. Click "+ New Product" to add entity-specific products. Set Purchase UOM when your supplier sells in a different unit than inventory.',
  },
  'grn-entry': {
    title: 'Goods Receipt Note (GRN)',
    steps: [
      'Optionally link a Purchase Order — line items and warehouse auto-populate with remaining receivable qty',
      'Select warehouse to receive into (auto-filled from PO when linked)',
      'Subsidiary entities see parent company products in the dropdown — configurable via Control Center → Lookup Tables → PRODUCT_CATALOG_ACCESS',
      'Scan or enter batch numbers and expiry dates for each line',
      'Submit for approval — once approved, stock is added and linked PO auto-updates to PARTIALLY_RECEIVED or RECEIVED',
    ],
    next: [
      { label: 'My Stock', path: '/erp/my-stock' },
      { label: 'Purchase Orders', path: '/erp/purchase-orders' },
      { label: 'Supplier Invoices', path: '/erp/supplier-invoices' },
    ],
    tip: 'Click "Receive" on a PO to jump here with lines pre-filled. OCR can auto-read batch/expiry from undertaking photos. Product catalog for subsidiaries is lookup-driven.',
  },
  'ocr-test': {
    title: 'Document Scanner (OCR)',
    steps: [
      'Select the document type (CSI, CR, OR, Gas Receipt, Odometer, DR, BIR 2307, Undertaking)',
      'Capture a photo or upload from gallery — ensure the document is well-lit and flat',
      'Review extracted fields — fields are color-coded by confidence: green (HIGH), yellow (MEDIUM), red (LOW)',
      'Edit any incorrect fields before confirming — the system learns vendor defaults when you override classifications',
      'For expense receipts (OR/Gas), the system auto-classifies the expense category and COA code using vendor matching and keyword rules',
      'Resolved master data (hospital, product, vendor) appears below extracted fields — verify the match is correct',
    ],
    next: [
      { label: 'Expenses', path: '/erp/expenses' },
      { label: 'Sales Entry', path: '/erp/sales-entry' },
      { label: 'Car Logbook', path: '/erp/car-logbook' },
      { label: 'GRN Entry', path: '/erp/grn' },
    ],
    tip: 'OCR classification rules are lookup-driven — admin can add keywords and COA mappings in Control Center → Lookup Tables → OCR_EXPENSE_RULES. Phone camera photos are auto-compressed for faster upload.',
  },
  'purchase-orders': {
    title: 'Purchase Orders',
    steps: [
      'Select vendor and add line items (product, qty, unit, price)',
      'Subsidiary entities automatically see parent company products — admin can toggle this in Control Center → Lookup Tables → PRODUCT_CATALOG_ACCESS',
      'Submit for approval (DRAFT → APPROVED)',
      'Click "Receive" to create a GRN linked to this PO — GRN approval auto-updates qty received and PO status',
      'Match with Supplier Invoice for 3-way match (PO ↔ GRN ↔ Invoice)',
      'Click PO # to view full details including warehouse address, delivery contact, linked GRNs and invoices',
      'Use the Activity Log to add status updates, courier waybill numbers, and delivery notes — works at any PO status',
      'Share POs via "Share Link" (copy link for Messenger/Viber/SMS), "Email PO" (send to vendor), or "Print / PDF"',
    ],
    next: [
      { label: 'GRN', path: '/erp/grn' },
      { label: 'Supplier Invoices', path: '/erp/supplier-invoices' },
      { label: 'Warehouse Manager', path: '/erp/warehouse-manager' },
      { label: 'Lookup Tables', path: '/erp/lookups' },
    ],
    tip: 'No products showing? Subsidiary entities inherit the parent company product catalog by default. Admin can enable/disable this per entity in Control Center → Lookup Tables → PRODUCT_CATALOG_ACCESS. The Activity Log tracks all PO updates with timestamps.',
  },
  'supplier-invoices': {
    title: 'Supplier Invoices',
    steps: [
      'Select warehouse and vendor — PO dropdown auto-filters to matching POs',
      'Link a PO to auto-fill vendor, warehouse, and line items with remaining uninvoiced qty',
      'Validate — 3-way match against PO and GRN',
      'Post — creates Accounts Payable journal entry',
    ],
    next: [
      { label: 'Accounts Payable', path: '/erp/accounts-payable' },
      { label: 'Purchase Orders', path: '/erp/purchase-orders' },
    ],
    tip: 'Select warehouse + vendor first to narrow down the PO dropdown. Unmatched invoices are flagged for review before posting.',
  },

  // ═══ Operations & Agent Management ═══
  'hospitals': {
    title: 'Hospital Management',
    steps: [
      'Add hospitals with type, beds, and engagement level',
      'Set financial terms (payment days, VAT, CWT, credit limit)',
      'Assign hospitals to warehouses — BDMs automatically see hospitals in their warehouse',
      'Export/Import via Excel for bulk updates (include Warehouse Codes column)',
    ],
    next: [
      { label: 'New Sale', path: '/erp/sales/entry' },
      { label: 'Collections', path: '/erp/collections' },
    ],
    tip: 'Assign warehouses instead of tagging individual BDMs — scales automatically when BDMs change. Use BDM overrides only for edge cases.',
  },
  'transfer-price-manager': {
    title: 'Transfer Price Manager',
    steps: [
      'Select source entity (VIP) and target entity (subsidiary)',
      'All VIP products are listed — set a price to tag to entity',
      'Clear a price to untag (entity no longer carries the product)',
      'Save changes — bulk update in one click',
    ],
    next: [
      { label: 'Products', path: '/erp/products' },
      { label: 'Warehouses', path: '/erp/control-center?section=warehouses' },
    ],
    tip: 'Transfer prices drive inter-company COGS and inventory valuation.',
  },
  'agent-dashboard': {
    title: 'AI Agent Intelligence',
    steps: [
      'View status of all 12 agents (6 AI-powered + 6 rule-based)',
      'Check recent runs, alerts generated, and key findings',
      'Click "Run Now" on any agent for instant data gathering',
      'Configure agent settings in Control Center → Intelligence',
    ],
    next: [
      { label: 'Control Center', path: '/erp/control-center?section=agent-settings' },
    ],
    tip: 'Free agents always run on schedule. AI agents require ANTHROPIC_API_KEY.',
  },
  'approval-manager': {
    title: 'Universal Approval Hub',
    steps: [
      'Governing principle: "Any person can CREATE, but authority POSTS." Submitters validate; the Hub posts.',
      'All Pending tab: see EVERY transaction across the ERP that needs your attention — approve, post, or reject inline.',
      'Module filter: narrow by Sales, Collections, SMER, Car Logbook, Expenses, PRF/CALF, Income, Deductions, GRN, Payroll, KPI, etc.',
      'Sub-permissions: your assigned approval sub-permissions control which modules you see. Admin might handle Sales + GRN, finance handles Expenses + Payroll. President sees everything. Configure in Control Center → ERP Access Templates → Approvals sub-permissions.',
      'Posting modules (Sales, Collections, SMER, Car Logbook, Expenses, PRF/CALF, Banking, Journal, Petty Cash, IC Transfer, Purchasing): documents in VALID status appear here — click Post to transition to POSTED.',
      'Approval modules (Income, Deductions, GRN, Payroll, KPI): multi-step review/approve workflows.',
      'Default-Roles Gate (always on): when a submitter\'s role is not in MODULE_DEFAULT_ROLES.metadata.roles, their submit creates a pending request and the document waits here. Set roles = null on a module to disable the gate (open-post).',
      'Attachments: waybill photos, deposit slips, OR receipts, fuel receipts, and supporting documents are displayed inline — click any thumbnail to view full-size.',
      'Quick Edit: click Edit on any item to fix typos (description, notes, check#, amount) before approving. Editable fields configured in Control Center → Lookup Tables → APPROVAL_EDITABLE_FIELDS.',
      'Line-Item Edit: fix individual line items (qty, unit_price, batch#) directly — totals recalculate automatically. Configure in Lookup Tables → APPROVAL_EDITABLE_LINE_FIELDS.',
      'Requests tab: authority matrix approvals (rule-triggered escalations on top of the default-roles gate).',
      'Rules tab (Admin): create Approval Rules to delegate — assign specific people or roles to approve specific modules. Rules layer on top of default roles, they don\'t replace them.',
      'Default Roles: each module has configurable default roles (Control Center → Lookup Tables → MODULE_DEFAULT_ROLES). Edit per-entity to fit each subsidiary.',
      'Sidebar badge shows how many items need your attention.',
    ],
    next: [
      { label: 'Control Center', path: '/erp/control-center?section=approval-rules' },
      { label: 'Lookup Tables', path: '/erp/control-center?section=lookups' },
      { label: 'Income', path: '/erp/income' },
      { label: 'Sales', path: '/erp/sales' },
    ],
    tip: 'Module visibility uses a 4-layer system: (1) Sub-permissions (approvals.approve_sales, etc.) — control which modules each user sees and can approve. (2) Approval Rules — delegate to specific people or roles for amount-based escalation. (3) Default-Roles Gate from MODULE_DEFAULT_ROLES lookup — always enforced; if submitter is not in the role list, their post is held here. (4) President / CEO always bypass. Per-entity, lookup-driven, subscription-ready: each subsidiary configures its own posting roles. To disable the gate for a module, set metadata.roles = null in the lookup.',
  },
  'batch-trace': {
    title: 'Batch Trace',
    steps: [
      'Select your warehouse — product list loads from warehouse stock',
      'Pick a product from the dropdown, then enter the batch/lot number',
      'Click Trace to view the full lifecycle: GRN receipt → sales → transfers → adjustments',
      'Review the summary card for total in/out/balance and transaction breakdown',
    ],
    next: [
      { label: 'My Stock', path: '/erp/inventory' },
      { label: 'Expiry Dashboard', path: '/erp/expiry-dashboard' },
    ],
    tip: 'Batch trace follows FIFO — oldest expiry batches are consumed first. Switch warehouses to trace batches across locations.',
  },
  'credit-notes': {
    title: 'Credit Notes',
    steps: [
      'Create credit notes for returned goods, damaged items, or pricing adjustments',
      'Link each credit note to the original CSI (sales invoice)',
      'Validate and submit — inventory is returned and AR is reduced',
      'Posted credit notes create reversal journal entries automatically',
    ],
    next: [
      { label: 'Sales List', path: '/erp/sales' },
      { label: 'AR Dashboard', path: '/erp/collections/ar' },
    ],
    tip: 'Credit notes reduce AR and can trigger inventory FIFO reversal.',
  },
  'expiry-dashboard': {
    title: 'Expiry Dashboard',
    steps: [
      'View all inventory batches grouped by expiry status: expired, near-expiry, safe',
      'Filter by BDM territory, product, or warehouse',
      'Take action on expired batches: write-off, return to supplier, or transfer',
      'Near-expiry threshold is configurable in Settings (default: 120 days)',
    ],
    next: [
      { label: 'Batch Trace', path: '/erp/batch-trace' },
      { label: 'My Stock', path: '/erp/inventory' },
    ],
    tip: 'Near-expiry items should be prioritized for sale or consignment conversion.',
  },
  'consignment-dashboard': {
    title: 'Consignment Dashboard',
    steps: [
      'View all active consignments by BDM and hospital',
      'Check status: OPEN, OVERDUE, FORCE_CSI, COLLECTED',
      'Drill down into aging details per product batch',
      'Follow up on overdue consignments for CSI conversion or return',
    ],
    next: [
      { label: 'DR Entry', path: '/erp/dr' },
      { label: 'New Sale', path: '/erp/sales/entry' },
      { label: 'Consignment Aging', path: '/erp/consignment-aging' },
    ],
    tip: 'Consignment aging affects BDM profit sharing eligibility.',
  },

  // ═══ Finance & Accounting ═══
  'accounts-payable': {
    title: 'Accounts Payable',
    steps: [
      'View outstanding supplier balances by aging bucket',
      'Drill down: Current, 30, 60, 90, 90+ days',
      'Process payments to reduce AP balance',
      'Posted payments create journal entries automatically',
    ],
    next: [
      { label: 'Supplier Invoices', path: '/erp/supplier-invoices' },
      { label: 'Bank Reconciliation', path: '/erp/bank-recon' },
    ],
  },
  'journal-entries': {
    title: 'Journal Entries',
    steps: [
      'Create manual JE with debit and credit lines (must balance)',
      'Add reference document or description',
      'Post — entries flow to Trial Balance and P&L',
      'Void if needed — creates reversal JE (Storno pattern)',
    ],
    next: [
      { label: 'Trial Balance', path: '/erp/trial-balance' },
      { label: 'P&L', path: '/erp/pnl' },
    ],
    tip: 'Auto-journals are created by Sales, Collections, Expenses. Manual JEs are for adjustments only.',
  },
  'month-end-close': {
    title: 'Month-End Close',
    steps: [
      'Review the checklist — each step shows PENDING/COMPLETE status',
      'Run steps in order (reconciliation → accruals → depreciation → close)',
      'Fix any ERROR steps before proceeding',
      'Lock the period when all steps are complete',
    ],
    next: [
      { label: 'Period Locks', path: '/erp/control-center?section=period-locks' },
      { label: 'Trial Balance', path: '/erp/trial-balance' },
    ],
    tip: 'Always run Trial Balance before closing to catch imbalances.',
  },
  'monthly-archive': {
    title: 'Monthly Archive & Period Control',
    steps: [
      'Select a period to view its close status and snapshot history',
      'Use "Close Period" to finalize — this locks all modules for that month',
      'Use "Re-open Period" if corrections are needed (requires president/admin)',
      'Archived snapshots are read-only and preserved for audit trail',
    ],
    next: [
      { label: 'Month-End Close', path: '/erp/month-end-close' },
      { label: 'Period Locks', path: '/erp/control-center?section=period-locks' },
      { label: 'Trial Balance', path: '/erp/trial-balance' },
    ],
    tip: 'Run Month-End Close before archiving to ensure all postings are finalized.',
  },
  'bank-reconciliation': {
    title: 'Bank Reconciliation',
    steps: [
      'Select bank account and reconciliation period',
      'Match bank statement entries to GL transactions',
      'Mark unmatched items as reconciling items',
      'Complete when bank balance = GL balance',
    ],
    next: [
      { label: 'Journal Entries', path: '/erp/journals' },
      { label: 'Bank Accounts', path: '/erp/control-center?section=bank-accounts' },
    ],
  },
  'vat-compliance': {
    title: 'VAT Compliance',
    steps: [
      'Review transactions for the filing period',
      'Classify each as INCLUDE, EXCLUDE, or DEFER',
      'Check summary totals match expected VAT return',
      'Generate 2550Q data for BIR filing',
    ],
    next: [
      { label: 'BIR Calculator', path: '/erp/bir-calculator' },
      { label: 'ERP Settings', path: '/erp/control-center?section=erp-settings' },
    ],
    tip: 'DEFERRED items carry forward to the next filing period.',
  },

  // ═══ Payroll & Miscellaneous ═══
  'payroll-run': {
    title: 'Payroll Run',
    steps: [
      'Select pay period and review employee list',
      'Compute — calculates gross, deductions, net per employee',
      'Review and adjust if needed (COMPUTED → REVIEWED)',
      'Approve and Post — creates payroll journal entries',
    ],
    next: [
      { label: 'Payslips', path: '/erp/payroll' },
      { label: 'Journal Entries', path: '/erp/journals' },
    ],
    tip: 'Government rates (SSS, PhilHealth, PagIBIG) are pulled from Settings automatically.',
  },
  'office-supplies': {
    title: 'Office Supplies',
    steps: [
      'Record purchases (PURCHASE) or issues to staff (ISSUE)',
      'Track returns and adjustments',
      'View current stock levels by category',
      'Categories are lookup-driven — manage in Lookup Tables',
    ],
    next: [
      { label: 'Petty Cash', path: '/erp/petty-cash' },
      { label: 'Lookup Tables', path: '/erp/control-center?section=lookups' },
      { label: 'Access Templates', path: '/erp/control-center?section=access' },
    ],
    tip: 'Access is template-driven — only users with the inventory.office_supplies sub-permission can see this page. Manage in Access Templates.',
  },
  'petty-cash': {
    title: 'Petty Cash',
    steps: [
      'Create a fund: assign a custodian (BDM), warehouse, mode, ceiling, and COA code',
      'Deposits can be auto-created from posted Collections (routed to this fund) or logged manually by the custodian',
      'For disbursements: attach Official Receipt (OR#), or toggle "Petty Cash Voucher" if no OR and describe the purchase',
      'Admin/Finance posts DRAFT transactions — balance updates and journal entry auto-creates',
      'DRAFT transactions can be voided if entered incorrectly',
      'When balance exceeds ceiling, generate a Remittance — custodian remits excess to owner',
      'When balance is low, click "Replenish Fund" — owner sends cash to custodian',
      'Process remittance/replenishment documents to finalize the balance transfer',
    ],
    next: [
      { label: 'Expenses', path: '/erp/expenses' },
      { label: 'Journal Entries', path: '/erp/journals' },
      { label: 'Lookup Tables', path: '/erp/control-center?section=lookups' },
    ],
    tip: 'Fund modes, statuses, expense categories, and transaction types are lookup-driven — manage them in Control Center > Lookup Tables (PETTY_CASH_FUND_TYPE, PETTY_CASH_FUND_STATUS, PETTY_CASH_EXPENSE_CATEGORY).',
  },
  'consignment-aging': {
    title: 'Consignment Aging',
    steps: [
      'View cross-BDM aging summary by status',
      'Identify OVERDUE and FORCE_CSI consignments',
      'Drill down to hospital-level detail',
      'Follow up with BDMs for conversion or return',
    ],
    next: [
      { label: 'Consignment Dashboard', path: '/erp/consignment' },
      { label: 'DR Entry', path: '/erp/dr' },
    ],
  },
  'erp-reports': {
    title: 'Reports & Analytics',
    steps: [
      'Browse available reports by category',
      'Click to navigate to detailed report pages',
      'Use date and entity filters on each report',
      'Export data to Excel where available',
    ],
    next: [
      { label: 'P&L', path: '/erp/pnl' },
      { label: 'Trial Balance', path: '/erp/trial-balance' },
      { label: 'AR Aging', path: '/erp/collections/ar' },
    ],
  },

  // ═══ People & Organization ═══
  'people-list': {
    title: 'People Directory',
    steps: [
      'Use the Active / Archive tabs to switch between current and separated employees',
      'Use search and filters to find people by name, type, role, or status',
      'The table shows system role, login status, employment type, BDM code, stage, and territory at a glance',
      'Use the Role filter to quickly find all admins, contractors, or people with no login',
      'Click any row to view full person details and change role or access',
      'In the Archive tab, click "Reactivate" to restore a separated employee to active status',
      'If a legacy role banner appears (e.g. medrep, employee), click "Migrate" to bulk-convert users to the current "contractor" role',
    ],
    next: [
      { label: 'Org Chart', path: '/erp/org-chart' },
      { label: 'Add Person', path: '/erp/people' },
    ],
    tip: 'The Active tab shows current employees (ACTIVE, ON_LEAVE, SUSPENDED). The Archive tab shows separated employees. Use "Sync from CRM" to import existing CRM users. Reactivating a person sets them to ACTIVE but does not restore login or role assignments — those must be re-enabled manually. Note: all people selection dropdowns across the ERP (Managed By, Reports To, Assign To, etc.) only show ACTIVE people.',
  },
  'person-detail': {
    title: 'Person Profile',
    steps: [
      'View and review person information, compensation, and insurance',
      'Edit details (admin/finance/president only) and save changes',
      'Manage system login access and ERP module permissions',
      'Use "Separate Employee" to deactivate — this revokes role assignments and disables login',
      'Use "Reactivate" on separated employees to restore active status (login and roles must be re-enabled manually)',
      'Person types, positions, departments, employment types, and BDM stages are managed via Lookup Tables (Control Center → System Settings)',
    ],
    next: [
      { label: 'People List', path: '/erp/people' },
      { label: 'Org Chart', path: '/erp/org-chart' },
      { label: 'Payroll', path: '/erp/payroll' },
    ],
    tip: 'Separating an employee cascades: marks SEPARATED, revokes all role assignments, and disables system login. Reactivation restores ACTIVE status only — re-enable login and role assignments manually. Career path: CONTRACTOR → PS_ELIGIBLE → TRANSITIONING → SUBSIDIARY → SHAREHOLDER. Position and Department are lookup-driven — to add new options, go to Control Center → Lookup Tables.',
  },
  'role-assignment-manager': {
    title: 'Role Assignment Manager',
    steps: [
      'Switch between "By Entity" view (see all assignments for an entity) and "By Person" view (search a person, see all their assignments)',
      'Create a new assignment: select person, entity, functional role, and optional approval limit',
      'Edit or deactivate existing assignments — deactivated assignments revoke that role for the person',
      'Use this to control who can access which ERP modules (Sales, Purchasing, Inventory, Finance, etc.) per entity',
    ],
    next: [
      { label: 'People List', path: '/erp/people' },
      { label: 'Control Center', path: '/erp/control-center' },
    ],
    tip: 'Role assignments are entity-scoped — a person can have different roles in different entities. Approval limits control the maximum amount a person can approve without escalation.',
  },
  'org-chart': {
    title: 'Organization Chart',
    steps: [
      'View the company structure organized by entity and reporting lines',
      'Expand or collapse departments and teams to explore hierarchy',
      'Click a partner node to view their scorecard and graduation status',
    ],
    next: [
      { label: 'People List', path: '/erp/people' },
      { label: 'Performance Ranking', path: '/erp/performance-ranking' },
    ],
    tip: 'Set "Reports To" on each person to build the org chart hierarchy.',
  },

  // ═══ Payroll & Performance ═══
  'payslip-view': {
    title: 'Payslip Viewer',
    steps: [
      'View the full pay breakdown: earnings, deductions, and employer contributions',
      'Review net pay and government contribution details',
      'Download or print the payslip for records',
    ],
    next: [
      { label: 'Payroll Run', path: '/erp/payroll' },
      { label: 'People List', path: '/erp/people' },
    ],
    tip: 'Payslips are generated during Payroll Run. Status flows: COMPUTED → REVIEWED → APPROVED → POSTED.',
  },
  'performance-ranking': {
    title: 'Performance Ranking',
    steps: [
      'View BDM rankings by net cash (sales minus expenses) for the selected period',
      'Switch tabs to see Sales Tracker or Collections Tracker by month',
      'Click any BDM row to expand month-over-month trend details',
    ],
    next: [
      { label: 'Cycle Status', path: '/erp/cycle-status' },
      { label: 'Expense Anomalies', path: '/erp/expense-anomalies' },
      { label: 'P&L', path: '/erp/pnl' },
    ],
    tip: 'Top 3 performers are highlighted green; bottom 3 are highlighted red.',
  },

  // ═══ Gap 9 — Rx Correlation ═══
  'rx-correlation': {
    title: 'Visit vs Sales Correlation (Rx Proxy)',
    steps: [
      'Map CRM products to ERP products in the Product Mapping tab (one-time setup)',
      'View Territory Summary to compare visit activity against sales and rebates',
      'Switch between PS and Non-PS pathways to see both engagement chains',
      'Check MD Partner Detail to see individual partner visit-to-sales-to-rebate ROI',
      'Use Program/Support tabs to measure which programs drive the most sales per visit',
    ],
    next: [
      { label: 'Performance Ranking', path: '/erp/performance-ranking' },
      { label: 'Reports', path: '/erp/reports' },
    ],
    tip: 'PS products correlate MD visits with sales and partner rebates. Non-PS products correlate hospital stakeholder engagement with product inclusion and sales.',
  },

  // ═══ Expense & Fuel Reports ═══
  'expense-anomalies': {
    title: 'Expense Anomalies',
    steps: [
      'Review flagged expenses that exceed period-over-period thresholds',
      'Switch to Budget Overruns tab to check actual vs. budgeted amounts',
      'Investigate outliers and follow up with the responsible BDM',
    ],
    next: [
      { label: 'Fuel Efficiency', path: '/erp/fuel-efficiency' },
      { label: 'Performance Ranking', path: '/erp/performance-ranking' },
      { label: 'Expenses', path: '/erp/expenses' },
    ],
    tip: 'Anomaly threshold percentage is configurable in ERP Settings.',
  },
  'fuel-efficiency': {
    title: 'Fuel Efficiency',
    steps: [
      'Monitor per-BDM fuel consumption: actual vs expected gas cost',
      'Identify trends and variance in kilometers-per-liter efficiency',
      'Flag BDMs exceeding the fuel variance threshold for review',
    ],
    next: [
      { label: 'Expense Anomalies', path: '/erp/expense-anomalies' },
      { label: 'Car Logbook', path: '/erp/car-logbook' },
    ],
    tip: 'Fuel overconsumption above 30% triggers automatic flagging.',
  },

  // ═══ Cycle & CSI Management ═══
  'cycle-status': {
    title: 'Cycle Status Dashboard',
    steps: [
      'View the current payslip cycle progress across all BDMs',
      'Check the pipeline showing how many are at each stage',
      'Identify BDMs behind schedule and follow up for completion',
    ],
    next: [
      { label: 'Cycle Reports', path: '/erp/cycle-reports' },
      { label: 'Payroll Run', path: '/erp/payroll' },
    ],
    tip: 'Behind-schedule BDMs are highlighted in red. Aim for 100% completion before payroll run.',
  },
  'csi-booklets': {
    title: 'CSI Booklets',
    steps: [
      'Create and manage CSI booklet series with start/end numbers',
      'Allocate weekly ranges to BDMs for invoice numbering',
      'Track usage and remaining numbers per booklet',
    ],
    next: [
      { label: 'Create Sale', path: '/erp/sales/entry' },
      { label: 'View Sales', path: '/erp/sales' },
      { label: 'Access Templates', path: '/erp/control-center?section=access' },
    ],
    tip: 'Access is template-driven — only users with the inventory.csi_booklets sub-permission can see this page. Manage in Access Templates. Exhausted booklets cannot issue new CSI numbers.',
  },
  'cycle-reports': {
    title: 'Cycle Reports',
    steps: [
      'View periodic cycle reports with sales, collections, and expense summaries',
      'Advance reports through the workflow: GENERATED → REVIEWED → CONFIRMED → CREDITED',
      'Export report data for external sharing or archival',
    ],
    next: [
      { label: 'Cycle Status', path: '/erp/cycle-status' },
      { label: 'P&L', path: '/erp/pnl' },
      { label: 'Profit Sharing', path: '/erp/profit-sharing' },
    ],
    tip: 'Only CREDITED reports affect profit sharing calculations.',
  },

  // ═══ Customer Management ═══
  'customer-list': {
    title: 'Customer Management',
    steps: [
      'View and manage all customers with search, type, and status filters',
      'Create new customers or edit existing ones via the modal form',
      'Tag BDMs to customers for visibility and access control',
    ],
    next: [
      { label: 'New Sale', path: '/erp/sales/entry' },
      { label: 'Collections', path: '/erp/collections' },
      { label: 'Hospitals', path: '/erp/hospitals' },
    ],
    tip: 'Use Import/Export Excel for bulk customer updates. Tagged BDMs control who can sell to each customer.',
  },

  // ═══ Accounting & Financial Setup ═══
  'chart-of-accounts': {
    title: 'Chart of Accounts',
    steps: [
      'View all accounts organized by type (Asset, Liability, Equity, Revenue, Expense)',
      'Create new accounts — codes must be exactly 4 digits (e.g., 1000, 6200, 6900)',
      'Each account has a normal balance (DEBIT or CREDIT) — journals enforce this direction',
      'Edit or deactivate accounts — inactive accounts are blocked from journal posting',
      'Import/Export via Excel for bulk setup or migration',
    ],
    next: [
      { label: 'Journal Entries', path: '/erp/journals' },
      { label: 'Trial Balance', path: '/erp/trial-balance' },
    ],
    tip: 'Account codes must be 4 digits. Normal balance is enforced: debiting a CREDIT-normal account (or vice versa) is blocked on posting. Inactive accounts cannot receive journal entries. Reversals bypass normal balance checks.',
  },
  'trial-balance': {
    title: 'Trial Balance',
    steps: [
      'Select entity and period to generate the trial balance',
      'Review debit and credit totals — they must balance',
      'Drill down into any account to see underlying journal entries',
      'Export to Excel for external auditors or review',
    ],
    next: [
      { label: 'P&L', path: '/erp/pnl' },
      { label: 'Journal Entries', path: '/erp/journals' },
    ],
    tip: 'Run Trial Balance before Month-End Close to catch any imbalances.',
  },
  'profit-and-loss': {
    title: 'Profit & Loss Statement',
    steps: [
      'Select entity, period range, and P&L view (Internal or BIR)',
      'Review revenue, COGS, gross profit, and operating expenses',
      'Compare periods side-by-side for trend analysis',
      'Export the report for stakeholder review',
    ],
    next: [
      { label: 'Trial Balance', path: '/erp/trial-balance' },
      { label: 'Income', path: '/erp/income' },
    ],
    tip: 'GL-based P&L is the authoritative view. Use Internal view for management, BIR view for tax filing.',
  },
  'cashflow-statement': {
    title: 'Cashflow Statement',
    steps: [
      'Select entity and period to generate cashflow',
      'Review Operating, Investing, and Financing activities',
      'Verify net cash change matches bank balance movement',
      'Export for financial reporting',
    ],
    next: [
      { label: 'Bank Reconciliation', path: '/erp/bank-recon' },
      { label: 'P&L', path: '/erp/pnl' },
    ],
  },
  'fixed-assets': {
    title: 'Fixed Assets',
    steps: [
      'Register new assets with cost, useful life, and depreciation method',
      'Run depreciation computation for the period',
      'Review staging entries before posting',
      'Post depreciation — journal entries are created automatically',
    ],
    next: [
      { label: 'Journal Entries', path: '/erp/journals' },
      { label: 'Trial Balance', path: '/erp/trial-balance' },
    ],
    tip: 'Depreciation uses straight-line method. Adjust useful life in months for accuracy.',
  },
  'loans': {
    title: 'Loan Management',
    steps: [
      'Register loans with principal, interest rate, and term',
      'Compute interest for the period',
      'Review and approve interest staging entries',
      'Post to create journal entries for interest expense',
    ],
    next: [
      { label: 'Journal Entries', path: '/erp/journals' },
      { label: 'Cashflow', path: '/erp/cashflow' },
    ],
  },
  'owner-equity': {
    title: 'Owner Equity',
    steps: [
      'Record capital infusions (investments) or drawings (withdrawals)',
      'Each entry creates a journal entry linking to equity accounts',
      'View the equity ledger for a complete history',
    ],
    next: [
      { label: 'Journal Entries', path: '/erp/journals' },
      { label: 'Trial Balance', path: '/erp/trial-balance' },
    ],
  },

  // ═══ Banking & Payment Setup ═══
  'bank-accounts': {
    title: 'Bank Accounts',
    steps: [
      'Add bank accounts with account number, bank name, and linked COA code',
      'Edit or deactivate accounts as needed',
      'Import/Export via Excel for bulk management',
    ],
    next: [
      { label: 'Bank Reconciliation', path: '/erp/bank-recon' },
      { label: 'COA', path: '/erp/control-center?section=coa' },
    ],
    tip: 'Each bank account must link to a COA code for proper journal posting.',
  },
  'credit-card-manager': {
    title: 'Credit Card Manager',
    steps: [
      'Register corporate credit cards with masked numbers and linked COA',
      'Assign cardholders from the People Master',
      'Track balances and spending limits',
    ],
    next: [
      { label: 'Credit Card Ledger', path: '/erp/credit-card-ledger' },
      { label: 'COA', path: '/erp/control-center?section=coa' },
    ],
  },
  'credit-card-ledger': {
    title: 'Credit Card Ledger',
    steps: [
      'View all credit card transactions by card and period',
      'Record new transactions or payments against balances',
      'Reconcile card statements against recorded transactions',
    ],
    next: [
      { label: 'Credit Cards', path: '/erp/control-center?section=credit-cards' },
      { label: 'Expenses', path: '/erp/expenses' },
    ],
  },
  'payment-modes': {
    title: 'Payment Modes',
    steps: [
      'Define payment methods (Cash, GCash, Bank Transfer, Check, etc.)',
      'Link each mode to a COA code for proper journal posting',
      'Activate or deactivate modes as business needs change',
    ],
    next: [
      { label: 'Collections', path: '/erp/collections' },
      { label: 'COA', path: '/erp/control-center?section=coa' },
    ],
    tip: 'Payment modes drive the funding COA resolution in auto-journals.',
  },

  // ═══ Tax & Compliance ═══
  'government-rates': {
    title: 'Government Rates',
    steps: [
      'View SSS, PhilHealth, PagIBIG, and Withholding Tax brackets',
      'Update rates when government publishes new schedules',
      'Import/Export rates via Excel for batch updates',
      'Use the BIR Calculator to test computation outputs',
    ],
    next: [
      { label: 'Payroll', path: '/erp/payroll' },
      { label: 'BIR Calculator', path: '/erp/bir-calculator' },
    ],
    tip: 'Rates are versioned by effective date. Payroll pulls the latest applicable rate automatically.',
  },
  'bir-calculator': {
    title: 'BIR Tax Calculator',
    steps: [
      'Enter gross compensation to compute tax breakdown',
      'Review SSS, PhilHealth, PagIBIG, and withholding tax amounts',
      'Compare results against actual payslip deductions',
      'Useful for payroll verification and employee inquiries',
    ],
    next: [
      { label: 'Government Rates', path: '/erp/control-center?section=government-rates' },
      { label: 'Payroll', path: '/erp/payroll' },
    ],
  },

  // ═══ Period & Governance Controls ═══
  'period-locks': {
    title: 'Period Locks',
    steps: [
      'View lock status for each module by month',
      'Toggle locks to prevent or allow posting in specific periods',
      'Lock periods after month-end close to protect financial integrity',
    ],
    next: [
      { label: 'Month-End Close', path: '/erp/month-end-close' },
      { label: 'Journal Entries', path: '/erp/journals' },
    ],
    tip: 'Locked periods block all posting (Sales, Collections, Expenses, Journals, etc.). Unlock temporarily if corrections are needed.',
  },
  'recurring-journals': {
    title: 'Recurring Journals',
    steps: [
      'Create journal templates for entries that repeat (rent, depreciation, etc.)',
      'Set frequency (monthly, quarterly) and next run date',
      'Run manually or let the system auto-generate on schedule',
      'Import/Export templates via Excel for backup',
    ],
    next: [
      { label: 'Journal Entries', path: '/erp/journals' },
      { label: 'Period Locks', path: '/erp/control-center?section=period-locks' },
    ],
  },
  'data-archive': {
    title: 'Data Archive',
    steps: [
      'Select the period range to archive',
      'Review the document count and types to be archived',
      'Trigger archival — documents move to archive collections',
      'Restore archived batches if needed for audit',
    ],
    next: [
      { label: 'Period Locks', path: '/erp/control-center?section=period-locks' },
      { label: 'Audit Logs', path: '/erp/audit-logs' },
    ],
    tip: 'Archive after year-end close to improve system performance. Archived data remains queryable.',
  },

  // ═══ Master Data & Setup ═══
  'vendor-list': {
    title: 'Vendor Management',
    steps: [
      'View and search all vendors with status filters',
      'Create new vendors with contact info and aliases',
      'Edit or deactivate vendors — active vendors cannot be deleted if referenced in POs',
      'Click "Learning Queue" chip to review AI-learned vendors — approve to confirm Claude\u2019s classification, reject to deactivate. Rejection preserves the audit trail but stops the classifier from matching.',
    ],
    tip: 'AI-learned vendors come from Claude wins on OCR scans. Toggle the learner in Control Center \u2192 OCR Settings. Tune the generic-word blocklist in Lookup Tables \u2192 VENDOR_AUTO_LEARN_BLOCKLIST.',
    next: [
      { label: 'Purchase Orders', path: '/erp/purchase-orders' },
      { label: 'Supplier Invoices', path: '/erp/supplier-invoices' },
    ],
  },
  'warehouse-manager': {
    title: 'Warehouse Management',
    steps: [
      'Create and manage warehouse locations per entity',
      'Use "Import Opening Stock" to seed stock on hand from CSV — matches products by brand + dosage, creates OPENING_BALANCE entries per warehouse',
      'Tag products to specific warehouses for inventory tracking',
      'View stock levels by warehouse',
    ],
    next: [
      { label: 'My Stock', path: '/erp/stock' },
      { label: 'Products', path: '/erp/control-center?section=products' },
    ],
    tip: 'Refresh the Product Master before importing stock — unmatched products will be skipped. Duplicate imports are safely ignored.',
  },
  'cost-centers': {
    title: 'Cost Centers',
    steps: [
      'Define cost centers in a hierarchical tree structure',
      'Assign cost centers to expenses and sales for tracking',
      'Import/Export via Excel for bulk setup',
    ],
    next: [
      { label: 'Budget Allocations', path: '/erp/budget-allocations' },
      { label: 'Expenses', path: '/erp/expenses' },
    ],
  },
  'budget-allocations': {
    title: 'Budget Allocations',
    steps: [
      'Define budgets per cost center and period',
      'Set component-level allocations (travel, supplies, etc.)',
      'Review and approve budget submissions',
      'Monitor actual vs budget in the Expense Anomalies report',
    ],
    next: [
      { label: 'Cost Centers', path: '/erp/control-center?section=cost-centers' },
      { label: 'Expense Anomalies', path: '/erp/expense-anomalies' },
    ],
  },

  // ═══ People & Access ═══
  'access-templates': {
    title: 'Access Templates',
    steps: [
      'Create templates defining module-level and sub-module access',
      'Assign templates to users for consistent permission management',
      'Edit templates — changes apply to all users using that template',
    ],
    next: [
      { label: 'People', path: '/erp/people' },
      { label: 'Control Center', path: '/erp/control-center?section=access-templates' },
    ],
    tip: 'Modules and sub-permissions are lookup-driven — manage them in Lookup Tables (ERP_MODULE, ERP_SUB_PERMISSION). Templates simplify access. Create one per role and assign to new users.',
  },

  // ═══ Settlement & IC ═══
  'ic-settlement': {
    title: 'Inter-Company Settlement',
    steps: [
      'View open IC transfers awaiting settlement',
      'Create settlement records linking transfers to payments',
      'Post settlements to update AR/AP between entities',
    ],
    next: [
      { label: 'Transfers', path: '/erp/transfers' },
      { label: 'IC AR Dashboard', path: '/erp/ic-ar' },
    ],
  },
  'ic-ar-dashboard': {
    title: 'IC AR Dashboard',
    steps: [
      'View inter-company accounts receivable summary by entity',
      'Drill down to individual transfer details',
      'Track settlement progress across entities',
    ],
    next: [
      { label: 'IC Settlement', path: '/erp/ic-settlement' },
      { label: 'Transfers', path: '/erp/transfers' },
    ],
  },

  // ═══ Payroll Extras ═══
  'thirteenth-month': {
    title: '13th Month Pay',
    steps: [
      'Select the fiscal year to compute 13th month pay',
      'Review per-employee computation based on basic salary',
      'Approve and post — creates journal entries for the liability',
    ],
    next: [
      { label: 'Payroll', path: '/erp/payroll' },
      { label: 'Journal Entries', path: '/erp/journals' },
    ],
    tip: 'Philippine law requires 13th month pay for all rank-and-file employees by December 24.',
  },
  'audit-logs': {
    title: 'Audit Logs',
    steps: [
      'Search audit entries by user, action type, or date range',
      'Review document changes with before/after values',
      'Export logs for compliance reporting or investigation',
    ],
    next: [
      { label: 'Control Center', path: '/erp/control-center' },
    ],
    tip: 'Audit logs are retained for 90 days. Archive older records if needed for compliance.',
  },

  // ═══ Phase 28 — Sales Goals & KPI ═══

  salesGoalDashboard: {
    title: 'Sales Goal Dashboard',
    steps: [
      'President creates the annual Sales Goal Plan from the Setup page',
      'Define growth drivers (Hospital Accreditation, Pharmacy/CSR, etc.) with KPI definitions',
      'Assign per-entity and per-BDM sales targets',
      'Activate the plan — targets become visible to BDMs',
      'Click "Compute KPIs" to refresh KPI snapshots from live ERP data',
      'Monitor the BDM leaderboard, incentive tiers, and driver progress',
    ],
    next: [
      { label: 'Goal Setup', path: '/erp/sales-goals/setup' },
      { label: 'Incentive Tracker', path: '/erp/sales-goals/incentives' },
      { label: 'My Goals', path: '/erp/sales-goals/my' },
    ],
    tip: 'BDMs see only their own goals. President and delegates with FULL sales_goals access see all BDMs.',
  },

  salesGoalSetup: {
    title: 'Sales Goal Plan Setup',
    type: 'dependency',
    items: [
      { action: 'Before creating a plan', deps: 'Seed Lookup categories (GROWTH_DRIVER, KPI_CODE, INCENTIVE_TIER) from Control Center → Lookup Tables', section: null },
      { action: 'When you set entity targets', deps: 'Sum of entity targets should match the plan target revenue. Over-allocation is allowed for execution buffer.', section: null },
      { action: 'When you set BDM targets', deps: 'Sum of BDM targets under an entity should match the entity target. Check the validation message.', section: null },
      { action: 'When you add a growth driver', deps: 'Select driver codes from Lookup GROWTH_DRIVER. Add KPI definitions using codes from Lookup KPI_CODE.', section: null },
      { action: 'When you activate the plan', deps: 'All targets move from DRAFT to ACTIVE. BDMs can then see their goals on the dashboard.', section: null },
      { action: 'To adjust incentive tiers mid-year', deps: 'Edit INCENTIVE_TIER in Control Center → Lookup Tables. Change budgets, add reward descriptions.', section: null },
    ],
    next: [
      { label: 'Goal Dashboard', path: '/erp/sales-goals' },
      { label: 'Lookup Tables', path: '/erp/control-center?section=lookups' },
      { label: 'Access Templates', path: '/erp/control-center?section=access-templates' },
    ],
    tip: 'Assign sales_goals: FULL access to an OM via Access Templates so they can help manage goals.',
  },

  salesGoalBdmView: {
    title: 'My Sales Goals',
    steps: [
      'Review your annual sales target and current YTD attainment',
      'Check your incentive tier — see the budget you\'ve earned and what\'s needed for the next tier',
      'Monitor monthly sales trends to identify patterns and momentum',
      'Review KPIs per growth driver — these indicate the health of your territory',
      'Create action items to drive each growth driver (accreditation, formulary listing, MD engagement)',
      'Enter manual KPI values for metrics the system can\'t auto-compute (e.g., time-to-accreditation)',
    ],
    next: [
      { label: 'Goal Dashboard', path: '/erp/sales-goals' },
      { label: 'Incentive Tracker', path: '/erp/sales-goals/incentives' },
      { label: 'My Sales', path: '/erp/sales' },
    ],
    tip: 'Complete action items consistently — they drive the KPIs that determine your incentive tier.',
  },

  kpiLibrary: {
    title: 'KPI Library — SMART Goal Management',
    steps: [
      'Browse existing KPIs grouped by function (Sales, Purchasing, Accounting, etc.)',
      'Create new KPIs using the SMART format: give it a name, description, unit, direction, and target',
      'Assign KPIs to functions — when a person has that functional role, the KPI appears in their self-rating',
      'Edit or deactivate KPIs as business priorities change',
      'Universal KPIs (function = "ALL") apply to every person regardless of role',
    ],
    next: [
      { label: 'Self-Rating', path: '/erp/self-rating' },
      { label: 'Lookup Tables', path: '/erp/control-center?section=lookups' },
      { label: 'Role Assignments', path: '/erp/role-assignments' },
    ],
    tip: 'KPIs are stored as lookup values (KPI_CODE category). You can also manage them directly from Lookup Tables.',
  },

  kpiSelfRating: {
    title: 'KPI Self-Rating & Performance Review',
    steps: [
      'Select your review period type (Monthly, Quarterly, Semi-Annual, or Annual)',
      'The system auto-fills KPIs based on your functional role assignments + universal KPIs',
      'Rate yourself 1–5 on each KPI and competency, and add comments',
      'Set your overall self-assessment score and summary',
      'Submit for your manager\'s review — they will add their scores side-by-side',
      'Manager reviews → Admin approves → rating is finalized',
      'If returned, edit and resubmit — your history is preserved',
    ],
    next: [
      { label: 'KPI Library', path: '/erp/kpi-library' },
      { label: 'Role Assignments', path: '/erp/role-assignments' },
      { label: 'People Master', path: '/erp/control-center?section=people' },
    ],
    tip: 'Your KPIs are based on your functional role(s). If you\'re missing KPIs, ask admin to verify your role assignments.',
  },

  incentiveTracker: {
    title: 'Incentive Tier Tracker',
    steps: [
      'View the tier summary cards — see how many BDMs are in each tier (Platinum/Gold/Silver/Bronze)',
      'Check the leaderboard — sorted by attainment %, showing current and projected tiers',
      'See "distance to next tier" — how much more sales you need to move up',
      'President: use the Budget Advisor panel to see total incentive spend vs. company revenue',
      'Tiers and budgets can be adjusted anytime via Control Center → Lookup Tables → INCENTIVE_TIER',
    ],
    next: [
      { label: 'Goal Dashboard', path: '/erp/sales-goals' },
      { label: 'Lookup Tables', path: '/erp/control-center?section=lookups' },
    ],
    tip: 'Tier budgets represent the amount — the president decides what reward matches that budget (trip, gadget, cash).',
  },
};

/**
 * WorkflowGuide component
 * @param {string} pageKey — key from WORKFLOW_GUIDES config
 */
 
export default function WorkflowGuide({ pageKey }) {
  const navigate = useNavigate();
  const storageKey = `wfg_dismiss_${pageKey}`;
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(storageKey) === '1');
  const [mobileTopOffset, setMobileTopOffset] = useState(0);
  const guideRef = useRef(null);
  const offsetRef = useRef(0);

  const guide = WORKFLOW_GUIDES[pageKey];

  useEffect(() => {
    if (!guide || dismissed) return;

    let rafId = 0;

    const adjustOffset = () => {
      const guideEl = guideRef.current;
      if (!guideEl) return;

      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      if (!isMobile) {
        offsetRef.current = 0;
        setMobileTopOffset(0);
        return;
      }

      const navEl = document.querySelector('.navbar');
      const navBottom = navEl ? navEl.getBoundingClientRect().bottom : 56;
      const minTop = navBottom + 8;
      const currentTop = guideEl.getBoundingClientRect().top;

      // Recover the natural top before any offset we already applied.
      const naturalTop = currentTop - offsetRef.current;
      const rawOffset = Math.max(0, Math.ceil(minTop - naturalTop));
      // Guardrail: keep mobile guide close to content and avoid oversized gaps.
      const neededOffset = Math.min(rawOffset, 48);

      offsetRef.current = neededOffset;
      setMobileTopOffset(neededOffset);
    };

    const scheduleAdjust = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(adjustOffset);
    };

    scheduleAdjust();

    window.addEventListener('resize', scheduleAdjust);
    window.addEventListener('orientationchange', scheduleAdjust);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleAdjust);
      window.removeEventListener('orientationchange', scheduleAdjust);
    };
  }, [pageKey, guide, dismissed]);

  const handleDismiss = () => {
    sessionStorage.setItem(storageKey, '1');
    setDismissed(true);
  };

  if (!guide || dismissed) return null;

  return (
    <>
      <style>{styles}</style>
      <div className="wfg" ref={guideRef} style={mobileTopOffset ? { marginTop: `${mobileTopOffset}px` } : undefined}>
        <button className="wfg-dismiss" onClick={handleDismiss} title="Dismiss for this session">×</button>
        <div className="wfg-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          {guide.title}
        </div>
        <div className="wfg-steps">
          {guide.steps.map((step, i) => (
            <div key={i} className="wfg-step">
              <span className="wfg-num">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
        {guide.next && guide.next.length > 0 && (
          <div className="wfg-next">
            <span className="wfg-next-label">Next steps:</span>
            {guide.next.map((n, i) => (
              <button key={i} className={`wfg-link ${i > 0 ? 'wfg-link-outline' : ''}`} onClick={() => navigate(n.path)}>
                {n.label} →
              </button>
            ))}
          </div>
        )}
        {guide.tip && <div className="wfg-tip">💡 {guide.tip}</div>}
      </div>
    </>
  );
}
 
