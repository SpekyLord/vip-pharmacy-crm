/**
 * ProtectedRoute Component
 *
 * Route wrapper that:
 * - Checks authentication status
 * - Verifies user role permissions
 * - Redirects to login if not authenticated
 * - Shows unauthorized message if role not allowed
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import LoadingSpinner from '../common/LoadingSpinner';
import { ROLES, ROLE_SETS, isAdminLike as checkAdminLike } from '../../constants/roles';

/**
 * Check if user has access to an ERP module.
 * Role overrides: president=always, admin without erp_access=always, ceo=VIEW only.
 */
const hasErpModuleAccess = (user, module) => {
  if (!user || !module) return true;
  const { role, erp_access } = user;
  if (role === ROLES.PRESIDENT) return true;
  if (role === ROLES.CEO) return true; // VIEW-only enforced at backend
  if (role === ROLES.ADMIN && (!erp_access || !erp_access.enabled)) return true;
  if (!erp_access || !erp_access.enabled) return false;
  const level = erp_access.modules?.[module] || 'NONE';
  return level !== 'NONE';
};

/* eslint-disable react/prop-types */
const ProtectedRoute = ({ children, allowedRoles = [], requiredErpModule = null }) => {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();
  const isAdminLike = checkAdminLike(user?.role);

  if (loading) {
    return <LoadingSpinner fullScreen text="Checking authentication..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Keep admin-like users on admin/ERP routes to avoid mixed admin sidebar + BDM pages.
  if (isAdminLike && (location.pathname.startsWith('/bdm') || location.pathname.startsWith('/employee'))) {
    return <Navigate to="/admin" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    // president/ceo/finance get admin-level access
    if (allowedRoles.includes(ROLES.ADMIN) && ROLE_SETS.PRESIDENT_ROLES.concat(ROLES.FINANCE).includes(user?.role)) {
      // Continue to ERP module check below
    } else {
      // Redirect to appropriate dashboard based on user role instead of showing error
      const roleRedirects = {
        [ROLES.ADMIN]: '/admin',
        [ROLES.PRESIDENT]: '/admin',
        [ROLES.CEO]: '/admin',
        [ROLES.FINANCE]: '/admin',
        [ROLES.CONTRACTOR]: '/bdm',
      };
      const redirectTo = roleRedirects[user?.role] || '/login';
      return <Navigate to={redirectTo} replace />;
    }
  }

  // ERP module access check (Phase 10)
  if (requiredErpModule && !hasErpModuleAccess(user, requiredErpModule)) {
    return <Navigate to="/erp" replace />;
  }

  return children;
};
/* eslint-enable react/prop-types */

export default ProtectedRoute;
