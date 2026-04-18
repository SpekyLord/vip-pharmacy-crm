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
const BASELINE_DANGER_SUB_PERMS = new Set([
  'accounting.reverse_posted',
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
