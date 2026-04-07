/**
 * useErpSubAccess — Phase 16
 *
 * Hook for checking sub-module permissions in the frontend.
 * Use this to conditionally show/hide action buttons (Create PO, Record Payment, etc.)
 *
 * Rules mirror erpSubAccessCheck middleware:
 *   - President → always true
 *   - Admin w/o erp_access.enabled → always true
 *   - Module FULL with no sub_permissions → all true
 *   - Module VIEW/FULL with sub_permissions → check specific key
 */
import { useAuth } from '../../hooks/useAuth';

export default function useErpSubAccess() {
  const { user } = useAuth();

  const hasSubPermission = (module, subKey) => {
    if (!user) return false;

    // President always passes
    if (user.role === 'president') return true;

    // Admin without erp_access enabled = full
    if (user.role === 'admin' && !user.erp_access?.enabled) return true;

    const moduleLevel = user.erp_access?.modules?.[module];
    if (!moduleLevel || moduleLevel === 'NONE') return false;

    // FULL with no sub_permissions for this module → all granted
    const moduleSubs = user.erp_access?.sub_permissions?.[module];
    if (!moduleSubs || Object.keys(moduleSubs).length === 0) {
      return moduleLevel === 'FULL';
    }

    // Check specific sub-permission
    return !!moduleSubs[subKey];
  };

  // Check if any sub-permission keys exist for a module (i.e., granular control is active)
  const hasGranularAccess = (module) => {
    const moduleSubs = user?.erp_access?.sub_permissions?.[module];
    return moduleSubs && Object.keys(moduleSubs).length > 0;
  };

  return { hasSubPermission, hasGranularAccess };
}
