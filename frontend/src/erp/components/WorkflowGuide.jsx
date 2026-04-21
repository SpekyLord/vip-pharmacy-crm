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

// ── Phase G6.9 — Pages whose document workflow includes Approval Hub rejection ──
// Each page key here renders the shared "Rejected? See banner above" footer note.
// Source-of-truth: MODULE_REJECTION_CONFIG seed in backend/erp/controllers/lookupGenericController.js.
// Adding a new module = adding the page key here AND seeding MODULE_REJECTION_CONFIG.
const PAGES_WITH_REJECTION_FLOW = new Set([
  'sales-entry', 'sales-opening-ar', 'sales-opening-ar-list', 'collections', 'smer', 'car-logbook', 'expenses', 'prf-calf',
  'grn-entry', 'payslip-view', 'kpi-rating', 'income', 'my-income',
  'purchase-orders', 'journal-entries', 'bank-reconciliation', 'transfer-orders',
  'ic-settlement', 'sales-goal-setup', 'sales-goal-bdm', 'incentive-payout-ledger',
  'petty-cash',
]);
const REJECTION_FOOTER_NOTE = 'If an approver rejects this document, a red banner with the reason will appear on this page. Click Fix & Resubmit to edit and re-send for approval — your data is preserved.';

// ── Complete BDM workflow guide config ──
const WORKFLOW_GUIDES = {
  // ── Phase G9.R7–R8 — Unified Operational Inbox ──
  'inbox': {
    title: 'Unified Operational Inbox',
    steps: [
      'Approvals folder = every pending decision routed to you. Approve/Reject in-place — the row delegates to the canonical approval handler (no parallel paths, Rule #20). Approve/Reject/Resolve are blocked until any must-acknowledge banner is cleared — the Acknowledge button itself is never gated.',
      'Tasks folder = your assigned tasks with the mini-editor (status / due date / reassign). Hit "Open full page" for the Gantt / Kanban / bulk-ops view at /erp/tasks.',
      'AI Agents folder = findings from rule-based agents (KPI variance, daily briefing, OCR, task overdue) — actionable items show [Resolve], passive ones show [Acknowledge]. AI reports auto-require ack by default (tunable in Control Center → Inbox Retention).',
      'Archive is per-recipient: Archive / Unarchive in the thread header only hides the message from your inbox — senders keep it in Sent, other recipients are unaffected. Use the list toolbar "Select" mode to bulk-archive several threads; "Mark all read" flips every unread row in the current folder.',
      'Approval threads stay together by ApprovalRequest._id — request, decision and reopen events fold into one conversation. Look here before re-opening a posted document.',
      'Compose to send a direct message or broadcast — gated by messaging.* sub-permissions and the per-entity MESSAGE_ACCESS_ROLES matrix (Control Center → Lookup Tables to edit). Use "Require acknowledgement" to force recipients to confirm before they can act. Read-receipts button (sender + admin/president/ceo/finance) lists who acknowledged and who is still pending.',
      'Retention: archived / read / AI-agent / broadcast messages auto-purge via the nightly #MR Inbox Retention agent. Tune per-entity windows or run a preview / Run Now from Control Center → Inbox Retention.',
    ],
    next: [
      { label: 'Approval Hub', path: '/erp/approvals' },
      { label: 'My Tasks', path: '/erp/tasks' },
      { label: 'AI Agents', path: '/erp/agent-dashboard' },
      { label: 'Inbox Retention', path: '/admin/control-center/inbox-retention' },
    ],
    tip: 'Channels (email / in-app / SMS) are kill-switched per entity via NOTIFICATION_CHANNELS lookup. Per-user opt-in lives on the user\'s NotificationPreference. Disabling IN_APP for the entity hides ALL future inbox writes — existing rows stay visible. Badge colors on the folder nav: blue = unread, amber ⚑ = unacknowledged, red = action required.',
  },
  // Inbox Retention Settings: embedded in Control Center only (standalone
  // routes redirect to /erp/control-center?section=inbox-retention). Per
  // CLAUDE.md Rule #1, embedded Control Center panels use DependencyBanner —
  // see DEPENDENCY_GUIDE['inbox-retention'] in ControlCenter.jsx. No
  // WorkflowGuide entry needed here; adding one would create duplicate copy.
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
  'sales-opening-ar': {
    title: 'Opening AR Entry — Pre-Go-Live CSIs',
    steps: [
      'Use this page only for historical CSIs dated BEFORE your ERP go-live date (live_date on your user profile). The form blocks any csi_date on or after live_date.',
      'Pick the hospital (or non-hospital customer) — the same record powers AR aging and Collections, so it must match the entity that owes the money.',
      'Enter the CSI booklet number (doc_ref) and the historical csi_date. The product dropdown is sourced from ProductMaster (no warehouse stock filter), so discontinued or zero-stock products are still selectable.',
      'Add line items — qty × unit_price feeds the AR balance. There is no FIFO override and no batch picker because no inventory is consumed (opening stock is loaded separately via the importOpeningStock script).',
      'Scan CSI (required): capture the invoice photo — it auto-fills doc_ref/date/hospital/line items via OCR and persists csi_photo_url for audit. Validate blocks any CSI row without a photo attached (lookup-driven via SALES_SETTINGS.REQUIRE_CSI_PHOTO — default on). Non-pharmacy subscribers can flip the flag off in Control Center.',
      'Duplicate rule: the same CSI # (doc_ref) cannot be used twice for the same hospital/customer within the Opening AR bucket. CSI numbers are canonicalized on save — prefixes ("CSI ", "INV ", "#") and leading zeros are stripped, so "4852", "004852", "CSI 004852", and "INV 004852" are all the same booklet page and stored as "4852". Live Sales and Opening AR are separate buckets — a live CSI #4852 does not conflict with an Opening AR #4852, and vice versa. A row with no hospital/customer yet will NOT trigger a duplicate error (it fails on the required-field check instead). If validation flags a duplicate, edit the existing row rather than creating a new one.',
      'Save Drafts → saved rows move to Opening AR Transactions (this page resets to a blank row for the next CSI). Click "View in Opening AR Transactions" in the success banner — or use the Transactions tab — to Validate and Post. Posting auto-routes through gateApproval (module=SALES). Period lock for the historical month is bypassed because source=OPENING_AR (set automatically when csi_date < live_date).',
      'Posted opening AR shows up in AR Aging, Collections (CSI dropdown), and Hospital SOA — same as live CSIs. The journal entry posts AR debit / Sales Revenue + Output VAT credit. No COGS, no inventory ledger entry.',
      'If an approver rejects: a red banner with the reason appears on the row. Click Re-upload CSI Photo to attach a clearer image without re-keying line items, then Validate + Post again.',
    ],
    next: [
      { label: 'Live Sales Entry', path: '/erp/sales/entry' },
      { label: 'View All Sales', path: '/erp/sales' },
      { label: 'AR Aging', path: '/erp/collections/ar' },
      { label: 'Approval Hub', path: '/erp/approvals' },
    ],
    tip: 'Opening AR is for receivables only. Pre-go-live INVENTORY is loaded with the importOpeningStock script (one-shot at cutover). After cutover is complete, your admin can remove the sales.opening_ar sub-permission to hide this page from the sidebar — entries already posted remain in AR aging.',
  },
  // Option B split — posted-history surface for Opening AR. Shares the
  // sales-family nav bar with SalesEntry / SalesList / OpeningArEntry. Gated
  // by sales.opening_ar_list sub-permission so subscribers can keep the audit
  // trail visible after revoking sales.opening_ar post-cutover.
  'sales-opening-ar-list': {
    title: 'Opening AR Transactions — Historical Read-Only Audit',
    steps: [
      'This is the full history of CSIs flagged source=OPENING_AR — posted, pending deletion, and any drafts/valid/error rows you want to review in one place. New drafts are created on the Opening AR Entry page.',
      'Filter by status (default = all) or csi_date range. The source filter is fixed to OPENING_AR — to see live sales use the Sales Transactions tab.',
      'Click any row to open the detail panel: line items, invoice total, VAT/net breakdown, CSI photo thumbnail, and the rejection banner (if an approver sent it back).',
      'Actions per row: Submit (VALID → POSTED), Re-open (POSTED → DRAFT, reverses the AR journal), Request Deletion (BDM), Approve Deletion (admin w/ accounting.approve_deletion), President Delete (holders of accounting.reverse_posted).',
      'Re-open is safe for OPENING_AR because no InventoryLedger entries were created at post time — only the AR + Sales Revenue journal is reversed (SAP Storno).',
      'If an approver rejected a row you submitted: open the detail panel, read the rejection banner, and click Fix & Resubmit — you\'ll land back on the Entry page pre-loaded for editing.',
      'Tab navigation lets you jump to Sales, Sales Transactions, Opening AR Entry, or CSI Booklets without leaving the context.',
    ],
    next: [
      { label: 'Opening AR Entry', path: '/erp/sales/opening-ar' },
      { label: 'Sales Transactions', path: '/erp/sales' },
      { label: 'AR Aging', path: '/erp/collections/ar' },
      { label: 'Approval Hub', path: '/erp/approvals' },
    ],
    tip: 'Subscribers who want read-only audit after cutover can revoke sales.opening_ar (hides Entry) but keep sales.opening_ar_list (keeps this page). Both are lookup-driven via Control Center → Lookup Tables → ERP_SUB_PERMISSION.',
  },
  'sales-entry': {
    title: 'Creating a Sale (CSI / Cash Receipt / Service Invoice)',
    steps: [
      'Select sale type: CSI (credit), Cash Receipt (cash), or Service Invoice (services)',
      'Select the hospital/customer and set the invoice date',
      'CSI/Cash Receipt: add one or more line items per CSI — each line has its own product (warehouse-stock filtered), batch/lot (auto-picked by FIFO), quantity, and unit price. Use + Line Item to add another product under the same CSI; the row shows a running Total that sums every line. Service Invoice: enter description + total (no line items).',
      'CSI only: the CSI # input shows your available booklet numbers (if you have an allocation). This is a monitoring hint — you can still type any number, but posting an unknown number will raise a yellow audit warning.',
      'CSI only: a CSI photo is required before Validate will accept the row. Use "Scan CSI" to capture the invoice — OCR auto-fills doc_ref/date/hospital/line items and stores the photo on the row for audit. Rule is lookup-driven (SALES_SETTINGS.REQUIRE_CSI_PHOTO, default on); subscribers can relax via Control Center.',
      'For Cash Receipt or Service Invoice with CASH payment: optionally select a Petty Cash Fund to deposit cash directly',
      'Duplicate rule (CSI): same CSI # cannot be reused for the same hospital/customer within the live Sales bucket. CSI numbers are canonicalized on save — prefixes ("CSI ", "INV ", "#") and leading zeros are stripped, so "4852", "004852", "CSI 004852", and "INV 004852" are the same booklet page. Opening AR is a separate bucket, so historical numbers do not collide with live ones. (CASH_RECEIPT and SERVICE_INVOICE doc-refs are system-generated and kept in their exact format.) If a duplicate is flagged, edit the existing row rather than creating a new one.',
      'Save as DRAFT, then Validate to check for errors. Red = must fix before posting. Yellow = informational (e.g. CSI number outside your allocation) — will NOT block posting.',
      'Post routes through the Approval Hub for users not in MODULE_DEFAULT_ROLES.SALES (lookup-driven, per-entity — default: admin, finance, president). Contractors/BDMs get a "Pending approval" toast and the row stays VALID until an authority posts it from /erp/approvals. If Authority Matrix is enabled, amount-threshold rules can add further escalation on top.',
      'Post to finalize — CSI creates AR; Cash Receipt/Service Invoice with fund creates direct petty cash deposit instead of AR. Posted CSI numbers are auto-marked "used" in your booklet allocation.',
      'Re-open a POSTED sale to correct it — reverses stock, petty-cash deposit, and journal entries (SAP Storno). The consumed CSI number returns to your available pool. Blocked if a POSTED Collection already settled this CSI; reopen the collection first to release it.',
    ],
    next: [
      { label: 'View All Sales', path: '/erp/sales' },
      { label: 'Check Inventory', path: '/erp/my-stock' },
      { label: 'Collect Payment', path: '/erp/collections' },
      { label: 'Petty Cash', path: '/erp/petty-cash' },
      { label: 'Approval Hub', path: '/erp/approvals' },
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
      'Wrong quantity? Use "Physical Count" (top-right) to record actual on-hand qty — variances post as ADJUSTMENT entries with a journal entry.',
      'Wrong batch number or expiry date? Expand the product row and click "Edit" on the batch line. Metadata-only fix — no journal entry, no quantity change.',
    ],
    next: [
      { label: 'Create Sale', path: '/erp/sales/entry' },
      { label: 'Request Transfer', path: '/erp/transfers' },
      { label: 'View Consignment', path: '/erp/consignment' },
    ],
    tip: 'FIFO (First In, First Out) is enforced. Oldest batches are sold first automatically. Batch metadata fix (batch # / expiry typo) is audited and rewrites every ledger row plus the source GRN line — gated by `inventory.edit_batch_metadata` sub-permission, so subscribers can grant it to trusted contractors via Access Template without code changes. Quantity corrections still run through Physical Count; full GRN reversal is the President-only path when qty or cost is wrong.',
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
    tip: 'Overdue accounts (>30 days) are flagged. Cash payments routed to a Petty Cash Fund auto-create a POSTED deposit on submission and auto-void on reopen. Only ACTIVE funds that accept deposits (REVOLVING or DEPOSIT_ONLY mode) are available. President Delete — for the President (or anyone granted accounting.reverse_posted in Access Templates): one-click delete of bad CRs. POSTED rows trigger SAP Storno (reverses collection + CWT + commission journals, deletes VAT/CWT ledger entries, voids petty cash deposit, decrements fund balance — all in a single transaction; original kept for audit). DRAFT/VALID/ERROR rows hard-delete. All actions logged.',
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
    tip: 'Expenses with COA 6900 (Misc) are BLOCKED from posting — map to correct account first. ACCESS expenses with non-cash payment auto-create a CALF. CALF must be POSTED before expense can post. COA codes are configurable in Settings → COA Mapping. OCR scanning is optional — if it fails or is disabled, the photo still uploads as proof and you fill the form manually. President Delete — for the President (or anyone granted accounting.reverse_posted in Access Templates): one-click delete of bad expense rows. POSTED/DELETION_REQUESTED → SAP Storno (reverses expense + CALF-link clear + journal entries; original kept for audit). DRAFT/VALID/ERROR → hard delete. Blocked if a POSTED CALF still references the row; reverse the CALF first. All actions logged.',
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
      'Select period and cycle (C1 = days 1–15, C2 = days 16–end, MONTHLY = full month) — all days including weekends are shown',
      'Fill in Start KM and End KM for each day — tap [S]/[E] to OCR-scan odometer photos; Personal KM is deducted from Official KM',
      'Destination auto-fills from your SMER entry for that date; edit manually if needed',
      'Click the Fuel cell to expand, add fuel entries (station, liters, ₱/L, payment mode) — or tap "Scan Receipt" to OCR a gas receipt',
      'Non-CASH fuel: either link it to a POSTED CALF (recommended), or click "Submit Fuel" to route it as its own FUEL_ENTRY through the Approval Hub (per-fuel approval, Phase 33)',
      'Click "Save Car Logbook" to persist all dirty rows; an * indicator shows unsaved days',
      'Click "Validate" to check the period+cycle, then "Submit" — the backend wraps the cycle into ONE CarLogbookCycle doc and posts ONE entry to the Approval Hub as LOGBOOK-{period}-{cycle}',
      'President posts the cycle → ONE journal entry covers the whole cycle; all per-day docs + the wrapper flip to POSTED atomically',
    ],
    next: [
      { label: 'Record SMER', path: '/erp/smer' },
      { label: 'Record Expenses', path: '/erp/expenses' },
      { label: 'PRF / CALF', path: '/erp/prf-calf' },
      { label: 'Fuel Efficiency', path: '/erp/fuel-efficiency' },
      { label: 'Approval Hub', path: '/erp/approvals' },
    ],
    tip: 'Phase 33 cycle-wrapper: submit/post/reverse now run at the cycle level (CarLogbookCycle), not per day. Per-day CarLogbookEntry docs remain the source of truth for odometer/fuel/efficiency — the wrapper only carries cycle-level approval/posting state and aggregated totals. Before Submit, the cycle pre-post gate requires each non-CASH fuel to be either (a) linked to a POSTED CALF or (b) have approval_status=APPROVED via the per-fuel Submit Fuel flow. Rejected fuel entries stay editable; fix the value and Resubmit. Reversing the cycle cascades to all per-day docs in one atomic transaction. COA code for fuel is admin-configurable in Settings (lookup-driven). Privileged viewers (president/admin/finance) use the BDM picker to audit someone else\'s cycle — the page is read-only until they pick themselves (Rule #21 — no silent self-fallback; backend requires an explicit bdm_id to create/validate/submit).',
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
    tip: 'Partner rebates follow accrual basis — journal entry (DR 5200 PARTNER_REBATE, CR funding) is created only when PRF is posted, not when the collection is recorded. CALF validates that linked expense line IDs actually belong to the referenced expense entry. Document numbers auto-generate from Territory + date + sequence — if generation fails, check Territory setup for the BDM. All COA codes are admin-configurable in Settings. President Delete — for the President (or anyone granted accounting.reverse_posted in Access Templates): one-click delete of bad PRF/CALF rows. POSTED → SAP Storno (CALF: clears calf_id on non-POSTED expenses; PRF: clears rebate_prf_id on the linked Collection; reverses the associated JE). Blocked if a POSTED downstream doc still depends on it (e.g., POSTED expense funded by this CALF, or an IncomeReport that auto-deducted this CALF — reverse those first). Controller auto-picks CALF vs PRF handler from the row\'s doc_type. All actions logged.',
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
      'Enter quantities to transfer — each order is assigned a human-readable ref at save time: ICT-{ENTITY}{MMDDYY}-{NNN} (e.g. ICT-VIP041826-001)',
      'Validate and Post — updates inventory in both warehouses',
    ],
    next: [
      { label: 'Receive Transfer', path: '/erp/transfers/receive' },
      { label: 'View Inventory', path: '/erp/my-stock' },
    ],
    tip: 'Inter-company transfers (between entities) use transfer prices set by the president. Subsidiary product catalog access is lookup-driven. Transfer refs use the source entity\'s short_name as the code (admin-editable in Entity management, cache-busted on rename) — subsidiaries get their own prefix without a code change, matching JE/CALF/PO numbering. Legacy transfers created before the numbering rollout show their original ICT-YYYYMMDD-NNN format; new transfers use the unified format.',
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
    title: 'Goods Receipt Note (GRN) — Capture',
    steps: [
      'Optionally link a Purchase Order or internal transfer — products, warehouse, and expected qty auto-fill from the source document',
      'Upload the courier waybill photo (required evidence that the goods physically arrived) — configurable via Control Center → GRN Settings → WAYBILL_REQUIRED',
      'Tap "Scan Undertaking Paper" to OCR the physical Undertaking — batch, expiry, and qty auto-fill for every matched product line (marked ✓). Unmatched rows stay open for manual entry.',
      'For any line not covered by the scan: type the batch/lot # from the packaging (optional when GRN_SETTINGS → REQUIRE_BATCH = 0), pick expiry via calendar (optional when REQUIRE_EXPIRY = 0; floored at today + MIN_EXPIRY_DAYS when provided), enter received qty',
      'Tap "Save & Validate" — backend checks batch/expiry/qty/waybill (skipping the checks turned off in GRN_SETTINGS), then auto-creates the Undertaking and deep-links you there for a read-only double-check before routing for approval',
    ],
    next: [
      { label: 'Undertaking (Review)', path: '/erp/undertaking' },
      { label: 'My Stock', path: '/erp/my-stock' },
      { label: 'Purchase Orders', path: '/erp/purchase-orders' },
    ],
    tip: 'Phase 32R — GRN is the capture surface. All batch/lot + expiry + qty data is entered here, and the paper Undertaking becomes the OCR source that auto-fills lines in bulk. The Undertaking page downstream is a read-only approval wrapper, not another data-entry form. Every GRN auto-assigns a human-readable number on create — `GRN-{TERR|ENTITY}{MMDDYY}-{NNN}` (e.g. `GRN-ILO042026-001`, matching the CALF/PO/JE format) — sequenced atomically per territory-per-day. Subscribers in non-pharmacy verticals can relax batch/expiry requirements in Control Center → GRN Settings — FIFO stays intact because blanks become safe sentinels (batch="N/A", expiry=9999-12-31).',
  },
  // Phase 32R — Undertaking (read-only approval wrapper over a captured GRN)
  'undertaking-entry': {
    title: 'Undertaking (Review & Approval)',
    steps: [
      'Auto-created on every GRN — open the DRAFT for the GRN you just captured. Every line mirrors what you entered on GrnEntry (product, qty, batch, expiry).',
      'Double-check the mirrored details and the attached waybill + scanned Undertaking paper thumbnails. Lines show ✓ when they were OCR-confirmed from the paper.',
      'Tap "Validate & Submit" — DRAFT → SUBMITTED. If your role is not in MODULE_DEFAULT_ROLES.UNDERTAKING the request is held in the Approval Hub (HTTP 202) for a president/finance/admin approver.',
      'Approver acknowledges → linked GRN auto-approves and InventoryLedger is written atomically in one session. FIFO picks the batch automatically downstream.',
      'Approver rejects → Undertaking becomes REJECTED (terminal). GRN stays PENDING so the BDM can reverse the GRN entirely and re-capture from scratch.',
    ],
    next: [
      { label: 'GRN Entry', path: '/erp/grn' },
      { label: 'Approval Hub', path: '/erp/approvals' },
      { label: 'My Stock', path: '/erp/my-stock' },
      { label: 'Batch Trace', path: '/erp/batch-trace' },
    ],
    tip: 'Variance flags (yellow/red): qty-under, qty-over (VARIANCE_TOLERANCE_PCT lookup), near-expiry. Data entry has already happened on GrnEntry — no inputs here on purpose. If something is wrong, reject the UT and reverse the GRN to recapture. The "Linked GRN" link now shows the GRN\'s human-readable number (`GRN-{TERR|ENTITY}{MMDDYY}-{NNN}`) — legacy GRNs created before Phase 32R-GRN# still display the last-6 id tail.',
  },
  'grn-audit': {
    title: 'GRN Audit Trail',
    steps: [
      'Read-only view: GRN header + the 1:1 Undertaking + InventoryLedger postings per batch — everything that happened to this receipt in one place',
      'GRN panel shows source (Standalone / PO / Internal Transfer), vendor, waybill thumbnail, and current status',
      'Undertaking panel shows scan ratio (✓ lines), variance flags, acknowledged-by, and rejection reason if any',
      'Use the "Open Undertaking →" button if you need to act (submit / acknowledge / reject / reverse) — this audit page is read-only',
      'For batch-level lookups across multiple GRNs, jump to Batch Trace from the sidebar instead',
    ],
    next: [
      { label: 'Undertaking', path: '/erp/undertaking' },
      { label: 'GRN List', path: '/erp/grn' },
      { label: 'Batch Trace', path: '/erp/batch-trace' },
    ],
    tip: 'No edits here on purpose — this is a forensic snapshot. Reversals route through the Undertaking page so the cascade (UT → GRN → InventoryLedger → PO/Reassignment status) stays consistent.',
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
      'View status of every registered agent (Claude AI + rule-based), sourced from the backend agent registry so new agents surface here automatically',
      'Check recent runs, alerts generated, messages sent, and key findings per agent',
      'Click "Run Now" on any agent for an on-demand execution (president/admin only)',
      'Configure enable/disable, notification routing, and run agents from Control Center → Intelligence',
    ],
    next: [
      { label: 'Control Center', path: '/erp/control-center?section=agent-settings' },
    ],
    tip: 'Rule-based agents always run on schedule (no cost). Claude AI agents require ANTHROPIC_API_KEY and a funded AI budget cap (Control Center → AI Budget). Every agent schedule is governed by the central cron in backend/agents/agentScheduler.js — per-agent thresholds and toggles live in Lookup Tables (subscription-ready, no code changes needed).',
  },
  'approval-manager': {
    title: 'Universal Approval Hub',
    steps: [
      'Governing principle: "Any person can CREATE, but authority POSTS." Submitters validate; the Hub posts.',
      'All Pending tab: EVERY transaction awaiting action across the ERP — includes module-native items (raw docs in VALID/PENDING_APPROVAL) AND Authority-Matrix / Default-Roles-Gate escalations. Each row expands to show the full document with line items, photos, and audit trail.',
      'Phase G4.1 (Apr 2026) — Approval Requests are now hydrated into All Pending with full DocumentDetailPanel cards (was: flat table in the Requests tab). Dedup keeps the raw module item whenever both surfaces exist, so there is no double-listing.',
      'Module filter: narrow by Sales, Collections, SMER, Car Logbook, Expenses, PRF/CALF, Income, Deductions, GRN, Payroll, KPI, Banking, Journal, Petty Cash, IC Transfer, Purchasing, Sales Goal Plans, Incentive Payouts, etc.',
      'Sub-permissions: your assigned approval sub-permissions control which modules you see. Admin might handle Sales + GRN, finance handles Expenses + Payroll. President sees everything. Configure in Control Center → ERP Access Templates → Approvals sub-permissions.',
      'Posting modules (Sales, Collections, SMER, Car Logbook, Expenses, PRF/CALF, Banking, Journal, Petty Cash, IC Transfer, Purchasing): documents in VALID status — click Post to transition to POSTED; the close-loop auto-resolves any pending ApprovalRequest on the same doc.',
      'Approval modules (Income, Deductions, GRN, Payroll, KPI, Undertaking, Per-Diem Override): multi-step review/approve workflows.',
      'Default-Roles Gate (always on): when a submitter\'s role is not in MODULE_DEFAULT_ROLES.metadata.roles, their post is held and a pending request appears in All Pending. Set roles = null on a module to disable the gate (open-post).',
      'Attachments: waybill photos, deposit slips, OR receipts, fuel receipts, and supporting documents are displayed inline — click any thumbnail to view full-size.',
      'Quick Edit: click Edit on any item to fix typos (description, notes, check#, amount) before approving. Editable fields configured in Control Center → Lookup Tables → APPROVAL_EDITABLE_FIELDS.',
      'Line-Item Edit: fix individual line items (qty, unit_price, batch#) directly — totals recalculate automatically. Configure in Lookup Tables → APPROVAL_EDITABLE_LINE_FIELDS.',
      'Approval History tab: historical ApprovalRequest decisions (APPROVED / REJECTED / CANCELLED) for Authority-Matrix audit. Filter by status or module.',
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
      'Create manual JE with debit and credit lines (must balance within ₱0.01)',
      'Add reference document or description — each JE is assigned a human-readable number at DRAFT time: JE-{ENTITY}{MMDDYY}-{NNN} (e.g. JE-VIP041826-001)',
      'Post — the system runs the Authority gate (MODULE_DEFAULT_ROLES.JOURNAL + optional ApprovalRule). Authorized roles post directly; others route through the Approval Hub',
      'Posted JEs flow to Trial Balance, P&L, and General Ledger',
      'Reverse if needed — creates a new JE with flipped amounts (SAP Storno); original stays POSTED with corrects_je_id linking them. Reversal is gated by accounting.reverse_posted danger sub-permission.',
    ],
    next: [
      { label: 'Trial Balance', path: '/erp/trial-balance' },
      { label: 'P&L', path: '/erp/pnl' },
      { label: 'Approval Hub', path: '/erp/approvals' },
    ],
    tip: 'Auto-journals are created automatically by Sales, Collections, Expenses, Petty Cash, IC Transfers, GRN, Depreciation, Interest — these inherit the source document\'s approval decision and do NOT re-gate. Manual JEs (created in this page) DO go through the Authority gate on post. JE numbers use the entity\'s short_name as the code (admin-editable in Entity management, cache-busted on rename) — subsidiaries get their own prefix without a code change. Legacy JEs created before the numbering rollout show their original numeric ID; new JEs use the formatted string. Sort order is chronological (je_date) — the number is for identification, not ordering.',
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
      'Click + Add Item to register a new supply. Each item_code must be unique within your entity — duplicates are rejected at save time (HTTP 409)',
      'Record purchases (PURCHASE) or issues to staff (ISSUE) via Record Transaction',
      'Track returns and adjustments; stock deltas are computed atomically',
      'View current stock levels by category; the REORDER badge highlights items at or below reorder_level',
      'President-only: click Reverse on any row to undo a mistake. Item reversal cascades to all transactions for that item; transaction reversal restores qty_on_hand. Both show up in the Reversal Console.',
    ],
    next: [
      { label: 'Petty Cash', path: '/erp/petty-cash' },
      { label: 'Reversal Console', path: '/erp/president/reversals' },
      { label: 'Lookup Tables', path: '/erp/control-center?section=lookups' },
      { label: 'Access Templates', path: '/erp/control-center?section=access' },
    ],
    tip: 'Access is template-driven — only users with the inventory.office_supplies sub-permission can see this page. Reversing needs accounting.reverse_posted (president always has it). Manage both in Access Templates.',
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
    tip: 'Fund modes, statuses, expense categories, and transaction types are lookup-driven — manage them in Control Center > Lookup Tables (PETTY_CASH_FUND_TYPE, PETTY_CASH_FUND_STATUS, PETTY_CASH_EXPENSE_CATEGORY). President Delete — for anyone granted accounting.reverse_posted in Access Templates (baseline: President only; delegable to CFO/Finance without a code change via ERP_DANGER_SUB_PERMISSIONS). Per-transaction SAP Storno: POSTED txn is marked VOIDED, its journal entry is reversed, and the fund balance flips back in a single atomic session. Fund delete is gated by the same danger sub-perm — the old hardcoded president-only check was removed so subsidiaries can delegate via the template editor. All actions logged to ErpAuditLog.',
  },
  // Phase G8 (P2-9) — Tasks page guide (Secretary Copilot backing UI).
  'tasks': {
    title: 'Tasks — POA-aligned workspace',
    steps: [
      'Create a task and (optionally) tag it with a Growth Driver + KPI + Goal Period so it lands in the right POA pipeline',
      'Use the [List] tab for day-to-day triage — advanced filters (driver, KPI, period, assignee, date range, text search) narrow the view; the checkboxes enable bulk ops (change status / priority / delete)',
      'Switch to [Gantt] to see timeline bars grouped by the 5 POA drivers (Hospital Accreditation, Product Inclusion, Inventory Optimization, Demand Pull, Price Increase) with revenue-band chips and a Today marker',
      'Switch to [Kanban] to drag cards between OPEN → IN_PROGRESS → BLOCKED → DONE → CANCELLED — drops save instantly and sync the inbox TASKS folder',
      'Switch to [Revenue Bridge] for the POA summary — % done per driver against the PHP 10M increment goal',
      'Owners (responsibility tags like BDM / PRESIDENT / EBDM / OM) render as chips in every view and in the mini-editor — add or remove them without leaving the row',
      'Bulk reassigning many tasks to one person? The inbox will roll them up into one summary row once the per-assignee count exceeds the TASK_BULK_NOTIFY_THRESHOLD lookup (default 5)',
      'Or say "create a task to sign rent renewal Friday" to the Copilot — it drafts + confirms + saves',
    ],
    next: [
      { label: 'AI Agents', path: '/erp/agent-dashboard' },
      { label: 'Control Center', path: '/erp/control-center' },
      { label: 'Inbox (TASKS folder)', path: '/inbox' },
    ],
    tip: 'Growth drivers, KPI codes, owner tags, and bulk-notify threshold are all editable via Control Center → Lookups — no code deploy needed. Tasks remain entity-scoped and outside the approval gate (productivity, not finance).',
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
  // Partner Scorecard slide-out panel (opens from Org Chart by clicking a
  // partner node). Read-only aggregation — the panel itself never writes to
  // the DB. Upstream data comes from CRM (Visit, Doctor.engagement_level) +
  // ERP (SalesLine, Collection, ExpenseEntry). Graduation + weights are
  // lookup-driven via ErpSettings (GRADUATION_CRITERIA, SCORECARD_WEIGHTS),
  // so each subsidiary can calibrate its own bar without code changes.
  'partner-scorecard': {
    title: 'Partner Scorecard — Performance, Graduation & AI Insights',
    steps: [
      'Performance tab — five weighted sub-scores (Visits / Sales / Collections / Efficiency / Engagement) plus an overall 0-100 composite. Weights come from ErpSettings.SCORECARD_WEIGHTS (default 25/25/20/15/15) and are per-entity, so every subsidiary can tune its own formula in Control Center without a code change.',
      'Graduation tab — live checklist of ErpSettings.GRADUATION_CRITERIA (7 defaults: Months Active, VIP Clients Assigned, Monthly Sales ₱, Collection Rate %, Expense/Sales Ratio %, Visit Compliance %, Avg Engagement). Each row shows actual vs target and comparator (≥ / ≤). 100% met = the green "Ready to Graduate" banner fires — your cue to start the subsidiary provisioning conversation.',
      'AI Insights tab — rule-based agent findings (KPI variance, org intelligence, daily briefing) tagged info / warning / critical. Rule-based is the default; paid Claude tier only engages where it clearly unlocks capability (handwriting / narrative). Empty state means the agents have not run yet for this partner.',
      'Data sources are read-only aggregations: CRM Visit + Doctor (assignment + engagement_level), ERP SalesLine (POSTED only), Collection (POSTED), ExpenseEntry (POSTED). The panel is a slide-out — closing or dismissing it never mutates data. Safe to recompute as often as you need.',
      'Monthly snapshots live in erp_partner_scorecards keyed by (person_id, period, entity_id). The trend bars at the bottom pull the last N history rows for this partner, newest on the right. Missing snapshot = "Click Recompute Scores to generate" empty state.',
      'Recompute is admin / president only via the "Recompute Scores" button on the Org Chart header (POST /api/erp/scorecards/compute, gated by roleCheck). BDMs see the last cached snapshot for their own scorecard but cannot trigger a recompute.',
    ],
    next: [
      { label: 'Org Chart', path: '/erp/org-chart' },
      { label: 'ERP Settings (Weights & Criteria)', path: '/erp/control-center?section=erp-settings' },
      { label: 'Agent Dashboard', path: '/erp/agent-dashboard' },
      { label: 'Performance Ranking', path: '/erp/performance-ranking' },
    ],
    tip: 'Subscription-ready by design: GRADUATION_CRITERIA and SCORECARD_WEIGHTS are per-entity ErpSettings so pharma, e-commerce, rental, and F&B subsidiaries can each set their own bar. Raising a graduation target does not invalidate past snapshots — just re-run Recompute Scores and partners re-qualify on the next pass. The panel respects entity isolation via req.entityId; president sees all entities, others see their own.',
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
    title: 'CSI Booklets — Monitoring & Traceability',
    steps: [
      'Record a BIR-registered booklet: code, series start/end, optional ATP number + registered address.',
      'Open a booklet → allocate a small range (typically 3–7 numbers) to a specific BDM. No dates required.',
      'Out-of-town BDMs get allocations so HQ can trace who used which CSI number. Iloilo-based users who use booklets directly do not need allocations — the system simply skips monitoring for them.',
      'Void an unused number (wrong entry, cancelled, torn) ONLY with a scan/photo of the physical copy. This prevents off-book reuse of "voided" numbers.',
      'When a sale posts, the CSI number is auto-marked USED — the BDM\'s available pool updates in real time. If the sale is reopened, the number returns to available.',
    ],
    next: [
      { label: 'Create Sale', path: '/erp/sales/entry' },
      { label: 'View Sales', path: '/erp/sales' },
      { label: 'Access Templates', path: '/erp/control-center?section=access' },
      { label: 'Void Reason Lookup', path: '/erp/control-center?section=lookups' },
    ],
    tip: 'Monitoring only — sales are NEVER blocked by CSI validation. Out-of-range / voided / already-used numbers surface as yellow warnings on validate. Void reasons are lookup-driven (ERP_CSI_VOID_REASONS) so subscribers can customize without code changes. Access is gated by the inventory.csi_booklets sub-permission (Access Templates).',
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

  // ═══ Phase 31 — President Reversal Console ═══
  'president-reversals': {
    title: 'President Reversal Console — SAP Storno across all modules',
    steps: [
      'Pick the Reversible Transactions tab to see POSTED docs across Sales, Collections, Expenses, CALF/PRF, SMER, Car Logbook, GRN, Supplier Invoices, Credit Notes, IC Transfers + Settlements, DR, Income, Payroll, Petty Cash, Sales Goal Plans, and manual JEs.',
      'Filter by document type and date range. The type list is lookup-driven — new modules appear automatically once their handler is registered.',
      'Click "Reverse…" on a row. The modal shows the dependent-doc preview: if any downstream POSTED doc consumed funds/stock (e.g., AP payment on a Supplier Invoice, Collection settling a CSI), you must reverse those first.',
      'Type the reason and DELETE to confirm. SAP Storno reversal posts to the current open period; the original document stays POSTED with a deletion_event_id link.',
      'Switch to the Reversal History tab to audit every prior reversal — actor, timestamp, side effects, reason.',
    ],
    next: [
      { label: 'Approval Hub', path: '/erp/approvals' },
      { label: 'Audit Logs', path: '/erp/audit-logs' },
      { label: 'Period Locks', path: '/erp/period-locks' },
    ],
    tip: 'Reversal entries land in the current period. If the current month is locked for the relevant module, unlock it first or wait. The original period is never modified. VAT (2550Q) and CWT (2307) ledger rows are NOT auto-modified by reversal — they are a finance-owned staging layer. During filing prep, check the finance_tag on any VAT/CWT rows whose source document has been reversed (look for the PRESIDENT_REVERSAL audit entry) and tag them EXCLUDE if they should not be filed, or add a reconciliation note if already filed. Scope: President / Admin / Finance see every entity by default on this page (matches the Sales list and Approval Hub) — append `?entity_id=<id>` to narrow. Non-privileged callers are always pinned to their working entity.',
  },

  // ═══ Phase 28 — Sales Goals & KPI ═══

  salesGoalDashboard: {
    title: 'Sales Goal Dashboard',
    steps: [
      'President creates the annual Sales Goal Plan from the Setup page',
      'Define growth drivers (Hospital Accreditation, Pharmacy/CSR, etc.) with KPI definitions',
      'Assign per-entity and per-BDM sales targets — or let activation auto-enroll every active BDM from People Master',
      'Activate the plan — reference number (SG-{ENTITY}{YYMM}-###) is stamped and targets go visible to BDMs',
      'Click "Compute KPIs" to refresh KPI snapshots from live ERP data (President/Finance only; others are routed through the Approval Hub)',
      'Monitor the BDM leaderboard, incentive tiers, and driver progress — deactivated BDMs are hidden automatically',
      'Scroll to Year-over-Year Trending to compare this year vs last year per BDM + per KPI (SG-5 #28). Needs at least one prior fiscal year of YTD snapshots',
      'Period locks gate writes: Activate/Reopen/Close/Targets-Bulk/Targets-Import are blocked if any month of the plan\'s fiscal year is locked under SALES_GOAL. Compute KPIs and Manual KPI Entry are blocked when the target month is locked. Unlock from Control Center → Period Locks first.',
    ],
    next: [
      { label: 'Goal Setup', path: '/erp/sales-goals/setup' },
      { label: 'Incentive Tracker', path: '/erp/sales-goals/incentives' },
      { label: 'Scenario Planner', path: '/erp/sales-goals/scenario' },
      { label: 'Variance Alerts', path: '/erp/variance-alerts' },
      { label: 'Approval Hub', path: '/erp/approvals' },
      { label: 'My Goals', path: '/erp/sales-goals/my' },
    ],
    tip: 'BDMs see only their own goals. President and delegates with FULL sales_goals access see all BDMs. Non-authorized compute/activate actions route through the Approval Hub (HTTP 202) — check there if a button silently "succeeded" with no data refresh. Status colors (green/amber/red bars + badges) are driven by the STATUS_PALETTE Lookup — rebrand per entity from Control Center → Lookup Tables. Commission accelerators (INCENTIVE_TIER.metadata.accelerator_factor) multiply a tier\'s payout for over-attainment — 1.0× by default (no-op); set > 1.0 per-tier to reward stretch performance.',
  },

  // ═══ Phase SG-4 #22 — Credit Rule Manager ═══
  'credit-rule-manager': {
    title: 'Credit Rules',
    steps: [
      'Each rule says "for sales matching THESE conditions, give THIS BDM THIS percentage of credit"',
      'Conditions are AND-combined — leave fields empty to skip that constraint. Empty rules match every sale (use min/max amount to scope by deal size)',
      'Priority controls evaluation order (lower runs first). Engine assigns credits until total hits 100%; the residual goes to sale.bdm_id (legacy fallback)',
      'When no rule matches a sale, full credit goes to sale.bdm_id — preserves pre-SG-4 behavior on day one',
      'Use Templates (CREDIT_RULE_TEMPLATES lookup) for common shapes: territory primary, product split, key-account override',
      'Deactivating a rule preserves the historical SalesCredit rows it produced — never hard-delete (audit trail)',
      'Engine runs automatically inside salesController.postSaleRow on every sale post — no manual trigger needed. Use the Reassign action on the Sale detail page to re-run after rule edits',
    ],
    next: [
      { label: 'Goal Dashboard', path: '/erp/sales-goals' },
      { label: 'Credit Ledger (this page → Credit Ledger tab)', path: '/erp/credit-rules' },
      { label: 'Lookup Tables', path: '/erp/control-center?section=lookups' },
    ],
    tip: 'Engine never throws into the sales path. If credit assignment fails, the sale still posts and the failure is logged to ErpAuditLog — admins re-run via the Reassign action. Add new templates by creating CREDIT_RULE_TEMPLATES Lookup rows — no code change.',
  },

  // ═══ Phase SG-4 #24 — Dispute Center ═══
  'dispute-center': {
    title: 'Incentive Dispute Center',
    steps: [
      'BDMs file disputes against an IncentivePayout (wrong tier, cap dispute, period mismatch) or a SalesCredit (missing/wrong credit)',
      'OPEN → UNDER_REVIEW (reviewer takes ownership) → RESOLVED_APPROVED or RESOLVED_DENIED → CLOSED',
      'Every transition routes through gateApproval(\'INCENTIVE_DISPUTE\') — non-authorized actions are held in the Approval Hub',
      'RESOLVED_APPROVED on a payout dispute cascades a SAP Storno reversal of the accrual journal (period-lock-respecting). On a credit dispute, appends a negative SalesCredit row',
      'SLA breaches are detected daily by the Dispute SLA Escalator agent (#DSP) — per-state SLA_DAYS configured via the DISPUTE_SLA_DAYS lookup. Breaches show a red SLA badge on the row',
      'Filer can CANCEL their own OPEN dispute (no gate). Once UNDER_REVIEW, only the resolver path applies',
    ],
    next: [
      { label: 'Goal Dashboard', path: '/erp/sales-goals' },
      { label: 'Payout Ledger', path: '/erp/incentive-payouts' },
      { label: 'Approval Hub', path: '/erp/approvals' },
      { label: 'Lookup Tables', path: '/erp/control-center?section=lookups' },
    ],
    tip: 'Dispute typology + SLAs are lookup-driven (INCENTIVE_DISPUTE_TYPE + DISPUTE_SLA_DAYS). Subscribers add new dispute types or tune SLA days per entity without code changes. SLA agent never auto-transitions — resolution is always a human decision.',
  },

  // ═══ Phase SG-5 #26 — Scenario Planner ═══
  scenarioPlanner: {
    title: 'Scenario Planner',
    steps: [
      'Load the active plan automatically — overrides drive a dry-run projection (no DB writes)',
      'Tweak Target Revenue or Baseline Revenue to see how company attainment % recomputes',
      'Adjust per-driver weight mix (must total 100% for a balanced plan — a warning banner flags any mismatch)',
      'Optionally force a per-BDM attainment % to preview tier placement under the stretch scenario',
      'Click Run Simulation — side-by-side "current vs scenario" columns render per BDM + company totals',
      'Accelerator column shows the INCENTIVE_TIER.metadata.accelerator_factor currently applied — set via Control Center → Lookup Tables',
      'Nothing persists. Push the scenario live by editing the plan (Goal Setup) and re-running Compute KPIs from the dashboard',
    ],
    next: [
      { label: 'Goal Dashboard', path: '/erp/sales-goals' },
      { label: 'Goal Setup', path: '/erp/sales-goals/setup' },
      { label: 'Lookup Tables', path: '/erp/control-center?section=lookups' },
    ],
    tip: 'Use this to answer "what if we raised the bar?" or "what if Juan finishes at 120%?" before committing to a new target. Because the engine reuses live computeIncentiveTier + applyTierAccelerator + applyIncentiveCap logic, the forecast matches production accrual math one-for-one — no drift.',
  },

  // ═══ Phase SG-5 #27 — Variance Alert Center ═══
  varianceAlertCenter: {
    title: 'Variance Alert Center',
    steps: [
      'kpiVarianceAgent runs monthly day 2 at 6:00 AM and flags every KPI whose deviation crosses the warning/critical threshold',
      'Each alert persists to VarianceAlert — the cooldown window (VARIANCE_ALERT_COOLDOWN_DAYS, default 7) blocks re-firing the same breach within the window',
      'The Monday 7:00 AM digest agent (kpiVarianceDigestAgent) rolls undelivered alerts into one per-manager email — so persistent low performers do not flood the inbox',
      'BDMs see only their own alerts; managers see their direct reports (via PeopleMaster.reports_to); admin/finance/president see the full queue',
      'Click Resolve once you have acknowledged the signal — optionally jot a short note. Resolved rows stay visible for audit',
      'Retune thresholds per KPI via Control Center → Lookup Tables → KPI_VARIANCE_THRESHOLDS (per-entity, subscription-ready)',
    ],
    next: [
      { label: 'Goal Dashboard', path: '/erp/sales-goals' },
      { label: 'Dispute Center', path: '/erp/disputes' },
      { label: 'Lookup Tables', path: '/erp/control-center?section=lookups' },
    ],
    tip: 'Resolve is a coaching acknowledgement, not a financial op — it does not reverse any journal or payout. If the underlying data is wrong (payout or credit), file a Dispute instead so the reversal flows through the approval gate.',
  },

  // ═══ Phase SG-3R — KPI Template Library ═══
  kpiTemplateManager: {
    title: 'KPI Template Library',
    steps: [
      'Create a template set name (e.g. "VIP FY2026 Base") that groups KPI defaults you want to reuse across plans or subsidiaries',
      'Add one row per (driver, KPI) — picking from existing GROWTH_DRIVER and KPI_CODE Lookup entries. Labels + units auto-fill from the KPI lookup; override if you need entity-specific phrasing',
      'Set a default target and sort order per row. Mark a row inactive to hide it from plan-creation expansion without losing the row',
      'When you create a new Sales Goal Plan, pass template_name (or template_id) in the POST body — plan creation will expand the template into growth_drivers[].kpi_definitions[]',
      'Combine with the GROWTH_DRIVER lookup metadata (default_kpi_codes + default_weight) for zero-typing onboarding of new subsidiaries',
      'The plan owns its copy after creation — editing the template later never mutates existing plans (SAP Commissions "events are immutable" posture)',
    ],
    next: [
      { label: 'Goal Setup', path: '/erp/sales-goals/setup' },
      { label: 'KPI Library', path: '/erp/kpi-library' },
      { label: 'Lookup Tables', path: '/erp/control-center?section=lookups' },
    ],
    tip: 'Templates are per-entity. Each subsidiary can have its own library — copy-paste the same template_name in MG AND CO. with different default targets if needed. Extend GROWTH_DRIVER.metadata.default_kpi_codes in Control Center to add more drivers without code changes.',
  },

  salesGoalSetup: {
    title: 'Sales Goal Plan Setup',
    steps: [
      'Before creating a plan — seed Lookup categories (GROWTH_DRIVER, KPI_CODE, INCENTIVE_TIER, STATUS_PALETTE, SALES_GOAL_ELIGIBLE_ROLES) from Control Center → Lookup Tables. STATUS_PALETTE auto-seeds on first dashboard load if missing.',
      'Fill in Plan Details: fiscal year, plan name, baseline revenue, target revenue, and collection target %',
      'Add Growth Drivers — select driver codes from Lookup GROWTH_DRIVER, then add KPI definitions using codes from Lookup KPI_CODE',
      'Set Entity Targets — the sum should match the plan target revenue (over-allocation is allowed as an execution buffer)',
      'Set BDM Targets manually OR rely on auto-enrollment at activation (creates a target row for every active PeopleMaster person whose person_type is in SALES_GOAL_ELIGIBLE_ROLES)',
      'Define Incentive Programs (optional) — choose whether each program uses tiered rewards',
      'Activate the plan — reference number assigned, all targets go ACTIVE, eligible BDMs auto-enrolled, audit entry written. Non-authorized submitters are held in the Approval Hub.',
    ],
    next: [
      { label: 'Goal Dashboard', path: '/erp/sales-goals' },
      { label: 'Lookup Tables', path: '/erp/control-center?section=lookups' },
      { label: 'Access Templates', path: '/erp/control-center?section=access-templates' },
      { label: 'Approval Hub', path: '/erp/approvals' },
    ],
    tip: 'To extend auto-enrollment to new sales roles (SALES_REP, SALES_MANAGER, TERRITORY_MANAGER, etc.) add the person_type code to the SALES_GOAL_ELIGIBLE_ROLES lookup — zero code change. Re-activating an existing plan is idempotent (only missing BDMs are added).',
  },

  salesGoalBdmView: {
    title: 'My Sales Goals',
    steps: [
      'Review your annual sales target and current YTD attainment',
      'Check your incentive tier — see the budget you\'ve earned and what\'s needed for the next tier',
      'Open the "My Payouts" tab to see your earned incentives — accrued, awaiting approval, paid, or reversed',
      'Monitor monthly sales trends to identify patterns and momentum',
      'Review KPIs per growth driver — these indicate the health of your territory',
      'Create action items to drive each growth driver (accreditation, formulary listing, MD engagement)',
      'Enter manual KPI values for metrics the system can\'t auto-compute (e.g., time-to-accreditation)',
    ],
    next: [
      { label: 'Goal Dashboard', path: '/erp/sales-goals' },
      { label: 'Incentive Tracker', path: '/erp/sales-goals/incentives' },
      { label: 'Payout Ledger', path: '/erp/incentive-payouts' },
      { label: 'My Sales', path: '/erp/sales' },
    ],
    tip: 'Complete action items consistently — they drive the KPIs that determine your incentive tier. Your target appears automatically once the president activates the annual plan; no manual enrollment is needed. Payouts accrue automatically once YTD attainment hits a tier threshold — the amount posts to the GL as Incentive Expense DR / Incentive Accrual CR, capped by your CompProfile if CASH-type + cap is set.',
  },

  // ═══ Phase SG-Q2 W3 — My Compensation tab on BDM view ═══

  salesGoalCompensation: {
    title: 'My Compensation Statement',
    steps: [
      'Earned — total incentive credited this fiscal year (ACCRUED + APPROVED + PAID)',
      'Accrued — credited but not yet authority-approved; sits in the Approval Hub',
      'Paid — settled via a settlement journal entry; cash already moved through your funding COA',
      'Adjustments — sum of CompProfile cap reductions + reversed payouts (transparency for what was clawed back or capped)',
      'Tier context shows your current YTD attainment, current tier, and FY-end projected tier',
      'Click "Print / Save as PDF" — opens the printable statement; use your browser\'s Print menu to save as PDF',
    ],
    next: [
      { label: 'Goal Detail', path: '/erp/sales-goals/my' },
      { label: 'Payout Ledger', path: '/erp/incentive-payouts' },
      { label: 'Notification Preferences', path: '/notifications/preferences' },
    ],
    tip: 'The statement is a live read of the Sales Goal incentive ledger — generated on demand, no caching, no stale snapshots. Tier milestone notifications fire to you, your manager, and the President when a payout accrues; opt out per-channel via Notification Preferences (compensationAlerts switch). The printable HTML is also subscriber-brandable via the COMP_STATEMENT_TEMPLATE Lookup category — admins set HEADER_TITLE / DISCLAIMER / SIGNATORY_TITLE per entity from Control Center → Lookup Tables.',
  },

  // ═══ Phase SG-Q2 W2 — Incentive Payout Ledger ═══

  incentivePayoutLedger: {
    title: 'Incentive Payout Ledger',
    steps: [
      'Payouts are created automatically when a BDM qualifies for a tier during YTD KPI snapshot computation',
      'Each ACCRUED row has a linked journal entry (DR Incentive Expense / CR Incentive Accrual) — audit-visible, period-locked',
      'Finance/President reviews accrued payouts and clicks "Approve" to lock the amount (no JE posted at approval)',
      'Click "Pay" on an APPROVED (or ACCRUED) payout → settlement JE posts (DR Incentive Accrual / CR funding COA) and status → PAID',
      'If a payout is wrong (miscalculated, tier changed, dispute upheld), click "Reverse" with a reason — a SAP-Storno reversal JE posts and status → REVERSED',
      'Filter by BDM, period, status, or fiscal year. Use the "Payable" view for payroll-batch consumption.',
    ],
    next: [
      { label: 'Goal Dashboard', path: '/erp/sales-goals' },
      { label: 'Incentive Tracker', path: '/erp/sales-goals/incentives' },
      { label: 'Approval Hub', path: '/erp/approvals' },
      { label: 'Period Locks', path: '/erp/period-locks' },
      { label: 'ERP Settings (COA)', path: '/erp/settings' },
    ],
    tip: 'Accrual/settlement/reversal COA codes come from Settings.COA_MAP.INCENTIVE_EXPENSE / INCENTIVE_ACCRUAL — subscriber-configurable via ERP Settings (validated against Chart of Accounts). Approve/Pay/Reverse are gated by gateApproval(module: INCENTIVE_PAYOUT, category: FINANCIAL) — non-authorized submitters are routed to the Approval Hub (HTTP 202). Reversal posts into the CURRENT period (SAP Storno); if the current period is locked, unlock it first. Sub-permissions: sales_goals.payout_view / payout_approve / payout_pay / payout_reverse — delegate via Access Templates.',
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

  // ═══ Phase SG-6 #29 — SOX Control Matrix ═══
  soxControlMatrix: {
    title: 'SOX Control Matrix',
    steps: [
      'Pick an audit window (default 90 days) — the matrix enumerates every Sales Goal state change and reads the LIVE authorization posture from Control Center lookups',
      'Each row shows: the operation + description + live allowed roles (MODULE_DEFAULT_ROLES) + approval category + required sub-permission + activity count + actors in the window + emitted integration event',
      'The Segregation-of-Duties panel flags any user who both CREATED and POSTED/APPROVED/PAID/REVERSED the same document — small-team overlap is common, but auditors want to see the pattern',
      'The Integration Event Registry panel shows every event Sales Goal emits + how many listeners each has. Zero listeners = no subscriber wired yet (drop-in without SG code changes)',
      'Click Print / Save as PDF for a point-in-time control report — subscribers brand the header via COMP_STATEMENT_TEMPLATE lookups if desired',
      'To change who can perform any operation, edit the MODULE_DEFAULT_ROLES row (Control Center → Lookup Tables) — the matrix reflects the change on next refresh',
    ],
    next: [
      { label: 'Goal Dashboard', path: '/erp/sales-goals' },
      { label: 'Lookup Tables', path: '/erp/control-center?section=lookups' },
      { label: 'Approval Hub', path: '/erp/approvals' },
      { label: 'Access Templates', path: '/erp/control-center?section=access-templates' },
    ],
    tip: 'This matrix NEVER governs access — it just REPORTS on the live authorization posture so SOX auditors can confirm controls are in place. Changing a row here would defeat the purpose. To actually tighten/open a control, edit the underlying lookup (e.g. MODULE_DEFAULT_ROLES.SALES_GOAL_PLAN.metadata.roles = null for open-post). The matrix will immediately reflect the new setting.',
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
        {PAGES_WITH_REJECTION_FLOW.has(pageKey) && (
          <div className="wfg-tip" style={{ color: '#991b1b' }}>⚠ {REJECTION_FOOTER_NOTE}</div>
        )}
      </div>
    </>
  );
}
 
