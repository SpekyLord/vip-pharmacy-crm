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

/**
 * Check if user has access to an ERP module.
 * Role overrides: president=always, admin without erp_access=always, ceo=VIEW only.
 */
const hasErpModuleAccess = (user, module) => {
  if (!user || !module) return true;
  const { role, erp_access } = user;
  if (role === 'president') return true;
  if (role === 'ceo') return true; // VIEW-only enforced at backend
  if (role === 'admin' && (!erp_access || !erp_access.enabled)) return true;
  if (!erp_access || !erp_access.enabled) return false;
  const level = erp_access.modules?.[module] || 'NONE';
  return level !== 'NONE';
};

const ProtectedRoute = ({ children, allowedRoles = [], requiredErpModule = null }) => {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();
  const adminLikeRoles = ['admin', 'president', 'ceo', 'finance'];
  const elevatedAdminLikeRoles = ['president', 'ceo', 'finance'];
  const isAdminLike = adminLikeRoles.includes(user?.role);

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
    if (allowedRoles.includes('admin') && elevatedAdminLikeRoles.includes(user?.role)) {
      // Continue to ERP module check below
    } else {
      // Redirect to appropriate dashboard based on user role instead of showing error
      const roleRedirects = {
        admin: '/admin',
        president: '/admin',
        ceo: '/admin',
        finance: '/admin',
        employee: '/bdm',
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

export default ProtectedRoute;
