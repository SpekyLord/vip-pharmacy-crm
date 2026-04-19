/**
 * useRejectionConfig — Phase G6
 *
 * Returns the lookup-driven rejection metadata for a module, keyed by the canonical
 * MODULE_DEFAULT_ROLES code (e.g. 'SALES', 'INCOME'). Thin wrapper over useLookupOptions
 * so we reuse the existing 5-min entity-aware cache and don't multiply API calls.
 *
 *   const { config, loading } = useRejectionConfig('SALES');
 *   // config = { rejected_status, reason_field, resubmit_allowed, editable_statuses,
 *   //            banner_tone, description }
 *
 * Returns { config: null } if the module has no lookup row (e.g. MODULE_REJECTION_CONFIG
 * hasn't been seeded yet, or the caller passed an unknown key). The RejectionBanner
 * treats null as "render nothing" — safe default for a page that rolls out to a
 * subscriber before their entity has the lookup populated.
 */
import { useMemo } from 'react';
import { useLookupOptions } from './useLookups';

export function useRejectionConfig(moduleKey) {
  const { options, loading } = useLookupOptions('MODULE_REJECTION_CONFIG');

  const config = useMemo(() => {
    if (!moduleKey) return null;
    const code = String(moduleKey).toUpperCase();
    const row = (options || []).find(o => String(o.code).toUpperCase() === code);
    return row?.metadata || null;
  }, [options, moduleKey]);

  return { config, loading };
}

export default useRejectionConfig;
