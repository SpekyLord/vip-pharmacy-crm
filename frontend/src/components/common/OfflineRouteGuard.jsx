/**
 * OfflineRouteGuard — Phase N offline-first sprint (Apr 27 2026)
 *
 * Wraps a route subtree and short-circuits to a "needs WiFi or cellular"
 * panel when:
 *   - the device is offline (offlineManager.isOnline === false), AND
 *   - the current pathname matches one of the configured
 *     "offline-required" prefixes
 *
 * Configuration is lookup-driven (Rule #3, subscription-readiness) via the
 * OFFLINE_REQUIRED_PATHS lookup category. Each lookup row's `code` is a
 * URL prefix (e.g. `/erp/`, `/admin/control-center`). When the lookup is
 * empty / errors, we fall back to the inline DEFAULT_OFFLINE_REQUIRED list
 * so the page never silently lets BDMs into Expenses while offline because
 * a Lookup outage stripped the guard.
 *
 * Why a single guard, not per-route boilerplate:
 *   - 100+ ERP routes already use ProtectedRoute. Adding a second wrapper
 *     to each line is noise + drift risk (someone adds a new ERP route
 *     and forgets the guard → silent leak).
 *   - The guard reads `useLocation()` once per render and consults the
 *     prefix list. Cheap; no per-page work.
 *   - Subscribers in the future SaaS spin-out can configure their own
 *     "offline-required" set without touching code.
 *
 * Anti-pattern this avoids: making expenses / approvals / settings
 * "offline-capable" by queueing their submits in the SW. Per Apr 27 user
 * decision (feedback_offline_first_globe_data_savings.md): expenses MUST
 * be online — Approval Hub guarantees + double-posting risk make queued
 * financial writes hostile.
 *
 * Children that don't match an offline-required prefix render normally
 * regardless of online state (Visit, CLM, Dashboard, MyVisits all stay
 * fully offline-capable).
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import offlineManager from '../../utils/offlineManager';
import { useLookupOptions } from '../../erp/hooks/useLookups';

// Inline fallback. Order doesn't matter — first matching prefix wins.
// Keep this list narrow: only routes that NEED a server round-trip on
// every interaction belong here. Read-only viewers that could cache a
// snapshot should NOT be here even if they currently fetch live (they
// can be made offline-capable without a behaviour change for online users).
export const DEFAULT_OFFLINE_REQUIRED = Object.freeze([
  '/erp/expenses',
  '/erp/prfcalf',
  '/erp/smer',
  '/erp/car-logbook',
  '/erp/approvals',
  '/erp/control-center',
  '/erp/people',
  '/erp/payroll',
  '/erp/banking',
  '/erp/journal-entries',
  '/erp/period-locks',
  '/erp/sales/entry',
  '/erp/sales/opening-ar',
  '/erp/grn',
  '/erp/undertaking',
  '/erp/dr',
  '/erp/collections',
  '/erp/transfer-orders',
  '/erp/credit-notes',
  '/erp/customers',
  '/erp/vendors',
  '/erp/purchase-orders',
  '/erp/petty-cash',
  '/erp/income',
  '/admin/control-center',
  '/admin/settings',
]);

const styles = `
  .off-block { max-width: 720px; margin: 48px auto; padding: 32px;
    background: #fff7ed; border: 1px solid #fdba74; border-radius: 14px;
    color: #7c2d12; box-shadow: 0 4px 14px rgba(124,45,18,.08); }
  .off-block h2 { margin: 0 0 8px; font-size: 22px; color: #7c2d12; }
  .off-block .off-icon { font-size: 32px; margin-bottom: 8px; }
  .off-block p { margin: 8px 0; line-height: 1.6; font-size: 14px; }
  .off-block .off-actions { margin-top: 18px; display: flex; gap: 10px; flex-wrap: wrap; }
  .off-block button { background: #ea580c; color: #fff; border: 0;
    padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; }
  .off-block button.secondary { background: transparent; color: #9a3412;
    border: 1px solid #fdba74; }
  .off-block .off-list { background: #fff; border: 1px solid #fed7aa;
    border-radius: 10px; padding: 12px 16px; margin-top: 14px; font-size: 13px; }
  .off-block .off-list strong { color: #1f2937; }
`;

function pathMatchesAny(pathname, prefixes) {
  if (!pathname) return false;
  for (const p of prefixes) {
    if (typeof p !== 'string' || !p) continue;
    if (pathname === p) return true;
    if (pathname.startsWith(p.endsWith('/') ? p : `${p}/`)) return true;
  }
  return false;
}

/**
 * Hook so other components (e.g. a sidebar that wants to dim ERP links
 * while offline) can ask "would the user be blocked from this path?".
 */
export function useOfflineBlocked(pathname) {
  const [online, setOnline] = useState(offlineManager.isOnline);
  const { options } = useLookupOptions('OFFLINE_REQUIRED_PATHS');
  useEffect(() => offlineManager.onStatusChange(setOnline), []);
  if (online) return { blocked: false, reason: null, prefixList: [] };
  const lookupPrefixes = (options || [])
    .map((o) => o?.code)
    .filter((c) => typeof c === 'string' && c.length > 0);
  const prefixes = lookupPrefixes.length ? lookupPrefixes : DEFAULT_OFFLINE_REQUIRED;
  const blocked = pathMatchesAny(pathname, prefixes);
  return { blocked, prefixList: prefixes, reason: blocked ? 'offline' : null };
}

export default function OfflineRouteGuard({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [online, setOnline] = useState(offlineManager.isOnline);
  // Lookup-driven path list. Empty = use defaults. Hook is safe to call
  // on every render because useLookupOptions caches per (entity, category)
  // for 5 minutes (see useLookups.js).
  const { options } = useLookupOptions('OFFLINE_REQUIRED_PATHS');

  useEffect(() => {
    return offlineManager.onStatusChange(setOnline);
  }, []);

  if (online) return children;

  const lookupPrefixes = (options || [])
    .map((o) => o?.code)
    .filter((c) => typeof c === 'string' && c.length > 0);
  const prefixes = lookupPrefixes.length ? lookupPrefixes : DEFAULT_OFFLINE_REQUIRED;
  const blocked = pathMatchesAny(location.pathname, prefixes);

  if (!blocked) return children;

  return (
    <>
      <style>{styles}</style>
      <div className="off-block" role="alert" aria-live="polite">
        <div className="off-icon" aria-hidden="true">⚠</div>
        <h2>This page needs WiFi or cellular</h2>
        <p>
          You're offline right now. Expenses, approvals, settings, and
          financial pages can't be edited without a server round-trip — every
          submit needs to clear authority gates and period locks before it
          posts.
        </p>
        <p>
          <strong>Visit logging, partnership presentations, photo capture
          and your dashboard still work offline.</strong> Your queued visits
          will sync automatically when you reconnect.
        </p>
        <div className="off-list">
          <p style={{ margin: 0 }}><strong>Tip:</strong> turn on cellular
          data, find a WiFi hotspot, or wait until you're back at the office.
          You can keep working in the BDM dashboard meanwhile.</p>
        </div>
        <div className="off-actions">
          <button onClick={() => navigate('/employee')}>Back to Dashboard</button>
          <button className="secondary" onClick={() => navigate(-1)}>Go Back</button>
          <button className="secondary" onClick={() => offlineManager.triggerSync()}>
            Sync Now (if you're actually online)
          </button>
        </div>
      </div>
    </>
  );
}
