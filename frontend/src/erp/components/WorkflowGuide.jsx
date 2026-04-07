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
      'Use Export/Import buttons for bulk price updates via Excel',
      'Tag products to warehouses for inventory tracking',
    ],
    next: [
      { label: 'My Stock', path: '/erp/my-stock' },
      { label: 'GRN', path: '/erp/grn' },
      { label: 'Transfer Prices', path: '/erp/control-center?section=transfer-prices' },
    ],
    tip: 'Set purchase_price accurately — it drives COGS in journal entries.',
  },
  'grn-entry': {
    title: 'Goods Receipt Note (GRN)',
    steps: [
      'Select supplier and warehouse to receive into',
      'Scan or enter batch numbers and expiry dates',
      'Match against Purchase Order if applicable',
      'Validate and Post — stock is added to inventory',
    ],
    next: [
      { label: 'My Stock', path: '/erp/my-stock' },
      { label: 'Purchase Orders', path: '/erp/purchasing/orders' },
    ],
    tip: 'OCR can auto-read batch/expiry from photos of delivery receipts.',
  },
  'purchase-orders': {
    title: 'Purchase Orders',
    steps: [
      'Select vendor and add line items (product, qty, price)',
      'Submit for approval (DRAFT → APPROVED)',
      'Receive goods via GRN — PO auto-updates to PARTIALLY_RECEIVED',
      'Match with Supplier Invoice for 3-way match',
    ],
    next: [
      { label: 'GRN', path: '/erp/grn' },
      { label: 'Supplier Invoices', path: '/erp/purchasing/invoices' },
    ],
    tip: 'Link POs to GRNs for accurate inventory costing.',
  },
  'supplier-invoices': {
    title: 'Supplier Invoices',
    steps: [
      'Enter supplier invoice details and line items',
      'Match against PO and GRN (3-way match)',
      'Validate — check totals, VAT, CWT',
      'Post — creates Accounts Payable journal entry',
    ],
    next: [
      { label: 'Accounts Payable', path: '/erp/purchasing/ap' },
      { label: 'Purchase Orders', path: '/erp/purchasing/orders' },
    ],
    tip: 'Unmatched invoices are flagged for review before posting.',
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
      { label: 'Supplier Invoices', path: '/erp/purchasing/invoices' },
      { label: 'Bank Reconciliation', path: '/erp/banking/reconciliation' },
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
      { label: 'Trial Balance', path: '/erp/accounting/trial-balance' },
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
      { label: 'Trial Balance', path: '/erp/accounting/trial-balance' },
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
      { label: 'Journal Entries', path: '/erp/accounting/journal' },
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
      { label: 'Payslips', path: '/erp/payroll/payslips' },
      { label: 'Journal Entries', path: '/erp/accounting/journal' },
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
      { label: 'Journal Entries', path: '/erp/accounting/journal' },
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
      { label: 'Consignment Dashboard', path: '/erp/consignment-dashboard' },
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
      { label: 'Trial Balance', path: '/erp/accounting/trial-balance' },
      { label: 'AR Aging', path: '/erp/collections/ar' },
    ],
  },

  // ═══ People & Organization ═══
  'people-list': {
    title: 'People Directory',
    steps: [
      'View all employee and partner records in the system',
      'Use search and filters to find people by name, type, or status',
      'Click any row to view full person details and profile',
    ],
    next: [
      { label: 'Org Chart', path: '/erp/org-chart' },
      { label: 'Add Person', path: '/erp/people' },
    ],
    tip: 'Use "Sync from CRM" to import existing CRM users into the People Master.',
  },
  'person-detail': {
    title: 'Person Profile',
    steps: [
      'View and review person information, compensation, and insurance',
      'Edit details (admin/finance/president only) and save changes',
      'Manage system login access and ERP module permissions',
    ],
    next: [
      { label: 'People List', path: '/erp/people' },
      { label: 'Org Chart', path: '/erp/org-chart' },
      { label: 'Payroll', path: '/erp/payroll' },
    ],
    tip: 'Changes to compensation profile affect future payroll computations.',
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
