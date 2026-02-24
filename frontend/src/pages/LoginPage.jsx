/**
 * LoginPage
 *
 * Public login page with:
 * - Login form
 * - Brand/logo display
 * - Redirect after successful login
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';
import { useAuth } from '../hooks/useAuth';

const LoginPage = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && user) {
      // Redirect based on role
      switch (user.role) {
        case 'admin':
          navigate('/admin');
          break;
        default:
          navigate('/employee');
      }
    }
  }, [isAuthenticated, user, navigate]);

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>VIP CRM</h1>
          <p>Customer Relationship Management System</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
};

export default LoginPage;
