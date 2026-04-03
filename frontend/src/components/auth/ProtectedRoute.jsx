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

const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();
  const adminLikeRoles = ['admin', 'president', 'ceo', 'finance'];
  const isAdminLike = adminLikeRoles.includes(user?.role);

  if (loading) {
    return <LoadingSpinner fullScreen text="Checking authentication..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Keep admin-like users on admin routes to avoid mixed admin sidebar + BDM pages.
  if (isAdminLike && (location.pathname.startsWith('/bdm') || location.pathname.startsWith('/employee'))) {
    return <Navigate to="/admin" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    // Allow finance/president/ceo to access admin-only routes
    if (allowedRoles.includes('admin') && isAdminLike && location.pathname.startsWith('/admin')) {
      return children;
    }

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

  return children;
};

export default ProtectedRoute;
