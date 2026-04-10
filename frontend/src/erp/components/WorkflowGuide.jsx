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
    title: 'Creating a Sale (CSI)',
    steps: [
      'Select the hospital/customer and set the invoice date',
      'Add line items — select product, quantity, and price',
      'System auto-selects FIFO batch for inventory deduction',
      'Save as DRAFT, then Validate to check for errors',
      'Post to finalize — this creates AR and COGS journal entries',
    ],
    next: [
      { label: 'View All Sales', path: '/erp/sales' },
      { label: 'Check Inventory', path: '/erp/my-stock' },
      { label: 'Collect Payment', path: '/erp/collections' },
    ],
    tip: 'Posted sales generate Accounts Receivable. Collect payment via Collections to clear the AR.',
  },
  'sales-list': {
    title: 'Sales Management',
    steps: [
      'Review all your CSI documents and their statuses',
      'DRAFT — still editable, not yet validated',
      'VALID — passed checks, ready to post',
      'POSTED — finalized, AR created, appears in reports',
    ],
    next: [
      { label: 'Create New Sale', path: '/erp/sales/entry' },
      { label: 'Collect Payment', path: '/erp/collections' },
      { label: 'View AR Aging', path: '/erp/collections/ar' },
    ],
    tip: 'Post valid sales promptly. Unposted sales do not count in MTD targets or P&L.',
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
      'Validate and Post — this clears the customer\'s AR balance',
    ],
    next: [
      { label: 'New Collection', path: '/erp/collections/session' },
      { label: 'View AR Aging', path: '/erp/collections/ar' },
      { label: 'Generate SOA', path: '/erp/collections/soa' },
    ],
    tip: 'Overdue accounts (>30 days) are flagged. Generate an SOA to send to the customer as a reminder.',
  },
  'collection-session': {
    title: 'Recording a Collection',
    steps: [
      'Select the customer/hospital',
      'Choose which invoices (CSIs) are being paid',
      'Enter the payment mode (Cash, Check, Bank Transfer, GCash)',
      'Enter amount received — can be partial or full payment',
      'Validate and Post to clear the AR and create bank deposit journal',
    ],
    next: [
      { label: 'View All Collections', path: '/erp/collections' },
      { label: 'View AR Aging', path: '/erp/collections/ar' },
    ],
    tip: 'CWT (Creditable Withholding Tax) is auto-computed if applicable. Check the CWT amount before posting.',
  },
  'ar-aging': {
    title: 'Accounts Receivable Aging',
    steps: [
      'Review outstanding balances by customer and age bracket',
      'Current (0-30 days), Overdue (31-60), Critical (60+)',
      'Prioritize collection on oldest receivables first',
      'Generate SOA for customers with high balances',
    ],
    next: [
      { label: 'Collect Payment', path: '/erp/collections/session' },
      { label: 'Generate SOA', path: '/erp/collections/soa' },
    ],
    tip: 'High AR aging affects your collection rate and profit sharing eligibility.',
  },
  'expenses': {
    title: 'Recording Expenses (ORE / ACCESS)',
    steps: [
      'Choose expense type: ORE (reimbursable) or ACCESS (operational)',
      'Use the OCR scanner to auto-extract receipt data, or enter manually',
      'Select category, COA code, and cost center',
      'Attach receipt photo as proof',
      'Save as DRAFT → Validate → Post to generate expense journal',
    ],
    next: [
      { label: 'Record SMER', path: '/erp/smer' },
      { label: 'Record Car Logbook', path: '/erp/car-logbook' },
      { label: 'PRF / CALF', path: '/erp/prf-calf' },
    ],
    tip: 'Expenses with CALF required cannot be posted until the linked CALF is posted. President can override this gate.',
  },
  'smer': {
    title: 'SMER (Sales/Marketing Expense Report)',
    steps: [
      'Select the period/cycle and your name',
      'Fill in each day\'s activity type (Office/Field/Other)',
      'Enter expense amounts per category (Mobile, Internet, Meals, etc.)',
      'System auto-computes Per Diem based on MD count',
      'Validate and Post to generate expense journal entries',
    ],
    next: [
      { label: 'Record Car Logbook', path: '/erp/car-logbook' },
      { label: 'Record Expenses', path: '/erp/expenses' },
      { label: 'View Reports', path: '/erp/reports' },
    ],
    tip: 'Full per diem requires minimum MDs per day (check ERP Settings). Half-day threshold is lower.',
  },
  'car-logbook': {
    title: 'Car Logbook',
    steps: [
      'Enter the date and your vehicle details',
      'Scan odometer photo using OCR for accurate reading',
      'Add fuel entries: station, fuel type, liters, cost',
      'System computes mileage and fuel efficiency automatically',
      'Validate and Post to generate fuel expense journal',
    ],
    next: [
      { label: 'Record SMER', path: '/erp/smer' },
      { label: 'Record Expenses', path: '/erp/expenses' },
      { label: 'Fuel Efficiency', path: '/erp/fuel-efficiency' },
    ],
    tip: 'Fuel overconsumption above the threshold (set in ERP Settings) will be flagged in anomaly reports.',
  },
  'prf-calf': {
    title: 'PRF / CALF',
    steps: [
      'PRF (Partner Rebate Form) — record partner rebate payments',
      'CALF (Cash Advance Liquidation) — liquidate cash advances against expenses',
      'For PRF: enter partner details, rebate amount, payment mode',
      'For CALF: link to related expenses, verify advance vs. liquidation balance',
      'Validate and Post — CALF cannot post until linked expenses are posted',
    ],
    next: [
      { label: 'Record Expenses', path: '/erp/expenses' },
      { label: 'View Sales', path: '/erp/sales' },
    ],
    tip: 'CALF is required for certain expense types before they can be posted. Check the funding source.',
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
    ],
    tip: 'Keep collateral records up to date. Unaccounted materials may be flagged in audits.',
  },
  'transfers': {
    title: 'Stock Transfers',
    steps: [
      'Create a transfer order to move stock between warehouses',
      'Select source warehouse, target warehouse, and products',
      'Enter quantities to transfer',
      'Validate and Post — updates inventory in both warehouses',
    ],
    next: [
      { label: 'Receive Transfer', path: '/erp/transfers/receive' },
      { label: 'View Inventory', path: '/erp/my-stock' },
    ],
    tip: 'Inter-company transfers (between entities) use transfer prices set by the president.',
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
  'income': {
    title: 'Revenue Summary',
    steps: [
      'View revenue breakdown by product, customer, and period',
      'Compare MTD vs. target',
      'Identify top-performing products and customers',
    ],
    next: [
      { label: 'View P&L', path: '/erp/pnl' },
      { label: 'Profit Sharing', path: '/erp/profit-sharing' },
    ],
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
    tip: 'Set Purchase UOM when your supplier sells in a different unit (CASE, CARTON) than what you track in inventory (BOX, PC). The conversion factor auto-converts received quantities.',
  },
  'grn-entry': {
    title: 'Goods Receipt Note (GRN)',
    steps: [
      'Optionally link a Purchase Order — line items and warehouse auto-populate with remaining receivable qty',
      'Select warehouse to receive into (auto-filled from PO when linked)',
      'Scan or enter batch numbers and expiry dates for each line',
      'Submit for approval — once approved, stock is added and linked PO auto-updates to PARTIALLY_RECEIVED or RECEIVED',
    ],
    next: [
      { label: 'My Stock', path: '/erp/my-stock' },
      { label: 'Purchase Orders', path: '/erp/purchase-orders' },
      { label: 'Supplier Invoices', path: '/erp/supplier-invoices' },
    ],
    tip: 'Click "Receive" on a PO to jump here with lines pre-filled. OCR can auto-read batch/expiry from undertaking photos.',
  },
  'purchase-orders': {
    title: 'Purchase Orders',
    steps: [
      'Select vendor and add line items (product, qty, unit, price)',
      'Submit for approval (DRAFT → APPROVED)',
      'Click "Receive" to create a GRN linked to this PO — GRN approval auto-updates qty received and PO status',
      'Match with Supplier Invoice for 3-way match (PO ↔ GRN ↔ Invoice)',
      'Click PO # to view full details, line items, linked GRNs and invoices',
      'Click "Print / PDF" in the detail view to generate a shareable document — screenshot or save as PDF for messenger/email',
    ],
    next: [
      { label: 'GRN', path: '/erp/grn' },
      { label: 'Supplier Invoices', path: '/erp/supplier-invoices' },
    ],
    tip: 'Filter by warehouse, vendor, status, or date range. Use Print / PDF to share POs via screenshot or browser Save as PDF.',
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
      'Tag BDMs to hospitals for visibility control',
      'Export/Import via Excel for bulk updates',
    ],
    next: [
      { label: 'New Sale', path: '/erp/sales/entry' },
      { label: 'Collections', path: '/erp/collections' },
    ],
    tip: 'Credit limits can WARN or BLOCK sales — set the action per hospital.',
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
    title: 'Approval Workflow Manager',
    steps: [
      'View pending approval requests assigned to you',
      'Approve or reject with a reason (rejections require a reason)',
      'Admin: create approval rules per module, doc type, and amount threshold',
      'Rules support multi-level approval chains (Level 1 → Level 2 → etc.)',
    ],
    next: [
      { label: 'Control Center', path: '/erp/control-center?section=approval-rules' },
      { label: 'Settings', path: '/erp/control-center?section=settings' },
    ],
    tip: 'Enable ENFORCE_AUTHORITY_MATRIX in Settings to activate approval workflows.',
  },
  'batch-trace': {
    title: 'Batch Trace',
    steps: [
      'Search for a product by name or item key',
      'View all batches with lot numbers, expiry dates, and current quantities',
      'Trace each batch movement: GRN receipt, sales consumption, transfers, adjustments',
      'Identify near-expiry or expired batches for action',
    ],
    next: [
      { label: 'My Stock', path: '/erp/inventory' },
      { label: 'Expiry Dashboard', path: '/erp/expiry-dashboard' },
    ],
    tip: 'Batch trace follows FIFO — oldest expiry batches are consumed first.',
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
    ],
  },
  'petty-cash': {
    title: 'Petty Cash',
    steps: [
      'View fund balance and ceiling limit',
      'Create disbursements with receipts and COA coding',
      'Replenish when fund is low',
      'Each disbursement posts a journal entry',
    ],
    next: [
      { label: 'Expenses', path: '/erp/expenses' },
      { label: 'Journal Entries', path: '/erp/journals' },
    ],
    tip: 'Fund ceiling is configurable in ERP Settings.',
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
      'Use search and filters to find people by name, type, or status',
      'Click any row to view full person details and profile',
      'In the Archive tab, click "Reactivate" to restore a separated employee to active status',
      'If a legacy role banner appears (e.g. medrep, employee), click "Migrate" to bulk-convert users to the current "contractor" role',
    ],
    next: [
      { label: 'Org Chart', path: '/erp/org-chart' },
      { label: 'Add Person', path: '/erp/people' },
    ],
    tip: 'The Active tab shows current employees (ACTIVE, ON_LEAVE, SUSPENDED). The Archive tab shows separated employees. Use "Sync from CRM" to import existing CRM users. Reactivating a person sets them to ACTIVE but does not restore login or role assignments — those must be re-enabled manually.',
  },
  'person-detail': {
    title: 'Person Profile',
    steps: [
      'View and review person information, compensation, and insurance',
      'Edit details (admin/finance/president only) and save changes',
      'Manage system login access and ERP module permissions',
      'Use "Separate Employee" to deactivate — this revokes role assignments and disables login',
      'Use "Reactivate" on separated employees to restore active status (login and roles must be re-enabled manually)',
      'Person types, employment types, and BDM stages are managed via Lookup Tables (Control Center → System Settings)',
    ],
    next: [
      { label: 'People List', path: '/erp/people' },
      { label: 'Org Chart', path: '/erp/org-chart' },
      { label: 'Payroll', path: '/erp/payroll' },
    ],
    tip: 'Separating an employee cascades: marks SEPARATED, revokes all role assignments, and disables system login. Reactivation restores ACTIVE status only — re-enable login and role assignments manually. Career path: CONTRACTOR → PS_ELIGIBLE → TRANSITIONING → SUBSIDIARY → SHAREHOLDER.',
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
    ],
    tip: 'Exhausted booklets cannot issue new CSI numbers. Create a new booklet before running out.',
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
      'Create new accounts with proper codes following the COA numbering convention',
      'Edit or deactivate accounts — active accounts cannot be deleted if used in journals',
      'Import/Export via Excel for bulk setup or migration',
    ],
    next: [
      { label: 'Journal Entries', path: '/erp/journals' },
      { label: 'Trial Balance', path: '/erp/trial-balance' },
    ],
    tip: 'Account codes follow ranges: 1000-1999 Assets, 2000-2999 Liabilities, 3000-3999 Equity, 4000-4999 Revenue, 5000-9999 Expenses.',
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
    ],
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
    tip: 'Templates simplify access management. Create one per role (BDM, Finance, Admin) and assign to new users.',
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
 
