/**
 * LoginPage
 *
 * Public login page with:
 * - Login form
 * - Brand/logo display
 * - Redirect after successful login
 * - Fully responsive (mobile-first)
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';
import { useAuth } from '../hooks/useAuth';
import { Moon, Sun } from 'lucide-react';

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
    position: relative;
    background: white;
    padding: 28px 32px 28px;
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    width: 100%;
    max-width: 400px;
  }

  .login-header {
    text-align: center;
    margin-bottom: 16px;
  }

  .login-logo-clip {
    height: 80px;
    overflow: hidden;
    display: flex;
    justify-content: center;
    margin: 0 auto 0;
  }

  .login-logo {
    height: 220px;
    width: auto;
    flex-shrink: 0;
    margin-top: -72px;
    margin-left: 12px;
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

  body.dark-mode .login-page {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  }

  body.dark-mode .login-container {
    background: #0f172a;
    border: 1px solid #1e293b;
  }

  body.dark-mode .login-header h1 {
    color: #f1f5f9;
  }

  body.dark-mode .login-header p {
    color: #94a3b8;
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

  const [isDark, setIsDark] = useState(() => {
    try {
      const stored = localStorage.getItem('darkMode');
      if (stored === 'true' || stored === 'false') return stored === 'true';
    } catch {
      // Ignore
    }
    return document.body.classList.contains('dark-mode');
  });

  useEffect(() => {
    document.body.classList.toggle('dark-mode', isDark);
    try {
      localStorage.setItem('darkMode', String(isDark));
    } catch {
      // Ignore
    }
  }, [isDark]);

  useEffect(() => {
    if (isAuthenticated && user) {
      // Redirect based on role
      switch (user.role) {
        case 'admin':
          navigate('/admin');
          break;
        default:
          navigate('/bdm');
      }
    }
  }, [isAuthenticated, user, navigate]);

  return (
    <div className="login-page">
      <style>{loginPageStyles}</style>
      <div className="login-container">
        <button
          type="button"
          className="auth-theme-btn"
          onClick={() => setIsDark((prev) => !prev)}
          aria-label="Toggle dark mode"
          title="Toggle dark mode"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <div className="login-header">
          <div className="login-logo-clip">
            <img src="/VIP_LOGO-removebg.svg" alt="VIP" className="login-logo" />
          </div>
          <h1>CRM</h1>
          <p>Customer Relationship Management System</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
};

export default LoginPage;
