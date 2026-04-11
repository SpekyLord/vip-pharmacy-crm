/**
 * PageGuide — CRM Helper Banner
 *
 * Contextual guide banner for CRM pages.
 * Shows what the page is for, numbered steps, and next-step links.
 * Dismissible per session via sessionStorage.
 */
import { useState } from 'react';
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
    ],
    next: [
      { label: 'Log Visit', path: '/bdm/visit/new' },
      { label: 'My Visits', path: '/bdm/visits' },
      { label: 'Call Plan', path: '/bdm/cpt' },
    ],
    tip: 'VIP Clients marked "Due" should be visited this week. "Carried" means a missed visit from a previous week.',
  },
  'doctors-page': {
    title: 'VIP Client Management',
    steps: [
      'Search and filter VIP Clients by region, specialization, or status',
      'Click a VIP Client to view or edit their full profile',
      'Use the Add button to create new VIP Client records',
      'Export VIP Clients to Excel using the Call Plan Template format',
    ],
    next: [
      { label: 'BDM Management', path: '/admin/employees' },
      { label: 'Reports', path: '/admin/reports' },
    ],
    tip: 'VIP Clients with visitFrequency=2 alternate weeks (W1+W3 or W2+W4). Frequency=4 means one visit per week.',
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
      { label: 'Regions', path: '/admin/regions' },
    ],
    tip: 'Region assignment is critical — BDMs can only see VIP Clients in their assigned regions.',
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
  'regions-page': {
    title: 'Region Management',
    steps: [
      'View the region hierarchy as a tree structure',
      'Create, edit, or deactivate regions at any level',
      'Click a region to see stats (VIP Client count, BDM assignments)',
    ],
    next: [
      { label: 'BDM Management', path: '/admin/employees' },
      { label: 'VIP Clients', path: '/admin/doctors' },
    ],
    tip: 'Regions cascade downward — assigning a BDM to a parent region gives access to all child regions.',
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
      'Submit the visit — it will be validated against weekly/monthly limits',
    ],
    next: [
      { label: 'My Visits', path: '/bdm/visits' },
      { label: 'Dashboard', path: '/bdm' },
    ],
    tip: 'Maximum one visit per VIP Client per week. Photos and GPS are required for every visit.',
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
      'View scheduled visits and compliance status',
      'Log a visit directly from this page',
    ],
    next: [
      { label: 'Log Visit', path: '/bdm/visit/new' },
      { label: 'Dashboard', path: '/bdm' },
    ],
  },
  'inbox': {
    title: 'Message Inbox',
    steps: [
      'View messages from Admin with priority indicators',
      'Click a message to read the full content',
      'Archive read messages to keep your inbox clean',
    ],
    next: [
      { label: 'Dashboard', path: '/bdm' },
    ],
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
};

export default function PageGuide({ pageKey }) {
  const navigate = useNavigate();
  const storageKey = `pg_dismiss_${pageKey}`;
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(storageKey) === '1');

  const guide = PAGE_GUIDES[pageKey];

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
