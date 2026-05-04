/**
 * PageGuide — CRM Helper Banner
 *
 * Contextual guide banner for CRM pages.
 * Shows what the page is for, numbered steps, and next-step links.
 * Dismissible per session via sessionStorage.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const styles = `
  .pg { background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%); border: 1px solid #bfdbfe; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; position: relative; font-size: 12px; line-height: 1.7; }
  .pg-dismiss { position: absolute; top: 8px; right: 10px; background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 6px; border-radius: 4px; }
  .pg-dismiss:hover { background: #dbeafe; color: #1e40af; }
  .pg-title { font-size: 13px; font-weight: 700; color: #1e40af; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
  .pg-title svg { width: 16px; height: 16px; }
  .pg-steps { display: flex; flex-direction: column; gap: 3px; }
  .pg-step { display: flex; align-items: flex-start; gap: 6px; color: #334155; }
  .pg-num { background: #2563eb; color: #fff; width: 18px; height: 18px; border-radius: 50%; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
  .pg-next { margin-top: 8px; padding-top: 8px; border-top: 1px solid #bfdbfe; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .pg-next-label { font-weight: 700; color: #1e40af; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
  .pg-link { background: #2563eb; color: #fff; border: none; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; text-decoration: none; }
  .pg-link:hover { background: #1d4ed8; }
  .pg-link-outline { background: transparent; border: 1px solid #bfdbfe; color: #2563eb; }
  .pg-link-outline:hover { background: #eff6ff; }
  .pg-tip { margin-top: 6px; color: #64748b; font-style: italic; font-size: 11px; }
  @media(max-width: 600px) {
    .pg { padding: 12px 12px 10px; font-size: 11px; }
    .pg-title { font-size: 12px; padding-right: 20px; }
    .pg-next { flex-direction: column; align-items: stretch; gap: 6px; }
    .pg-link { width: 100%; text-align: center; padding: 8px 12px; font-size: 12px; }
  }
`;

const PAGE_GUIDES = {
  'admin-dashboard': {
    title: 'Admin Dashboard',
    steps: [
      'View system-wide stats: total BDMs, VIP Clients, visits, and compliance',
      'Monitor recent activity and visit trends across all regions',
      'Use quick-action cards to jump to management pages',
    ],
    next: [
      { label: 'BDM Management', path: '/admin/employees' },
      { label: 'VIP Clients', path: '/admin/doctors' },
      { label: 'Reports', path: '/admin/reports' },
    ],
  },
  'bdm-dashboard': {
    title: 'BDM Dashboard',
    steps: [
      'View your assigned VIP Clients and their visit status for this cycle',
      'Check which VIP Clients are due for a visit this week',
      'Tap a VIP Client to view their profile, then log a visit',
      'You can close the app between clinic visits to save battery — the dashboard caches your VIP Client list locally so the next page (and offline visit logging) still works on weak signal',
      'When you reconnect, queued offline visits sync automatically. You\'ll see a toast ("Synced N visits") and a copy lands in your Inbox so you can audit data spend later',
      'If a queued visit can\'t replay (e.g., photos lost from local storage), a red "Sync errors (N)" badge appears next to your name — tap it to review and discard',
      'New here? Open the Field Guide from the sidebar for the full offline-visit + Partnership-deck walkthrough — bookmark it and revisit before each field day until it\'s second nature',
    ],
    next: [
      { label: 'Log Visit', path: '/bdm/visit/new' },
      { label: 'My Visits', path: '/bdm/visits' },
      { label: 'Call Plan', path: '/bdm/cpt' },
      { label: 'Field Guide', path: '/bdm/field-guide' },
    ],
    tip: 'VIP Clients marked "Due" should be visited this week. "Carried" means a missed visit from a previous week. Visit logging + partnership presentations work offline; financial / approval pages need WiFi or cellular. Open the Field Guide for the full offline workflow reference.',
  },
  'field-guide': {
    title: 'BDM Offline Field Guide',
    steps: [
      'Bookmark this page — it covers offline visit logging, in-person CLM (Start Presentation), remote deck links, photo proof, sync errors, and which pages need WiFi',
      'Read once before your first field day, then revisit any time you forget a step',
      'Sections 1-4 are the everyday workflow; sections 5-7 are the troubleshooting + tips you\'ll want when something looks off',
      'Section 8 covers what admin expects from pilot BDMs during rollout week',
    ],
    next: [
      { label: 'Log Visit', path: '/bdm/visit/new' },
      { label: 'Comm Log', path: '/bdm/comm-log' },
      { label: 'Dashboard', path: '/bdm' },
    ],
    tip: 'Same content lives in docs/BDM-OFFLINE-FIELD-GUIDE.md so admin onboarding for new BDMs uses the same playbook. If something is unclear or wrong on your phone, screenshot it and tell admin via Comm Log.',
  },
  'md-merge': {
    title: 'MD Merge Tool (Canonical De-dup)',
    steps: [
      'Pick a "Duplicate Candidates" group — each row is a Doctor that shares a canonical name key (lastname|firstname) with at least one other live Doctor.',
      'Pick the Winner (the survivor — usually the record with the most visit / CLM / commission history) and the Loser (the absorbed duplicate). The two cannot be the same record.',
      'Click "Preview merge" to see the cascade blast radius — how many Visit / Schedule / ProductAssignment / CommunicationLog / CLMSession / InviteLink / ERP Collection / MdProductRebate / MdCapitationRule / PrfCalf / PatientMdAttribution rows will be re-pointed, and any uniqueness collisions that need defusing.',
      'Add a Reason (required, audit-logged) and click "Merge now". The cascade runs inside a MongoDB transaction when supported (Atlas replica set), then the loser is soft-deleted (mergedInto + isActive=false). Rollback grace is 30 days; daily cron hard-deletes after.',
      'The "Merge History" tab lists past merges with a Rollback button for APPLIED rows. Rollback re-points cascaded FKs back, restores collision sentinels, re-activates deactivated rows.',
    ],
    next: [
      { label: 'VIP Clients', path: '/admin/doctors' },
      { label: 'MD Leads', path: '/admin/md-leads' },
    ],
    tip: 'The unique-index flip on Doctor.vip_client_name_clean (Phase A.5.2) is gated on this tool — until duplicates are merged, the unique constraint cannot be applied. Default role gates: admin + president for view/execute/rollback; president-only for hard-delete (which bypasses the 30-day grace). Subscribers reconfigure per entity via Control Center → Lookup Tables → VIP_CLIENT_LIFECYCLE_ROLES.',
  },
  'md-leads': {
    title: 'MD Partner Leads',
    steps: [
      'Pick a status pill (LEAD / CONTACTED / VISITED / PARTNER / INACTIVE) to filter the pipeline. Counts are tallied client-side from a single fetch.',
      'For each row, the action button advances the MD one step (LEAD → CONTACTED → VISITED → PARTNER) — discovery is automated, conversion is human in-person.',
      'Promoting to PARTNER opens a modal that requires the partner_agreement_date — that\'s gate #2 of the rebate engine (VIP-1.B). Capture the actual signed date for BIR 2307 service-fee framing.',
      'BDMs may transition their own assigned MDs to LEAD/CONTACTED/VISITED/INACTIVE; PARTNER promotion is admin/president-only (lookup-driven via MD_PARTNER_ROLES).',
      'Status pill labels + colors + lead-source labels come from the DOCTOR_PARTNERSHIP_STATUS and DOCTOR_LEAD_SOURCE lookup categories. Subscribers configure them via Control Center → Lookup Tables (no code change needed).',
    ],
    next: [
      { label: 'VIP Clients', path: '/admin/doctors' },
      { label: 'BDMs', path: '/admin/employees' },
    ],
    tip: 'New auto-discovered MDs (Rx OCR + storefront customer attestation, ships in VIP-1.D/E) land here as LEAD. Existing pre-VIP-1.A doctors save as PARTNER on next save (legacy assumption: anyone in CRM is at least at VISITED). Demote via the action menu if wrong.',
  },
  'bir-compliance': {
    title: 'BIR Compliance Dashboard',
    steps: [
      'Set the year filter at the top — the heatmap, deadlines, and recent exports refilter on the chosen year.',
      'Open "Tax Config" to enter the entity TIN, RDO code, business style, VAT registration, and filing email. Address must be complete (street, barangay, city, province, ZIP) for alphalists to import into Alphalist Data Entry.',
      'Click "Run Scan" to refresh the Data Quality strip — it sweeps every Hospital, Customer, Vendor, PeopleMaster, and Doctor for missing TIN / address. BLOCK status means a deadline within 7 days is data-blocked; act on it first.',
      'Use "Drill-down" to see the exact records failing the scan. Have staff fix the missing TIN/address fields, then re-run the scan.',
      'The Filing Heatmap shows every BIR form × period × status. Green = CONFIRMED (BIR receipt parsed from email), blue = FILED, indigo = REVIEWED, yellow = DRAFT, red = OVERDUE or DATA INCOMPLETE.',
      'Click any cell to drill into the form detail page (Phase J1+ surfaces copy-paste boxes for each BIR field). Today (J0) the cells are status indicators only.',
      'When you receive a BIR email confirmation in your inbox, the parser auto-flips the matching cell from FILED to CONFIRMED. If the parser cannot match (subject-line variance), the email lands in the unmatched queue for manual confirmation.',
    ],
    next: [
      { label: 'SC/PWD Sales Book', path: '/erp/scpwd-sales-book' },
      { label: 'Period Locks (ERP)', path: '/erp/period-locks' },
      { label: 'Trial Balance', path: '/erp/accounting' },
    ],
    tip: 'The dashboard is your accountant view — no BIR form ships from VIP CRM directly to BIR (we have no eFPS integration). The deliverable is a copy-paste UX into eBIR Forms for monthly + quarterly forms, .dat files for Alphalist Data Entry (SAWT, QAP, 1604-CF, 1604-E), and PDFs for the loose-leaf Books of Accounts. Phases J1-J7 add the per-form aggregators + serializers; J0 ships the dashboard, data-quality agent, and tax-config UI.',
  },
  'bir-ewt-return': {
    title: 'BIR 1601-EQ / 1606 — Expanded Withholding Tax',
    steps: [
      'Pre-flight: Tax Config must have entity.withholding_active = true (1601-EQ) or rent_withholding_active = true (1606). When OFF the engine writes nothing — the page renders zeros and Schedule is empty. Toggle from BIR Compliance Dashboard → Tax Config.',
      'Engine activates: when an Expense line carries an ATC code (e.g. WI010 5% professional fees) AND the entity is withholding-active, the engine writes a WithholdingLedger row at post time. Same pattern for PRF rent lines + WI160/WC160 + rent_withholding_active.',
      'Threshold flip: WI010 (5%) auto-flips to WI011 (10%) when YTD payout to a payee crosses ₱720k. The flip is per-payee per-year — historical 5% rows stay 5% in alphalist (correct, that\'s what BIR expects).',
      'Each card is one BIR field on the form. Click the copy icon and paste directly into eBIRForms 7.x. Schedule rows below the boxes show per-payee × ATC detail — finance reviews them before signing off.',
      'Per-payee 2307 PDF: each Schedule row in 1601-EQ has a "2307 PDF" button that generates the BIR Form 2307 (Certificate of Creditable Tax Withheld) for that payee × quarter. Send the PDF to the contractor / supplier — they need it for their own income-tax filing.',
      'SAWT (.dat alphalist): use the SAWT toolbar button on the 1601-EQ page to export the BIR Alphalist Data Entry .dat file for the quarter. Import into the Alphalist Data Entry tool (BIR-published software) before submitting the 1601-EQ.',
      'Lifecycle: Export CSV → Mark Reviewed (president) → Mark Filed (bookkeeper, after eBIR submission) → CONFIRMED (auto-flip when BIR email lands, or manual with reference number).',
    ],
    next: [
      { label: 'BIR Compliance Dashboard', path: '/erp/bir' },
      { label: 'Expenses (set ATC code per line)', path: '/erp/expenses' },
      { label: 'PRF / CALF (set ATC on rent PRFs)', path: '/erp/prf-calf' },
    ],
    tip: 'Finance ledger gates: every WithholdingLedger row starts as PENDING. Review under "VAT/EWT Tagging" (Phase G3 surface, /erp/accounting) and tag INCLUDE before exporting CSVs — the aggregator only counts INCLUDE rows. Mirrors the VAT ledger discipline so 1601-EQ totals always match what finance signed off.',
  },
  'bir-comp-return': {
    title: 'BIR 1601-C — Monthly Compensation Withholding',
    steps: [
      'Pre-flight: this report aggregates COMPENSATION-direction WithholdingLedger rows that the engine emits whenever a Payslip is POSTED (legacy direct-post path in payrollController + cascade path through the Approval Hub). If you see zero employees, post a payroll first — there\'s no separate switch to flip per Phase J3.',
      'Bucket layout (BIR ATC codes): WI100 = regular taxable compensation (gross + tax via graduated tax tables in payslipCalc.js); WC120 = 13th-month + bonuses excess of ₱90k (gross only — its tax was already counted in the WI100 row\'s withheld); WMWE = minimum wage earners (gross only, structurally exempt under TRAIN / RA 10963). The bottom Total Net Taxable Compensation = WI100 gross + WC120 gross (excludes the MWE pool).',
      'Per-employee schedule below the boxes shows each PeopleMaster employee × ATC bucket — drill in if a total looks off. The 13th-month exemption threshold (₱90k) is configurable per entity via Settings COMPENSATION_13TH_MONTH_EXEMPT for subscribers in jurisdictions with different thresholds (subscription-ready per Rule #19).',
      'Each card is one BIR field. Click the copy icon and paste directly into eBIRForms 7.x for the 1601-C return. Tax computation already happened inside payslipCalc — this report just surfaces the totals the engine recorded.',
      'No 2307 PDF here — compensation receipts use BIR Form 2316 (annual employee certificate), shipping in Phase J3 Part B alongside 1604-CF. No SAWT here either — SAWT is the EWT alphalist for 1601-EQ (Phase J2), not for compensation.',
      'Lifecycle: Export CSV → Mark Reviewed (president sign-off) → Mark Filed (bookkeeper, after eBIR submission with reference number) → CONFIRMED (auto-flip when BIR confirmation email lands at yourpartner@viosintegrated.net).',
      'MWE classification: an employee is treated as MWE if PeopleMaster.employment_type = "MWE". Engine forces withheld_amount=0 and routes the entire compensation to the WMWE bucket. To revoke MWE status mid-year (e.g., promotion above the minimum wage), update PeopleMaster — the change applies to NEW payslip posts; reopen + repost a closed period to retroactively re-emit (Reversal Console).',
    ],
    next: [
      { label: 'BIR Compliance Dashboard', path: '/erp/bir' },
      { label: 'Payroll (post payslips)', path: '/erp/payroll' },
      { label: '1601-EQ EWT (sibling form)', path: '/erp/bir' },
    ],
    tip: 'The compensation engine is idempotent on payslip._id — re-posting the same payslip (after reopen) deletes prior compensation rows and re-emits. This means partial 1601-C totals after a mid-month reopen are normal until you re-post the affected payslips. The legacy direct-post path AND the cascade Approval Hub path BOTH emit, so a clerk-submitted run cleared by admin produces the same compensation rows as a president-direct post.',
  },
  'bir-vat-return': {
    title: 'BIR 2550M / 2550Q VAT Return',
    steps: [
      'Click "Recompute" if the heatmap looked stale or if you tagged new VAT entries (INCLUDE / EXCLUDE / DEFER) since arriving on this page. The aggregator pulls from VatLedger + SalesBookSCPWD using only INCLUDE-tagged rows.',
      'Each card is one BIR field. Click the copy icon, then paste directly into the matching eBIRForms 7.x box. Vatable Sales (13A) → Output Tax Due (18A) → Input Tax Carryover (20A) + Input Tax Current (20B) → Net VAT Payable (22A) is the order eBIRForms expects.',
      'For a paper trail, click "Export CSV" — it downloads the form with a SHA-256 content hash, refreshes the dashboard heatmap, and appends to the export audit log on this page. The hash matches the X-Content-Hash response header so you can re-verify integrity later.',
      'Once president has reviewed the numbers, click "Mark Reviewed". Bookkeeper then submits via eBIRForms 7.x and clicks "Mark Filed" with the BIR reference number from the eBIR receipt.',
      'Forward the BIR confirmation email to your entity\'s tax filing email (set under Tax Config). The auto-confirm bridge parses the email and flips the status to CONFIRMED. If the parser cannot match (subject-line variance), use "Mark Confirmed" manually with the reference number.',
      'After CONFIRMED, the period locks (PeriodLock module = BIR_FILING). To revise, finance + president must reopen the period.',
    ],
    next: [
      { label: 'BIR Compliance Dashboard', path: '/erp/bir' },
      { label: 'SC/PWD Sales Book', path: '/erp/scpwd-sales-book' },
      { label: 'Period Locks (ERP)', path: '/erp/period-locks' },
    ],
    tip: 'Phase J1 stubs Zero-Rated Sales (14A) and Sales to Government (16A) at 0 — Phase J1.1 wires the customer.vat_status / customer_type joins. If your entity has either, manually adjust the eBIRForms boxes; export CSV still records what was computed, so the audit trail is honest about the J1 surface.',
  },
  'scpwd-sales-book': {
    title: 'SC / PWD Sales Book (BIR-mandated)',
    steps: [
      'Pick the BIR period (year + month) at the top — the table, counts, and exports all filter on the chosen period.',
      'Click "New Entry" to land a SC/PWD transaction. Enter the OSCA / PWD ID + customer name, then add line items (qty × unit price). The 20% discount + 12% VAT-exemption math auto-derives per RA 9994.',
      'Each row starts as DRAFT. Verify the math then click "Post" to commit it to the BIR Sales Book — POSTED rows lock the period\'s totals.',
      'A POSTED row can be voided with a written reason (audit trail). Voids do NOT remove the row from monthly export totals — they show with discount = 0 so BIR auditors can see the reversal trail.',
      '"Export Monthly CSV" produces the BIR RR 7-2010 format Sales Book — Senior Citizen / PWD register. File this with your monthly BIR submission.',
      '"Export VAT Reclaim (DRAFT)" produces a BIR Form 2306 worksheet showing the input VAT recoverable from suppliers. Review with your accredited tax accountant before filing — this is real money owed back from BIR.',
    ],
    next: [
      { label: 'VIP Clients', path: '/admin/doctors' },
      { label: 'Period Locks (ERP)', path: '/erp/period-locks' },
    ],
    tip: 'Once a BIR period is filed and locked (Period Locks page in ERP), retroactive SC/PWD entries are rejected. Default role gates: admin + finance for write/export; admin + finance + president for view. Subscribers configure per entity via Control Center → Lookup Tables → SCPWD_ROLES.',
  },
  'doctors-page': {
    title: 'VIP Client Management',
    steps: [
      'Search and filter VIP Clients by region, specialization, client type, or status',
      'Click a VIP Client to view or edit their full profile',
      'Use the Add button to create new VIP Client records — set Client Type (MD, Pharmacist, etc.) and link Hospital affiliations',
      'Export VIP Clients to Excel using the Call Plan Template format',
      'Use Clean Names to fix ALL CAPS or inconsistent name formatting — preview changes before applying',
    ],
    next: [
      { label: 'BDM Management', path: '/admin/employees' },
      { label: 'Reports', path: '/admin/reports' },
    ],
    tip: 'Client Type distinguishes MDs from other stakeholders (pharmacist, purchaser, administrator). Names are auto-cleaned on new entries and Excel imports. Use Clean Names for existing records.',
  },
  'employees-page': {
    title: 'BDM Management',
    steps: [
      'View all BDMs with their assigned regions and status',
      'Create new BDM accounts or edit existing ones',
      'Assign regions to control which VIP Clients each BDM can access',
      'Configure entity and ERP access settings per BDM',
    ],
    next: [
      { label: 'VIP Clients', path: '/admin/doctors' },
      { label: 'Reports', path: '/admin/reports' },
    ],
    tip: 'BDMs can only see VIP Clients assigned to them. Use the Entity/ERP access section to configure module access.',
  },
  'reports-page': {
    title: 'BDM Visit Reports',
    steps: [
      'Select a BDM and date range to generate the visit report',
      'Review the Call Plan Template grid showing visit compliance',
      'Export to Excel or CSV for sharing with management',
    ],
    next: [
      { label: 'BDM Management', path: '/admin/employees' },
      { label: 'VIP Clients', path: '/admin/doctors' },
    ],
  },
  'my-visits': {
    title: 'My Visits',
    steps: [
      'View your visit history with search and date filters',
      'Click a visit to see details, photos, and GPS data',
      'Use filters to find visits by VIP Client name or date range',
    ],
    next: [
      { label: 'Log New Visit', path: '/bdm/visit/new' },
      { label: 'Dashboard', path: '/bdm' },
    ],
  },
  'new-visit': {
    title: 'Log a Visit',
    steps: [
      'Select the VIP Client you are visiting from the dropdown',
      'Capture at least one photo as proof of visit (1-10 photos)',
      'GPS location is captured automatically — ensure location services are on',
      'Select products discussed and add any notes',
      'Tap "Start Presentation" (after picking products) to walk the VIP Client through the partnership deck — both the visit and the pitch are linked automatically',
      'Submit the visit — it will be validated against weekly/monthly limits',
    ],
    next: [
      { label: 'My Visits', path: '/bdm/visits' },
      { label: 'Dashboard', path: '/bdm' },
    ],
    tip: 'Offline-friendly: photos and form fields auto-save while you work. Submit while offline to queue the visit; it syncs automatically when you reconnect (you\'ll see a toast + an audit entry in your Inbox showing how much mobile data was used). If the VIP Client doesn\'t appear in the offline picker, open them once while online so the dashboard caches the profile. Maximum one visit per VIP Client per week.',
  },
  'call-plan': {
    title: 'Call Plan (CPT)',
    steps: [
      'View the 4-week schedule grid showing your assigned VIP Clients',
      'Check visit status: completed, due, carried, or missed',
      'Plan your daily visits based on the schedule and carried visits',
      'Export the CPT to Excel for offline reference',
    ],
    next: [
      { label: 'Log Visit', path: '/bdm/visit/new' },
      { label: 'My Visits', path: '/bdm/visits' },
    ],
    tip: 'Carried visits from previous weeks should be cleared before the cycle ends (W4D5).',
  },
  'products-page': {
    title: 'Product Management',
    steps: [
      'View all products from the product catalog',
      'Search by brand name, generic name, or category',
      'Manage product-to-VIP Client assignments',
    ],
    next: [
      { label: 'VIP Clients', path: '/admin/doctors' },
      { label: 'Dashboard', path: '/admin' },
    ],
  },
  'settings-page': {
    title: 'System Settings',
    steps: [
      'Configure system-wide settings for programs, specializations, and support types',
      'Use the tabs to switch between different setting categories',
      'Changes take effect immediately for all users',
    ],
    next: [
      { label: 'Dashboard', path: '/admin' },
    ],
  },
  'doctor-detail': {
    title: 'VIP Client Profile',
    steps: [
      'Review the VIP Client\'s complete profile and visit history',
      'Check assigned products and engagement level',
      'View Hospital Context (HEAT data) — purchaser, pharmacist, decision maker, and engagement level for linked hospitals',
      'Log a visit directly from this page',
    ],
    next: [
      { label: 'Log Visit', path: '/bdm/visit/new' },
      { label: 'Dashboard', path: '/bdm' },
    ],
    tip: 'Hospital HEAT data appears automatically when a VIP Client has hospital affiliations set by admin.',
  },
  'inbox': {
    title: 'Unified Inbox',
    steps: [
      'Folders on the left group everything: Approvals, Tasks, Executive Brief, AI Agents, Announcements, Chat. The red dot is "Action Required" — items waiting on your click ([Approve] / [Resolve] / [Mark done]). An amber ⚑ count on the Inbox folder means messages are awaiting your acknowledgement.',
      'Click a row to read it. Replies appear inline as a threaded conversation — approve/decision/reopen events all fold into the same thread by approval request.',
      'Executive Brief (Phase G9.R11) = high-signal daily reads (morning brief, FP&A forecast, procurement scorecard, expansion readiness). Split out from AI Agents so the briefs you read every morning don\'t get buried under operational noise.',
      'AI Agents folder = lower-signal agent findings (compliance alerts, KPI variance, ai_alerts, inventory reorder, proxy SLA, data-quality digests). When inside the folder, use the Priority chips above the list to scan High / Important first.',
      'Archive is per-recipient: archiving a message only hides it from your own inbox — senders still see it in their Sent folder and other recipients are unaffected (Gmail-style).',
      'Flagged messages show an amber "⚑ Ack required" banner. Hit "I acknowledge" before approving/rejecting/resolving — that button is gated until you confirm you have read the message. Admin/president/ceo + sender can click "Read receipts" to see who has acknowledged and who is still pending.',
      'Bulk mode: use "Select" in the list toolbar to tick several rows then "Archive selected" in one shot. "Mark all read" flips every unread message in the current folder so the counter clears.',
      'Tasks open with a mini-editor so you can change status / due date / assignee inline. Need the full Gantt / Kanban view? Use the "Open full page" button.',
      'New message? Hit "+ New" to send a direct message or broadcast — backend enforces who can DM whom via the messaging.* sub-permissions and the MESSAGE_ACCESS_ROLES lookup. Admin/president can require acknowledgement on the compose modal; the tri-state default is driven by INBOX_ACK_DEFAULTS (see Control Center → Inbox Retention).',
      'Per-role folder visibility (Phase G9.R9 + R11): your role may have folders hidden via INBOX_HIDDEN_FOLDERS_BY_ROLE lookup. By default president has APPROVALS hidden (covered by Approval Hub) and AI_AGENT_REPORTS hidden from the main count (still accessible via direct click). Edit the lookup in Control Center → Lookup Tables to add CEO, hide TASKS for finance, etc.',
    ],
    next: [
      { label: 'Dashboard', path: '/bdm' },
      { label: 'Approvals', path: '/erp/approvals' },
      { label: 'My Tasks', path: '/erp/tasks' },
    ],
    tip: 'The bell in the top navbar shows action-required (red) and unread (blue) totals. Cmd/Ctrl+click any item to open it in a new tab. Old archived/read messages auto-purge via the nightly Inbox Retention agent — admins tune windows per entity in Control Center → Inbox Retention.',
  },
  'gps-verification': {
    title: 'GPS Verification',
    steps: [
      'Review BDM visit locations against clinic GPS coordinates',
      'Visits within the configured threshold are marked VERIFIED (green)',
      'Visits beyond the threshold are flagged SUSPICIOUS (red) for further review',
      'Click a visit to see both locations on the map with distance line',
    ],
    next: [
      { label: 'Reports', path: '/admin/reports' },
      { label: 'Activity Monitor', path: '/admin/activity' },
    ],
    tip: 'Distance is calculated using GPS from the BDM\'s photo and the clinic\'s registered coordinates. The threshold can be adjusted in ERP Settings.',
  },
  'activity-monitor': {
    title: 'Activity Monitor',
    steps: [
      'View real-time system activity: visits logged, logins, and auth events',
      'Use filters to narrow by activity type or date range',
      'Click any activity for detailed information (photos, GPS, device info)',
      'Stats refresh automatically every 60 seconds',
    ],
    next: [
      { label: 'GPS Verification', path: '/admin/gps-verification' },
      { label: 'Reports', path: '/admin/reports' },
    ],
    tip: 'The feed shows today\'s activity by default. Use date filters to review historical data.',
  },
  'statistics-page': {
    title: 'Statistics & Analytics',
    steps: [
      'Team Activity tab is the COO daily-scan surface — one row per BDM with today / this week / this month / cycle counts, last-visit recency, and a 🚩 red flag for BDMs idle ≥ 2 work days. Click a row to drill into that BDM\'s DCR.',
      'Overview tab shows system-wide compliance rate and a per-BDM call rate chart — click any bar to drill into that BDM\'s DCR (Apr 2026 wiring).',
      'BDM Performance tab lets you drill into any BDM\'s DCR summary by cycle (auto-loaded when you drill in from Team Activity or Overview).',
      'Programs tab shows program and support type coverage across VIP Clients.',
      'Products tab shows which products are being presented most and by which BDMs.',
      'Daily Heatmap tab shows visit intensity across all BDMs and working days in one grid.',
      'CLM Performance tab is the pitch-coaching surface — per-BDM × per-slide × per-product matrix over the last 90 days. Status pill ("on track" / "short" / "coach" / "new BDM") flags BDMs rushing through the deck or missing the conversion threshold. Click any BDM row to drill into their DCR.',
    ],
    next: [
      { label: 'Reports', path: '/admin/reports' },
      { label: 'Activity Monitor', path: '/admin/activity' },
    ],
    tip: 'Threshold lookups are subscriber-tunable in Control Center → Lookup Tables: TEAM_ACTIVITY_THRESHOLDS for the red-flag rule, CLM_PERFORMANCE_THRESHOLDS for pitch dwell + conversion floors. No code deploy required.',
  },
  'communication-log': {
    title: 'Communication Log',
    steps: [
      'Tap "Generate Deck Link" to create a shareable partnership presentation URL — paste it into Viber/Messenger/WhatsApp so a remote VIP Client can view the slides without logging in',
      'Tap "Log Interaction" to record a Viber, Messenger, WhatsApp, Email, or Google Chat conversation',
      'Select the VIP Client or Regular Client you contacted',
      'Choose the channel used and attach 1-10 screenshots as proof',
      'Use the "Send Message" tab to message clients directly from here',
      'View your interaction history filtered by channel or date',
    ],
    next: [
      { label: 'Log Visit', path: '/bdm/visit/new' },
      { label: 'My Visits', path: '/bdm/visits' },
      { label: 'Dashboard', path: '/bdm' },
    ],
    tip: 'Generated deck links are anonymous + read-only. The VIP Client opens the URL on any browser — no login required. If you log a CommLog right after generating a link, the two records are joined automatically for analytics.',
  },
  'admin-communication-logs': {
    title: 'Communication Logs Overview',
    steps: [
      'View all BDM interactions with VIP and Regular Clients across channels',
      'Filter by BDM, channel (Viber/Messenger/Email/Google Chat), or date range',
      'Review screenshots and message content for each interaction',
      'API-sent messages show delivery status (sent/delivered/read)',
    ],
    next: [
      { label: 'Reports', path: '/admin/reports' },
      { label: 'Statistics', path: '/admin/statistics' },
      { label: 'Msg Templates', path: '/admin/message-templates' },
    ],
  },
  'admin-invites': {
    title: 'Invite Triage (Phase M1)',
    steps: [
      'Review invite links BDMs have generated for VIP Clients — see who has replied (converted) and who is still pending (sent/opened)',
      'For unconverted invites, nudge the BDM to follow up via SMS or personal contact',
      'Status: Sent = link generated but not opened · Opened = MD tapped but did not message · Converted = MD replied, channel ID auto-linked',
      'Filter by status or channel to focus on Messenger-only pending invites, for example',
    ],
    tips: [
      'Invites expire after 180 days automatically',
      'Once an MD replies, their Messenger / Viber ID auto-links to their profile via the `ref=doc_<id>` param — no manual entry needed',
      'M2 (campaigns) is blocked until NPC registration is filed — this triage page only covers 1:1 invite-and-reply',
    ],
    next: [
      { label: 'VIP Clients', path: '/admin/doctors' },
      { label: 'Comm Logs', path: '/admin/comm-logs' },
      { label: 'Msg Templates', path: '/admin/message-templates' },
    ],
  },
  'message-templates': {
    title: 'Message Templates',
    steps: [
      'Create reusable message templates for BDMs to send in one click',
      'Use {{variables}} like {{firstName}}, {{lastName}}, {{fullName}} for personalization',
      'Set channel restrictions (WhatsApp, Viber, Messenger, Email) or leave empty for all',
      'Assign categories (from Control Center lookups) to organize templates',
      'Toggle templates active/inactive — BDMs only see active templates',
    ],
    tips: [
      'BDMs see the Template tab in their Communication Log > Send Message panel',
      'Template categories are lookup-driven (MSG_TEMPLATE_CATEGORY) — add new ones from Control Center',
      'Auto-reply messages for after-hours are configured in ERP Settings, not here',
    ],
    next: [
      { label: 'Comm Logs', path: '/admin/comm-logs' },
      { label: 'VIP Clients', path: '/admin/doctors' },
      { label: 'BDMs', path: '/admin/employees' },
    ],
  },
  'bdm-visits': {
    title: 'BDM Visit History',
    steps: [
      'Select a BDM from the dropdown to view their visit history',
      'Filter by date range, visit type (VIP or Regular), or status',
      'Click any visit row to see full details — photos, GPS, engagement types',
      'Use the summary cards at top to see total visits, compliance rate, and carried count',
    ],
    next: [
      { label: 'Reports', path: '/admin/reports' },
      { label: 'Statistics', path: '/admin/statistics' },
    ],
    tip: 'This page shows both VIP Client visits and Regular Client visits for the selected BDM.',
  },
  'new-client-visit': {
    title: 'Log Regular Client Visit',
    steps: [
      'Select the Regular Client you are visiting from the dropdown',
      'Capture at least one photo as proof of visit',
      'GPS location is captured automatically — ensure location services are on',
      'Select engagement types and add notes about the interaction',
      'Submit — monthly limits are enforced based on the client\'s visit frequency',
    ],
    next: [
      { label: 'My Visits', path: '/bdm/visits' },
      { label: 'Dashboard', path: '/bdm' },
    ],
    tip: 'Regular Clients are non-VIP contacts (pharmacists, purchasers, etc.). Up to 30 extra calls per day allowed.',
  },
  'import-export': {
    title: 'Import / Export',
    steps: [
      'Upload a CPT Excel file — the system parses all 23 sheets and stages the data',
      'Review the parsed batch: check VIP Client names, schedules, and duplicate warnings',
      'Approve the batch to create VIP Client profiles + 4-week schedules automatically',
      'Reject with a reason if the data needs corrections from the BDM',
      'Export current VIP Clients to Excel using the Call Plan Template format',
    ],
    next: [
      { label: 'VIP Clients', path: '/admin/doctors' },
      { label: 'BDM Management', path: '/admin/employees' },
    ],
    tip: 'Duplicate detection uses lastName + firstName (case-insensitive). Existing VIP Clients are updated, not duplicated.',
  },
  'photo-audit': {
    title: 'Photo Audit',
    steps: [
      'Review visit photos for authenticity — check for duplicates, screenshots, or stock images',
      'Filter by BDM, date range, or flag status (flagged, cleared, pending)',
      'Click a photo to see full-size image with GPS metadata and timestamp',
      'Flag suspicious photos with a reason — the BDM will be notified',
      'Clear flagged photos after BDM provides explanation',
    ],
    next: [
      { label: 'GPS Verification', path: '/admin/gps-verification' },
      { label: 'Activity Monitor', path: '/admin/activity' },
    ],
    tip: 'The AI Photo Audit agent runs nightly to auto-flag duplicates and anomalies. Review its findings here.',
  },
  'my-performance': {
    title: 'My Performance',
    steps: [
      'View your DCR (Daily Call Report) summary for the current cycle',
      'Check your call rate, compliance percentage, and visit trends',
      'Review the weekly breakdown to see which weeks had missed visits',
      'Compare your performance against team averages in the chart',
    ],
    next: [
      { label: 'Call Plan', path: '/bdm/cpt' },
      { label: 'My Visits', path: '/bdm/visits' },
    ],
    tip: 'Call rate = total visits / expected visits. Aim for 100% compliance each cycle.',
  },
  'product-spec': {
    title: 'Product Specifications',
    steps: [
      'Browse products grouped by specialization or therapeutic category',
      'Search by brand name, generic name, or category',
      'Tap a product card to view full details — dosage, indications, and presentation images',
      'Use this as a reference when discussing products with VIP Clients during visits',
    ],
    next: [
      { label: 'Log Visit', path: '/bdm/visit/new' },
      { label: 'Dashboard', path: '/bdm' },
    ],
    tip: 'Product images are optimized for tablet display. Show the detail view to VIP Clients during presentations.',
  },
  'schedule': {
    title: '4-Week Schedule',
    steps: [
      'View your assigned VIP Clients mapped to the 4-week visit cycle (W1-W4)',
      'Each cell shows the VIP Client name and visit status (due, completed, carried, missed)',
      'Click a cell to navigate to the VIP Client profile or log a visit',
      'Carried visits from earlier weeks appear in yellow — clear them before the cycle ends',
    ],
    next: [
      { label: 'Call Plan', path: '/bdm/cpt' },
      { label: 'Log Visit', path: '/bdm/visit/new' },
    ],
    tip: 'The cycle anchors to Jan 5, 2026 and repeats every 4 weeks. W4D5 (Friday) is the hard cutoff for carried visits.',
  },
  'sent-messages': {
    title: 'Sent Messages',
    steps: [
      'View all messages sent by Admin to BDMs with delivery status',
      'Filter by recipient BDM, category, priority, or date range',
      'Click a message to see read/unread status per recipient',
    ],
    next: [
      { label: 'Msg Templates', path: '/admin/message-templates' },
      { label: 'BDM Management', path: '/admin/employees' },
    ],
  },
  'notification-preferences': {
    title: 'Notification Preferences',
    steps: [
      'Toggle email notifications on/off for different event types',
      'Configure weekly compliance summary delivery (every Monday)',
      'Set push notification preferences for real-time alerts',
      'Changes are saved automatically when you toggle a switch',
    ],
    next: [
      { label: 'Dashboard', path: '/bdm' },
    ],
    tip: 'Email notifications require a valid email address on your profile. Push notifications require browser permission.',
  },
  'partnership-clm': {
    title: 'Partnership Presentation (CLM)',
    steps: [
      'Pick the VIP Client you are pitching to and the products you plan to feature',
      'Tap "Start Presentation" to go full-screen — swipe left/right to navigate slides',
      'Show the QR on the final slide so the VIP Client can message you on Messenger',
      'On Session Complete, fill Interest Level + Outcome + Notes (all required) — then Save Session forwards you to Visit Logger to take the proof selfie',
      'Skip is allowed if the client is leaving — but Visit Submit stays blocked with a red banner until you Resume CLM and Save this session (Notes-required gate)',
      'Review your past sessions in the History tab',
    ],
    next: [
      { label: 'My Visits', path: '/bdm/visits' },
      { label: 'Dashboard', path: '/bdm' },
    ],
    tip: 'Each product you select shows on slide 5. Mark which ones the VIP Client was interested in before ending the session. Save Session is disabled until Notes is filled (Interest defaults to 3, Outcome to "maybe", Follow-up Date is optional). If you Skip, the visit page will show a red "CLM session not finalized" banner — click "Resume CLM session" to come back here and Save. Skipping products entirely is fine — slide 5 shows a neutral empty-state card. Offline drafts sync when connectivity returns. If you re-enter an in-progress session you will see a "Resuming in-progress CLM session" toast.',
  },
  'clm-sessions-admin': {
    title: 'CLM Sessions Overview',
    steps: [
      'View every BDM partnership pitch with duration, slides viewed, and QR conversion',
      'Filter by BDM, date range, or outcome to audit field activity',
      'Drill into a session to see slide-by-slide engagement and product interest',
      'Use the analytics summary for conversion rate and top-performing BDMs',
    ],
    next: [
      { label: 'Statistics', path: '/admin/statistics' },
      { label: 'BDM Management', path: '/admin/employees' },
      { label: 'CLM Branding', path: '/admin/clm-branding' },
    ],
  },
  'clm-branding': {
    title: 'CLM Branding & Identity',
    steps: [
      'Upload your circular logo (shown on hero + connect slides) — PNG or JPEG, max 15 MB',
      'Upload your trademark logo (shown on the presentation top bar) — PNG or JPEG recommended',
      'Edit your company name, website URL, sales email, phone, and primary brand color (hex)',
      'Open the Slide Content tab to edit pitch copy: 3 pillars, 4 opportunity cards, 4 integrity cards, hero subtitle, connect messaging',
      'Preview updates live on the Preview tab before saving — changes apply to every BDM in this entity',
    ],
    next: [
      { label: 'CLM Sessions', path: '/admin/clm-sessions' },
      { label: 'Entity Settings', path: '/admin/control-center' },
    ],
    tip: 'Leave any field blank to fall back to a neutral placeholder. Each entity has its own branding — subsidiaries and subscribers configure their own identity without a code deploy. Upload both logos before your first BDM pitch to avoid blank placeholders on the deck.',
  },
  // ── Phase VIP-1.B Phase 4 ─────────────────────────────────────────────
  'rebate-matrix': {
    title: 'Tier-A MD Product Rebate Matrix',
    steps: [
      'List shows active MdProductRebate rows (one per MD × Hospital × Product). Switch the filter to see inactive / superseded rows.',
      'Click Add Rule to seed a new (MD × Hospital × Product × %) row. Phase R1 added Hospital as a required match dimension — same MD at different hospitals routinely has different rates (separate MOA per institution).',
      'The 3-gate validator enforces: PARTNER status + signed agreement_date + rebate_pct ≤ Settings.MAX_MD_REBATE_PCT (default 25%). Only MDs (clientType=MD) appear in the picker; pharmacists/admin go on the Non-MD form.',
      'Failures surface the schema error verbatim — fix the underlying gate (promote MD via /admin/md-leads, set agreement date, or raise the ceiling via Control Center → Settings).',
      'Hospital options come from the selected MD\'s hospitals[] array on the VIP Client profile. If the MD has none, add at least one before creating a rule.',
      'Multiple rules at the same (MD, hospital, product) all earn full % independently — no winner-take-all.',
      'Rules walked at Collection.save → md_rebate_lines auto-populated → Tier-A excludes the line_item from Non-MD partner rebate base when calculation_mode=EXCLUDE_MD_COVERED. All MD Tier-A accruals route to PRF/CALF (single-flow), bir_flag=INTERNAL even after disbursement.',
    ],
    next: [
      { label: 'MD Leads', path: '/admin/md-leads' },
      { label: 'Capitation Rules', path: '/erp/capitation-rules' },
      { label: 'Payout Ledger', path: '/erp/payout-ledger' },
    ],
    tip: 'Tier-A wins over Non-MD partner rebates on overlap when the partner uses EXCLUDE_MD_COVERED (the safe default). If the partner is on TOTAL_COLLECTION, both fire independently — doubled cost, business policy permits.',
  },
  'non-md-rebate-matrix': {
    title: 'Non-MD Partner Rebate Matrix',
    steps: [
      'List shows NonMdPartnerRebateRule rows for non-MD partners (pharmacist, purchaser, administrator, key decision maker). Phase R1 simplified the match grain to per-(partner × hospital).',
      'Partner picker filters by clientType ≠ MD AND partnership_status=PARTNER AND partner_agreement_date ≠ null. MDs belong on the Tier-A form.',
      'Hospital is REQUIRED. Auto-fills from the partner\'s hospitals[] when there\'s exactly one; pickable when multiple. Add hospital affiliations on the VIP Client profile.',
      'Choose calculation_mode: EXCLUDE_MD_COVERED (default — base = Σ collected lines NOT covered by MD Tier-A) OR TOTAL_COLLECTION (base = full net_of_vat regardless of MD overlap).',
      'Multiple non-MD partners at the same hospital each earn full % independently per their own mode. No winner-take-all.',
      'Auto-fill at Collection entry: if BDM doesn\'t set partner_tags[].rebate_pct, the matrix fills it from the most-recently-active rule for that (partner, hospital). Manual override is preserved.',
      'All accruals route to PRF/CALF (single-flow), bir_flag=INTERNAL even after disbursement to the partner — internal cost allocation, never on BIR P&L.',
    ],
    next: [
      { label: 'MD Rebate Matrix', path: '/erp/rebate-matrix' },
      { label: 'Payout Ledger', path: '/erp/payout-ledger' },
    ],
    tip: 'Manual rebate_pct on a partner_tags row at Collection entry takes precedence over the matrix. Use this for one-off arrangements.',
  },
  'capitation-rules': {
    title: 'Tier-B MD Capitation Rules',
    steps: [
      'Tier-B = per-patient flat ₱ or % of order. Same 3-gate as Tier-A (PARTNER + signed agreement_date).',
      'Pick MODE = Flat (per qualifying patient) OR % (of order net). Pick Cadence: monthly / quarterly / annually / per-order.',
      'Phase R1 — labels updated: "Rule name" → "Program label", "Frequency window" → "Cadence". Schema unchanged.',
      'Rules apply ONLY to products NOT covered by an active Tier-A rebate for the same MD — the Excluded Products view shows the live exclusion set.',
      'Online Pharmacy only — capitation ACCRUES at Order.paid (storefront — VIP-1.D wires the listener). For now the engine is read-ready; admin can seed rules in advance.',
      'Deactivate stops new accruals; existing PAID payouts are unaffected.',
    ],
    next: [
      { label: 'MD Rebate Matrix', path: '/erp/rebate-matrix' },
      { label: 'Payout Ledger', path: '/erp/payout-ledger' },
    ],
    tip: 'Capitation excels for relationships where the MD steers patients to your pharmacy regardless of the specific product. Tier-A excels for product-specific deals.',
  },
  'commission-matrix': {
    title: 'Staff Commission Matrix',
    steps: [
      'Tabs split rules by payee_role: BDM (field reps), ECOMM_REP (storefront referrers), AREA_BDM (territory leads).',
      'Phase R1 — Payee dropdown filters by role=staff (Phase S2 auth tier; admins don\'t draw commission). Product picker swapped from free-text to ProductMaster (brand + generic + dosage per Rule #4).',
      'Per-line routing: commission attaches to each SalesLine.bdm_id. Multi-product CSIs with multiple BDMs split commission across all of them automatically — no splits configured here.',
      'Add Rule with optional payee_id (blank = matches any staff with that role) + amount band + product/customer/hospital filters.',
      'At Collection entry, BDM commission auto-fills from this matrix; if no rule matches, falls back to legacy CompProfile.commission_rate.',
      'Lower priority breaks ties when multiple rules match (most-specific wins on dimension count).',
      'Manual commission_rate override at the CSI level beats the matrix — Finance retains override authority via COMMISSION_ROLES.OVERRIDE_AUTO_RATES.',
    ],
    next: [
      { label: 'Payout Ledger', path: '/erp/payout-ledger' },
      { label: 'BDM Mgmt', path: '/admin/employees' },
    ],
    tip: 'AREA_BDM accruals require Territory.area_bdm_user_id (not yet wired in this phase — defer until storefront launches).',
  },
  'payout-ledger': {
    title: 'Payout Ledger (Read-only)',
    steps: [
      'Tabs split between Rebate Payouts (RebatePayout collection) and Commission Payouts (CommissionPayout). Both auto-populated by engines.',
      'Filter by status + period + payee. Summary chips at top roll up totals by status × payee_kind / payee_role.',
      'Lifecycle: ACCRUING → READY_TO_PAY (period close) → PAID (after PRF posts). Inline buttons gated by REBATE_ROLES.RUN_MONTHLY_CLOSE / MARK_PAID.',
      'Void requires a reason; voided rows are terminal — re-accrual creates a new row to preserve audit trail.',
      'Each row links back to its source Collection / Order so investigators can trace the rebate to the originating sale.',
    ],
    next: [
      { label: 'PRF / CALF', path: '/erp/prf-calf' },
      { label: 'MD Rebate Matrix', path: '/erp/rebate-matrix' },
    ],
    tip: 'Discrepancy between the ledger and posted PRFs usually means a manual PRF was created outside autoPrfRouting. Check the PRF\'s metadata.auto_generated_by field.',
  },
};

export default function PageGuide({ pageKey, onVisibilityChange }) {
  const navigate = useNavigate();
  const storageKey = `pg_dismiss_${pageKey}`;
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(storageKey) === '1');

  const guide = PAGE_GUIDES[pageKey];

  useEffect(() => {
    if (typeof onVisibilityChange === 'function') {
      onVisibilityChange(Boolean(guide && !dismissed));
    }
  }, [dismissed, guide, onVisibilityChange]);

  const handleDismiss = () => {
    sessionStorage.setItem(storageKey, '1');
    setDismissed(true);
  };

  if (!guide || dismissed) return null;

  return (
    <>
      <style>{styles}</style>
      <div className="pg">
        <button className="pg-dismiss" onClick={handleDismiss} title="Dismiss for this session">&times;</button>
        <div className="pg-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          {guide.title}
        </div>
        <div className="pg-steps">
          {guide.steps.map((step, i) => (
            <div key={i} className="pg-step">
              <span className="pg-num">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
        {guide.next && guide.next.length > 0 && (
          <div className="pg-next">
            <span className="pg-next-label">Next steps:</span>
            {guide.next.map((n, i) => (
              <button key={i} className={`pg-link ${i > 0 ? 'pg-link-outline' : ''}`} onClick={() => navigate(n.path)}>
                {n.label} &rarr;
              </button>
            ))}
          </div>
        )}
        {guide.tip && <div className="pg-tip">{guide.tip}</div>}
      </div>
    </>
  );
}
