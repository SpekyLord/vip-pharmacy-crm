/**
 * LoginPage
 *
 * Public login page with:
 * - Login form
 * - Brand/logo display
 * - Redirect after successful login
 * - Fully responsive (mobile-first)
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';
import { useAuth } from '../hooks/useAuth';

const loginPageStyles = `
  .login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    padding: 16px;
  }

  .login-container {
    background: white;
    padding: 40px 32px;
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    width: 100%;
    max-width: 400px;
  }

  .login-header {
    text-align: center;
    margin-bottom: 32px;
  }

  .login-header .login-logo {
    width: 56px;
    height: 56px;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 800;
    font-size: 22px;
    margin: 0 auto 16px;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  .login-header h1 {
    color: #1f2937;
    font-size: 24px;
    font-weight: 700;
    margin: 0 0 8px 0;
  }

  .login-header p {
    color: #6b7280;
    margin: 0;
    font-size: 14px;
  }

  .login-form .btn {
    width: 100%;
    min-height: 48px;
    font-size: 16px;
    font-weight: 600;
    border-radius: 12px;
    cursor: pointer;
    border: none;
  }

  .login-form .btn-primary {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: white;
  }

  .login-form .btn-primary:hover {
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .login-form .btn-primary:active {
    transform: scale(0.98);
  }

  .login-form .btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  @media (max-width: 480px) {
    .login-container {
      padding: 32px 20px;
      border-radius: 16px;
      margin: 0 4px;
    }

    .login-header h1 {
      font-size: 22px;
    }
  }
`;

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
      <style>{loginPageStyles}</style>
      <div className="login-container">
        <div className="login-header">
          <div className="login-logo">VP</div>
          <h1>VIP CRM</h1>
          <p>Customer Relationship Management System</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
};

export default LoginPage;
