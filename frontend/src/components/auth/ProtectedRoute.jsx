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

  if (loading) {
    return <LoadingSpinner fullScreen text="Checking authentication..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    // Redirect to appropriate dashboard based on user role instead of showing error
    const roleRedirects = {
      admin: '/admin',
      medrep: '/medrep',
      employee: '/employee',
    };
    const redirectTo = roleRedirects[user?.role] || '/login';
    return <Navigate to={redirectTo} replace />;
  }

  return children;
};

export default ProtectedRoute;
