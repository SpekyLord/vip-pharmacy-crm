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
    ],
    next: [
      { label: 'Log Visit', path: '/bdm/visit/new' },
      { label: 'My Visits', path: '/bdm/visits' },
      { label: 'Call Plan', path: '/bdm/cpt' },
    ],
    tip: 'VIP Clients marked "Due" should be visited this week. "Carried" means a missed visit from a previous week. Visit logging + partnership presentations work offline; financial / approval pages need WiFi or cellular.',
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
      'Folders on the left group everything: Approvals, Tasks, AI Agents, Announcements, Chat. The red dot is "Action Required" — items waiting on your click ([Approve] / [Resolve] / [Mark done]). An amber ⚑ count on the Inbox folder means messages are awaiting your acknowledgement.',
      'Click a row to read it. Replies appear inline as a threaded conversation — approve/decision/reopen events all fold into the same thread by approval request.',
      'Archive is per-recipient: archiving a message only hides it from your own inbox — senders still see it in their Sent folder and other recipients are unaffected (Gmail-style).',
      'Flagged messages show an amber "⚑ Ack required" banner. Hit "I acknowledge" before approving/rejecting/resolving — that button is gated until you confirm you have read the message. Admin/president/ceo + sender can click "Read receipts" to see who has acknowledged and who is still pending.',
      'Bulk mode: use "Select" in the list toolbar to tick several rows then "Archive selected" in one shot. "Mark all read" flips every unread message in the current folder so the counter clears.',
      'Tasks open with a mini-editor so you can change status / due date / assignee inline. Need the full Gantt / Kanban view? Use the "Open full page" button.',
      'New message? Hit "+ New" to send a direct message or broadcast — backend enforces who can DM whom via the messaging.* sub-permissions and the MESSAGE_ACCESS_ROLES lookup. Admin/president can require acknowledgement on the compose modal; the tri-state default is driven by INBOX_ACK_DEFAULTS (see Control Center → Inbox Retention).',
      'Per-role folder visibility (Phase G9.R9): your role may have folders hidden via INBOX_HIDDEN_FOLDERS_BY_ROLE lookup. By default the president has APPROVALS hidden because Approval Hub already covers them. Edit the lookup in Control Center → Lookup Tables to add CEO, hide TASKS for finance, etc.',
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
      'Overview tab shows system-wide compliance rate and per-BDM call rate chart with team average line',
      'BDM Performance tab lets you drill into any BDM\'s DCR summary by cycle',
      'Programs tab shows program and support type coverage across VIP Clients',
      'Products tab shows which products are being presented most and by which BDMs',
      'Daily Heatmap tab shows visit intensity across all BDMs and working days in one grid',
    ],
    next: [
      { label: 'Reports', path: '/admin/reports' },
      { label: 'Activity Monitor', path: '/admin/activity' },
    ],
    tip: 'Use the Refresh button to pull the latest data. Select a BDM in the Performance tab to see their DCR.',
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
      'End the session to record interest level, outcome, and follow-up date',
      'Review your past sessions in the History tab',
    ],
    next: [
      { label: 'My Visits', path: '/bdm/visits' },
      { label: 'Dashboard', path: '/bdm' },
    ],
    tip: 'Each product you select shows on slide 5. Mark which ones the VIP Client was interested in before ending the session. Skipping products is allowed — slide 5 will show a neutral empty-state card instead of specific products. If offline, your CLM drafts sync automatically when connectivity returns and you\'ll see a confirmation toast + audit entry in your Inbox.',
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
