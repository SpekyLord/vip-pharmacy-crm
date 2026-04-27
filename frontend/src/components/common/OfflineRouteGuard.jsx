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
 * (in offlineRouteGuardConfig.js) so the page never silently lets BDMs into
 * Expenses while offline because a Lookup outage stripped the guard.
 *
 * Why a single guard, not per-route boilerplate:
 *   - 100+ ERP routes already use ProtectedRoute. Adding a second wrapper
 *     to each line is noise + drift risk (someone adds a new ERP route
 *     and forgets the guard → silent leak that lets BDM submit an expense
 *     offline, queueing it behind the SW envelope path that would bypass
 *     period locks + Approval Hub guarantees).
 *   - The guard reads `useLocation()` once per render and consults the
 *     prefix list. Cheap; no per-page work.
 *   - Subscribers in the future SaaS spin-out can configure their own
 *     "offline-required" set without touching code.
 *
 * Helpers + the default-prefix list live in `utils/offlineRouteGuardConfig.js`
 * so this file exports only a component (lint rule
 * react-refresh/only-export-components).
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import offlineManager from '../../utils/offlineManager';
import { useLookupOptions } from '../../erp/hooks/useLookups';
import {
  DEFAULT_OFFLINE_REQUIRED,
  pathMatchesAny,
} from '../../utils/offlineRouteGuardConfig';

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
          You&apos;re offline right now. Expenses, approvals, settings, and
          financial pages can&apos;t be edited without a server round-trip — every
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
          data, find a WiFi hotspot, or wait until you&apos;re back at the office.
          You can keep working in the BDM dashboard meanwhile.</p>
        </div>
        <div className="off-actions">
          <button onClick={() => navigate('/employee')}>Back to Dashboard</button>
          <button className="secondary" onClick={() => navigate(-1)}>Go Back</button>
          <button className="secondary" onClick={() => offlineManager.triggerSync()}>
            Sync Now (if you&apos;re actually online)
          </button>
        </div>
      </div>
    </>
  );
}
