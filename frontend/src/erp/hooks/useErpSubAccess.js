/**
 * useErpSubAccess — Phase 16 (updated Phase 3a)
 *
 * Hook for checking sub-module permissions in the frontend.
 * Use this to conditionally show/hide action buttons (Create PO, Record Payment, etc.)
 *
 * Rules mirror erpSubAccessCheck middleware:
 *   - President → always true
 *   - Admin w/o erp_access.enabled → always true
 *   - Module FULL with no sub_permissions → all true EXCEPT danger keys
 *   - Module VIEW/FULL with sub_permissions → check specific key
 *
 * Danger keys (Phase 3a): sub-permissions in BASELINE_DANGER_SUB_PERMS are
 * NEVER inherited from module FULL — they require an explicit entry in
 * `user.erp_access.sub_permissions[module][subKey]`. Backend enforces the
 * same rule + any subscriber-added keys from the ERP_DANGER_SUB_PERMISSIONS
 * Lookup category; those extras aren't mirrored on the frontend because
 * admin perm-config changes rarely (the backend will still reject if the
 * UI ever shows a button the user can't actually use).
 */
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';

// Mirrors BASELINE_DANGER_SUB_PERMS in backend/erp/services/dangerSubPermissions.js.
// Keep in sync when adding/removing baseline danger keys.
// Phase 3c (Apr 2026): expanded from 1 → 10 keys covering period-lock, year-end,
// settings, transfer-pricing, people/login mgmt, access-template delete, payroll
// gov-rate delete, and product hard-delete. See backend file for the full mapping.
// Phase G6.1 (Apr 26 2026): +2 keys for People Master entity lifecycle (transfer
// home / grant span). See backend dangerSubPermissions.js for matching entries.
// Phase G4.5ff (May 5 2026) — match the backend resolveOwnerScope.js
// hasProxySubPermission contract: proxy keys require explicit grant, never
// inherited from module FULL. Catches every variant currently in use without
// a hardcoded list (proxy_entry, opening_ar_proxy, grn_proxy_entry, smer_proxy,
// car_logbook_proxy, prf_calf_proxy, deduction_schedule_proxy, batch_metadata_proxy,
// physical_count_proxy, internal_transfer_proxy).
function isProxySubKey(subKey) {
  if (!subKey) return false;
  return subKey === 'proxy_entry' || /(?:^|_)proxy(?:_entry)?$/.test(subKey);
}

const BASELINE_DANGER_SUB_PERMS = new Set([
  'accounting.reverse_posted',
  'accounting.period_force_unlock',
  'accounting.year_end_close',
  'accounting.settings_write',
  'people.terminate',
  'people.manage_login',
  'people.transfer_entity',
  'people.grant_entity',
  'erp_access.template_delete',
  'payroll.gov_rate_delete',
  'inventory.transfer_price_set',
  'master.product_delete',
]);

export default function useErpSubAccess() {
  const { user } = useAuth();

  const hasSubPermission = (module, subKey) => {
    if (!user) return false;

    // President always passes
    if (user.role === ROLES.PRESIDENT) return true;

    // Admin without erp_access enabled = full
    if (user.role === ROLES.ADMIN && !user.erp_access?.enabled) return true;

    const moduleLevel = user.erp_access?.modules?.[module];
    if (!moduleLevel || moduleLevel === 'NONE') return false;

    // FULL with no sub_permissions for this module → all granted, EXCEPT danger keys
    // Count only truthy entries — stale false values don't count
    const moduleSubs = user.erp_access?.sub_permissions?.[module];
    const truthyCount = moduleSubs ? Object.values(moduleSubs).filter(Boolean).length : 0;
    if (!moduleSubs || truthyCount === 0) {
      if (moduleLevel !== 'FULL') return false;
      // Danger sub-perms require explicit grant — module FULL does not inherit them
      if (BASELINE_DANGER_SUB_PERMS.has(`${module}.${subKey}`)) return false;
      // Phase G4.5ff (May 5 2026) — proxy-entry keys also require explicit grant.
      // Proxy entry is privileged (records under another BDM's name affecting their
      // KPIs and commissions). Backend `hasProxySubPermission` in resolveOwnerScope.js
      // does NOT do the FULL fallback. The previous frontend FULL fallback would
      // render the OwnerPicker but every proxy submit would 403, creating a confusing
      // dropdown that always failed.
      if (isProxySubKey(subKey)) return false;
      return true;
    }

    // Explicit grants bypass the danger gate — admin took the decision
    return !!moduleSubs[subKey];
  };

  // Check if any sub-permission keys exist for a module (i.e., granular control is active)
  const hasGranularAccess = (module) => {
    const moduleSubs = user?.erp_access?.sub_permissions?.[module];
    return moduleSubs && Object.values(moduleSubs).filter(Boolean).length > 0;
  };

  return { hasSubPermission, hasGranularAccess };
}
