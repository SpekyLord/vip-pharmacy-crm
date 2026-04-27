/**
 * OfflineRouteGuard config + helpers — Phase N offline-first sprint
 *
 * Kept in a separate file from OfflineRouteGuard.jsx so the .jsx file is
 * component-only (satisfies react-refresh/only-export-components — the lint
 * rule complains when a component file also exports constants or hooks).
 *
 * Contracts:
 *   - DEFAULT_OFFLINE_REQUIRED: inline fallback prefix list. Used when the
 *     OFFLINE_REQUIRED_PATHS Lookup category is empty / unreachable. Order
 *     doesn't matter; first matching prefix wins.
 *   - pathMatchesAny: prefix matcher with /-boundary correctness (so `/erp`
 *     does NOT match `/erpx-thing`).
 *   - useOfflineBlocked: live hook other components can call to ask
 *     "would the user be blocked from this path?". Reads offline state +
 *     the OFFLINE_REQUIRED_PATHS lookup the same way the guard does.
 */
import { useEffect, useState } from 'react';
import offlineManager from './offlineManager';
import { useLookupOptions } from '../erp/hooks/useLookups';

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

export function pathMatchesAny(pathname, prefixes) {
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
